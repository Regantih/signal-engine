/**
 * Wiki Engine — Karpathy-style Research Wiki for Signal Engine
 *
 * Manages a filesystem-based wiki of markdown files that accumulate
 * institutional knowledge about market signals, patterns, and prediction outcomes.
 * All generation is rule-based using template strings — NO external LLM calls.
 */

import fs from "fs";
import path from "path";
import type { Opportunity } from "@shared/schema";

const WIKI_ROOT = path.resolve(process.cwd(), "autoresearch/wiki");

// Ensure directories exist
function ensureDirs(): void {
  const dirs = [
    WIKI_ROOT,
    path.join(WIKI_ROOT, "raw"),
    path.join(WIKI_ROOT, "raw/predictions"),
    path.join(WIKI_ROOT, "pages"),
    path.join(WIKI_ROOT, "pages/tickers"),
    path.join(WIKI_ROOT, "pages/patterns"),
    path.join(WIKI_ROOT, "pages/analysis"),
    path.join(WIKI_ROOT, "pages/macro"),
    path.join(WIKI_ROOT, "pages/predictions"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function now(): string {
  return new Date().toISOString();
}

// ════════════════════════════════════════════════════════════════
// INGEST: Write a raw document into the wiki
// ════════════════════════════════════════════════════════════════

export async function ingestDocument(
  type: string,
  content: string,
  source: string,
): Promise<void> {
  ensureDirs();

  const slug = source.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const filename = `${today()}-${slug}.md`;
  const dir = type === "prediction"
    ? path.join(WIKI_ROOT, "raw/predictions")
    : path.join(WIKI_ROOT, "raw");

  const filePath = path.join(dir, filename);
  const doc = `# Raw: ${source}\n\n> Ingested: ${now()}\n> Type: ${type}\n\n${content}\n`;
  fs.writeFileSync(filePath, doc, "utf-8");

  appendLog(`ingest | ${type} | ${source}`);
}

// ════════════════════════════════════════════════════════════════
// TICKER PAGE: Generate/update a ticker knowledge page
// ════════════════════════════════════════════════════════════════

export interface TickerPageData {
  ticker: string;
  compositeScore: number | null;
  convictionBand: string | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
  thesis: string | null;
  fundamentals?: {
    peRatio?: number | null;
    roe?: number | null;
    grossMargin?: number | null;
    qualityGrade?: string;
  };
  predictions?: Array<{
    date: string;
    action: string;
    entry: number | null;
    target: number | null;
    stop: number | null;
    outcome: string;
    pnl: string;
  }>;
}

export async function updateTickerPage(
  ticker: string,
  data: TickerPageData,
): Promise<void> {
  ensureDirs();

  const filePath = path.join(WIKI_ROOT, `pages/tickers/${ticker.toUpperCase()}.md`);

  // Build prediction table rows
  let predictionRows = "";
  if (data.predictions && data.predictions.length > 0) {
    predictionRows = data.predictions
      .map(p => `| ${p.date} | ${p.action} | $${p.entry?.toFixed(2) ?? "N/A"} | $${p.target?.toFixed(2) ?? "N/A"} | $${p.stop?.toFixed(2) ?? "N/A"} | ${p.outcome} | ${p.pnl} |`)
      .join("\n");
  } else {
    predictionRows = "| — | — | — | — | — | — | — |";
  }

  // Build fundamentals section
  let fundamentalsSection = "";
  if (data.fundamentals) {
    const f = data.fundamentals;
    const parts: string[] = [];
    if (f.peRatio != null) parts.push(`P/E: ${f.peRatio.toFixed(1)}`);
    if (f.roe != null) parts.push(`ROE: ${f.roe.toFixed(1)}%`);
    if (f.grossMargin != null) parts.push(`Gross Margin: ${f.grossMargin.toFixed(1)}%`);
    if (f.qualityGrade) parts.push(`Quality Grade: ${f.qualityGrade}`);
    fundamentalsSection = parts.length > 0
      ? `## Fundamentals\n- ${parts.join(" | ")}\n`
      : "";
  }

  // Read existing page to preserve pattern notes
  let existingPatterns = "_No patterns observed yet._";
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    const patternMatch = existing.match(/## Key Patterns\n([\s\S]*?)(?=\n## |\n---|\n$)/);
    if (patternMatch && patternMatch[1].trim() && !patternMatch[1].includes("No patterns")) {
      existingPatterns = patternMatch[1].trim();
    }
  }

  const page = `# ${ticker.toUpperCase()} — Research Page

## Current Snapshot
- **Score**: ${data.compositeScore?.toFixed(3) ?? "N/A"} | **Conviction**: ${data.convictionBand ?? "unscored"}
- **Price**: $${data.entryPrice?.toFixed(2) ?? "N/A"} | **Target**: $${data.targetPrice?.toFixed(2) ?? "N/A"} | **Stop**: $${data.stopLoss?.toFixed(2) ?? "N/A"}
- **Signals**: Mom ${data.momentum} | MR ${data.meanReversion} | Qual ${data.quality} | Flow ${data.flow} | Risk ${data.risk} | Crowd ${data.crowding}

## AI Thesis
${data.thesis || "_No thesis generated yet._"}

## Prediction Record
| Date | Action | Entry | Target | Stop | Outcome | P&L |
|------|--------|-------|--------|------|---------|-----|
${predictionRows}

## Key Patterns
${existingPatterns}

${fundamentalsSection}
---
Last updated: ${now()}
`;

  fs.writeFileSync(filePath, page, "utf-8");
  await updateIndex();
  appendLog(`ticker-update | ${ticker.toUpperCase()}`);
}

// ════════════════════════════════════════════════════════════════
// PATTERN: Record a pattern observation
// ════════════════════════════════════════════════════════════════

export async function recordPattern(
  patternName: string,
  conditions: string[],
  outcome: string,
  confidence: number,
): Promise<void> {
  ensureDirs();

  const slug = patternName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const filePath = path.join(WIKI_ROOT, `pages/patterns/${slug}.md`);

  // If page exists, append a new example row
  if (fs.existsSync(filePath)) {
    let existing = fs.readFileSync(filePath, "utf-8");

    // Update confidence
    existing = existing.replace(
      /## Confidence: \d+/,
      `## Confidence: ${confidence}`,
    );

    // Append example if table exists
    const tableRow = `| ${today()} | — | ${outcome} | — |`;
    if (existing.includes("| Date | Ticker | Outcome | Return |")) {
      existing = existing.replace(
        /(\n---\nLast updated:)/,
        `\n${tableRow}\n$1`,
      );
    }

    existing = existing.replace(/Last updated: .*/, `Last updated: ${now()}`);
    fs.writeFileSync(filePath, existing, "utf-8");
  } else {
    const conditionsList = conditions.map(c => `- ${c}`).join("\n");
    const page = `# Pattern: ${patternName}

## Description
${patternName} — a pattern discovered by analyzing prediction outcomes in the Signal Engine.

## Conditions
${conditionsList}

## Historical Outcomes
- Win rate: calculating...
- Avg return: calculating...

## Examples
| Date | Ticker | Outcome | Return |
|------|--------|---------|--------|
| ${today()} | — | ${outcome} | — |

## Confidence: ${confidence}

---
Last updated: ${now()}
`;
    fs.writeFileSync(filePath, page, "utf-8");
  }

  await updateIndex();
  appendLog(`pattern | ${patternName} | confidence ${confidence}`);
}

// ════════════════════════════════════════════════════════════════
// MACRO: Record macro regime observation
// ════════════════════════════════════════════════════════════════

export async function recordMacroObservation(
  regime: string,
  indicators: {
    vix?: { value: number; signal: string };
    sp500?: { value: number; change: number };
    yield10y?: { value: number };
    dxy?: { value: number };
    sentiment?: string;
  },
): Promise<void> {
  ensureDirs();

  const slug = `${today()}-${regime.toLowerCase()}`;
  const filePath = path.join(WIKI_ROOT, `pages/macro/${slug}.md`);

  const page = `# Macro: ${regime} Regime — ${today()}

## Regime
${regime}

## Key Indicators
- VIX: ${indicators.vix?.value ?? "N/A"} (${indicators.vix?.signal ?? "N/A"})
- S&P 500: ${indicators.sp500?.value ?? "N/A"} (${indicators.sp500?.change != null ? (indicators.sp500.change >= 0 ? "+" : "") + indicators.sp500.change.toFixed(2) + "%" : "N/A"})
- 10Y Yield: ${indicators.yield10y?.value ?? "N/A"}
- DXY: ${indicators.dxy?.value ?? "N/A"}
- Sentiment: ${indicators.sentiment ?? "N/A"}

## Market Implications
${regime === "CRISIS" ? "Crisis regime: reduce position sizes, tighten stops, favor defensive assets." :
  regime === "RISK_OFF" ? "Risk-off regime: cautious positioning, favor quality signals over momentum." :
  regime === "RISK_ON" ? "Risk-on regime: full position sizing, momentum signals carry more weight." :
  "Neutral regime: standard position sizing and signal weights apply."}

---
Observed: ${now()}
`;

  fs.writeFileSync(filePath, page, "utf-8");
  await updateIndex();
  appendLog(`macro | ${regime} regime observed`);
}

// ════════════════════════════════════════════════════════════════
// PREDICTION OUTCOME: Record a resolved prediction as raw doc
// ════════════════════════════════════════════════════════════════

export async function recordPredictionOutcome(
  ticker: string,
  action: string,
  entryPrice: number,
  targetPrice: number | null,
  stopLoss: number | null,
  outcome: "WIN" | "LOSS" | "PENDING",
  resolvedPrice: number | null,
  reasoning: string,
): Promise<void> {
  ensureDirs();

  const outcomeLower = outcome.toLowerCase();
  const filename = `${ticker.toUpperCase()}-${today()}-${outcomeLower}.md`;
  const filePath = path.join(WIKI_ROOT, `raw/predictions/${filename}`);

  const pnl = resolvedPrice && entryPrice
    ? (((resolvedPrice - entryPrice) / entryPrice) * 100).toFixed(2) + "%"
    : "N/A";

  const content = `# Prediction: ${ticker.toUpperCase()} ${action} — ${outcome}

- **Date**: ${today()}
- **Action**: ${action}
- **Entry**: $${entryPrice.toFixed(2)}
- **Target**: $${targetPrice?.toFixed(2) ?? "N/A"}
- **Stop**: $${stopLoss?.toFixed(2) ?? "N/A"}
- **Resolved Price**: $${resolvedPrice?.toFixed(2) ?? "N/A"}
- **Outcome**: ${outcome}
- **P&L**: ${pnl}

## Reasoning
${reasoning}

---
Recorded: ${now()}
`;

  fs.writeFileSync(filePath, content, "utf-8");
  appendLog(`prediction-outcome | ${ticker.toUpperCase()} | ${outcome} | ${pnl}`);
}

// ════════════════════════════════════════════════════════════════
// THESIS CONTEXT: Get relevant wiki history for a ticker
// ════════════════════════════════════════════════════════════════

export async function getThesisContext(ticker: string): Promise<string> {
  ensureDirs();
  const parts: string[] = [];
  const t = ticker.toUpperCase();

  // 1. Read ticker page if exists
  const tickerPath = path.join(WIKI_ROOT, `pages/tickers/${t}.md`);
  if (fs.existsSync(tickerPath)) {
    const content = fs.readFileSync(tickerPath, "utf-8");

    // Extract prediction record section
    const predMatch = content.match(/## Prediction Record\n([\s\S]*?)(?=\n## )/);
    if (predMatch) {
      // Count wins and losses from table
      const rows = predMatch[1].split("\n").filter(r => r.startsWith("|") && !r.includes("---") && !r.includes("Date"));
      let wins = 0, losses = 0;
      for (const row of rows) {
        if (row.includes("WIN")) wins++;
        if (row.includes("LOSS")) losses++;
      }
      const total = wins + losses;
      if (total > 0) {
        parts.push(`Historical record: ${wins}W/${losses}L (${((wins / total) * 100).toFixed(0)}% win rate over ${total} trades).`);
      }
    }

    // Extract pattern notes
    const patternMatch = content.match(/## Key Patterns\n([\s\S]*?)(?=\n## |\n---)/);
    if (patternMatch && !patternMatch[1].includes("No patterns")) {
      parts.push(`Known patterns: ${patternMatch[1].trim()}`);
    }
  }

  // 2. Read raw prediction files for this ticker
  const rawDir = path.join(WIKI_ROOT, "raw/predictions");
  if (fs.existsSync(rawDir)) {
    const files = fs.readdirSync(rawDir).filter(f => f.startsWith(`${t}-`));
    const recentFiles = files.slice(-5); // Last 5 predictions
    for (const file of recentFiles) {
      const content = fs.readFileSync(path.join(rawDir, file), "utf-8");
      // Extract one-line summary
      const outcomeMatch = content.match(/\*\*Outcome\*\*: (\w+)/);
      const pnlMatch = content.match(/\*\*P&L\*\*: ([^\n]+)/);
      if (outcomeMatch) {
        parts.push(`Previous: ${outcomeMatch[1]}${pnlMatch ? ` (${pnlMatch[1]})` : ""}`);
      }
    }
  }

  // 3. Check current macro regime
  const macroDir = path.join(WIKI_ROOT, "pages/macro");
  if (fs.existsSync(macroDir)) {
    const macroFiles = fs.readdirSync(macroDir).sort().reverse();
    if (macroFiles.length > 0) {
      const latest = fs.readFileSync(path.join(macroDir, macroFiles[0]), "utf-8");
      const regimeMatch = latest.match(/## Regime\n(\w+)/);
      if (regimeMatch) {
        parts.push(`Current macro regime: ${regimeMatch[1]}.`);
      }
    }
  }

  return parts.length > 0 ? parts.join(" ") : "";
}

// ════════════════════════════════════════════════════════════════
// QUERY: Search wiki pages for relevant content
// ════════════════════════════════════════════════════════════════

export async function queryWiki(question: string): Promise<string> {
  ensureDirs();

  const q = question.toLowerCase();
  const results: Array<{ file: string; relevance: number; excerpt: string }> = [];

  // Search all pages
  const searchDirs = [
    { dir: path.join(WIKI_ROOT, "pages/tickers"), type: "ticker" },
    { dir: path.join(WIKI_ROOT, "pages/patterns"), type: "pattern" },
    { dir: path.join(WIKI_ROOT, "pages/analysis"), type: "analysis" },
    { dir: path.join(WIKI_ROOT, "pages/macro"), type: "macro" },
  ];

  for (const { dir, type } of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const contentLower = content.toLowerCase();

      // Score relevance by keyword matching
      const words = q.split(/\s+/).filter(w => w.length > 2);
      let hits = 0;
      for (const word of words) {
        if (contentLower.includes(word)) hits++;
      }

      if (hits > 0) {
        // Extract first meaningful paragraph as excerpt
        const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("---") && !l.startsWith(">"));
        const excerpt = lines.slice(0, 3).join(" ").substring(0, 200);
        results.push({
          file: `${type}/${file}`,
          relevance: hits / words.length,
          excerpt: excerpt || "(no excerpt)",
        });
      }
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevance - a.relevance);
  const top = results.slice(0, 5);

  if (top.length === 0) {
    return `No wiki pages found matching "${question}". The wiki grows as the autopilot scores tickers and records outcomes.`;
  }

  const answer = top.map((r, i) =>
    `${i + 1}. **${r.file}** (relevance: ${(r.relevance * 100).toFixed(0)}%)\n   ${r.excerpt}`
  ).join("\n\n");

  return `Found ${results.length} relevant page(s) for "${question}":\n\n${answer}`;
}

// ════════════════════════════════════════════════════════════════
// LINT: Find stale or missing info in the wiki
// ════════════════════════════════════════════════════════════════

export async function lintWiki(): Promise<string[]> {
  ensureDirs();
  const issues: string[] = [];

  // Check index exists
  const indexPath = path.join(WIKI_ROOT, "index.md");
  if (!fs.existsSync(indexPath)) {
    issues.push("Missing index.md");
  }

  // Check for ticker pages that haven't been updated in 7+ days
  const tickerDir = path.join(WIKI_ROOT, "pages/tickers");
  if (fs.existsSync(tickerDir)) {
    const files = fs.readdirSync(tickerDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const stat = fs.statSync(path.join(tickerDir, file));
      const daysSinceUpdate = (Date.now() - stat.mtimeMs) / 86400000;
      if (daysSinceUpdate > 7) {
        issues.push(`Stale ticker page: ${file} (${daysSinceUpdate.toFixed(0)} days old)`);
      }
    }
  }

  // Check for empty pages
  const pagesDirs = ["pages/tickers", "pages/patterns", "pages/macro", "pages/analysis"];
  for (const pd of pagesDirs) {
    const dir = path.join(WIKI_ROOT, pd);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      if (content.length < 50) {
        issues.push(`Near-empty page: ${pd}/${file}`);
      }
    }
  }

  // Check log exists and is non-empty
  const logPath = path.join(WIKI_ROOT, "log.md");
  if (!fs.existsSync(logPath)) {
    issues.push("Missing log.md");
  }

  if (issues.length === 0) {
    issues.push("Wiki is clean — no issues found.");
  }

  return issues;
}

// ════════════════════════════════════════════════════════════════
// INDEX: Rebuild index.md from current page state
// ════════════════════════════════════════════════════════════════

async function updateIndex(): Promise<void> {
  const indexPath = path.join(WIKI_ROOT, "index.md");

  const sections: string[] = [
    "# Signal Engine Research Wiki — Index\n",
    "> Auto-maintained catalog of all research pages. Updated on every ingest.\n",
  ];

  // Ticker pages
  const tickerDir = path.join(WIKI_ROOT, "pages/tickers");
  const tickerFiles = fs.existsSync(tickerDir) ? fs.readdirSync(tickerDir).filter(f => f.endsWith(".md")).sort() : [];
  sections.push("## Ticker Pages");
  if (tickerFiles.length === 0) {
    sections.push("_No ticker pages yet._\n");
  } else {
    for (const f of tickerFiles) {
      const ticker = f.replace(".md", "");
      const content = fs.readFileSync(path.join(tickerDir, f), "utf-8");
      const scoreMatch = content.match(/\*\*Score\*\*: ([^\s|]+)/);
      const convMatch = content.match(/\*\*Conviction\*\*: (\w+)/);
      sections.push(`- [${ticker}](pages/tickers/${f}) — Score: ${scoreMatch?.[1] ?? "N/A"}, ${convMatch?.[1] ?? "unscored"}`);
    }
    sections.push("");
  }

  // Pattern pages
  const patternDir = path.join(WIKI_ROOT, "pages/patterns");
  const patternFiles = fs.existsSync(patternDir) ? fs.readdirSync(patternDir).filter(f => f.endsWith(".md")).sort() : [];
  sections.push("## Pattern Pages");
  if (patternFiles.length === 0) {
    sections.push("_No patterns recorded yet._\n");
  } else {
    for (const f of patternFiles) {
      const name = f.replace(".md", "").replace(/-/g, " ");
      const content = fs.readFileSync(path.join(patternDir, f), "utf-8");
      const confMatch = content.match(/## Confidence: (\d+)/);
      sections.push(`- [${name}](pages/patterns/${f}) — Confidence: ${confMatch?.[1] ?? "N/A"}`);
    }
    sections.push("");
  }

  // Analysis pages
  const analysisDir = path.join(WIKI_ROOT, "pages/analysis");
  const analysisFiles = fs.existsSync(analysisDir) ? fs.readdirSync(analysisDir).filter(f => f.endsWith(".md")).sort().reverse() : [];
  sections.push("## Analysis Pages");
  if (analysisFiles.length === 0) {
    sections.push("_No analysis pages yet._\n");
  } else {
    for (const f of analysisFiles.slice(0, 10)) {
      sections.push(`- [${f.replace(".md", "")}](pages/analysis/${f})`);
    }
    sections.push("");
  }

  // Macro pages
  const macroDir = path.join(WIKI_ROOT, "pages/macro");
  const macroFiles = fs.existsSync(macroDir) ? fs.readdirSync(macroDir).filter(f => f.endsWith(".md")).sort().reverse() : [];
  sections.push("## Macro Pages");
  if (macroFiles.length === 0) {
    sections.push("_No macro observations yet._\n");
  } else {
    for (const f of macroFiles.slice(0, 10)) {
      const content = fs.readFileSync(path.join(macroDir, f), "utf-8");
      const regimeMatch = content.match(/## Regime\n(\w+)/);
      sections.push(`- [${f.replace(".md", "")}](pages/macro/${f}) — ${regimeMatch?.[1] ?? "unknown"}`);
    }
    sections.push("");
  }

  sections.push("---");
  sections.push(`Last updated: ${now()}`);

  fs.writeFileSync(indexPath, sections.join("\n"), "utf-8");
}

// ════════════════════════════════════════════════════════════════
// LOG: Append-only log
// ════════════════════════════════════════════════════════════════

function appendLog(entry: string): void {
  const logPath = path.join(WIKI_ROOT, "log.md");
  const line = `\n## [${now()}] ${entry}\n`;
  fs.appendFileSync(logPath, line, "utf-8");
}

// ════════════════════════════════════════════════════════════════
// READ helpers for API endpoints
// ════════════════════════════════════════════════════════════════

export function readIndexContent(): string {
  ensureDirs();
  const indexPath = path.join(WIKI_ROOT, "index.md");
  if (!fs.existsSync(indexPath)) return "# Wiki Index\n\nNo content yet.";
  return fs.readFileSync(indexPath, "utf-8");
}

export function readTickerPage(ticker: string): string | null {
  ensureDirs();
  const filePath = path.join(WIKI_ROOT, `pages/tickers/${ticker.toUpperCase()}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export function listWikiPages(): {
  tickers: string[];
  patterns: string[];
  analysis: string[];
  macro: string[];
} {
  ensureDirs();
  const read = (sub: string) => {
    const dir = path.join(WIKI_ROOT, sub);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".md")).map(f => f.replace(".md", "")) : [];
  };
  return {
    tickers: read("pages/tickers"),
    patterns: read("pages/patterns"),
    analysis: read("pages/analysis"),
    macro: read("pages/macro"),
  };
}

export function readLogContent(): string {
  ensureDirs();
  const logPath = path.join(WIKI_ROOT, "log.md");
  if (!fs.existsSync(logPath)) return "# Wiki Log\n\nNo entries yet.";
  return fs.readFileSync(logPath, "utf-8");
}

export function readPatternPage(slug: string): string | null {
  ensureDirs();
  const filePath = path.join(WIKI_ROOT, `pages/patterns/${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export function readMacroPage(slug: string): string | null {
  ensureDirs();
  const filePath = path.join(WIKI_ROOT, `pages/macro/${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}
