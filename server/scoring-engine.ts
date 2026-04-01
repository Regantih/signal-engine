/**
 * Renaissance-Style Signal Aggregation & Scoring Engine
 *
 * Core formula:
 * Score_i = w1*Z(momentum) + w2*Z(mean_reversion) + w3*Z(quality) + w4*Z(flow) - w5*Z(risk) - w6*Z(crowding)
 *
 * Then converts to probability via logistic sigmoid, computes expected edge,
 * and applies fractional Kelly for position sizing.
 */

import {
  OPTIMIZED_WEIGHTS,
  OPTIMIZED_ZSCORE,
  OPTIMIZED_SIGMOID_STEEPNESS,
  OPTIMIZED_KELLY,
  OPTIMIZED_EMPIRICAL_PROB_MAP,
  OPTIMIZED_THRESHOLDS,
} from "./autoresearch-params";

/**
 * Feature flag: when true, scoring functions use autoresearch-optimized
 * parameters instead of hardcoded defaults. Default false for safety —
 * flip to true after validating optimized params in staging.
 */
export const USE_OPTIMIZED_PARAMS = false;

interface SignalInputs {
  momentum: number;      // 0-100: trend strength, earnings drift, funding velocity
  meanReversion: number; // 0-100: deviation from fair value, oversold/overbought
  quality: number;       // 0-100: fundamentals, team, moat, margins
  flow: number;          // 0-100: capital flows, demand persistence, engagement
  risk: number;          // 0-100: volatility, execution complexity, regulatory
  crowding: number;      // 0-100: how many others are in the same trade
}

interface Weights {
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
}

export interface ScoringResult {
  compositeScore: number;       // Raw weighted score (-3 to +3 range, normalized)
  probabilityOfSuccess: number; // 0-1, via logistic transform
  expectedEdge: number;         // probability-adjusted upside minus costs
  kellyFraction: number;        // Fractional Kelly allocation %
  convictionBand: string;       // "high" | "medium" | "low" | "avoid"
  suggestedAllocation: number;  // Dollar amount from $100 budget
  downsideRisk: number;         // Risk-adjusted downside penalty
  signalContributions: Record<string, number>; // How much each signal contributes
}

/**
 * Z-score normalization: converts raw 0-100 signal to standardized score
 * Assumes population mean=50, sd=16.67 (so that 0 and 100 are ~3 SDs)
 */
function zScore(value: number): number {
  const mean = USE_OPTIMIZED_PARAMS ? OPTIMIZED_ZSCORE.mean : 50;
  const sd = USE_OPTIMIZED_PARAMS ? OPTIMIZED_ZSCORE.sd : 16.67;
  return (value - mean) / sd;
}

/**
 * Logistic sigmoid: converts raw score to probability [0, 1]
 * Steepness parameter controls how quickly score maps to certainty
 */
function logisticSigmoid(score: number, steepness?: number): number {
  const s = steepness ?? (USE_OPTIMIZED_PARAMS ? OPTIMIZED_SIGMOID_STEEPNESS : 1.5);
  return 1 / (1 + Math.exp(-s * score));
}

/**
 * Empirical probability calibration
 * Instead of trusting the sigmoid directly, map composite score ranges
 * to observed historical hit rates. This prevents Kelly from using
 * synthetic probabilities.
 *
 * Based on backtest data (303 trades, 12 months):
 * - High composite (>0.8): ~70% hit rate
 * - Medium composite (0.3-0.8): ~58% hit rate
 * - Low composite (0-0.3): ~50% hit rate
 * - Negative composite (<0): ~40% hit rate
 *
 * These should be updated as more forward-test data accumulates.
 */
function empiricalProbability(compositeScore: number): number {
  if (USE_OPTIMIZED_PARAMS) {
    for (const [threshold, prob] of OPTIMIZED_EMPIRICAL_PROB_MAP) {
      if (compositeScore > threshold) return prob;
    }
    return OPTIMIZED_EMPIRICAL_PROB_MAP[OPTIMIZED_EMPIRICAL_PROB_MAP.length - 1][1];
  }

  // Hardcoded defaults (fallback)
  if (compositeScore > 1.0) return 0.72;
  if (compositeScore > 0.8) return 0.68;
  if (compositeScore > 0.5) return 0.62;
  if (compositeScore > 0.3) return 0.56;
  if (compositeScore > 0.1) return 0.52;
  if (compositeScore > 0) return 0.48;
  if (compositeScore > -0.3) return 0.42;
  return 0.35;
}

/**
 * Fractional Kelly Criterion:
 * f = c * (p * b - (1-p)) / b
 * where:
 *   c = Kelly fraction (0.25 = quarter-Kelly, conservative)
 *   p = probability of success
 *   b = payoff ratio (win/loss ratio)
 */
function fractionalKelly(
  probability: number,
  payoffRatio?: number,
  kellyMultiplier?: number
): number {
  const b = payoffRatio ?? (USE_OPTIMIZED_PARAMS ? OPTIMIZED_KELLY.payoffRatio : 2.0);
  const c = kellyMultiplier ?? (USE_OPTIMIZED_PARAMS ? OPTIMIZED_KELLY.fraction : 0.25);
  const maxPos = USE_OPTIMIZED_PARAMS ? OPTIMIZED_KELLY.maxPositionPct : 0.15;

  const numerator = probability * b - (1 - probability);
  const fraction = (numerator / b) * c;

  // Clamp: no negative positions, max position cap
  return Math.max(0, Math.min(fraction, maxPos));
}

/**
 * Main scoring function — the heart of the engine
 */
