/**
 * Client-side scoring utilities for live preview
 * Mirrors the server scoring engine for instant UI feedback
 */

export interface SignalInputs {
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
}

export interface Weights {
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
}

export interface ScoringResult {
  compositeScore: number;
  probabilityOfSuccess: number;
  expectedEdge: number;
  kellyFraction: number;
  convictionBand: string;
  suggestedAllocation: number;
  downsideRisk: number;
  signalContributions: Record<string, number>;
  action: string;
}

function zScore(value: number): number {
  return (value - 50) / 16.67;
}

function logisticSigmoid(score: number, steepness: number = 1.5): number {
  return 1 / (1 + Math.exp(-steepness * score));
}

function fractionalKelly(
  probability: number,
  payoffRatio: number = 2.0,
  kellyMultiplier: number = 0.25
): number {
  const numerator = probability * payoffRatio - (1 - probability);
  const fraction = (numerator / payoffRatio) * kellyMultiplier;
  return Math.max(0, Math.min(fraction, 0.25));
}

export function scoreLocally(
  signals: SignalInputs,
  weights: Weights,
  budget: number = 100
): ScoringResult {
  const zM = zScore(signals.momentum);
  const zMR = zScore(signals.meanReversion);
  const zQ = zScore(signals.quality);
  const zF = zScore(signals.flow);
  const zR = zScore(signals.risk);
  const zC = zScore(signals.crowding);

  const compositeScore =
    weights.momentum * zM +
    weights.meanReversion * zMR +
    weights.quality * zQ +
    weights.flow * zF -
    weights.risk * zR -
    weights.crowding * zC;

  const prob = logisticSigmoid(compositeScore);
  const payoffRatio = 2.0;
  const transactionCost = 50 / 10000;
  const expectedEdge = prob * payoffRatio - (1 - prob) - transactionCost;
  const downsideRisk = (weights.risk * zR + weights.crowding * zC) / (weights.risk + weights.crowding);
  const kellyFraction = fractionalKelly(prob, payoffRatio, 0.25);
  const suggestedAllocation = Math.round(kellyFraction * budget * 100) / 100;

  let convictionBand: string;
  if (prob >= 0.70 && expectedEdge > 0.3) convictionBand = "high";
  else if (prob >= 0.55 && expectedEdge > 0.1) convictionBand = "medium";
  else if (prob >= 0.45 && expectedEdge > 0) convictionBand = "low";
  else convictionBand = "avoid";

  let action: string;
  if (convictionBand === "high" && expectedEdge > 0.3) action = "BUY";
  else if (convictionBand === "medium" && expectedEdge > 0.1) action = "BUY";
  else if (convictionBand === "avoid" || expectedEdge < -0.1) action = "SELL";
  else action = "WATCH";

  const totalAbs =
    Math.abs(weights.momentum * zM) +
    Math.abs(weights.meanReversion * zMR) +
    Math.abs(weights.quality * zQ) +
    Math.abs(weights.flow * zF) +
    Math.abs(weights.risk * zR) +
    Math.abs(weights.crowding * zC);

  const signalContributions = totalAbs > 0
    ? {
        momentum: (weights.momentum * zM) / totalAbs,
        meanReversion: (weights.meanReversion * zMR) / totalAbs,
        quality: (weights.quality * zQ) / totalAbs,
        flow: (weights.flow * zF) / totalAbs,
        risk: -(weights.risk * zR) / totalAbs,
        crowding: -(weights.crowding * zC) / totalAbs,
      }
    : { momentum: 0, meanReversion: 0, quality: 0, flow: 0, risk: 0, crowding: 0 };

  return {
    compositeScore: Math.round(compositeScore * 1000) / 1000,
    probabilityOfSuccess: Math.round(prob * 1000) / 1000,
    expectedEdge: Math.round(expectedEdge * 1000) / 1000,
    kellyFraction: Math.round(kellyFraction * 10000) / 10000,
    convictionBand,
    suggestedAllocation,
    downsideRisk: Math.round(downsideRisk * 1000) / 1000,
    signalContributions,
    action,
  };
}

export const DEFAULT_WEIGHTS: Weights = {
  momentum: 0.20,
  meanReversion: 0.15,
  quality: 0.25,
  flow: 0.15,
  risk: 0.15,
  crowding: 0.10,
};

export const SIGNAL_DESCRIPTIONS: Record<string, { label: string; description: string; domain: Record<string, string> }> = {
  momentum: {
    label: "Momentum",
    description: "Trend strength and directional persistence",
    domain: {
      public_markets: "20-day price trend, earnings drift, sector rotation",
      vc_themes: "Funding velocity, deal pace acceleration, talent migration",
      content_brand: "Topic growth rate, engagement trend, follower acceleration",
      side_business: "Demand growth, market expansion velocity, repeat purchase rate",
    },
  },
  meanReversion: {
    label: "Mean Reversion",
    description: "Deviation from fair value — oversold or overbought",
    domain: {
      public_markets: "Price vs. 200-day MA, PE ratio vs. 5-yr avg, RSI extremes",
      vc_themes: "Sector correction depth, post-hype normalization, valuation reset",
      content_brand: "Engagement pullback, topic fatigue level, audience saturation",
      side_business: "Market correction opportunity, competitor exit, pricing gap",
    },
  },
  quality: {
    label: "Quality",
    description: "Fundamental strength and competitive moat",
    domain: {
      public_markets: "ROE, gross margins, revenue quality, management track record",
      vc_themes: "Team strength, technology moat, enterprise urgency, unit economics",
      content_brand: "Content depth, audience loyalty, monetization path clarity",
      side_business: "Margin potential, defensibility, operational complexity",
    },
  },
  flow: {
    label: "Flow",
    description: "Capital and attention flows",
    domain: {
      public_markets: "Institutional buying, ETF flows, dark pool activity, volume",
      vc_themes: "LP commitments, corporate venture interest, cloud cost decline",
      content_brand: "Network overlap, sharing velocity, cross-platform reach",
      side_business: "Customer acquisition cost trend, referral rate, channel strength",
    },
  },
  risk: {
    label: "Risk",
    description: "Downside exposure and volatility",
    domain: {
      public_markets: "Volatility regime, beta, max drawdown, liquidity risk",
      vc_themes: "Regulatory risk, technology risk, market timing, capital intensity",
      content_brand: "Platform dependency, topic controversy, algorithm risk",
      side_business: "Execution complexity, capital requirements, competitive threat",
    },
  },
  crowding: {
    label: "Crowding",
    description: "How many others are pursuing the same opportunity",
    domain: {
      public_markets: "Short interest, hedge fund concentration, retail sentiment",
      vc_themes: "Number of funded competitors, hype cycle position, FOMO indicator",
      content_brand: "Creator saturation, topic oversaturation, copycat density",
      side_business: "Competitor density, barrier to entry, market maturity",
    },
  },
};
