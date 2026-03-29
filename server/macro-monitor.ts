import { execSync } from "child_process";

// ──────────────────────────────────────────────
// Shared helper (same pattern as screeners.ts)
// ──────────────────────────────────────────────

function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
  try {
    const escaped = params.replace(/'/g, "'\\''");
    const result = execSync(`external-tool call '${escaped}'`, {
      timeout: 30000,
      encoding: "utf-8",
    });
    return JSON.parse(result);
  } catch (e: any) {
    console.error(`Finance tool error (${toolName}):`, e.message?.slice(0, 200));
    return null;
  }
}

function parseCSVContent(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];

  const headers = lines[0].split("|").map((h) => h.trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];

  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => (row[h] = cells[idx]));
      rows.push(row);
    }
  }
  return rows;
}

function parseNumber(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[$,\s%]/g, "")) || 0;
}

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
  // CRISIS: VIX > 40 + gold surging + yields spiking
  if (vixValue > 40 && goldChange > 1.5 && yield10yChange > 0.1) {
    return { regime: "CRISIS", adjustmentFactor: 0.3 };
  }
  // Also crisis if VIX extremely high
  if (vixValue > 45) {
    return { regime: "CRISIS", adjustmentFactor: 0.3 };
  }

  // RISK_OFF: VIX > 30, market trending down, bearish sentiment
  if (vixValue > 30) {
    return { regime: "RISK_OFF", adjustmentFactor: 0.7 };
  }
  if (vixValue > 25 && sp500Change < -1 && sentiment === "bearish") {
    return { regime: "RISK_OFF", adjustmentFactor: 0.7 };
  }

  // RISK_ON: VIX < 20, S&P up, sentiment bullish
  if (vixValue < 20 && sp500Change > 0 && sentiment === "bullish") {
    return { regime: "RISK_ON", adjustmentFactor: 1.3 };
  }
  // Partial risk-on: low VIX and modest gains
  if (vixValue < 18 && sp500Change >= 0) {
    return { regime: "RISK_ON", adjustmentFactor: 1.3 };
  }

  // NEUTRAL: everything else
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
// Macro extraction helpers
// ──────────────────────────────────────────────

