import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scoreOpportunity, suggestAction, computePriceLevels } from "./scoring-engine";
import { insertOpportunitySchema, DEFAULT_WEIGHTS } from "@shared/schema";
import { fetchBenzingaNews, getNewsSentimentScore } from "./benzinga-service";
import { computeAutoSignals } from "./auto-signals";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

        await storage.updateOpportunity(opp.id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          updatedAt: now,
        });

        results.push({ id: opp.id, name: opp.name, ...result, action });
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
        value: s.key.includes("api_key") && s.value.length > 8
          ? s.value.slice(0, 4) + "..." + s.value.slice(-4)
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
      res.json(setting);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/benzinga/status", async (_req, res) => {
    // Always connected — we use public Benzinga pages
    res.json({ connected: true, keyConfigured: true, source: "public" });
  });

  // ========================
  // AUTO-SCORE (Live Data)
  // ========================

  // POST /api/auto-score/:ticker — Compute signals from live finance data and update opportunity
  app.post("/api/auto-score/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const signals = computeAutoSignals(ticker);

      if (!signals) {
        return res.status(400).json({ error: `Could not compute signals for ${ticker}. Finance data unavailable.` });
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
          reasoning: `Auto-scored from live data: Mom=${signals.momentum} MR=${signals.meanReversion} Qual=${signals.quality} Flow=${signals.flow} Risk=${signals.risk} Crowd=${signals.crowding}`,
          signalSnapshot: JSON.stringify({ ...signals, weights }),
          timestamp: now,
        });

        res.json({ signals, score: result, action, opportunity: updated, metadata: signals.metadata });
      } else {
        // No matching opportunity — just return the computed signals
        res.json({
          signals,
          metadata: signals.metadata,
          opportunity: null,
          message: `No opportunity found with ticker ${ticker}. Signals computed but not saved.`,
        });
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
          const signals = computeAutoSignals(ticker);
          if (signals) {
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
              reasoning: `Bulk auto-scored: Mom=${signals.momentum} MR=${signals.meanReversion} Qual=${signals.quality} Flow=${signals.flow} Risk=${signals.risk} Crowd=${signals.crowding}`,
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

  return httpServer;
}
