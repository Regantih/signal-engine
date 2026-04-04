import { fetchMacroQuotes, deriveSentiment } from "./market-data-provider";

// ──────────────────────────────────────────────
// Public Interface
// ──────────────────────────────────────────────

export interface MacroSnapshot {
  regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "CRISIS";
  adjustmentFactor: number;
  vix: { value: number; change: number; signal: string };
  sp500: { value: number; change: number; signal: string };
  nasdaq: { value: number; change: number; signal: string };
  dxy: { value: number; change: number; signal: string };
  eurusd: { value: number; change: number; signal: string };
  usdjpy: { value: number; change: number; signal: string };
  gold: { value: number; change: number; signal: string };
  oil: { value: number; change: number; signal: string };
  yield10y: { value: number; change: number; signal: string };
  sentiment: string;
  macro: {
    gdpGrowth: number | null;
    inflationRate: number | null;
    interestRate: number | null;
    unemploymentRate: number | null;
  };
  computedAt: string;
  summary: string;
}

// ──────────────────────────────────────────────
// Signal helpers
// ──────────────────────────────────────────────

function vixSignal(value: number, change: number): string {
  if (value > 40) return "EXTREME_FEAR";
  if (value > 30) return "HIGH_FEAR";
  if (value > 20) return "ELEVATED";
  if (change > 10) return "RISING";
  if (change < -10) return "FALLING";
  return "CALM";
}

function priceSignal(change: number): string {
  if (change > 1.5) return "STRONG_UP";
  if (change > 0.3) return "UP";
  if (change < -1.5) return "STRONG_DOWN";
  if (change < -0.3) return "DOWN";
  return "FLAT";
}

function yieldSignal(value: number, change: number): string {
  if (value > 5) return "HIGH";
  if (change > 0.1) return "RISING";
  if (change < -0.1) return "FALLING";
  return "STABLE";
}

function goldSignal(change: number): string {
  if (change > 2) return "SURGING";
  if (change > 0.5) return "RISING";
  if (change < -0.5) return "FALLING";
  return "STABLE";
}

function oilSignal(change: number): string {
  if (change > 2) return "SURGING";
  if (change > 0.5) return "RISING";
  if (change < -1) return "FALLING";
  return "STABLE";
}

function fxSignal(change: number): string {
  if (change > 0.5) return "STRONG";
  if (change > 0.1) return "RISING";
  if (change < -0.5) return "WEAK";
  if (change < -0.1) return "FALLING";
  return "STABLE";
}

// ──────────────────────────────────────────────
// Regime computation
// ──────────────────────────────────────────────

function computeRegime(
  vixValue: number,
  sp500Change: number,
  goldChange: number,
  yield10yChange: number,
  sentiment: string,
): { regime: MacroSnapshot["regime"]; adjustmentFactor: number } {
  if (vixValue > 40 && goldChange > 1.5 && yield10yChange > 0.1) {
    return { regime: "CRISIS", adjustmentFactor: 0.3 };
  }
  if (vixValue > 45) {
    return { regime: "CRISIS", adjustmentFactor: 0.3 };
  }
  if (vixValue > 30) {
    return { regime: "RISK_OFF", adjustmentFactor: 0.7 };
  }
  if (vixValue > 25 && sp500Change < -1 && sentiment === "bearish") {
    return { regime: "RISK_OFF", adjustmentFactor: 0.7 };
  }
  if (vixValue < 20 && sp500Change > 0 && sentiment === "bullish") {
    return { regime: "RISK_ON", adjustmentFactor: 1.3 };
  }
  if (vixValue < 18 && sp500Change >= 0) {
    return { regime: "RISK_ON", adjustmentFactor: 1.3 };
  }
  return { regime: "NEUTRAL", adjustmentFactor: 1.0 };
}

// ──────────────────────────────────────────────
// Summary generator
// ──────────────────────────────────────────────