function extractMacroValue(
  rows: Record<string, string>[],
  keywords: string[],
): number | null {
  for (const row of rows) {
    const rowStr = JSON.stringify(row).toLowerCase();
    const matchesKeyword = keywords.some((kw) => rowStr.includes(kw.toLowerCase()));
    if (!matchesKeyword) continue;

    // Look for a numeric value in any column
    for (const val of Object.values(row)) {
      const cleaned = val.replace(/[$%,\s]/g, "");
      const num = parseFloat(cleaned);
      if (!isNaN(num) && isFinite(num) && num !== 0) {
        return num;
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────

export function fetchMacroSnapshot(): MacroSnapshot {
  console.log("[macro] Fetching macro environment snapshot...");

  // 1. Fetch market quotes
  const quotesResp = callFinanceTool("finance_quotes", {
    ticker_symbols: ["EURUSD", "USDJPY", "^VIX", "^GSPC", "^IXIC", "GC=F", "CL=F", "^TNX"],
    fields: ["price", "change", "changesPercentage"],
    action: "Fetching macro market quotes",
  });

  // 2. Fetch market sentiment
  const sentimentResp = callFinanceTool("finance_market_sentiment", {
    market_type: "market",
    country: "US",
    query: "current market sentiment",
    action: "Analyzing market sentiment",
  });

  // 3. Fetch macro snapshot
  const macroResp = callFinanceTool("finance_macro_snapshot", {
    countries: ["United States"],
    keywords: ["interest rate", "inflation", "unemployment", "GDP growth"],
    action: "Fetching US macro indicators",
  });

  // ── Parse quotes ──
  const quoteMap: Record<string, { price: number; change: number; changePct: number }> = {};

  if (quotesResp?.result?.content) {
    const rows = parseCSVContent(quotesResp.result.content);
    for (const row of rows) {
      const sym =
        row["Symbol"] || row["symbol"] || row["Ticker"] || row["ticker"] || "";
      if (!sym) continue;

      const price = parseNumber(
        row["Price"] || row["price"] || row["Last"] || row["last"] || "0",
      );
      const change = parseNumber(
        row["Change"] || row["change"] || row["Chg"] || row["chg"] || "0",
      );
      const changePct = parseNumber(
        row["Change %"] ||
        row["changesPercentage"] ||
        row["% Change"] ||
        row["Chg %"] ||
        "0",
      );

      quoteMap[sym.toUpperCase()] = { price, change, changePct };
    }
  }

  // Helper to extract from quoteMap with symbol fallbacks
  const getQuote = (...syms: string[]) => {
    for (const s of syms) {
      const q = quoteMap[s.toUpperCase()];
      if (q) return q;
    }
    return { price: 0, change: 0, changePct: 0 };
  };

  const vixQ = getQuote("^VIX", "VIX");
  const sp500Q = getQuote("^GSPC", "GSPC");
  const nasdaqQ = getQuote("^IXIC", "IXIC");
  const eurQ = getQuote("EURUSD", "EUR/USD");
  const jpyQ = getQuote("USDJPY", "USD/JPY");
  const goldQ = getQuote("GC=F", "GCF", "GOLD");
  const oilQ = getQuote("CL=F", "CLF", "OIL");
  const yieldQ = getQuote("^TNX", "TNX");
  const dxyQ = getQuote("DX-Y.NYB", "DXY");

  // ── Parse sentiment ──
  let sentimentStr = "neutral";
  if (sentimentResp?.result?.content) {
    const content = sentimentResp.result.content.toLowerCase();
    if (content.includes("bullish") || content.includes("bull")) {
      sentimentStr = "bullish";
    } else if (content.includes("bearish") || content.includes("bear")) {
      sentimentStr = "bearish";
    } else {
      sentimentStr = "neutral";
    }
  }

  // ── Parse macro indicators ──
  let gdpGrowth: number | null = null;
  let inflationRate: number | null = null;
  let interestRate: number | null = null;
  let unemploymentRate: number | null = null;

  if (macroResp?.result?.content) {
    const rows = parseCSVContent(macroResp.result.content);
    gdpGrowth = extractMacroValue(rows, ["gdp", "growth"]);
    inflationRate = extractMacroValue(rows, ["inflation", "cpi"]);
    interestRate = extractMacroValue(rows, ["interest rate", "fed", "federal funds"]);
    unemploymentRate = extractMacroValue(rows, ["unemployment", "jobless"]);
  }

  // ── Compute regime ──
  const vixValue = vixQ.price || 20;
  const sp500ChangePct = sp500Q.changePct;
  const goldChangePct = goldQ.changePct;
  const yieldChange = yieldQ.change;

  const { regime, adjustmentFactor } = computeRegime(
    vixValue,
    sp500ChangePct,
    goldChangePct,
    yieldChange,
    sentimentStr,
  );

  // ── Build structured fields ──
  const vixField = {
    value: vixValue,
    change: vixQ.changePct,
    signal: vixSignal(vixValue, vixQ.changePct),
  };

  const sp500Field = {
    value: sp500Q.price,
    change: sp500Q.changePct,
    signal: priceSignal(sp500Q.changePct),
  };

  const nasdaqField = {
    value: nasdaqQ.price,
    change: nasdaqQ.changePct,
    signal: priceSignal(nasdaqQ.changePct),
  };

  const dxyField = {
    value: dxyQ.price,
    change: dxyQ.changePct,
    signal: fxSignal(dxyQ.changePct),
  };

  const eurField = {
    value: eurQ.price,
    change: eurQ.changePct,
    signal: fxSignal(eurQ.changePct),
  };

  const jpyField = {
    value: jpyQ.price,
    change: jpyQ.changePct,
    signal: fxSignal(jpyQ.changePct),
  };

  const goldField = {
    value: goldQ.price,
    change: goldQ.changePct,
    signal: goldSignal(goldQ.changePct),
  };

  const oilField = {
    value: oilQ.price,
    change: oilQ.changePct,
    signal: oilSignal(oilQ.changePct),
  };

  const yieldField = {
    value: yieldQ.price,
    change: yieldQ.changePct,
    signal: yieldSignal(yieldQ.price, yieldQ.change),
  };

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
