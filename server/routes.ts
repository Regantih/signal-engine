import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scoreOpportunity, suggestAction, computePriceLevels } from "./scoring-engine";
import { insertOpportunitySchema, DEFAULT_WEIGHTS } from "@shared/schema";
import { fetchBenzingaNews, getNewsSentimentScore } from "./benzinga-service";
import { computeAutoSignals } from "./auto-signals";
import { computeCryptoSignals, CRYPTO_TICKERS } from "./crypto-signals";
import { computeETFSignals, ETF_TICKERS } from "./etf-signals";
import { scanUniverse, addScannedOpportunity, getLastScanResults, setLastScanResults } from "./universe-scanner";
import { getAccount, getPositions, getOrders, placeBracketOrder, closePosition, closeAllPositions, isAlpacaConnected } from "./alpaca-service";
import { executePaperTrade, getPaperPositions, getPaperOrders, closePaperPosition, closeAllPaperPositions, getPaperAccountSummary } from "./paper-trading";
import { evaluateOutcomes, computeSignalAccuracy, autoTuneWeights } from "./feedback-engine";
import { evaluatePosition, evaluatePortfolioRisk, convictionSize, type Position, type PortfolioRisk } from "./risk-manager";
import { fetchMacroSnapshot, type MacroSnapshot } from "./macro-monitor";
import { fetchFullIntelligence } from "./intelligence-service";
import { runDailyPipeline, computeCapitalState, getCostMetrics, resetCostMetrics, sellSideScreen, checkEarningsBlackout } from "./execution-engine";
import { requireAuth, generateToken, validatePassword, isPasswordSet } from "./auth";
import { captureCredentials } from "./credentials";
import { startRealtime, stopRealtime, addClient, removeClient, getRealtimeStatus } from "./realtime-engine";
import { fetchFundamentals, fetchFundamentalsBatch } from "./fundamental-analysis";
import { generateThesis } from "./ai-thesis";
import { resolveOldPredictions } from "./prediction-resolver";
import { computePortfolioAnalytics } from "./portfolio-analytics";
import { getWikiIndex, getTickerPage, queryWiki, getWikiLog } from "./wiki-engine";

// In-memory rate limiter
const rateLimiter = {
  trades: new Map<string, number>(), // ticker -> last trade timestamp
  pipeline: 0, // last pipeline run timestamp
  maxTradesPerDay: 20,
  dailyTradeCount: 0,
  lastResetDate: new Date().toDateString(),

  canTrade(ticker: string): { allowed: boolean; reason?: string } {
    // Reset daily counter
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyTradeCount = 0;
      this.lastResetDate = today;
    }

    // Max 20 trades per day
    if (this.dailyTradeCount >= this.maxTradesPerDay) {
      return { allowed: false, reason: `Daily trade limit reached (${this.maxTradesPerDay})` };
    }

    // No duplicate trade on same ticker within 5 minutes
    const lastTrade = this.trades.get(ticker);
    if (lastTrade && (Date.now() - lastTrade) < 300000) {
      return { allowed: false, reason: `Duplicate trade blocked: ${ticker} was traded ${Math.round((Date.now() - lastTrade) / 1000)}s ago` };
    }

    return { allowed: true };
  },

  recordTrade(ticker: string) {
    this.trades.set(ticker, Date.now());
    this.dailyTradeCount++;
  },

  canRunPipeline(): boolean {
    // No more than once per 5 minutes
    if (Date.now() - this.pipeline < 300000) return false;
    this.pipeline = Date.now();
    return true;
  }
};