function buildSummary(snapshot: Omit<MacroSnapshot, "summary">): string {
  const { regime, adjustmentFactor, vix, sp500, gold } = snapshot;

  const regimeLabel: Record<string, string> = {
    RISK_ON: "RISK_ON regime",
    NEUTRAL: "NEUTRAL regime",
    RISK_OFF: "RISK_OFF regime",
    CRISIS: "CRISIS regime",
  };

  const adjLabel: Record<string, string> = {
    RISK_ON: "Scaling up allocations by 30%.",
    NEUTRAL: "No allocation adjustment.",
    RISK_OFF: "Reducing allocations by 30%.",
    CRISIS: "Kill switch active — no new positions.",
  };

  const vixStr = `VIX ${vix.value.toFixed(1)} (${vix.change >= 0 ? "+" : ""}${vix.change.toFixed(1)}%)`;
  const sp500Str = `S&P ${sp500.change >= 0 ? "+" : ""}${sp500.change.toFixed(1)}%`;
  const goldStr = gold.change !== 0
    ? `, gold ${gold.change >= 0 ? "+" : ""}${gold.change.toFixed(1)}%`
    : "";

  return `${regimeLabel[regime]} — ${vixStr}, ${sp500Str}${goldStr}. ${adjLabel[regime]}`;
}

// ──────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────

export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  console.log("[macro] Fetching macro environment snapshot...");

  const mq = await fetchMacroQuotes();

  const sentimentStr = deriveSentiment(mq.vix.price, mq.sp500.changePct);

  // Macro indicators — use 10Y yield for interest rate, recent known values for others
  const interestRate: number = mq.yield10y.price || 4.3;
  // Latest BEA GDP estimate (Q4 2025 advance estimate)
  const gdpGrowth: number = 2.8;
  // Latest BLS CPI-U 12-month change (Feb 2026)
  const inflationRate: number = 2.8;
  // Latest BLS unemployment rate (Mar 2026)
  const unemploymentRate: number = 4.2;

  const vixValue = mq.vix.price || 20;
  const { regime, adjustmentFactor } = computeRegime(
    vixValue,
    mq.sp500.changePct,
    mq.gold.changePct,
    mq.yield10y.change,
    sentimentStr,
  );

  const vixField = { value: vixValue, change: mq.vix.changePct, signal: vixSignal(vixValue, mq.vix.changePct) };
  const sp500Field = { value: mq.sp500.price, change: mq.sp500.changePct, signal: priceSignal(mq.sp500.changePct) };
  const nasdaqField = { value: mq.nasdaq.price, change: mq.nasdaq.changePct, signal: priceSignal(mq.nasdaq.changePct) };
  const dxyField = { value: mq.dxy.price, change: mq.dxy.changePct, signal: fxSignal(mq.dxy.changePct) };
  const eurField = { value: mq.eurusd.price, change: mq.eurusd.changePct, signal: fxSignal(mq.eurusd.changePct) };
  const jpyField = { value: mq.usdjpy.price, change: mq.usdjpy.changePct, signal: fxSignal(mq.usdjpy.changePct) };
  const goldField = { value: mq.gold.price, change: mq.gold.changePct, signal: goldSignal(mq.gold.changePct) };
  const oilField = { value: mq.oil.price, change: mq.oil.changePct, signal: oilSignal(mq.oil.changePct) };
  const yieldField = { value: mq.yield10y.price, change: mq.yield10y.changePct, signal: yieldSignal(mq.yield10y.price, mq.yield10y.change) };

  const partial: Omit<MacroSnapshot, "summary"> = {
    regime,
    adjustmentFactor,
    vix: vixField,
    sp500: sp500Field,
    nasdaq: nasdaqField,
    dxy: dxyField,
    eurusd: eurField,
    usdjpy: jpyField,
    gold: goldField,
    oil: oilField,
    yield10y: yieldField,
    sentiment: sentimentStr,
    macro: { gdpGrowth, inflationRate, interestRate, unemploymentRate },
    computedAt: new Date().toISOString(),
  };

  const summary = buildSummary(partial);
  const snapshot: MacroSnapshot = { ...partial, summary };

  console.log(`[macro] Regime: ${regime}, adjustmentFactor: ${adjustmentFactor}, VIX: ${vixValue}`);
  return snapshot;
}