export function scoreOpportunity(
  signals: SignalInputs,
  weights: Weights,
  budget: number = 100,
  transactionCostBps: number = 50 // 0.5% friction/cost estimate
): ScoringResult {
  // Step 1: Z-score normalize all signals
  const zMomentum = zScore(signals.momentum);
  const zMeanReversion = zScore(signals.meanReversion);
  const zQuality = zScore(signals.quality);
  const zFlow = zScore(signals.flow);
  const zRisk = zScore(signals.risk);
  const zCrowding = zScore(signals.crowding);

  // Use optimized weights when flag is enabled, otherwise use passed-in weights
  const w = USE_OPTIMIZED_PARAMS ? OPTIMIZED_WEIGHTS : weights;

  // Step 2: Compute weighted composite score
  // Positive signals: momentum, mean_reversion, quality, flow
  // Negative signals: risk, crowding (these are PENALTIES)
  const compositeScore =
    w.momentum * zMomentum +
    w.meanReversion * zMeanReversion +
    w.quality * zQuality +
    w.flow * zFlow -
    w.risk * zRisk -
    w.crowding * zCrowding;

  // Step 3: Convert to probability via empirical calibration
  // Use empirical calibration instead of raw sigmoid
  // Sigmoid is kept for relative ranking but not used for Kelly sizing
  const rawProbability = empiricalProbability(compositeScore);
  const sigmoidScore = logisticSigmoid(compositeScore); // kept for display only

  // Step 4: Compute expected edge (net of transaction costs)
  const transactionCost = transactionCostBps / 10000;
  const payoffRatio = USE_OPTIMIZED_PARAMS ? OPTIMIZED_KELLY.payoffRatio : 2.0;
  const expectedEdge = rawProbability * payoffRatio - (1 - rawProbability) - transactionCost;

  // Step 5: Downside risk penalty
  const downsideRisk = (w.risk * zRisk + w.crowding * zCrowding) /
    (w.risk + w.crowding);

  // Step 6: Fractional Kelly position sizing
  const kellyFraction = fractionalKelly(rawProbability, payoffRatio);

  // Step 7: Dollar allocation from budget
  const suggestedAllocation = Math.round(kellyFraction * budget * 100) / 100;

  // Step 8: Conviction band
  const probThreshold = USE_OPTIMIZED_PARAMS ? OPTIMIZED_THRESHOLDS.buyProbThreshold : 0.55;
  const edgeThreshold = USE_OPTIMIZED_PARAMS ? OPTIMIZED_THRESHOLDS.buyEdgeThreshold : 0.10;

  let convictionBand: string;
  if (rawProbability >= 0.70 && expectedEdge > 0.3) {
    convictionBand = "high";
  } else if (rawProbability >= probThreshold && expectedEdge > edgeThreshold) {
    convictionBand = "medium";
  } else if (rawProbability >= 0.45 && expectedEdge > 0) {
    convictionBand = "low";
  } else {
    convictionBand = "avoid";
  }

  // Step 9: Signal contribution breakdown (for explainability)
  const totalAbsWeight =
    Math.abs(w.momentum * zMomentum) +
    Math.abs(w.meanReversion * zMeanReversion) +
    Math.abs(w.quality * zQuality) +
    Math.abs(w.flow * zFlow) +
    Math.abs(w.risk * zRisk) +
    Math.abs(w.crowding * zCrowding);

  const signalContributions = totalAbsWeight > 0 ? {
    momentum: (w.momentum * zMomentum) / totalAbsWeight,
    meanReversion: (w.meanReversion * zMeanReversion) / totalAbsWeight,
    quality: (w.quality * zQuality) / totalAbsWeight,
    flow: (w.flow * zFlow) / totalAbsWeight,
    risk: -(w.risk * zRisk) / totalAbsWeight,
    crowding: -(w.crowding * zCrowding) / totalAbsWeight,
  } : {
    momentum: 0, meanReversion: 0, quality: 0, flow: 0, risk: 0, crowding: 0,
  };

  return {
    compositeScore: Math.round(compositeScore * 1000) / 1000,
    probabilityOfSuccess: Math.round(rawProbability * 1000) / 1000,
    expectedEdge: Math.round(expectedEdge * 1000) / 1000,
    kellyFraction: Math.round(kellyFraction * 10000) / 10000,
    convictionBand,
    suggestedAllocation,
    downsideRisk: Math.round(downsideRisk * 1000) / 1000,
    signalContributions,
  };
}

/**
 * Suggest action based on scoring
 */
export function suggestAction(result: ScoringResult): string {
  if (result.convictionBand === "high" && result.expectedEdge > 0.3) return "BUY";
  if (result.convictionBand === "medium" && result.expectedEdge > 0.1) return "BUY";
  if (result.convictionBand === "avoid" || result.expectedEdge < -0.1) return "SELL";
  return "WATCH";
}

/**
 * Compute target price and stop loss from entry
 */
export function computePriceLevels(
  entryPrice: number,
  probabilityOfSuccess: number,
  payoffRatio: number = 2.0
): { targetPrice: number; stopLoss: number } {
  // Target: entry * (1 + expected upside based on probability)
  const expectedUpside = probabilityOfSuccess * payoffRatio * 0.1; // Scale to reasonable %
  const targetPrice = Math.round(entryPrice * (1 + expectedUpside) * 100) / 100;

  // Stop loss: entry * (1 - risk-adjusted downside)
  const downsideRisk = (1 - probabilityOfSuccess) * 0.1;
  const stopLoss = Math.round(entryPrice * (1 - downsideRisk) * 100) / 100;

  return { targetPrice, stopLoss };
}