// Helper: score a list of tickers for a given domain (crypto/etf)
async function scoreMultiAssetDomain(
  domain: string,
  tickers: string[],
  computeSignals: (ticker: string) => Promise<{ momentum: number; meanReversion: number; quality: number; flow: number; risk: number; crowding: number; metadata: { ticker: string; price: number; computedAt: string; dataPoints: Record<string, any> } } | null>,
): Promise<Array<{ ticker: string; signals?: any; price?: number; error?: string }>> {
  const opps = await storage.getOpportunities();
  const results: Array<{ ticker: string; signals?: any; price?: number; error?: string }> = [];

  for (const ticker of tickers) {
    try {
      const signals = await computeSignals(ticker);
      if (!signals) {
        results.push({ ticker, error: "Failed to compute signals" });
        continue;
      }

      const now = new Date().toISOString();
      let opp = opps.find(o => o.ticker?.toUpperCase() === ticker.toUpperCase() && o.domain === domain);

      if (!opp) {
        opp = await storage.createOpportunity({
          name: `${ticker} (${domain})`,
          ticker: ticker.toUpperCase(),
          domain,
          description: `Auto-discovered ${domain} asset`,
          momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality,
          flow: signals.flow, risk: signals.risk, crowding: signals.crowding,
          entryPrice: signals.metadata.price, targetPrice: null, stopLoss: null,
          status: "watch", screenerFlags: null, createdAt: now, updatedAt: now,
        });
      } else {
        await storage.updateOpportunity(opp.id, {
          momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality,
          flow: signals.flow, risk: signals.risk, crowding: signals.crowding,
          entryPrice: signals.metadata.price, updatedAt: now,
        });
      }

      const weights = await storage.getWeights(domain) || {
        momentum: DEFAULT_WEIGHTS.momentum, meanReversion: DEFAULT_WEIGHTS.mean_reversion,
        quality: DEFAULT_WEIGHTS.quality, flow: DEFAULT_WEIGHTS.flow,
        risk: DEFAULT_WEIGHTS.risk, crowding: DEFAULT_WEIGHTS.crowding,
      };
      const portfolio = await storage.getPortfolio();
      const budget = portfolio?.cashRemaining || 100;

      const result = scoreOpportunity(
        { momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality, flow: signals.flow, risk: signals.risk, crowding: signals.crowding },
        { momentum: weights.momentum, meanReversion: weights.meanReversion, quality: weights.quality, flow: weights.flow, risk: weights.risk, crowding: weights.crowding },
        budget
      );
      const action = suggestAction(result);
      const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

      await storage.updateOpportunity(opp.id, {
        compositeScore: result.compositeScore, probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge, kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand, suggestedAllocation: result.suggestedAllocation,
        targetPrice: priceLevels.targetPrice, stopLoss: priceLevels.stopLoss,
        status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
        updatedAt: now,
      });

      await storage.createPrediction({
        opportunityId: opp.id, action,
        compositeScore: result.compositeScore, probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge, kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand, suggestedAllocation: result.suggestedAllocation,
        entryPrice: signals.metadata.price, targetPrice: priceLevels.targetPrice,
        stopLoss: priceLevels.stopLoss, currentPrice: signals.metadata.price,
        reasoning: `Auto-scored ${domain}: Mom=${signals.momentum} Qual=${signals.quality} Flow=${signals.flow}`,
        signalSnapshot: JSON.stringify(signals), timestamp: now,
      });

      results.push({ ticker, signals: { momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality, flow: signals.flow, risk: signals.risk, crowding: signals.crowding }, price: signals.metadata.price });
    } catch (e: any) {
      results.push({ ticker, error: e.message });
    }
  }
  return results;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Capture fresh credentials from proxy on every request
  app.use((_req, _res, next) => {
    captureCredentials();
    next();
  });

  // Apply authentication middleware to all routes
  app.use(requireAuth);

  // ========================
  // AUTH
  // ========================

  app.get("/api/auth/status", (_req, res) => {
    res.json({ authenticated: true, passwordRequired: isPasswordSet() });
  });

  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });
    if (!isPasswordSet()) return res.status(400).json({ error: "No password configured. Set APP_PASSWORD environment variable." });
    if (!validatePassword(password)) return res.status(401).json({ error: "Invalid password" });
    const token = generateToken();
    res.json({ token, expiresIn: "24h" });
  });

  // ========================
  // OPPORTUNITIES
  // ========================
  
  app.get("/api/opportunities", async (_req, res) => {
    const opps = await storage.getOpportunities();
    res.json(opps);
  });

  app.get("/api/opportunities/:id", async (req, res) => {
    const opp = await storage.getOpportunity(Number(req.params.id));
    if (!opp) return res.status(404).json({ error: "Not found" });
    res.json(opp);
  });

  app.post("/api/opportunities", async (req, res) => {
    try {
      const now = new Date().toISOString();
      const data = {
        ...req.body,
        createdAt: now,
        updatedAt: now,
      };

      const opp = await storage.createOpportunity(data);

      // Auto-score the opportunity
      const weights = await storage.getWeights(opp.domain) || {
        momentum: DEFAULT_WEIGHTS.momentum,
        meanReversion: DEFAULT_WEIGHTS.mean_reversion,
        quality: DEFAULT_WEIGHTS.quality,
        flow: DEFAULT_WEIGHTS.flow,
        risk: DEFAULT_WEIGHTS.risk,
        crowding: DEFAULT_WEIGHTS.crowding,
      };

      const portfolio = await storage.getPortfolio();
      const budget = portfolio?.cashRemaining || 100;

      const result = scoreOpportunity(
        {
          momentum: opp.momentum,
          meanReversion: opp.meanReversion,
          quality: opp.quality,
          flow: opp.flow,
          risk: opp.risk,
          crowding: opp.crowding,
        },
        {
          momentum: weights.momentum,
          meanReversion: weights.meanReversion,
          quality: weights.quality,
          flow: weights.flow,
          risk: weights.risk,
          crowding: weights.crowding,
        },
        budget
      );

      const action = suggestAction(result);

      // Update opportunity with scores
      const updated = await storage.updateOpportunity(opp.id, {
        compositeScore: result.compositeScore,
        probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge,
        kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand,
        suggestedAllocation: result.suggestedAllocation,
        status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
        updatedAt: now,
      });

      // Create prediction audit record
      await storage.createPrediction({
        opportunityId: opp.id,
        action,
        compositeScore: result.compositeScore,
        probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge,
        kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand,
        suggestedAllocation: result.suggestedAllocation,
        entryPrice: opp.entryPrice,
        targetPrice: opp.targetPrice,
        stopLoss: opp.stopLoss,
        currentPrice: opp.entryPrice,
        reasoning: `Auto-scored: Composite=${result.compositeScore.toFixed(3)}, P(success)=${(result.probabilityOfSuccess * 100).toFixed(1)}%, Edge=${result.expectedEdge.toFixed(3)}`,
        signalSnapshot: JSON.stringify({
          momentum: opp.momentum,
          meanReversion: opp.meanReversion,
          quality: opp.quality,
          flow: opp.flow,
          risk: opp.risk,
          crowding: opp.crowding,
          weights,
        }),
        timestamp: now,
      });

      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/opportunities/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const now = new Date().toISOString();
      
      const opp = await storage.getOpportunity(id);
      if (!opp) return res.status(404).json({ error: "Not found" });

      const updatedData = { ...req.body, updatedAt: now };
      const updated = await storage.updateOpportunity(id, updatedData);
      
      if (!updated) return res.status(404).json({ error: "Update failed" });

      // Re-score if signals changed
      if (req.body.momentum !== undefined || req.body.meanReversion !== undefined || 
          req.body.quality !== undefined || req.body.flow !== undefined ||
          req.body.risk !== undefined || req.body.crowding !== undefined) {
        
        const weights = await storage.getWeights(updated.domain) || {
          momentum: DEFAULT_WEIGHTS.momentum,
          meanReversion: DEFAULT_WEIGHTS.mean_reversion,
          quality: DEFAULT_WEIGHTS.quality,
          flow: DEFAULT_WEIGHTS.flow,
          risk: DEFAULT_WEIGHTS.risk,
          crowding: DEFAULT_WEIGHTS.crowding,
        };

        const portfolio = await storage.getPortfolio();
        const budget = portfolio?.cashRemaining || 100;

        const result = scoreOpportunity(
          {
            momentum: updated.momentum,
            meanReversion: updated.meanReversion,
            quality: updated.quality,
            flow: updated.flow,
            risk: updated.risk,
            crowding: updated.crowding,
          },
          {
            momentum: weights.momentum,
            meanReversion: weights.meanReversion,
            quality: weights.quality,
            flow: weights.flow,
            risk: weights.risk,
            crowding: weights.crowding,
          },
          budget
        );

        const action = suggestAction(result);

        const rescored = await storage.updateOpportunity(id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          updatedAt: now,
        });

        // Create new prediction record for audit trail
        await storage.createPrediction({
          opportunityId: id,
          action,
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          entryPrice: updated.entryPrice,
          targetPrice: updated.targetPrice,
          stopLoss: updated.stopLoss,
          currentPrice: updated.entryPrice,
          reasoning: `Re-scored: signals updated`,
          signalSnapshot: JSON.stringify({
            momentum: updated.momentum,
            meanReversion: updated.meanReversion,
            quality: updated.quality,
            flow: updated.flow,
            risk: updated.risk,
            crowding: updated.crowding,
            weights,
          }),
          timestamp: now,
        });

        res.json(rescored);
      } else {
        res.json(updated);
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/opportunities/:id", async (req, res) => {
    await storage.deleteOpportunity(Number(req.params.id));
    res.json({ ok: true });
  });

  // ========================
  // SCORE / RESCORE
  // ========================
  
  app.post("/api/score", async (req, res) => {
    try {
      const { signals, domain, budget = 100 } = req.body;
      const weights = await storage.getWeights(domain) || {
        momentum: DEFAULT_WEIGHTS.momentum,
        meanReversion: DEFAULT_WEIGHTS.mean_reversion,
        quality: DEFAULT_WEIGHTS.quality,
        flow: DEFAULT_WEIGHTS.flow,
        risk: DEFAULT_WEIGHTS.risk,
        crowding: DEFAULT_WEIGHTS.crowding,
      };

      const result = scoreOpportunity(signals, {
        momentum: weights.momentum,
        meanReversion: weights.meanReversion,
        quality: weights.quality,
        flow: weights.flow,
        risk: weights.risk,
        crowding: weights.crowding,
      }, budget);

      const action = suggestAction(result);
      res.json({ ...result, action });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/thesis/:ticker — Get AI thesis for a specific ticker
  app.get("/api/thesis/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const opps = await storage.getOpportunities();
      const opp = opps.find(o => o.ticker?.toUpperCase() === ticker);
      if (!opp) return res.status(404).json({ error: `No opportunity found for ticker ${ticker}` });

      // Return cached thesis if available, otherwise generate fresh
      if (opp.thesis) {
        return res.json({ ticker, thesis: opp.thesis });
      }

      const thesis = generateThesis(opp);
      await storage.updateOpportunity(opp.id, { thesis, updatedAt: new Date().toISOString() });
      res.json({ ticker, thesis });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Rescore ALL opportunities
  app.post("/api/rescore-all", async (_req, res) => {
    try {
      const opps = await storage.getOpportunities();
      const now = new Date().toISOString();
      const results = [];

      for (const opp of opps) {
        const weights = await storage.getWeights(opp.domain) || {
          momentum: DEFAULT_WEIGHTS.momentum,
          meanReversion: DEFAULT_WEIGHTS.mean_reversion,
          quality: DEFAULT_WEIGHTS.quality,
          flow: DEFAULT_WEIGHTS.flow,
          risk: DEFAULT_WEIGHTS.risk,
          crowding: DEFAULT_WEIGHTS.crowding,
        };

        const portfolio = await storage.getPortfolio();
        const budget = portfolio?.cashRemaining || 100;

        const result = scoreOpportunity(
          {
            momentum: opp.momentum,
            meanReversion: opp.meanReversion,
            quality: opp.quality,
            flow: opp.flow,
            risk: opp.risk,
            crowding: opp.crowding,
          },
          {
            momentum: weights.momentum,
            meanReversion: weights.meanReversion,
            quality: weights.quality,
            flow: weights.flow,
            risk: weights.risk,
            crowding: weights.crowding,
          },
          budget
        );

        const action = suggestAction(result);

        // Generate AI thesis
        const updatedOpp = { ...opp, ...result, status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch" };
        const thesis = generateThesis(updatedOpp as any);

        await storage.updateOpportunity(opp.id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          thesis,
          updatedAt: now,
        });

        results.push({ id: opp.id, name: opp.name, ...result, action, thesis });
      }

      res.json(results);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // PREDICTIONS (Audit Trail)
  // ========================
  
  app.get("/api/predictions", async (req, res) => {
    const oppId = req.query.opportunityId ? Number(req.query.opportunityId) : undefined;
    const preds = await storage.getPredictions(oppId);
    res.json(preds);
  });

  // ========================
  // PERFORMANCE
  // ========================
  
  app.get("/api/performance", async (req, res) => {
    const oppId = req.query.opportunityId ? Number(req.query.opportunityId) : undefined;
    const perfs = await storage.getPerformance(oppId);
    res.json(perfs);
  });

  // ========================
  // WEIGHTS
  // ========================
  
  app.get("/api/weights", async (_req, res) => {
    const weights = await storage.getAllWeights();
    res.json(weights);
  });

  app.patch("/api/weights/:domain", async (req, res) => {
    try {
      const updated = await storage.updateWeights(req.params.domain, req.body);
      if (!updated) return res.status(404).json({ error: "Domain not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // PORTFOLIO
  // ========================
  
  app.get("/api/portfolio", async (_req, res) => {
    const p = await storage.getPortfolio();
    res.json(p);
  });

  app.patch("/api/portfolio", async (req, res) => {
    try {
      const updated = await storage.updatePortfolio({
        ...req.body,
        updatedAt: new Date().toISOString(),
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // STATS / DASHBOARD
  // ========================
  
  app.get("/api/stats", async (_req, res) => {
    const opps = await storage.getOpportunities();
    const preds = await storage.getPredictions();
    const portfolio = await storage.getPortfolio();

    const byDomain: Record<string, number> = {};
    const byConviction: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const opp of opps) {
      byDomain[opp.domain] = (byDomain[opp.domain] || 0) + 1;
      if (opp.convictionBand) {
        byConviction[opp.convictionBand] = (byConviction[opp.convictionBand] || 0) + 1;
      }
      byStatus[opp.status] = (byStatus[opp.status] || 0) + 1;
    }

    const avgScore = opps.length > 0 
      ? opps.reduce((sum, o) => sum + (o.compositeScore || 0), 0) / opps.length 
      : 0;

    const totalAllocated = opps
      .filter(o => o.status === "buy")
      .reduce((sum, o) => sum + (o.suggestedAllocation || 0), 0);

    res.json({
      totalOpportunities: opps.length,
      totalPredictions: preds.length,
      byDomain,
      byConviction,
      byStatus,
      avgCompositeScore: Math.round(avgScore * 1000) / 1000,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      portfolio,
    });
  });

  // ========================
  // MARKET DATA
  // ========================

  // GET /api/market-data/:ticker - Get cached OHLCV data
  app.get("/api/market-data/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const data = await storage.getMarketData(ticker);
      const latest = data.length > 0 ? data[data.length - 1] : null;
      
      // Check freshness: < 1 hour
      const isFresh = latest 
        ? (Date.now() - new Date(latest.fetchedAt).getTime()) < 3600000 
        : false;

      res.json({ ticker, data, isFresh, count: data.length });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/market-data/:ticker/quote - Get latest quote
  app.get("/api/market-data/:ticker/quote", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const latest = await storage.getLatestMarketData(ticker);
      
      if (!latest) {
        return res.json({ ticker, price: null, change: null, changePercent: null });
      }

      // Get previous day to compute change
      const allData = await storage.getMarketData(ticker);
      const idx = allData.findIndex(d => d.id === latest.id);
      const prev = idx > 0 ? allData[idx - 1] : null;
      
      const change = prev ? latest.close - prev.close : null;
      const changePercent = prev ? ((latest.close - prev.close) / prev.close) * 100 : null;

      res.json({
        ticker,
        price: latest.close,
        change,
        changePercent,
        date: latest.date,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        volume: latest.volume,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/market-data/fetch - Manually trigger fetch (stub — caching layer only)
  app.post("/api/market-data/fetch", async (req, res) => {
    try {
      const { ticker } = req.body;
      if (!ticker) return res.status(400).json({ error: "ticker required" });
      const data = await storage.getMarketData(ticker.toUpperCase());
      res.json({ ticker: ticker.toUpperCase(), cached: data.length, message: "Use /api/market-data/seed to add data" });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/market-data/seed - Seed historical OHLCV data
  app.post("/api/market-data/seed", async (req, res) => {
    try {
      const { ticker, data } = req.body;
      if (!ticker || !Array.isArray(data)) {
        return res.status(400).json({ error: "ticker and data array required" });
      }

      const now = new Date().toISOString();
      const rows = data.map((d: any) => ({
        ticker: ticker.toUpperCase(),
        date: d.date,
        open: d.open ?? null,
        high: d.high ?? null,
        low: d.low ?? null,
        close: d.close,
        volume: d.volume ?? null,
        fetchedAt: now,
      }));

      await storage.seedMarketData(ticker.toUpperCase(), rows);
      res.json({ ok: true, ticker: ticker.toUpperCase(), count: rows.length });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // TRADINGVIEW WEBHOOKS
  // ========================

  // POST /api/webhooks/tradingview - Receive TradingView webhook alerts
  app.post("/api/webhooks/tradingview", async (req, res) => {
    try {
      // Respond immediately (TradingView requires <3s)
      const now = new Date().toISOString();
      const body = req.body;

      const ticker = (body.ticker || body.symbol || "UNKNOWN").toUpperCase();
      const alertType = body.alert_type || body.alertType || (body.action ? "price_cross" : "custom");
      const message = body.message || body.comment || JSON.stringify(body);

      await storage.createWebhookAlert({
        ticker,
        alertType,
        message,
        rawPayload: JSON.stringify(body),
        processed: 0,
        receivedAt: now,
      });

      res.status(200).json({ ok: true, received: now });
    } catch (e: any) {
      // Still return 200 so TradingView doesn't retry
      res.status(200).json({ ok: false, error: e.message });
    }
  });

  // GET /api/webhooks/alerts - List recent webhook alerts
  app.get("/api/webhooks/alerts", async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const alerts = await storage.getWebhookAlerts(limit);
      res.json(alerts);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // PUBLISH / SOCIAL
  // ========================

  // POST /api/publish - Generate a formatted post for a prediction
  app.post("/api/publish", async (req, res) => {
    try {
      const { predictionId, platform = "clipboard" } = req.body;
      if (!predictionId) return res.status(400).json({ error: "predictionId required" });

      const preds = await storage.getPredictions();
      const pred = preds.find(p => p.id === predictionId);
      if (!pred) return res.status(404).json({ error: "Prediction not found" });

      const opp = await storage.getOpportunity(pred.opportunityId);
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });

      let snapshot: any = {};
      try { snapshot = JSON.parse(pred.signalSnapshot); } catch {}

      const ticker = opp.ticker ? opp.ticker.toUpperCase() : "";
      const name = opp.name;
      const content = `📊 SIGNAL ENGINE — ${pred.action} ${ticker || name}

Domain: ${opp.domain.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
Composite Score: ${pred.compositeScore.toFixed(3)}
P(Success): ${(pred.probabilityOfSuccess * 100).toFixed(1)}%
Expected Edge: ${pred.expectedEdge.toFixed(3)}
Conviction: ${pred.convictionBand?.toUpperCase()} | Kelly: ${(pred.kellyFraction * 100).toFixed(2)}%
Allocation: $${pred.suggestedAllocation.toFixed(2)} of $100

Entry: ${pred.entryPrice ? `$${pred.entryPrice.toFixed(2)}` : "N/A"} | Target: ${pred.targetPrice ? `$${pred.targetPrice.toFixed(2)}` : "N/A"} | Stop: ${pred.stopLoss ? `$${pred.stopLoss.toFixed(2)}` : "N/A"}

Signal Breakdown:
  Momentum: ${snapshot.momentum ?? "—"}/100
  Mean Reversion: ${snapshot.meanReversion ?? "—"}/100
  Quality: ${snapshot.quality ?? "—"}/100
  Flow: ${snapshot.flow ?? "—"}/100
  Risk: ${snapshot.risk ?? "—"}/100 (penalty)
  Crowding: ${snapshot.crowding ?? "—"}/100 (penalty)

⏰ Timestamped: ${pred.timestamp}
🔒 Immutable audit record #${pred.id}

Methodology: Renaissance-style multi-signal aggregation with Z-score normalization, logistic probability, and fractional Kelly sizing.

⚠️ Not financial advice. This is a public experiment in systematic signal scoring.`;

      const now = new Date().toISOString();
      await storage.createPublishedPrediction({
        predictionId: pred.id,
        opportunityId: opp.id,
        platform,
        postContent: content,
        publishedAt: now,
      });

      res.json({ content, platform, publishedAt: now });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/published - List published predictions
  app.get("/api/published", async (_req, res) => {
    try {
      const published = await storage.getPublishedPredictions();
      res.json(published);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // ACCOUNTABILITY LEDGER
  // ========================

  // GET /api/accountability - Full prediction ledger with win/loss stats
  app.get("/api/accountability", async (_req, res) => {
    try {
      const allPreds = await storage.getPredictions();
      const opps = await storage.getOpportunities();

      const ledger = allPreds
        .filter(p => p.action === "BUY" && p.entryPrice)
        .map(p => {
          const opp = opps.find(o => o.id === p.opportunityId);
          return {
            id: p.id,
            ticker: opp?.ticker || "N/A",
            action: p.action,
            entryPrice: p.entryPrice,
            targetPrice: p.targetPrice,
            stopLoss: p.stopLoss,
            compositeScore: p.compositeScore,
            probabilityOfSuccess: p.probabilityOfSuccess,
            convictionBand: p.convictionBand,
            timestamp: p.timestamp,
            resolvedAt: p.resolvedAt,
            resolvedPrice: p.resolvedPrice,
            actualReturn: p.actualReturn,
            wasCorrect: p.wasCorrect,
            resolutionNotes: p.resolutionNotes,
          };
        });

      const resolved = ledger.filter(l => l.wasCorrect !== null && l.wasCorrect !== undefined);
      const wins = resolved.filter(l => l.wasCorrect === 1);
      const losses = resolved.filter(l => l.wasCorrect === -1);
      const open = ledger.filter(l => l.wasCorrect === null || l.wasCorrect === undefined);

      const avgReturnWins = wins.length > 0
        ? wins.reduce((s, l) => s + (l.actualReturn || 0), 0) / wins.length
        : 0;
      const avgReturnLosses = losses.length > 0
        ? losses.reduce((s, l) => s + (l.actualReturn || 0), 0) / losses.length
        : 0;
      const overallAlpha = resolved.length > 0
        ? resolved.reduce((s, l) => s + (l.actualReturn || 0), 0) / resolved.length
        : 0;

      res.json({
        stats: {
          totalPredictions: ledger.length,
          resolved: resolved.length,
          wins: wins.length,
          losses: losses.length,
          open: open.length,
          winRate: resolved.length > 0 ? Math.round((wins.length / resolved.length) * 1000) / 10 : 0,
          avgReturnWins: Math.round(avgReturnWins * 100) / 100,
          avgReturnLosses: Math.round(avgReturnLosses * 100) / 100,
          overallAlpha: Math.round(overallAlpha * 100) / 100,
        },
        ledger,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // LIVE P&L
  // ========================

  // GET /api/live-pnl - Compute live P&L for all "buy" status opportunities
  app.get("/api/live-pnl", async (_req, res) => {
    try {
      const opps = await storage.getOpportunities();
      const buyOpps = opps.filter(o => o.status === "buy" && o.entryPrice);

      const results = [];
      let totalPnl = 0;
      let totalAllocated = 0;

      for (const opp of buyOpps) {
        if (!opp.ticker || !opp.entryPrice) continue;

        const latest = await storage.getLatestMarketData(opp.ticker.toUpperCase());
        const currentPrice = latest?.close ?? opp.entryPrice;
        const entryPrice = opp.entryPrice;
        const allocation = opp.suggestedAllocation || 0;
        const shares = allocation / entryPrice;
        const pnl = (currentPrice - entryPrice) * shares;
        const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

        totalPnl += pnl;
        totalAllocated += allocation;

        results.push({
          opportunityId: opp.id,
          name: opp.name,
          ticker: opp.ticker,
          entryPrice,
          currentPrice,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          allocation,
          hasLiveData: !!latest,
        });
      }

      const totalPnlPercent = totalAllocated > 0 ? (totalPnl / totalAllocated) * 100 : 0;

      res.json({
        positions: results,
        totals: {
          totalPnl: Math.round(totalPnl * 100) / 100,
          totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
          totalAllocated: Math.round(totalAllocated * 100) / 100,
          positionCount: results.length,
        },
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/refresh-prices - Fetch latest prices for all public_markets opps with tickers
  app.post("/api/refresh-prices", async (_req, res) => {
    try {
      const opps = await storage.getOpportunities();
      const marketOpps = opps.filter(o => o.domain === "public_markets" && o.ticker);
      
      const tickers = [...new Set(marketOpps.map(o => o.ticker!.toUpperCase()))];
      const results: Record<string, any> = {};

      for (const ticker of tickers) {
        const data = await storage.getLatestMarketData(ticker);
        results[ticker] = data ? { price: data.close, date: data.date } : { price: null, message: "No cached data" };
      }

      res.json({ ok: true, tickers, results });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // BENZINGA NEWS
  // ========================

  app.get("/api/benzinga/news", async (req, res) => {
    try {
      const ticker = req.query.ticker as string | undefined;
      const refresh = req.query.refresh === "true";

      if (refresh) {
        // Get tickers to refresh — either specified or all tracked tickers
        let tickers: string[] = [];
        if (ticker) {
          tickers = [ticker.toUpperCase()];
        } else {
          const opps = await storage.getOpportunities();
          tickers = [...new Set(opps.filter(o => o.ticker).map(o => o.ticker!.toUpperCase()))];
        }
        if (tickers.length > 0) {
          await fetchBenzingaNews(tickers);
        }
      }

      const news = await storage.getBenzingaNews(
        ticker?.toUpperCase(),
        Number(req.query.limit) || 50
      );

      res.json({ news, count: news.length });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/benzinga/sentiment/:ticker", async (req, res) => {
    try {
      const result = await getNewsSentimentScore(req.params.ticker);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // SETTINGS
  // ========================

  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await storage.getAllSettings();
      // Mask API keys for security
      const masked = settings.map(s => ({
        ...s,
        value: (s.key.includes("key") || s.key.includes("secret") || s.key.includes("token") || s.key.includes("password")) && s.value.length > 8
          ? s.value.slice(0, 4) + "****" + s.value.slice(-4)
          : s.value,
        rawLength: s.value.length,
      }));
      res.json(masked);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: "key and value required" });
      const setting = await storage.upsertSetting(key, value);
      res.json({ key: setting.key, updated: true, updatedAt: setting.updatedAt });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/benzinga/status", async (_req, res) => {
    // Always connected — we use public Benzinga pages
    res.json({ connected: true, keyConfigured: true, source: "public" });
  });

  // ========================
  // PUBLIC INSTANT SCORE (no auth required — GET passes through requireAuth)
  // ========================

  // In-memory score cache (15-minute TTL)
  const scoreCache = new Map<string, { data: any; expiresAt: number }>();
  const SCORE_CACHE_TTL = 15 * 60 * 1000;

  // GET /api/score/:ticker — Public instant score for any ticker
  app.get("/api/score/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      if (!ticker || ticker.length > 10 || !/^[A-Z]{1,10}$/.test(ticker)) {
        return res.status(400).json({ error: "Invalid ticker symbol" });
      }

      // Check cache first
      const cached = scoreCache.get(ticker);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json({ ...cached.data, cached: true });
      }

      // Always compute live signals for fresh data
      let signals: Awaited<ReturnType<typeof computeAutoSignals>> = null;
      try { signals = await computeAutoSignals(ticker); } catch {}
      if (!signals) {
        return res.status(404).json({ error: `Could not compute score for ${ticker}. Market data unavailable.` });
      }

      // Use existing name from DB if available
      const opps = await storage.getOpportunities();
      const existing = opps.find(o => o.ticker?.toUpperCase() === ticker);
      const displayName = existing?.name || ticker;

      const weights = {
        momentum: DEFAULT_WEIGHTS.momentum,
        meanReversion: DEFAULT_WEIGHTS.mean_reversion,
        quality: DEFAULT_WEIGHTS.quality,
        flow: DEFAULT_WEIGHTS.flow,
        risk: DEFAULT_WEIGHTS.risk,
        crowding: DEFAULT_WEIGHTS.crowding,
      };

      const sigInputs = {
        momentum: signals.momentum,
        meanReversion: signals.meanReversion,
        quality: signals.quality,
        flow: signals.flow,
        risk: signals.risk,
        crowding: signals.crowding,
      };

      const result = scoreOpportunity(sigInputs, weights, 100);

      const action = suggestAction(result);
      const entryPrice = signals.metadata?.price || 0;
      const priceLevels = entryPrice > 0
        ? computePriceLevels(entryPrice, result.probabilityOfSuccess)
        : { targetPrice: 0, stopLoss: 0 };

      let fundamentals: Awaited<ReturnType<typeof fetchFundamentals>> | null = null;
      try { fundamentals = await fetchFundamentals(ticker); } catch {}

      const price = entryPrice || fundamentals?.currentPrice || null;
      const scoreVal = Math.round(result.probabilityOfSuccess * 100);

      const scoreData = {
        ticker,
        name: displayName,
        price,
        score: scoreVal,
        compositeScore: result.compositeScore,
        probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge,
        conviction: result.convictionBand,
        action,
        signals: {
          momentum: signals.momentum,
          meanReversion: signals.meanReversion,
          quality: signals.quality,
          flow: signals.flow,
          risk: signals.risk,
          crowding: signals.crowding,
        },
        target: priceLevels.targetPrice || null,
        stopLoss: priceLevels.stopLoss || null,
        entry: price,
        fundamentals: fundamentals ? {
          grade: fundamentals.fundamentalGrade,
          score: fundamentals.fundamentalScore,
          pe: fundamentals.peRatio,
          forwardPE: fundamentals.forwardPE,
          fairValue: fundamentals.fairValue,
          fairValueUpside: fundamentals.fairValueUpside,
          profitMargin: fundamentals.profitMargin,
          revenueGrowth: fundamentals.revenueGrowth,
          dividendYield: fundamentals.dividendYield,
        } : null,
        thesis: `${displayName} scores ${scoreVal}/100 with ${result.convictionBand} conviction. ` +
          `Momentum=${signals.momentum}, Quality=${signals.quality}, Flow=${signals.flow}. ` +
          (fundamentals?.fairValueUpside ? `Fair value upside: ${fundamentals.fairValueUpside.toFixed(1)}%. ` : "") +
          (priceLevels.targetPrice ? `Target: $${priceLevels.targetPrice.toFixed(2)}, Stop: $${priceLevels.stopLoss.toFixed(2)}.` : ""),
        scoredAt: new Date().toISOString(),
        cached: false,
      };

      scoreCache.set(ticker, { data: scoreData, expiresAt: Date.now() + SCORE_CACHE_TTL });
      res.json(scoreData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========================
  // AUTO-SCORE (Live Data)
  // ========================

  // POST /api/auto-score/:ticker — Compute signals from live finance data and update opportunity
  app.post("/api/auto-score/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const signals = await computeAutoSignals(ticker);

      if (!signals) {
        return res.status(400).json({ error: `Could not compute signals for ${ticker}. Finance data unavailable.` });
      }

      // Enhance quality signal with fundamental analysis
      try {
        const fundamentals = await fetchFundamentals(ticker);
        if (fundamentals.fundamentalScore > 70) {
          signals.quality = Math.min(100, Math.max(signals.quality, Math.round(70 + fundamentals.fundamentalScore * 0.2)));
        } else if (fundamentals.fundamentalScore >= 50) {
          signals.quality = Math.round(signals.quality * 0.4 + (55 + fundamentals.fundamentalScore * 0.2) * 0.6);
        } else {
          signals.quality = Math.round(signals.quality * 0.4 + (25 + fundamentals.fundamentalScore * 0.3) * 0.6);
        }
        signals.quality = Math.max(0, Math.min(100, signals.quality));
      } catch (e: any) {
        console.log(`[auto-score] Fundamental enhancement skipped for ${ticker}:`, e.message?.slice(0, 100));
      }

      // Find matching opportunity and update
      const opps = await storage.getOpportunities();
      const opp = opps.find(o => o.ticker?.toUpperCase() === ticker);

      if (opp) {
        const now = new Date().toISOString();

        // Update opportunity with new signals
        await storage.updateOpportunity(opp.id, {
          momentum: signals.momentum,
          meanReversion: signals.meanReversion,
          quality: signals.quality,
          flow: signals.flow,
          risk: signals.risk,
          crowding: signals.crowding,
          entryPrice: signals.metadata.price,
          updatedAt: now,
        });

        // Re-score with new signals
        const weights = await storage.getWeights(opp.domain) || {
          momentum: DEFAULT_WEIGHTS.momentum,
          meanReversion: DEFAULT_WEIGHTS.mean_reversion,
          quality: DEFAULT_WEIGHTS.quality,
          flow: DEFAULT_WEIGHTS.flow,
          risk: DEFAULT_WEIGHTS.risk,
          crowding: DEFAULT_WEIGHTS.crowding,
        };

        const portfolio = await storage.getPortfolio();
        const budget = portfolio?.cashRemaining || 100;

        const result = scoreOpportunity(
          {
            momentum: signals.momentum,
            meanReversion: signals.meanReversion,
            quality: signals.quality,
            flow: signals.flow,
            risk: signals.risk,
            crowding: signals.crowding,
          },
          {
            momentum: weights.momentum,
            meanReversion: weights.meanReversion,
            quality: weights.quality,
            flow: weights.flow,
            risk: weights.risk,
            crowding: weights.crowding,
          },
          budget
        );

        const action = suggestAction(result);
        const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

        // Generate AI thesis
        const scoredOpp = {
          ...opp,
          ...result,
          entryPrice: signals.metadata.price,
          targetPrice: priceLevels.targetPrice,
          stopLoss: priceLevels.stopLoss,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          momentum: signals.momentum,
          meanReversion: signals.meanReversion,
          quality: signals.quality,
          flow: signals.flow,
          risk: signals.risk,
          crowding: signals.crowding,
        };
        const thesis = generateThesis(scoredOpp as any, signals);

        const updated = await storage.updateOpportunity(opp.id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          targetPrice: priceLevels.targetPrice,
          stopLoss: priceLevels.stopLoss,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          thesis,
          updatedAt: now,
        });

        // Create prediction audit record
        await storage.createPrediction({
          opportunityId: opp.id,
          action,
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          entryPrice: signals.metadata.price,
          targetPrice: priceLevels.targetPrice,
          stopLoss: priceLevels.stopLoss,
          currentPrice: signals.metadata.price,
          reasoning: thesis,
          signalSnapshot: JSON.stringify({ ...signals, weights }),
          timestamp: now,
        });

        res.json({ signals, score: result, action, opportunity: updated, metadata: signals.metadata });
      } else {
        // No matching opportunity — create one and score it
        const now = new Date().toISOString();
        const newOpp = await storage.createOpportunity({
          name: ticker,
          ticker,
          domain: "public_markets",
          description: `Auto-created from live data scoring`,
          momentum: signals.momentum,
          meanReversion: signals.meanReversion,
          quality: signals.quality,
          flow: signals.flow,
          risk: signals.risk,
          crowding: signals.crowding,
          entryPrice: signals.metadata.price,
          targetPrice: null,
          stopLoss: null,
          status: "watch",
          createdAt: now,
          updatedAt: now,
        });

        // Score the new opportunity
        const weights = await storage.getWeights("public_markets") || {
          momentum: DEFAULT_WEIGHTS.momentum,
          meanReversion: DEFAULT_WEIGHTS.mean_reversion,
          quality: DEFAULT_WEIGHTS.quality,
          flow: DEFAULT_WEIGHTS.flow,
          risk: DEFAULT_WEIGHTS.risk,
          crowding: DEFAULT_WEIGHTS.crowding,
        };
        const portfolio = await storage.getPortfolio();
        const budget = portfolio?.cashRemaining || 100;

        const result = scoreOpportunity(
          {
            momentum: signals.momentum,
            meanReversion: signals.meanReversion,
            quality: signals.quality,
            flow: signals.flow,
            risk: signals.risk,
            crowding: signals.crowding,
          },
          {
            momentum: weights.momentum,
            meanReversion: weights.meanReversion,
            quality: weights.quality,
            flow: weights.flow,
            risk: weights.risk,
            crowding: weights.crowding,
          },
          budget
        );

        const action = suggestAction(result);
        const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

        // Generate AI thesis for new opportunity
        const newScoredOpp = {
          ...newOpp,
          ...result,
          entryPrice: signals.metadata.price,
          targetPrice: priceLevels.targetPrice,
          stopLoss: priceLevels.stopLoss,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          momentum: signals.momentum,
          meanReversion: signals.meanReversion,
          quality: signals.quality,
          flow: signals.flow,
          risk: signals.risk,
          crowding: signals.crowding,
        };
        const newThesis = generateThesis(newScoredOpp as any, signals);

        const updated = await storage.updateOpportunity(newOpp.id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          targetPrice: priceLevels.targetPrice,
          stopLoss: priceLevels.stopLoss,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          thesis: newThesis,
          updatedAt: now,
        });

        await storage.createPrediction({
          opportunityId: newOpp.id,
          action,
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          entryPrice: signals.metadata.price,
          targetPrice: priceLevels.targetPrice,
          stopLoss: priceLevels.stopLoss,
          currentPrice: signals.metadata.price,
          reasoning: newThesis,
          signalSnapshot: JSON.stringify({ ...signals, weights }),
          timestamp: now,
        });

        res.json({ signals, score: result, action, opportunity: updated, metadata: signals.metadata });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/auto-score-all — Compute signals for all public_markets opportunities with tickers
  app.post("/api/auto-score-all", async (_req, res) => {
    try {
      const opps = await storage.getOpportunities();
      const marketOpps = opps.filter(o => o.domain === "public_markets" && o.ticker);

      const results = [];
      for (const opp of marketOpps) {
        try {
          const ticker = opp.ticker!.toUpperCase();
          const signals = await computeAutoSignals(ticker);
          if (signals) {
            // Enhance quality signal with fundamental analysis
            try {
              const fundamentals = await fetchFundamentals(ticker);
              if (fundamentals.fundamentalScore > 70) {
                signals.quality = Math.min(100, Math.max(signals.quality, Math.round(70 + fundamentals.fundamentalScore * 0.2)));
              } else if (fundamentals.fundamentalScore >= 50) {
                signals.quality = Math.round(signals.quality * 0.4 + (55 + fundamentals.fundamentalScore * 0.2) * 0.6);
              } else {
                signals.quality = Math.round(signals.quality * 0.4 + (25 + fundamentals.fundamentalScore * 0.3) * 0.6);
              }
              signals.quality = Math.max(0, Math.min(100, signals.quality));
            } catch { /* skip fundamental enhancement if unavailable */ }

            results.push({
              ticker,
              signals: {
                momentum: signals.momentum,
                meanReversion: signals.meanReversion,
                quality: signals.quality,
                flow: signals.flow,
                risk: signals.risk,
                crowding: signals.crowding,
              },
              price: signals.metadata.price,
            });

            // Update opportunity (same logic as single auto-score)
            const now = new Date().toISOString();
            await storage.updateOpportunity(opp.id, {
              momentum: signals.momentum,
              meanReversion: signals.meanReversion,
              quality: signals.quality,
              flow: signals.flow,
              risk: signals.risk,
              crowding: signals.crowding,
              entryPrice: signals.metadata.price,
              updatedAt: now,
            });

            const weights = await storage.getWeights(opp.domain) || {
              momentum: DEFAULT_WEIGHTS.momentum,
              meanReversion: DEFAULT_WEIGHTS.mean_reversion,
              quality: DEFAULT_WEIGHTS.quality,
              flow: DEFAULT_WEIGHTS.flow,
              risk: DEFAULT_WEIGHTS.risk,
              crowding: DEFAULT_WEIGHTS.crowding,
            };
            const portfolio = await storage.getPortfolio();
            const budget = portfolio?.cashRemaining || 100;

            const result = scoreOpportunity(
              {
                momentum: signals.momentum,
                meanReversion: signals.meanReversion,
                quality: signals.quality,
                flow: signals.flow,
                risk: signals.risk,
                crowding: signals.crowding,
              },
              {
                momentum: weights.momentum,
                meanReversion: weights.meanReversion,
                quality: weights.quality,
                flow: weights.flow,
                risk: weights.risk,
                crowding: weights.crowding,
              },
              budget
            );
            const action = suggestAction(result);
            const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

            // Generate AI thesis with signal snapshot for rich data
            const scoredOpp = {
              ...opp,
              ...result,
              entryPrice: signals.metadata.price,
              targetPrice: priceLevels.targetPrice,
              stopLoss: priceLevels.stopLoss,
              status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
            };
            const thesis = generateThesis(scoredOpp as any, signals);

            await storage.updateOpportunity(opp.id, {
              compositeScore: result.compositeScore,
              probabilityOfSuccess: result.probabilityOfSuccess,
              expectedEdge: result.expectedEdge,
              kellyFraction: result.kellyFraction,
              convictionBand: result.convictionBand,
              suggestedAllocation: result.suggestedAllocation,
              targetPrice: priceLevels.targetPrice,
              stopLoss: priceLevels.stopLoss,
              status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
              thesis,
              updatedAt: now,
            });

            await storage.createPrediction({
              opportunityId: opp.id,
              action,
              compositeScore: result.compositeScore,
              probabilityOfSuccess: result.probabilityOfSuccess,
              expectedEdge: result.expectedEdge,
              kellyFraction: result.kellyFraction,
              convictionBand: result.convictionBand,
              suggestedAllocation: result.suggestedAllocation,
              entryPrice: signals.metadata.price,
              targetPrice: priceLevels.targetPrice,
              stopLoss: priceLevels.stopLoss,
              currentPrice: signals.metadata.price,
              reasoning: thesis,
              signalSnapshot: JSON.stringify(signals),
              timestamp: now,
            });
          } else {
            results.push({ ticker, error: "Failed to compute signals" });
          }
        } catch (e: any) {
          results.push({ ticker: opp.ticker, error: e.message });
        }
      }

      res.json({ results, count: results.length });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/auto-score-crypto — Score all crypto assets via CoinGecko
  app.post("/api/auto-score-crypto", async (_req, res) => {
    try {
      const results = await scoreMultiAssetDomain("crypto", CRYPTO_TICKERS, (t) => computeCryptoSignals(t));
      res.json({ results, count: results.length, domain: "crypto" });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/auto-score-etf — Score all ETF assets via Yahoo Finance
  app.post("/api/auto-score-etf", async (_req, res) => {
    try {
      const results = await scoreMultiAssetDomain("etf", ETF_TICKERS, (t) => computeETFSignals(t));
      res.json({ results, count: results.length, domain: "etf" });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // UNIVERSE SCANNER
  // ========================

  // GET /api/scan-universe — Return last cached scan results
  app.get("/api/scan-universe", async (_req, res) => {
    const cached = getLastScanResults();
    if (!cached) {
      return res.json({ results: [], totalHits: 0, timestamp: null });
    }
    res.json(cached);
  });

  // POST /api/scan-universe — Run all screeners to find new opportunities
  app.post("/api/scan-universe", async (_req, res) => {
    try {
      const results = await scanUniverse();
      setLastScanResults(results);
      res.json({ results, totalHits: results.length, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/scan-universe/add — Add a scanned ticker as a tracked opportunity
  app.post("/api/scan-universe/add", async (req, res) => {
    try {
      const { ticker, name, screeners } = req.body;
      if (!ticker) return res.status(400).json({ error: "ticker required" });

      // Check if already exists
      const existing = (await storage.getOpportunities()).find(
        (o) => o.ticker?.toUpperCase() === ticker.toUpperCase()
      );
      if (existing) {
        // Update screener flags on existing
        const existingFlags = existing.screenerFlags ? JSON.parse(existing.screenerFlags) : [];
        const newFlags = [
          ...existingFlags,
          ...(screeners || []).map((s: any) => ({
            id: s.screenerId,
            name: s.screenerName,
            reason: s.reason,
            confidence: s.confidence,
            detectedAt: s.detectedAt,
          })),
        ];
        await storage.updateOpportunity(existing.id, {
          screenerFlags: JSON.stringify(newFlags),
          updatedAt: new Date().toISOString(),
        });
        return res.json({
          ...existing,
          screenerFlags: JSON.stringify(newFlags),
          message: "Updated existing opportunity with new screener flags",
        });
      }

      const opp = await addScannedOpportunity(ticker, name || ticker, screeners || []);

      // Auto-score the newly added ticker immediately
      try {
        const signals = await computeAutoSignals(ticker.toUpperCase());
        if (signals && opp.id) {
          const now = new Date().toISOString();
          await storage.updateOpportunity(opp.id, {
            momentum: signals.momentum,
            meanReversion: signals.meanReversion,
            quality: signals.quality,
            flow: signals.flow,
            risk: signals.risk,
            crowding: signals.crowding,
            entryPrice: signals.metadata.price,
            updatedAt: now,
          });

          const weights = await storage.getWeights("public_markets") || {
            momentum: DEFAULT_WEIGHTS.momentum,
            meanReversion: DEFAULT_WEIGHTS.mean_reversion,
            quality: DEFAULT_WEIGHTS.quality,
            flow: DEFAULT_WEIGHTS.flow,
            risk: DEFAULT_WEIGHTS.risk,
            crowding: DEFAULT_WEIGHTS.crowding,
          };
          const portfolio = await storage.getPortfolio();
          const budget = portfolio?.cashRemaining || 100;

          const result = scoreOpportunity(
            {
              momentum: signals.momentum,
              meanReversion: signals.meanReversion,
              quality: signals.quality,
              flow: signals.flow,
              risk: signals.risk,
              crowding: signals.crowding,
            },
            {
              momentum: weights.momentum,
              meanReversion: weights.meanReversion,
              quality: weights.quality,
              flow: weights.flow,
              risk: weights.risk,
              crowding: weights.crowding,
            },
            budget
          );
          const action = suggestAction(result);
          const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

          const scored = await storage.updateOpportunity(opp.id, {
            compositeScore: result.compositeScore,
            probabilityOfSuccess: result.probabilityOfSuccess,
            expectedEdge: result.expectedEdge,
            kellyFraction: result.kellyFraction,
            convictionBand: result.convictionBand,
            suggestedAllocation: result.suggestedAllocation,
            targetPrice: priceLevels.targetPrice,
            stopLoss: priceLevels.stopLoss,
            status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
            updatedAt: now,
          });

          await storage.createPrediction({
            opportunityId: opp.id,
            action,
            compositeScore: result.compositeScore,
            probabilityOfSuccess: result.probabilityOfSuccess,
            expectedEdge: result.expectedEdge,
            kellyFraction: result.kellyFraction,
            convictionBand: result.convictionBand,
            suggestedAllocation: result.suggestedAllocation,
            entryPrice: signals.metadata.price,
            targetPrice: priceLevels.targetPrice,
            stopLoss: priceLevels.stopLoss,
            currentPrice: signals.metadata.price,
            reasoning: `Track-This auto-scored: Mom=${signals.momentum} MR=${signals.meanReversion} Qual=${signals.quality} Flow=${signals.flow} Risk=${signals.risk} Crowd=${signals.crowding}`,
            signalSnapshot: JSON.stringify({ ...signals, weights }),
            timestamp: now,
          });

          return res.json({ ...scored, autoScored: true });
        }
      } catch (scoreErr: any) {
        console.error(`[scan-universe/add] Auto-score failed for ${ticker}: ${scoreErr.message}`);
      }

      res.json(opp);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // ALPACA TRADING
  // ========================

  app.get("/api/alpaca/status", async (_req, res) => {
    try {
      const connected = await isAlpacaConnected();
      if (connected) {
        const account = await getAccount();
        res.json({
          connected: true,
          mode: "alpaca",
          account: {
            equity: account.equity,
            buyingPower: account.buying_power,
            cash: account.cash,
            portfolioValue: account.portfolio_value,
          },
        });
      } else {
        // Fall back to paper trading engine
        const account = await getPaperAccountSummary();
        res.json({
          connected: true,
          mode: "paper-local",
          account,
        });
      }
    } catch (e: any) {
      // Even on error, paper trading is always available
      try {
        const account = await getPaperAccountSummary();
        res.json({ connected: true, mode: "paper-local", account });
      } catch {
        res.json({ connected: false, error: e.message });
      }
    }
  });

  app.get("/api/alpaca/positions", async (_req, res) => {
    try {
      const alpacaConnected = await isAlpacaConnected();
      if (alpacaConnected) {
        const positions = await getPositions();
        res.json({ positions });
      } else {
        // Return paper positions in Alpaca-compatible format
        const paperPos = await getPaperPositions();
        const positions = paperPos.map(p => ({
          symbol: p.ticker,
          qty: String(p.shares),
          avg_entry_price: String(p.avgEntryPrice),
          current_price: String(p.currentPrice || p.avgEntryPrice),
          market_value: String(p.marketValue || 0),
          unrealized_pl: String(p.unrealizedPnl || 0),
          unrealized_plpc: String((p.unrealizedPnlPct || 0) / 100),
          side: p.side,
          asset_class: "us_equity",
          _paper: true,
        }));
        res.json({ positions });
      }
    } catch (e: any) {
      // Fallback: always return paper positions
      try {
        const paperPos = await getPaperPositions();
        const positions = paperPos.map(p => ({
          symbol: p.ticker,
          qty: String(p.shares),
          avg_entry_price: String(p.avgEntryPrice),
          current_price: String(p.currentPrice || p.avgEntryPrice),
          market_value: String(p.marketValue || 0),
          unrealized_pl: String(p.unrealizedPnl || 0),
          unrealized_plpc: String((p.unrealizedPnlPct || 0) / 100),
          side: p.side,
          asset_class: "us_equity",
          _paper: true,
        }));
        res.json({ positions });
      } catch {
        res.status(400).json({ error: e.message });
      }
    }
  });

  app.get("/api/alpaca/orders", async (req, res) => {
    try {
      const alpacaConnected = await isAlpacaConnected();
      if (alpacaConnected) {
        const status = (req.query.status as string) || "all";
        const orders = await getOrders(status);
        res.json({ orders });
      } else {
        // Return paper orders in Alpaca-compatible format
        const paperOrd = await getPaperOrders();
        const orders = paperOrd.map(o => ({
          id: String(o.id),
          symbol: o.ticker,
          qty: String(o.shares),
          notional: String(o.shares * o.price),
          side: o.action.toLowerCase(),
          type: "market",
          status: o.status,
          created_at: o.createdAt,
          filled_avg_price: String(o.price),
          _paper: true,
        }));
        res.json({ orders });
      }
    } catch (e: any) {
      try {
        const paperOrd = await getPaperOrders();
        const orders = paperOrd.map(o => ({
          id: String(o.id),
          symbol: o.ticker,
          qty: String(o.shares),
          notional: String(o.shares * o.price),
          side: o.action.toLowerCase(),
          type: "market",
          status: o.status,
          created_at: o.createdAt,
          filled_avg_price: String(o.price),
          _paper: true,
        }));
        res.json({ orders });
      } catch {
        res.status(400).json({ error: e.message });
      }
    }
  });

  // POST /api/alpaca/execute/:id — Execute a BUY for an opportunity
  app.post("/api/alpaca/execute/:id", async (req, res) => {
    try {
      const opp = await storage.getOpportunity(Number(req.params.id));
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });
      if (!opp.ticker) return res.status(400).json({ error: "No ticker symbol" });
      if (!opp.suggestedAllocation || opp.suggestedAllocation <= 0)
        return res.status(400).json({ error: "No allocation — run Auto-Score first" });
      
      // Broker-aware order validation
      const brokerMode = (await storage.getSetting("broker_mode"))?.value || "alpaca_fractional";
      // alpaca_fractional: supports fractional shares, min $1 notional
      // whole_shares: traditional broker, whole shares only
      
      if (brokerMode === "alpaca_fractional") {
        // Alpaca: minimum $1 notional order
        if (opp.suggestedAllocation < 1.00) {
          return res.status(400).json({ error: `Allocation $${opp.suggestedAllocation.toFixed(2)} is below Alpaca minimum of $1.00` });
        }
      } else {
        // Whole shares mode: need enough $ for at least 1 share
        // We'll compute this after fetching the live price below
      }

      // Kill switch check
      try {
        const macro = await fetchMacroSnapshot();
        if (macro.regime === "CRISIS") {
          return res.status(403).json({ error: "KILL SWITCH ACTIVE: Market in CRISIS regime. No new trades allowed.", regime: macro.regime });
        }
      } catch { /* If macro check fails, allow trade but log warning */ }

      // Rate limiting and duplicate order prevention
      const rateCheck = rateLimiter.canTrade(opp.ticker!);
      if (!rateCheck.allowed) {
        return res.status(429).json({ error: rateCheck.reason });
      }

      // CRITICAL: Fetch CURRENT market price for execution, not stale entry price
      let currentPrice = opp.entryPrice || 0;
      try {
        const signals = await computeAutoSignals(opp.ticker);
        if (signals?.metadata?.price && signals.metadata.price > 0) {
          currentPrice = signals.metadata.price;
          // Update opportunity with fresh price and signals
          await storage.updateOpportunity(opp.id, {
            entryPrice: currentPrice,
            momentum: signals.momentum,
            meanReversion: signals.meanReversion,
            quality: signals.quality,
            flow: signals.flow,
            risk: signals.risk,
            crowding: signals.crowding,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error(`[execute] Failed to fetch live price for ${opp.ticker}, using stored price $${currentPrice}`);
      }

      if (currentPrice <= 0) {
        return res.status(400).json({ error: `Cannot determine current price for ${opp.ticker}. Run Auto-Score first.` });
      }

      // Whole-share validation for traditional brokers
      let orderQty: number | null = null; // null = use notional (fractional)
      let orderNotional: number | null = opp.suggestedAllocation;
      
      if (brokerMode === "whole_shares") {
        const wholeShares = Math.floor(opp.suggestedAllocation / currentPrice);
        if (wholeShares < 1) {
          return res.status(400).json({
            error: `Cannot buy whole shares: $${opp.suggestedAllocation.toFixed(2)} allocation ÷ $${currentPrice.toFixed(2)} per share = ${(opp.suggestedAllocation / currentPrice).toFixed(4)} shares. Need at least $${currentPrice.toFixed(2)} for 1 share. Increase budget or choose a lower-priced stock.`,
            requiredForOneShare: currentPrice,
            currentAllocation: opp.suggestedAllocation,
            fractionalShares: Math.round((opp.suggestedAllocation / currentPrice) * 10000) / 10000,
          });
        }
        orderQty = wholeShares;
        orderNotional = null; // use qty instead of notional
      }

      const targetPrice = opp.targetPrice || currentPrice * 1.1;
      const stopLoss = opp.stopLoss || currentPrice * 0.95;

      // Check if Alpaca is connected — if not, use paper trading
      const alpacaConnected = await isAlpacaConnected();

      if (alpacaConnected) {
        const order = await placeBracketOrder(
          opp.ticker,
          orderNotional || (orderQty! * currentPrice),
          targetPrice,
          stopLoss
        );

        rateLimiter.recordTrade(opp.ticker!);

        await storage.updateOpportunity(opp.id, {
          status: "buy",
          entryPrice: currentPrice,
          updatedAt: new Date().toISOString(),
        });

        res.json({
          order,
          message: brokerMode === "whole_shares"
            ? `Bracket order placed: ${orderQty} share(s) of ${opp.ticker} at $${currentPrice.toFixed(2)} ($${(orderQty! * currentPrice).toFixed(2)}) with TP=$${targetPrice.toFixed(2)}, SL=$${stopLoss.toFixed(2)}`
            : `Bracket order placed: $${opp.suggestedAllocation.toFixed(2)} of ${opp.ticker} at $${currentPrice.toFixed(2)} (${(opp.suggestedAllocation / currentPrice).toFixed(4)} fractional shares) with TP=$${targetPrice.toFixed(2)}, SL=$${stopLoss.toFixed(2)}`,
          executionPrice: currentPrice,
          brokerMode,
          shares: brokerMode === "whole_shares" ? orderQty : Math.round((opp.suggestedAllocation / currentPrice) * 10000) / 10000,
          wholeSharesOnly: brokerMode === "whole_shares",
          notionalValue: brokerMode === "whole_shares" ? (orderQty! * currentPrice) : opp.suggestedAllocation,
        });
      } else {
        // Paper trading execution
        const shares = orderQty || (opp.suggestedAllocation / currentPrice);
        const order = await executePaperTrade(opp.ticker, "BUY", shares, currentPrice, opp.id);

        rateLimiter.recordTrade(opp.ticker!);

        await storage.updateOpportunity(opp.id, {
          status: "buy",
          entryPrice: currentPrice,
          updatedAt: new Date().toISOString(),
        });

        res.json({
          order,
          message: `[PAPER] Bought ${shares.toFixed(4)} shares of ${opp.ticker} at $${currentPrice.toFixed(2)}`,
          executionPrice: currentPrice,
          brokerMode: "paper-local",
          shares,
          notionalValue: shares * currentPrice,
          _paper: true,
        });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/alpaca/sell/:id — Close position for an opportunity
  app.post("/api/alpaca/sell/:id", async (req, res) => {
    try {
      const opp = await storage.getOpportunity(Number(req.params.id));
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });
      if (!opp.ticker) return res.status(400).json({ error: "No ticker symbol" });

      const alpacaConnected = await isAlpacaConnected();

      if (alpacaConnected) {
        const result = await closePosition(opp.ticker);
        await storage.updateOpportunity(opp.id, {
          status: "closed",
          updatedAt: new Date().toISOString(),
        });
        res.json({ result, message: `Position closed for ${opp.ticker}` });
      } else {
        // Paper trading: close position
        const order = await closePaperPosition(opp.ticker);
        await storage.updateOpportunity(opp.id, {
          status: "closed",
          updatedAt: new Date().toISOString(),
        });
        res.json({ result: order, message: `[PAPER] Position closed for ${opp.ticker}`, _paper: true });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/alpaca/close-all — Close all positions
  app.post("/api/alpaca/close-all", async (_req, res) => {
    try {
      const alpacaConnected = await isAlpacaConnected();

      if (alpacaConnected) {
        const result = await closeAllPositions();
        res.json({ result, message: "All positions closed" });
      } else {
        const result = await closeAllPaperPositions();
        res.json({ result, message: `[PAPER] Closed ${result.closed} paper positions`, _paper: true });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // FEEDBACK & LEARNING
  // ========================

  // GET /api/feedback/outcomes — Evaluate all predictions
  app.get("/api/feedback/outcomes", async (_req, res) => {
    try {
      const outcomes = await evaluateOutcomes();
      const totalWins = outcomes.filter((o) => o.outcome === "win").length;
      const totalLosses = outcomes.filter((o) => o.outcome === "loss").length;
      const totalOpen = outcomes.filter((o) => o.outcome === "open").length;
      const hitRate =
        totalWins + totalLosses > 0
          ? (totalWins / (totalWins + totalLosses)) * 100
          : 0;

      res.json({
        outcomes,
        summary: {
          totalWins,
          totalLosses,
          totalOpen,
          hitRate: Math.round(hitRate * 10) / 10,
          total: outcomes.length,
        },
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/feedback/signal-accuracy — Per-signal hit rates
  app.get("/api/feedback/signal-accuracy", async (_req, res) => {
    try {
      const outcomes = await evaluateOutcomes();
      const accuracy = computeSignalAccuracy(outcomes);
      res.json({ accuracy });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/feedback/auto-tune — Run weight optimization and apply
  app.post("/api/feedback/auto-tune", async (_req, res) => {
    try {
      const outcomes = await evaluateOutcomes();
      const newWeights = await autoTuneWeights(outcomes);

      // Apply to all domains
      const allWeights = await storage.getAllWeights();
      for (const w of allWeights) {
        await storage.updateWeights(w.domain, {
          momentum: newWeights.momentum,
          meanReversion: newWeights.meanReversion,
          quality: newWeights.quality,
          flow: newWeights.flow,
          risk: newWeights.risk,
          crowding: newWeights.crowding,
        });
      }

      // Rescore all opportunities with new weights
      const opps = await storage.getOpportunities();
      const rescored = [];
      for (const opp of opps) {
        const portfolio = await storage.getPortfolio();
        const budget = portfolio?.cashRemaining || 100;
        const result = scoreOpportunity(
          {
            momentum: opp.momentum,
            meanReversion: opp.meanReversion,
            quality: opp.quality,
            flow: opp.flow,
            risk: opp.risk,
            crowding: opp.crowding,
          },
          {
            momentum: newWeights.momentum,
            meanReversion: newWeights.meanReversion,
            quality: newWeights.quality,
            flow: newWeights.flow,
            risk: newWeights.risk,
            crowding: newWeights.crowding,
          },
          budget
        );
        const action = suggestAction(result);
        await storage.updateOpportunity(opp.id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          updatedAt: new Date().toISOString(),
        });
        rescored.push({ id: opp.id, name: opp.name });
      }

      const signalAccuracy = computeSignalAccuracy(outcomes);
      res.json({ newWeights, signalAccuracy, rescoredCount: rescored.length });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // RISK MANAGEMENT
  // ========================

  // POST /api/risk/evaluate — Evaluate all open positions against risk rules
  app.post("/api/risk/evaluate", async (_req, res) => {
    try {
      const opps = await storage.getOpportunities();
      const openPositions = opps.filter(o => o.status === "buy" && o.entryPrice && o.ticker);

      const decisions = [];
      for (const opp of openPositions) {
        const latest = opp.ticker ? await storage.getLatestMarketData(opp.ticker.toUpperCase()) : null;
        const currentPrice = latest?.close || opp.entryPrice!;
        const allData = opp.ticker ? await storage.getMarketData(opp.ticker.toUpperCase()) : [];
        const recentPrices = allData.slice(-6).map(d => d.close);

        const highWaterMark = Math.max(opp.entryPrice!, ...recentPrices);

        const position: Position = {
          ticker: opp.ticker!,
          entryPrice: opp.entryPrice!,
          entryDate: opp.createdAt,
          currentPrice,
          highWaterMark,
          shares: opp.suggestedAllocation ? opp.suggestedAllocation / opp.entryPrice! : 0,
          allocation: opp.suggestedAllocation || 0,
          partialTaken: false,
          compositeScore: opp.compositeScore || 0,
          screenerCount: opp.screenerFlags ? JSON.parse(opp.screenerFlags).length : 0,
        };

        const decision = evaluatePosition(position, recentPrices);
        decisions.push({
          opportunityId: opp.id,
          ticker: opp.ticker,
          name: opp.name,
          ...decision,
          currentPrice,
          entryPrice: opp.entryPrice,
          pnlPercent: ((currentPrice - opp.entryPrice!) / opp.entryPrice!) * 100,
        });
      }

      // Portfolio-level risk
      const portfolio = await storage.getPortfolio();
      const portfolioRisk = evaluatePortfolioRisk(
        portfolio?.cashRemaining || 100,
        portfolio?.totalBudget || 100,
        openPositions.length,
      );

      res.json({ decisions, portfolioRisk, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // MACRO ENVIRONMENT
  // ========================

  // GET /api/macro — Get current macro environment snapshot
  app.get("/api/macro", async (_req, res) => {
    try {
      const snapshot = await fetchMacroSnapshot();
      res.json(snapshot);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/intelligence — Full market intelligence snapshot
  app.get("/api/intelligence", async (_req, res) => {
    try {
      const intel = await fetchFullIntelligence();
      res.json(intel);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // EXECUTION PIPELINE
  // ========================

  // POST /api/pipeline/run — Run the full daily pipeline
  app.post("/api/pipeline/run", async (_req, res) => {
    try {
      if (!rateLimiter.canRunPipeline()) {
        return res.status(429).json({ error: "Pipeline can only run once every 5 minutes" });
      }
      const result = await runDailyPipeline();

      // Run daily digest as part of pipeline (once per day at 8am)
      let digestResult = null;
      try {
        const { runDigestIfNeeded } = await import("./daily-digest");
        digestResult = await runDigestIfNeeded();
      } catch (e) {
        console.error("[pipeline] Digest generation failed:", e);
      }

      res.json({ ...result, digest: digestResult });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/capital — Current capital state
  app.get("/api/capital", async (_req, res) => {
    try {
      const state = await computeCapitalState();
      res.json(state);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/costs — Cost tracking metrics
  app.get("/api/costs", async (_req, res) => {
    res.json(getCostMetrics());
  });

  // POST /api/costs/reset — Reset cost counters
  app.post("/api/costs/reset", async (_req, res) => {
    resetCostMetrics();
    res.json({ ok: true, message: "Cost metrics reset" });
  });

  // GET /api/sell-signals — Check which positions should be sold
  app.get("/api/sell-signals", async (_req, res) => {
    try {
      const sells = await sellSideScreen();
      res.json({ sells, count: sells.length });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/earnings-check — Check earnings blackout for tickers
  app.post("/api/earnings-check", async (req, res) => {
    try {
      const { tickers } = req.body;
      if (!tickers || !Array.isArray(tickers)) return res.status(400).json({ error: "tickers array required" });
      const result = checkEarningsBlackout(tickers);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/pipeline/approve — Approve a pending buy/sell from the pipeline
  app.post("/api/pipeline/approve", async (req, res) => {
    try {
      const { opportunityId, action } = req.body;
      if (!opportunityId || !action) return res.status(400).json({ error: "opportunityId and action required" });
      
      const opp = await storage.getOpportunity(opportunityId);
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });
      
      if (action === "BUY") {
        // Kill switch check for BUY approvals
        try {
          const macro = await fetchMacroSnapshot();
          if (macro.regime === "CRISIS") {
            return res.status(403).json({ error: "KILL SWITCH ACTIVE: Market in CRISIS regime. No new trades allowed.", regime: macro.regime });
          }
        } catch { /* If macro check fails, allow approval but log warning */ }

        // Mark as approved for execution
        await storage.updateOpportunity(opportunityId, { status: "buy", updatedAt: new Date().toISOString() });
        res.json({ approved: true, action: "BUY", ticker: opp.ticker, message: `Approved BUY for ${opp.ticker}. Execute via Trading page or broker API.` });
      } else if (action === "SELL") {
        await storage.updateOpportunity(opportunityId, { status: "closed", updatedAt: new Date().toISOString() });
        res.json({ approved: true, action: "SELL", ticker: opp.ticker, message: `Approved SELL for ${opp.ticker}. Position marked as closed.` });
      } else if (action === "REJECT") {
        res.json({ approved: false, action: "REJECT", ticker: opp.ticker, message: `Rejected trade for ${opp.ticker}.` });
      } else {
        res.status(400).json({ error: "action must be BUY, SELL, or REJECT" });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // REAL-TIME STREAMING
  // ========================

  // GET /api/realtime/stream — SSE endpoint for live price updates
  app.get("/api/realtime/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ message: "Real-time stream connected" })}\n\n`);

    addClient(res);

    // Start polling if not already running
    startRealtime(30000); // 30 second intervals

    req.on("close", () => {
      removeClient(res);
    });
  });

  // GET /api/realtime/status — Current realtime engine status
  app.get("/api/realtime/status", (_req, res) => {
    res.json(getRealtimeStatus());
  });

  // POST /api/realtime/start — Start the realtime engine
  app.post("/api/realtime/start", (_req, res) => {
    const interval = 30000; // 30 seconds
    startRealtime(interval);
    res.json({ started: true, intervalMs: interval });
  });

  // POST /api/realtime/stop — Stop the realtime engine
  app.post("/api/realtime/stop", (_req, res) => {
    stopRealtime();
    res.json({ stopped: true });
  });

  // ========================
  // FUNDAMENTAL ANALYSIS
  // ========================

  // GET /api/fundamentals/:ticker — Get fundamental analysis for a ticker
  app.get("/api/fundamentals/:ticker", async (req, res) => {
    try {
      const { ticker } = req.params;
      if (!ticker || ticker.length > 10) {
        return res.status(400).json({ error: "Invalid ticker" });
      }
      const data = await fetchFundamentals(ticker);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/fundamentals/batch — Get fundamentals for multiple tickers
  app.post("/api/fundamentals/batch", async (req, res) => {
    try {
      const { tickers } = req.body;
      if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: "tickers array required" });
      }
      const limited = tickers.slice(0, 20);
      const results = await fetchFundamentalsBatch(limited);
      const obj: Record<string, any> = {};
      results.forEach((v, k) => { obj[k] = v; });
      res.json(obj);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========================
  // PORTFOLIO ANALYTICS
  // ========================

  app.get("/api/portfolio/analytics", async (_req, res) => {
    try {
      const analytics = await computePortfolioAnalytics();
      res.json(analytics);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // WATCHLISTS
  // ========================

  app.get("/api/watchlists", async (_req, res) => {
    try {
      const lists = await storage.getWatchlists();
      res.json(lists);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/watchlists", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const watchlist = await storage.createWatchlist({ name, createdAt: new Date().toISOString() });
      res.json(watchlist);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/watchlists/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const watchlist = await storage.getWatchlist(id);
      if (!watchlist) return res.status(404).json({ error: "Not found" });
      const items = await storage.getWatchlistItems(id);
      res.json({ ...watchlist, items });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/watchlists/:id", async (req, res) => {
    try {
      await storage.deleteWatchlist(Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/watchlists/:id/items", async (req, res) => {
    try {
      const watchlistId = Number(req.params.id);
      const { ticker, notes } = req.body;
      if (!ticker) return res.status(400).json({ error: "ticker required" });
      const item = await storage.addWatchlistItem({
        watchlistId,
        ticker: ticker.toUpperCase(),
        addedAt: new Date().toISOString(),
        notes: notes || null,
      });
      res.json(item);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/watchlists/:id/items/:itemId", async (req, res) => {
    try {
      await storage.removeWatchlistItem(Number(req.params.itemId));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // STRATEGIES (LEADERBOARD)
  // ========================

  app.get("/api/strategies", async (_req, res) => {
    try {
      const list = await storage.getStrategies();
      res.json(list);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/strategies", async (req, res) => {
    try {
      const { name, description, sharpeRatio, totalReturn, maxDrawdown, winRate, tradeCount } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const strategy = await storage.createStrategy({
        name,
        description: description || null,
        sharpeRatio: sharpeRatio ?? null,
        totalReturn: totalReturn ?? null,
        maxDrawdown: maxDrawdown ?? null,
        winRate: winRate ?? null,
        tradeCount: tradeCount ?? null,
        updatedAt: new Date().toISOString(),
        isPublic: 1,
      });
      res.json(strategy);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // DAILY DIGEST
  // ========================

  app.get("/api/digest/preview", async (_req, res) => {
    try {
      const digestSetting = await storage.getSetting("last_digest");
      if (digestSetting?.value) {
        res.json(JSON.parse(digestSetting.value));
      } else {
        // Generate a fresh preview
        const { generateDailyDigest } = await import("./daily-digest");
        const digest = await generateDailyDigest();
        res.json(digest);
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/digest/generate", async (_req, res) => {
    try {
      const { generateDailyDigest } = await import("./daily-digest");
      const digest = await generateDailyDigest();
      // Store for preview
      await storage.upsertSetting("last_digest", JSON.stringify(digest));
      // Create notification
      await storage.createNotification({
        type: "daily_summary",
        title: `Daily Digest — ${digest.date}`,
        message: digest.summary,
        ticker: null,
        read: 0,
        createdAt: new Date().toISOString(),
      });
      res.json(digest);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // RESEARCH WIKI
  // ========================

  app.get("/api/wiki", async (_req, res) => {
    try {
      const index = await getWikiIndex();
      res.json({ content: index });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/wiki/ticker/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const page = await getTickerPage(ticker);
      if (!page) return res.status(404).json({ error: `No wiki page for ${ticker}` });
      res.json({ ticker, content: page });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/wiki/query", async (req, res) => {
    try {
      const { q } = req.body;
      if (!q || typeof q !== "string") return res.status(400).json({ error: "Query string 'q' is required" });
      const result = await queryWiki(q);
      res.json({ query: q, result });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/wiki/log", async (_req, res) => {
    try {
      const log = await getWikiLog(50);
      res.json({ content: log });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // NOTIFICATIONS
  // ========================

  app.get("/api/notifications", async (_req, res) => {
    try {
      const list = await storage.getNotifications(50);
      res.json(list);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/notifications/unread-count", async (_req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount();
      res.json({ count });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      await storage.markNotificationRead(Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/notifications/read-all", async (_req, res) => {
    try {
      await storage.markAllNotificationsRead();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  return httpServer;
}
