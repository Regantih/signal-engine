/**
 * AI Trade Thesis Generator
 *
 * Rule-based (no external LLM API) — generates plain-English trade analysis
 * for every scored ticker by reading signals, fundamentals, and scoring output.
 */

import type { Opportunity } from "@shared/schema";
import { getThesisContext } from "./wiki-engine";

interface SignalSnapshot {
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
  metadata?: {
    ticker: string;
    price: number;
    computedAt: string;
    dataPoints: Record<string, any>;
  };
}

function qualityGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function convictionLabel(band: string | null): string {
  switch (band) {
    case "high": return "high conviction";
    case "medium": return "medium conviction";
    case "low": return "low conviction";
    case "avoid": return "avoid";
    default: return "unscored";
  }
}

function pctFmt(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function dollarFmt(val: number): string {
  return `$${val.toFixed(2)}`;
}

function describeStrongestSignal(signals: SignalSnapshot): string {
  const positiveSignals = [
    { name: "momentum", score: signals.momentum, desc: "strong price momentum" },
    { name: "mean reversion", score: signals.meanReversion, desc: "mean reversion opportunity (oversold conditions)" },
    { name: "quality", score: signals.quality, desc: "solid fundamental quality" },
    { name: "flow", score: signals.flow, desc: "positive capital flow and analyst sentiment" },
  ];

  const sorted = positiveSignals.sort((a, b) => b.score - a.score);
  const best = sorted[0];

  if (best.score >= 75) return `Key driver: ${best.desc} (${best.name} score ${best.score}/100).`;
  if (best.score >= 60) return `Moderate ${best.desc} (${best.name} score ${best.score}/100).`;
  return `No standout positive signal — highest is ${best.name} at ${best.score}/100.`;
}

function describeFundamentals(signals: SignalSnapshot, opp: Opportunity): string {
  const parts: string[] = [];
  const dp = signals.metadata?.dataPoints;

  const grade = qualityGrade(signals.quality);
  parts.push(`Quality grade ${grade}`);

  if (dp?.quality) {
    if (dp.quality.grossMargin != null) parts.push(`gross margin ${dp.quality.grossMargin}%`);
    if (dp.quality.roe != null) parts.push(`ROE ${dp.quality.roe}%`);
  }

  if (dp?.crowding?.pe && dp.crowding.pe > 0) {
    parts.push(`P/E ${dp.crowding.pe.toFixed(1)}`);
  }

  if (dp?.flow?.targetUpside != null) {
    const upside = dp.flow.targetUpside;
    if (upside > 0) {
      parts.push(`${upside.toFixed(1)}% upside to analyst target`);
    } else {
      parts.push(`${Math.abs(upside).toFixed(1)}% below analyst target`);
    }
  }

  return parts.length > 0 ? parts.join(", ") + "." : "";
}

function describeRisks(signals: SignalSnapshot): string {
  const risks: string[] = [];
  const dp = signals.metadata?.dataPoints;

  if (signals.crowding >= 70) risks.push("elevated crowding suggests the move may be overcrowded");
  else if (signals.crowding >= 55) risks.push("moderate crowding risk");

  if (signals.risk >= 70) risks.push("high volatility risk");
  else if (signals.risk >= 55) risks.push("above-average volatility");

  if (dp?.risk?.maxDrawdown && dp.risk.maxDrawdown > 20) {
    risks.push(`max drawdown ${dp.risk.maxDrawdown}%`);
  }

  if (dp?.momentum?.return20d != null && dp.momentum.return20d < -10) {
    risks.push("negative recent momentum");
  }

  if (signals.meanReversion < 30) {
    risks.push("overbought — may be extended");
  }

  return risks.length > 0 ? `Key risks: ${risks.join("; ")}.` : "No major risk flags identified.";
}

function describeMomentum(signals: SignalSnapshot): string {
  const dp = signals.metadata?.dataPoints;
  const parts: string[] = [];

  if (dp?.momentum) {
    if (dp.momentum.return20d != null) {
      const r = dp.momentum.return20d;
      parts.push(`${r > 0 ? "+" : ""}${r.toFixed(1)}% over 20 days`);
    }
    if (dp.momentum.volRatio != null && dp.momentum.volRatio > 1.3) {
      parts.push(`${dp.momentum.volRatio.toFixed(1)}x normal volume`);
    }
  }

  if (parts.length === 0) {
    if (signals.momentum >= 70) return "Strong positive momentum.";
    if (signals.momentum >= 55) return "Moderate positive momentum.";
    if (signals.momentum >= 45) return "Flat momentum.";
    return "Negative momentum.";
  }

  return `Momentum: ${parts.join(" with ")}.`;
}

function describePositionSizing(opp: Opportunity): string {
  const parts: string[] = [];

  if (opp.suggestedAllocation && opp.suggestedAllocation > 0) {
    parts.push(`Position sized at ${dollarFmt(opp.suggestedAllocation)}`);
  }

  if (opp.entryPrice && opp.targetPrice) {
    parts.push(`target ${dollarFmt(opp.targetPrice)}`);
  }

  if (opp.entryPrice && opp.stopLoss) {
    parts.push(`stop ${dollarFmt(opp.stopLoss)}`);
  }

  return parts.length > 0 ? parts.join(", ") + "." : "";
}

function actionRecommendation(opp: Opportunity): string {
  const band = opp.convictionBand;
  const prob = opp.probabilityOfSuccess;
  const edge = opp.expectedEdge;

  if (band === "high" && edge && edge > 0.3) {
    return "Strong buy — high conviction with significant edge.";
  }
  if (band === "medium" && edge && edge > 0.1) {
    return "Buy — medium conviction with positive expected edge.";
  }
  if (band === "low" && edge && edge > 0) {
    return "Watch — low conviction. Wait for stronger signal confirmation before entry.";
  }
  if (band === "avoid") {
    if (edge && edge < -0.1) {
      return "Avoid. Negative expected edge doesn't justify the risk. No position recommended.";
    }
    return "Avoid. Insufficient conviction for a position.";
  }

  if (prob && prob < 0.45) {
    return `P(Success) at just ${pctFmt(prob)} doesn't justify the risk. No position recommended.`;
  }

  return "Watch. Wait for momentum confirmation before entry.";
}

function describeWikiContext(wikiContext: string): string {
  if (!wikiContext || wikiContext.trim().length < 20) return "";

  const parts: string[] = [];

  // Extract prediction history stats from wiki
  const historyRows = wikiContext.match(/\| \d{4}-\d{2}-\d{2} \| (BUY|SELL|WATCH) \|/g);
  if (historyRows && historyRows.length > 1) {
    parts.push(`Wiki history: ${historyRows.length} prior predictions tracked.`);
  }

  // Check for macro regime context
  const regimeMatch = wikiContext.match(/\| \d{4}-\d{2}-\d{2}[^|]*\| (NEUTRAL|BULLISH|BEARISH|CRISIS) \|/g);
  if (regimeMatch && regimeMatch.length > 0) {
    const latest = regimeMatch[regimeMatch.length - 1];
    const regime = latest.match(/(NEUTRAL|BULLISH|BEARISH|CRISIS)/)?.[1];
    if (regime) parts.push(`Current macro regime: ${regime}.`);
  }

  return parts.length > 0 ? parts.join(" ") : "";
}

export function generateThesis(opp: Opportunity, signalSnapshot?: SignalSnapshot | null): string {
  // Build signals from opportunity if no snapshot provided
  const signals: SignalSnapshot = signalSnapshot || {
    momentum: opp.momentum,
    meanReversion: opp.meanReversion,
    quality: opp.quality,
    flow: opp.flow,
    risk: opp.risk,
    crowding: opp.crowding,
  };

  const ticker = opp.ticker || opp.name;
  const score = opp.compositeScore;
  const band = opp.convictionBand;

  // Build the thesis sections
  const sections: string[] = [];

  // 1. Header: ticker + conviction
  if (band === "avoid" || (opp.expectedEdge && opp.expectedEdge < 0)) {
    sections.push(`${ticker} — Avoid. Negative composite score (${score?.toFixed(3)}) with weak outlook.`);
  } else if (band === "high") {
    sections.push(`${ticker} — Strong Buy (${convictionLabel(band)}). Composite score ${score?.toFixed(3)} with P(Success) ${opp.probabilityOfSuccess ? pctFmt(opp.probabilityOfSuccess) : "N/A"}.`);
  } else if (band === "medium") {
    sections.push(`${ticker} — Buy (${convictionLabel(band)}). Score ${score?.toFixed(3)}, P(Success) ${opp.probabilityOfSuccess ? pctFmt(opp.probabilityOfSuccess) : "N/A"}.`);
  } else if (band === "low") {
    sections.push(`${ticker} — Watch. Score ${score?.toFixed(3)} (${convictionLabel(band)}). ${opp.probabilityOfSuccess ? `P(Success) ${pctFmt(opp.probabilityOfSuccess)}.` : ""}`);
  } else {
    sections.push(`${ticker} — Score ${score?.toFixed(3) || "N/A"}.`);
  }

  // 2. Momentum description
  const momentumDesc = describeMomentum(signals);
  if (momentumDesc) sections.push(momentumDesc);

  // 3. Strongest signal
  sections.push(describeStrongestSignal(signals));

  // 4. Fundamentals context
  const fundDesc = describeFundamentals(signals, opp);
  if (fundDesc) sections.push(fundDesc);

  // 5. Risks
  sections.push(describeRisks(signals));

  // 6. Position sizing and targets
  const posDesc = describePositionSizing(opp);
  if (posDesc) sections.push(posDesc);

  // 7. Action recommendation
  sections.push(actionRecommendation(opp));

  // 8. Wiki historical context (if available)
  if (opp.ticker) {
    try {
      // Synchronously check for wiki context — getThesisContext is async
      // but we read the file directly for synchronous thesis generation
      const fs = require("fs");
      const path = require("path");
      const tickerPath = path.resolve("autoresearch/wiki/pages/tickers", `${opp.ticker.toUpperCase()}.md`);
      if (fs.existsSync(tickerPath)) {
        const wikiContent = fs.readFileSync(tickerPath, "utf-8");
        const ctx = describeWikiContext(wikiContent);
        if (ctx) sections.push(ctx);
      }
    } catch { /* wiki context is optional */ }
  }

  return sections.join(" ");
}
