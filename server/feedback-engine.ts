import { storage } from "./storage";
import { DEFAULT_WEIGHTS } from "@shared/schema";

interface PredictionOutcome {
  predictionId: number;
  opportunityId: number;
  ticker: string | null;
  action: string;
  entryPrice: number;
  currentPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  pnlPercent: number;
  outcome: "win" | "loss" | "open"; // win = hit target, loss = hit stop, open = still active
  holdingDays: number;
  signalSnapshot: any;
}

// Evaluate all predictions and determine outcomes
export async function evaluateOutcomes(): Promise<PredictionOutcome[]> {
  const preds = await storage.getPredictions();
  const opps = await storage.getOpportunities();
  const results: PredictionOutcome[] = [];

  for (const pred of preds) {
    if (pred.action !== "BUY") continue; // only evaluate BUY predictions

    const opp = opps.find((o) => o.id === pred.opportunityId);
    if (!opp || !pred.entryPrice) continue;

    // Use latest market data or current opportunity price
    const latestData = opp.ticker
      ? await storage.getLatestMarketData(opp.ticker.toUpperCase())
      : null;
    const currentPrice = latestData?.close || opp.entryPrice || pred.entryPrice;

    const pnlPercent = ((currentPrice - pred.entryPrice) / pred.entryPrice) * 100;
    const daysSince = Math.floor(
      (Date.now() - new Date(pred.timestamp).getTime()) / 86400000
    );

    let outcome: "win" | "loss" | "open" = "open";
    if (pred.targetPrice && currentPrice >= pred.targetPrice) outcome = "win";
    else if (pred.stopLoss && currentPrice <= pred.stopLoss) outcome = "loss";
    else if (pnlPercent > 5) outcome = "win"; // 5% gain = win
    else if (pnlPercent < -5) outcome = "loss"; // 5% loss = loss
    else if (daysSince > 30 && pnlPercent > 0) outcome = "win"; // positive after 30 days
    else if (daysSince > 30 && pnlPercent <= 0) outcome = "loss"; // negative after 30 days

    let snapshot: any = {};
    try {
      snapshot = JSON.parse(pred.signalSnapshot);
    } catch {}

    results.push({
      predictionId: pred.id,
      opportunityId: pred.opportunityId,
      ticker: opp.ticker,
      action: pred.action,
      entryPrice: pred.entryPrice,
      currentPrice,
      targetPrice: pred.targetPrice || null,
      stopLoss: pred.stopLoss || null,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      outcome,
      holdingDays: daysSince,
      signalSnapshot: snapshot,
    });
  }

  return results;
}

// Compute hit rate per signal — which signals correlate with wins?
export function computeSignalAccuracy(
  outcomes: PredictionOutcome[]
): Record<string, { hitRate: number; avgPnlWin: number; avgPnlLoss: number; count: number }> {
  const signals = ["momentum", "meanReversion", "quality", "flow", "risk", "crowding"];
  const result: Record<
    string,
    { hitRate: number; avgPnlWin: number; avgPnlLoss: number; count: number }
  > = {};

  const closed = outcomes.filter((o) => o.outcome !== "open");
  if (closed.length < 3) {
    // Not enough data — return defaults
    for (const sig of signals) {
      result[sig] = { hitRate: 50, avgPnlWin: 0, avgPnlLoss: 0, count: 0 };
    }
    return result;
  }

  for (const sig of signals) {
    // For each signal, compute: when this signal was HIGH (>60), what % of predictions won?
    const highSignal = closed.filter((o) => {
      const val =
        o.signalSnapshot?.[sig] ||
        o.signalSnapshot?.metadata?.dataPoints?.[sig]?.score;
      return val && val > 60;
    });

    const wins = highSignal.filter((o) => o.outcome === "win");
    const losses = highSignal.filter((o) => o.outcome === "loss");

    const hitRate =
      highSignal.length > 0 ? (wins.length / highSignal.length) * 100 : 50;
    const avgPnlWin =
      wins.length > 0
        ? wins.reduce((s, o) => s + o.pnlPercent, 0) / wins.length
        : 0;
    const avgPnlLoss =
      losses.length > 0
        ? losses.reduce((s, o) => s + o.pnlPercent, 0) / losses.length
        : 0;

    result[sig] = {
      hitRate: Math.round(hitRate * 10) / 10,
      avgPnlWin: Math.round(avgPnlWin * 100) / 100,
      avgPnlLoss: Math.round(avgPnlLoss * 100) / 100,
      count: highSignal.length,
    };
  }

  return result;
}

// Auto-tune weights based on signal accuracy
export async function autoTuneWeights(
  outcomes: PredictionOutcome[]
): Promise<Record<string, number>> {
  const accuracy = computeSignalAccuracy(outcomes);
  const signals = ["momentum", "meanReversion", "quality", "flow", "risk", "crowding"];

  // Base weights
  const baseWeights: Record<string, number> = {
    momentum: DEFAULT_WEIGHTS.momentum,
    meanReversion: DEFAULT_WEIGHTS.mean_reversion,
    quality: DEFAULT_WEIGHTS.quality,
    flow: DEFAULT_WEIGHTS.flow,
    risk: DEFAULT_WEIGHTS.risk,
    crowding: DEFAULT_WEIGHTS.crowding,
  };

  const closed = outcomes.filter((o) => o.outcome !== "open");
  if (closed.length < 5) return baseWeights; // Not enough data to tune

  // Adjust weights: signals with higher hit rates get more weight
  const adjustedWeights: Record<string, number> = {};
  let totalWeight = 0;

  for (const sig of signals) {
    const acc = accuracy[sig];
    // Multiplier: hit rate above 50% increases weight, below decreases
    const multiplier = acc.count >= 3 ? acc.hitRate / 50 : 1.0;
    adjustedWeights[sig] =
      baseWeights[sig] * Math.max(0.5, Math.min(2.0, multiplier));
    totalWeight += adjustedWeights[sig];
  }

  // Normalize to sum to 1.0
  for (const sig of signals) {
    adjustedWeights[sig] =
      Math.round((adjustedWeights[sig] / totalWeight) * 1000) / 1000;
  }

  return adjustedWeights;
}
