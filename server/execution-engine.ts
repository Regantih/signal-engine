import { storage } from "./storage";
import { scanUniverse, addScannedOpportunity } from "./universe-scanner";
import { computeAutoSignals } from "./auto-signals";
import { computeCryptoSignals, CRYPTO_TICKERS } from "./crypto-signals";
import { computeETFSignals, ETF_TICKERS } from "./etf-signals";
import { scoreOpportunity, suggestAction, computePriceLevels } from "./scoring-engine";
import { evaluatePosition, evaluatePortfolioRisk, convictionSize, type Position } from "./risk-manager";
import { fetchMacroSnapshot } from "./macro-monitor";
import { resolveOldPredictions } from "./prediction-resolver";
import { DEFAULT_WEIGHTS } from "@shared/schema";
import { isTVMCPAvailable, deploySignalAlertPineScript } from "./tradingview-bridge";

// Cost tracking
let apiCallCount = 0;
let sessionStartTime = Date.now();

function trackCost(calls: number = 1) { apiCallCount += calls; }

export function getCostMetrics() {
  const uptimeMinutes = (Date.now() - sessionStartTime) / 60000;
  return {
    apiCalls: apiCallCount,
    uptimeMinutes: Math.round(uptimeMinutes),
    estimatedCostUsd: Math.round(apiCallCount * 0.001 * 100) / 100,
    callsPerHour: uptimeMinutes > 0 ? Math.round((apiCallCount / uptimeMinutes) * 60) : 0,
  };
}

export function resetCostMetrics() {
  apiCallCount = 0;
  sessionStartTime = Date.now();
}

// Check if a ticker has earnings within N days
// No free earnings calendar API — return not-blocked for all tickers
export function checkEarningsBlackout(tickers: string[]): Record<string, { blocked: boolean; earningsDate: string | null; daysUntil: number | null }> {
  const result: Record<string, { blocked: boolean; earningsDate: string | null; daysUntil: number | null }> = {};
  for (const t of tickers) result[t] = { blocked: false, earningsDate: null, daysUntil: null };
  return result;
}

