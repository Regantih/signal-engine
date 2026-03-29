/**
 * Risk Management Engine
 *
 * Rules:
 * 1. TRAILING STOP: -3% from highest price since entry → SELL
 * 2. TAKE PROFIT: +8% from entry → sell 50%, move stop to breakeven
 * 3. MOMENTUM REVERSAL EXIT: if 4-week return flips negative while holding → SELL
 * 4. MAX DRAWDOWN KILL SWITCH: if portfolio down >10% from peak → stop all new BUYs
 * 5. TIME STOP: max hold 6 weeks (not infinite)
 * 6. CONVICTION SIZING: Kelly fraction scales with composite score and screener convergence
 */

export interface Position {
  ticker: string;
  entryPrice: number;
  entryDate: string;
  currentPrice: number;
  highWaterMark: number; // highest price since entry
  shares: number;
  allocation: number; // dollar amount invested
  partialTaken: boolean; // whether 50% profit was taken at +8%
  compositeScore: number;
  screenerCount: number;
}

export interface RiskDecision {
  action: "HOLD" | "SELL_ALL" | "SELL_HALF" | "TIGHTEN_STOP";
  reason: string;
  rule: string; // which rule triggered
  urgency: "immediate" | "end_of_day" | "next_open";
}

export interface PortfolioRisk {
  totalEquity: number;
  peakEquity: number;
  currentDrawdown: number; // % from peak
  killSwitchActive: boolean;
  openPositionCount: number;
  maxPositions: number; // cap at 10
}

// Compute ATR (Average True Range) from weekly prices
// This adapts stops to each asset's volatility
function computeATR(prices: number[], periods: number = 4): number {
  if (prices.length < 2) return 0;
  
  let trSum = 0;
  let count = 0;
  for (let i = 1; i < Math.min(prices.length, periods + 1); i++) {
    const tr = Math.abs(prices[i] - prices[i - 1]);
    trSum += tr;
    count++;
  }
  
  return count > 0 ? trSum / count : 0;
}

// Compute dynamic stop percentage based on ATR
function dynamicStopPercent(prices: number[]): number {
  if (prices.length < 3) return 3.0; // default fallback
  
  const currentPrice = prices[prices.length - 1];
  const atr = computeATR(prices);
  
  if (currentPrice <= 0 || atr <= 0) return 3.0;
  
  // Stop at 2x ATR as percentage of current price
  // This means volatile stocks get wider stops, stable stocks get tighter
  const atrPercent = (atr * 2 / currentPrice) * 100;
  
  // Clamp between 2% (minimum) and 8% (maximum)
  return Math.max(2.0, Math.min(8.0, atrPercent));
}

export function evaluatePosition(
  position: Position,
  weeklyPrices: number[], // last 6 weekly closes (most recent last)
): RiskDecision {
  const { entryPrice, currentPrice, highWaterMark, partialTaken } = position;
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const drawdownFromPeak = ((highWaterMark - currentPrice) / highWaterMark) * 100;

  // Rule 1: TRAILING STOP — dynamic ATR-based stop (adapts to each asset's volatility)
  const stopPercent = dynamicStopPercent(weeklyPrices);
  if (drawdownFromPeak >= stopPercent) {
    return {
      action: "SELL_ALL",
      reason: `Trailing stop hit: price dropped ${drawdownFromPeak.toFixed(1)}% from peak $${highWaterMark.toFixed(2)} (ATR-based stop: ${stopPercent.toFixed(1)}%)`,
      rule: "TRAILING_STOP",
      urgency: "immediate",
    };
  }

  // Rule 2: TAKE PROFIT — dynamic, 2.5x the stop distance from entry
  const takeProfitPercent = Math.max(6.0, dynamicStopPercent(weeklyPrices) * 2.5); // TP = 2.5x the stop distance
  if (!partialTaken && pnlPercent >= takeProfitPercent) {
    return {
      action: "SELL_HALF",
      reason: `Take profit: up ${pnlPercent.toFixed(1)}% from entry (target: ${takeProfitPercent.toFixed(1)}%), locking in 50%`,
      rule: "TAKE_PROFIT",
      urgency: "immediate",
    };
  }

  // Rule 3: MOMENTUM REVERSAL — 4-week return negative
  if (weeklyPrices.length >= 5) {
    const fourWeeksAgo = weeklyPrices[weeklyPrices.length - 5];
    const now = weeklyPrices[weeklyPrices.length - 1];
    const fourWeekReturn = ((now - fourWeeksAgo) / fourWeeksAgo) * 100;
    if (fourWeekReturn < -5.0 && pnlPercent < 2.0) {
      return {
        action: "SELL_ALL",
        reason: `Momentum reversal: 4-week return ${fourWeekReturn.toFixed(1)}% while position at ${pnlPercent.toFixed(1)}%`,
        rule: "MOMENTUM_REVERSAL",
        urgency: "end_of_day",
      };
    }
  }

  // Rule 5: TIME STOP — max 6 weeks
  // (handled by the caller since we don't have date arithmetic here)

  // After partial profit taken and stock still above entry, tighten stop to breakeven
  if (partialTaken && currentPrice > entryPrice) {
    // Breakeven stop: if price drops back to entry, close remaining
    if (pnlPercent < 0.5) {
      return {
        action: "SELL_ALL",
        reason: `Breakeven stop: price returned to entry after partial profit taken`,
        rule: "BREAKEVEN_STOP",
        urgency: "immediate",
      };
    }
  }

  return {
    action: "HOLD",
    reason: `Holding: P&L ${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%, HWM $${highWaterMark.toFixed(2)}`,
    rule: "NONE",
    urgency: "next_open",
  };
}

export function evaluatePortfolioRisk(
  totalEquity: number,
  peakEquity: number,
  openPositions: number,
): PortfolioRisk {
  const currentDrawdown = peakEquity > 0 ? ((peakEquity - totalEquity) / peakEquity) * 100 : 0;
  return {
    totalEquity,
    peakEquity,
    currentDrawdown,
    killSwitchActive: currentDrawdown >= 10.0,
    openPositionCount: openPositions,
    maxPositions: 10,
  };
}

// Conviction-weighted position sizing
export function convictionSize(
  baseAllocation: number, // from Kelly formula
  compositeScore: number,
  screenerCount: number,
  portfolioRisk: PortfolioRisk,
): number {
  if (portfolioRisk.killSwitchActive) return 0; // kill switch = no new positions
  if (portfolioRisk.openPositionCount >= portfolioRisk.maxPositions) return 0;

  // Scale by conviction: higher score and more screeners = larger position
  let multiplier = 1.0;
  if (compositeScore > 1.0) multiplier *= 1.3;
  else if (compositeScore > 0.5) multiplier *= 1.1;
  else if (compositeScore < 0) multiplier *= 0.5;

  // Screener convergence bonus
  if (screenerCount >= 3) multiplier *= 1.25;
  else if (screenerCount >= 2) multiplier *= 1.1;

  // Drawdown adjustment: reduce size as drawdown increases
  if (portfolioRisk.currentDrawdown > 5) multiplier *= 0.7;
  if (portfolioRisk.currentDrawdown > 8) multiplier *= 0.5;

  const sized = baseAllocation * multiplier;
  // Cap at 25% of remaining equity
  const maxSize = portfolioRisk.totalEquity * 0.25;
  return Math.min(sized, maxSize);
}