// Sell-side screener: check which current positions should be exited
export async function sellSideScreen(): Promise<Array<{ opportunityId: number; ticker: string; reason: string; urgency: string }>> {
  const opps = await storage.getOpportunities();
  const openPositions = opps.filter(o => o.status === "buy" && o.ticker && o.entryPrice);
  const sells: Array<{ opportunityId: number; ticker: string; reason: string; urgency: string }> = [];

  for (const opp of openPositions) {
    const ticker = opp.ticker!.toUpperCase();
    const allData = await storage.getMarketData(ticker);
    const recentPrices = allData.slice(-6).map(d => d.close);
    const currentPrice = recentPrices.length > 0 ? recentPrices[recentPrices.length - 1] : opp.entryPrice!;
    const highWaterMark = Math.max(opp.entryPrice!, ...recentPrices);

    const position: Position = {
      ticker,
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
    if (decision.action === "SELL_ALL" || decision.action === "SELL_HALF") {
      sells.push({ opportunityId: opp.id, ticker, reason: decision.reason, urgency: decision.urgency });
    }

    const pnlPercent = ((currentPrice - opp.entryPrice!) / opp.entryPrice!) * 100;
    const holdDays = Math.ceil((Date.now() - new Date(opp.createdAt).getTime()) / 86400000);

    if (holdDays > 30 && pnlPercent < -2) {
      sells.push({ opportunityId: opp.id, ticker, reason: `Stale losing position: held ${holdDays} days at ${pnlPercent.toFixed(1)}%`, urgency: "end_of_day" });
    }
  }

  return sells;
}

// Capital tracker
export interface CapitalState {
  totalBudget: number;
  cashAvailable: number;
  deployed: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalValue: number;
  positions: Array<{ ticker: string; allocation: number; currentValue: number; pnl: number }>;
}

export async function computeCapitalState(): Promise<CapitalState> {
  const portfolio = await storage.getPortfolio();
  const opps = await storage.getOpportunities();
  const buyOpps = opps.filter(o => o.status === "buy" && o.entryPrice && o.ticker);

  let deployed = 0;
  let unrealizedPnl = 0;
  const positions: CapitalState["positions"] = [];

  for (const opp of buyOpps) {
    const allocation = opp.suggestedAllocation || 0;
    deployed += allocation;

    const latest = opp.ticker ? await storage.getLatestMarketData(opp.ticker.toUpperCase()) : null;
    const currentPrice = latest?.close || opp.entryPrice!;
    const shares = allocation / opp.entryPrice!;
    const currentValue = shares * currentPrice;
    const pnl = currentValue - allocation;
    unrealizedPnl += pnl;

    positions.push({ ticker: opp.ticker!, allocation, currentValue: Math.round(currentValue * 100) / 100, pnl: Math.round(pnl * 100) / 100 });
  }

  const totalBudget = portfolio?.totalBudget || 100;
  const realizedPnl = portfolio?.totalPnl || 0;
  const cashAvailable = totalBudget - deployed + realizedPnl;

  return {
    totalBudget,
    cashAvailable: Math.round(cashAvailable * 100) / 100,
    deployed: Math.round(deployed * 100) / 100,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    totalValue: Math.round((cashAvailable + deployed + unrealizedPnl) * 100) / 100,
    positions,
  };
}

// Score a list of tickers for a given domain, creating opportunities if they don't exist
async function scoreDomainAssets(
  domain: string,
  tickers: string[],
  computeSignals: (ticker: string) => Promise<{ momentum: number; meanReversion: number; quality: number; flow: number; risk: number; crowding: number; metadata: { ticker: string; price: number; computedAt: string; dataPoints: Record<string, any> } } | null>,
  macroRegime: string,
  macroAdjustment: number,
  pending: Array<{ type: "BUY" | "SELL"; ticker: string; reason: string; allocation?: number; opportunityId: number }>,
): Promise<number> {
  let scored = 0;
  const opps = await storage.getOpportunities();

  for (const ticker of tickers) {
    try {
      const signals = await computeSignals(ticker);
      if (!signals) continue;

      const now = new Date().toISOString();

      // Find or create opportunity
      let opp = opps.find(o => o.ticker?.toUpperCase() === ticker.toUpperCase() && o.domain === domain);
      if (!opp) {
        const created = await storage.createOpportunity({
          name: `${ticker} (${domain})`,
          ticker: ticker.toUpperCase(),
          domain,
          description: `Auto-discovered ${domain} asset`,
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
          screenerFlags: null,
          createdAt: now,
          updatedAt: now,
        });
        opp = created;
      } else {
        await storage.updateOpportunity(opp.id, {
          momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality,
          flow: signals.flow, risk: signals.risk, crowding: signals.crowding,
          entryPrice: signals.metadata.price, updatedAt: now,
        });
      }

      const weights = await storage.getWeights(domain) || {
        momentum: 0.20, meanReversion: 0.15, quality: 0.25, flow: 0.15, risk: 0.15, crowding: 0.10,
      };
      const portfolio = await storage.getPortfolio();
      const budget = portfolio?.cashRemaining || 100;

      const result = scoreOpportunity(
        { momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality, flow: signals.flow, risk: signals.risk, crowding: signals.crowding },
        { momentum: weights.momentum, meanReversion: weights.meanReversion, quality: weights.quality, flow: weights.flow, risk: weights.risk, crowding: weights.crowding },
        budget
      );

      const adjustedAllocation = Math.round(result.suggestedAllocation * macroAdjustment * 100) / 100;
      const action = suggestAction(result);
      const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

      await storage.updateOpportunity(opp.id, {
        compositeScore: result.compositeScore, probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge, kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand, suggestedAllocation: adjustedAllocation,
        targetPrice: priceLevels.targetPrice, stopLoss: priceLevels.stopLoss,
        status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
        updatedAt: now,
      });

      await storage.createPrediction({
        opportunityId: opp.id, action,
        compositeScore: result.compositeScore, probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge, kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand, suggestedAllocation: adjustedAllocation,
        entryPrice: signals.metadata.price, targetPrice: priceLevels.targetPrice,
        stopLoss: priceLevels.stopLoss, currentPrice: signals.metadata.price,
        reasoning: `Pipeline auto-scored ${domain} [${macroRegime}/${macroAdjustment}x]: Mom=${signals.momentum} Qual=${signals.quality} Flow=${signals.flow}`,
        signalSnapshot: JSON.stringify({ ...signals, macroRegime, macroAdjustment }),
        timestamp: now,
      });

      scored++;
      trackCost(1);

      if (action === "BUY" && adjustedAllocation > 0 && opp.status !== "buy") {
        pending.push({
          type: "BUY", ticker: ticker.toUpperCase(),
          reason: `[${domain}] Score ${result.compositeScore.toFixed(3)}, P(success) ${(result.probabilityOfSuccess * 100).toFixed(1)}%, allocation $${adjustedAllocation}`,
          allocation: adjustedAllocation, opportunityId: opp.id,
        });
      }
    } catch (e: any) {
      console.error(`[pipeline] ${domain} score failed for ${ticker}:`, e.message);
    }
  }
  return scored;
}

// The full daily pipeline
export interface PipelineResult {
  phase: string;
  scanResults: number;
  scored: number;
  buySignals: number;
  sellSignals: number;
  earningsBlocked: string[];
  macroRegime: string;
  macroAdjustment: number;
  capitalState: CapitalState;
  costMetrics: ReturnType<typeof getCostMetrics>;
  pendingApprovals: Array<{ type: "BUY" | "SELL"; ticker: string; reason: string; allocation?: number; opportunityId: number }>;
  timestamp: string;
}

export async function runDailyPipeline(): Promise<PipelineResult> {
  console.log("[pipeline] Starting daily pipeline...");
  const pending: PipelineResult["pendingApprovals"] = [];

  // Phase 1: Macro check
  console.log("[pipeline] Phase 1: Macro regime check...");
  let macroRegime = "NEUTRAL";
  let macroAdjustment = 1.0;
  try {
    const macro = await fetchMacroSnapshot();
    macroRegime = macro.regime;
    macroAdjustment = macro.adjustmentFactor;
  } catch (e) { console.error("Macro check failed, using NEUTRAL"); }

  // Phase 2: Sell-side — check existing positions
  console.log("[pipeline] Phase 2: Sell-side screening...");
  const sellSignals = await sellSideScreen();
  for (const sell of sellSignals) {
    pending.push({ type: "SELL", ticker: sell.ticker, reason: sell.reason, opportunityId: sell.opportunityId });
  }

  // Phase 3: Scan universe for new opportunities
  console.log("[pipeline] Phase 3: Universe scan...");
  let scanCount = 0;
  if (macroRegime !== "CRISIS") {
    try {
      const results = await scanUniverse();
      scanCount = results.length;
      const newOnes = results.filter(r => r.isNew && r.screenerCount >= 2).slice(0, 5);
      for (const r of newOnes) {
        await addScannedOpportunity(r.ticker, r.name, r.screeners);
      }
    } catch (e) { console.error("Scan failed:", e); }
  }

  // Phase 4: Auto-score all public_markets opportunities
  console.log("[pipeline] Phase 4: Auto-scoring...");
  const opps = await storage.getOpportunities();
  const marketOpps = opps.filter(o => o.domain === "public_markets" && o.ticker);
  let scoredCount = 0;

  const tickers = marketOpps.map(o => o.ticker!.toUpperCase());
  const earningsCheck = tickers.length > 0 ? checkEarningsBlackout(tickers) : {};
  const earningsBlocked: string[] = [];

  for (const opp of marketOpps) {
    try {
      const ticker = opp.ticker!.toUpperCase();
      const signals = await computeAutoSignals(ticker);
      if (!signals) continue;

      const now = new Date().toISOString();
      await storage.updateOpportunity(opp.id, {
        momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality,
        flow: signals.flow, risk: signals.risk, crowding: signals.crowding,
        entryPrice: signals.metadata.price, updatedAt: now,
      });

      const weights = await storage.getWeights(opp.domain) || {
        momentum: 0.20, meanReversion: 0.15, quality: 0.25, flow: 0.15, risk: 0.15, crowding: 0.10,
      };
      const portfolio = await storage.getPortfolio();
      const budget = portfolio?.cashRemaining || 100;

      const result = scoreOpportunity(
        { momentum: signals.momentum, meanReversion: signals.meanReversion, quality: signals.quality, flow: signals.flow, risk: signals.risk, crowding: signals.crowding },
        { momentum: weights.momentum, meanReversion: weights.meanReversion, quality: weights.quality, flow: weights.flow, risk: weights.risk, crowding: weights.crowding },
        budget
      );

      const adjustedAllocation = Math.round(result.suggestedAllocation * macroAdjustment * 100) / 100;

      const action = suggestAction(result);
      const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

      await storage.updateOpportunity(opp.id, {
        compositeScore: result.compositeScore, probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge, kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand, suggestedAllocation: adjustedAllocation,
        targetPrice: priceLevels.targetPrice, stopLoss: priceLevels.stopLoss,
        status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
        updatedAt: now,
      });

      await storage.createPrediction({
        opportunityId: opp.id, action,
        compositeScore: result.compositeScore, probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge, kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand, suggestedAllocation: adjustedAllocation,
        entryPrice: signals.metadata.price, targetPrice: priceLevels.targetPrice,
        stopLoss: priceLevels.stopLoss, currentPrice: signals.metadata.price,
        reasoning: `Pipeline auto-scored [${macroRegime}/${macroAdjustment}x]: Mom=${signals.momentum} Qual=${signals.quality} Flow=${signals.flow}`,
        signalSnapshot: JSON.stringify({ ...signals, macroRegime, macroAdjustment }),
        timestamp: now,
      });

      scoredCount++;
      trackCost(3); // quote + ohlcv + ratios

      if (action === "BUY" && adjustedAllocation > 0 && opp.status !== "buy") {
        const eb = earningsCheck[ticker];
        if (eb?.blocked) {
          earningsBlocked.push(`${ticker} (earnings ${eb.earningsDate}, ${eb.daysUntil}d away)`);
        } else {
          pending.push({ type: "BUY", ticker, reason: `Score ${result.compositeScore.toFixed(3)}, P(success) ${(result.probabilityOfSuccess * 100).toFixed(1)}%, allocation $${adjustedAllocation}`, allocation: adjustedAllocation, opportunityId: opp.id });

          // Auto-create TradingView alerts for HIGH conviction picks
          if (result.convictionBand === "HIGH" && priceLevels.targetPrice && priceLevels.stopLoss && isTVMCPAvailable()) {
            try {
              const deployed = await deploySignalAlertPineScript(ticker, priceLevels.targetPrice, priceLevels.stopLoss);
              if (deployed) {
                console.log(`[autopilot] TradingView alert created: ${ticker} target $${priceLevels.targetPrice.toFixed(2)} / stop $${priceLevels.stopLoss.toFixed(2)}`);
              }
            } catch { /* TV alert creation is best-effort */ }
          }
        }
      }
    } catch (e: any) { console.error(`Score failed for ${opp.ticker}:`, e.message); }
  }

  // Phase 4b: Auto-score crypto assets
  console.log("[pipeline] Phase 4b: Scoring crypto assets...");
  scoredCount += await scoreDomainAssets("crypto", CRYPTO_TICKERS, (t) => computeCryptoSignals(t), macroRegime, macroAdjustment, pending);

  // Phase 4c: Auto-score ETF assets
  console.log("[pipeline] Phase 4c: Scoring ETF assets...");
  scoredCount += await scoreDomainAssets("etf", ETF_TICKERS, (t) => computeETFSignals(t), macroRegime, macroAdjustment, pending);

  // Phase 5: Resolve old predictions (accountability ledger)
  console.log("[pipeline] Phase 5: Resolving predictions...");
  try {
    const resolutions = await resolveOldPredictions();
    if (resolutions.length > 0) {
      console.log(`[pipeline] Resolved ${resolutions.length} predictions`);
    }
  } catch (e: any) { console.error("[pipeline] Resolver error:", e.message); }

  // Phase 6: Capital state
  const capitalState = await computeCapitalState();

  const pipelineResult: PipelineResult = {
    phase: "complete",
    scanResults: scanCount,
    scored: scoredCount,
    buySignals: pending.filter(p => p.type === "BUY").length,
    sellSignals: pending.filter(p => p.type === "SELL").length,
    earningsBlocked,
    macroRegime,
    macroAdjustment,
    capitalState,
    costMetrics: getCostMetrics(),
    pendingApprovals: pending,
    timestamp: new Date().toISOString(),
  };

  console.log(`[pipeline] Complete: scanned=${scanCount}, scored=${scoredCount}, buys=${pipelineResult.buySignals}, sells=${pipelineResult.sellSignals}, blocked=${earningsBlocked.length}`);
  return pipelineResult;
}
