/**
 * Karpathy-style Research Wiki Engine
 *
 * File-based wiki using Node.js fs. NO external LLM calls.
 * Maintains per-ticker knowledge pages, pattern observations,
 * macro regime logs, and a searchable index.
 */

import * as fs from "fs";
import * as path from "path";
import type { Opportunity } from "@shared/schema";

const WIKI_ROOT = path.resolve("autoresearch/wiki");
const RAW_DIR = path.join(WIKI_ROOT, "raw");
const PAGES_DIR = path.join(WIKI_ROOT, "pages");
const TICKERS_DIR = path.join(PAGES_DIR, "tickers");
const PATTERNS_DIR = path.join(PAGES_DIR, "patterns");
const ANALYSIS_DIR = path.join(PAGES_DIR, "analysis");
const MACRO_DIR = path.join(PAGES_DIR, "macro");
const INDEX_PATH = path.join(WIKI_ROOT, "index.md");
const LOG_PATH = path.join(WIKI_ROOT, "log.md");

// Ensure all directories exist
function ensureDirs(): void {
  for (const dir of [RAW_DIR, TICKERS_DIR, PATTERNS_DIR, ANALYSIS_DIR, MACRO_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function dateTag(): string {
  return new Date().toISOString().split("T")[0];
}

function qualityGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// ──────────────────────────────────────────────
// Append to log.md
// ──────────────────────────────────────────────
function appendLog(entry: string): void {
  try {
    fs.appendFileSync(LOG_PATH, `\n## ${timestamp()} | ${entry}\n`);
  } catch (e: any) {
    console.error(`[wiki] Log append error: ${e.message}`);
  }
}

// ──────────────────────────────────────────────
// Rebuild index.md from disk
// ──────────────────────────────────────────────
function rebuildIndex(): void {
  try {
    const sections: string[] = [
      "# Signal Engine Research Wiki — Index\n",
      `> Auto-generated content catalog. Last updated: ${timestamp()}\n`,
    ];

    // Tickers
    const tickers = safeReadDir(TICKERS_DIR).filter(f => f.endsWith(".md")).sort();
    sections.push("## Tickers");
    if (tickers.length === 0) {
      sections.push("_No ticker pages yet._\n");
    } else {
      for (const f of tickers) {
        const ticker = f.replace(".md", "").toUpperCase();
        const firstLine = readFirstContentLine(path.join(TICKERS_DIR, f));
        sections.push(`- [${ticker}](pages/tickers/${f}) — ${firstLine}`);
      }
      sections.push("");
    }

    // Patterns
    const patterns = safeReadDir(PATTERNS_DIR).filter(f => f.endsWith(".md")).sort();
    sections.push("## Patterns");
    if (patterns.length === 0) {
      sections.push("_No pattern pages yet._\n");
    } else {
      for (const f of patterns) {
        const name = f.replace(".md", "").replace(/-/g, " ");
        const firstLine = readFirstContentLine(path.join(PATTERNS_DIR, f));
        sections.push(`- [${name}](pages/patterns/${f}) — ${firstLine}`);
      }
      sections.push("");
    }

    // Analysis
    const analysis = safeReadDir(ANALYSIS_DIR).filter(f => f.endsWith(".md")).sort();
    sections.push("## Analysis");
    if (analysis.length === 0) {
      sections.push("_No analysis pages yet._\n");
    } else {
      for (const f of analysis) {
        const name = f.replace(".md", "").replace(/-/g, " ");
        sections.push(`- [${name}](pages/analysis/${f})`);
      }
      sections.push("");
    }

    // Macro
    const macroFiles = safeReadDir(MACRO_DIR).filter(f => f.endsWith(".md")).sort();
    sections.push("## Macro");
    if (macroFiles.length === 0) {
      sections.push("_No macro observations yet._\n");
    } else {
      for (const f of macroFiles) {
        const name = f.replace(".md", "").replace(/-/g, " ");
        sections.push(`- [${name}](pages/macro/${f})`);
      }
      sections.push("");
    }

    fs.writeFileSync(INDEX_PATH, sections.join("\n"));
  } catch (e: any) {
    console.error(`[wiki] Index rebuild error: ${e.message}`);
  }
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function readFirstContentLine(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    // Skip headers and blank lines, grab first content
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith(">") && !trimmed.startsWith("|") && !trimmed.startsWith("-")) {
        return trimmed.slice(0, 80);
      }
    }
    // Fall back to first non-empty header
    for (const line of lines) {
      if (line.trim().startsWith("# ")) return line.trim().replace(/^#+\s*/, "").slice(0, 80);
    }
    return "(empty)";
  } catch {
    return "(unreadable)";
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Ingest a raw document into the wiki.
 * Writes to raw/, appends to log.md, rebuilds index.md.
 */
export async function ingestDocument(type: string, content: string, source: string): Promise<void> {
  ensureDirs();
  const filename = `${dateTag()}-${type}-${source.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40)}.md`;
  const filePath = path.join(RAW_DIR, filename);

  const doc = [
    `# Raw Document: ${type}`,
    `> Source: ${source}`,
    `> Ingested: ${timestamp()}`,
    "",
    content,
  ].join("\n");

  fs.writeFileSync(filePath, doc);
  appendLog(`ingest | ${type} | ${source}`);
  rebuildIndex();
  console.log(`[wiki] Ingested document: ${filename}`);
}

/**
 * Create or update a ticker knowledge page with current scoring data.
 */
export async function updateTickerPage(
  ticker: string,
  opportunity: Opportunity,
  fundamentals?: Record<string, any> | null,
): Promise<void> {
  ensureDirs();
  const tickerUpper = ticker.toUpperCase();
  const filePath = path.join(TICKERS_DIR, `${tickerUpper}.md`);
  const now = timestamp();

  // Read existing page to preserve prediction history
  let existingHistory = "";
  let existingObservations = "";
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    const historyMatch = existing.match(/## Prediction History\n([\s\S]*?)(?=\n## |\n$)/);
    if (historyMatch) existingHistory = historyMatch[1].trim();
    const obsMatch = existing.match(/## Observations\n([\s\S]*?)$/);
    if (obsMatch) existingObservations = obsMatch[1].trim();
  }

  // Add new prediction row
  const action = opportunity.status === "buy" ? "BUY" : opportunity.status === "sell" ? "SELL" : "WATCH";
  const newRow = `| ${dateTag()} | ${action} | ${opportunity.compositeScore?.toFixed(3) || "N/A"} | $${opportunity.entryPrice?.toFixed(2) || "N/A"} | $${opportunity.targetPrice?.toFixed(2) || "N/A"} | $${opportunity.stopLoss?.toFixed(2) || "N/A"} | pending |`;

  // Build prediction history table
  let historyTable: string;
  if (existingHistory && existingHistory.includes("| Date")) {
    // Append new row, but avoid duplicate date+action
    const todayPrefix = `| ${dateTag()} | ${action}`;
    if (existingHistory.includes(todayPrefix)) {
      // Update today's row instead of duplicating
      const rows = existingHistory.split("\n");
      const updated = rows.map(row => row.startsWith(todayPrefix) ? newRow : row);
      historyTable = updated.join("\n");
    } else {
      historyTable = existingHistory + "\n" + newRow;
    }
  } else {
    historyTable = [
      "| Date | Action | Score | Entry | Target | Stop | Outcome |",
      "|------|--------|-------|-------|--------|------|---------|",
      newRow,
    ].join("\n");
  }

  const grade = qualityGrade(opportunity.quality);

  const page = [
    `# ${tickerUpper} — Research Page`,
    "",
    `> Last updated: ${now}`,
    "",
    "## Current Score",
    `- **Composite:** ${opportunity.compositeScore?.toFixed(3) || "N/A"}`,
    `- **Conviction:** ${opportunity.convictionBand || "unscored"}`,
    `- **P(Success):** ${opportunity.probabilityOfSuccess ? (opportunity.probabilityOfSuccess * 100).toFixed(1) + "%" : "N/A"}`,
    `- **Expected Edge:** ${opportunity.expectedEdge?.toFixed(3) || "N/A"}`,
    `- **Kelly Fraction:** ${opportunity.kellyFraction?.toFixed(3) || "N/A"}`,
    `- **Suggested Allocation:** $${opportunity.suggestedAllocation?.toFixed(2) || "0.00"}`,
    "",
    "## Thesis",
    opportunity.thesis || "_No thesis generated yet._",
    "",
    "## Signal Snapshot",
    "| Signal | Score |",
    "|--------|-------|",
    `| Momentum | ${opportunity.momentum}/100 |`,
    `| Mean Reversion | ${opportunity.meanReversion}/100 |`,
    `| Quality | ${opportunity.quality}/100 |`,
    `| Flow | ${opportunity.flow}/100 |`,
    `| Risk | ${opportunity.risk}/100 |`,
    `| Crowding | ${opportunity.crowding}/100 |`,
    "",
    "## Fundamentals",
    `- **Quality Grade:** ${grade}`,
    `- **Entry:** $${opportunity.entryPrice?.toFixed(2) || "N/A"}`,
    `- **Target:** $${opportunity.targetPrice?.toFixed(2) || "N/A"}`,
    `- **Stop:** $${opportunity.stopLoss?.toFixed(2) || "N/A"}`,
    fundamentals ? formatFundamentals(fundamentals) : "",
    "",
    "## Prediction History",
    historyTable,
    "",
    "## Observations",
    existingObservations || "_No observations yet._",
    "",
  ].join("\n");

  fs.writeFileSync(filePath, page);
  appendLog(`ticker-update | ${tickerUpper} | score=${opportunity.compositeScore?.toFixed(3)} band=${opportunity.convictionBand}`);
  rebuildIndex();
}

function formatFundamentals(data: Record<string, any>): string {
  const parts: string[] = [];
  if (data.pe) parts.push(`- **P/E:** ${data.pe}`);
  if (data.roe) parts.push(`- **ROE:** ${data.roe}%`);
  if (data.grossMargin) parts.push(`- **Gross Margin:** ${data.grossMargin}%`);
  if (data.debtToEquity) parts.push(`- **Debt/Equity:** ${data.debtToEquity}`);
  if (data.fcfMargin) parts.push(`- **FCF Margin:** ${data.fcfMargin}%`);
  return parts.length > 0 ? "\n" + parts.join("\n") : "";
}

/**
 * Record a pattern observation.
 */
export async function recordPattern(
  patternName: string,
  conditions: string[],
  outcome: string,
  confidence: number,
): Promise<void> {
  ensureDirs();
  const slug = patternName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const filePath = path.join(PATTERNS_DIR, `${slug}.md`);
  const now = timestamp();

  // Read existing observations
  let existingObs = "";
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    const obsMatch = existing.match(/## Observations\n([\s\S]*?)$/);
    if (obsMatch) existingObs = obsMatch[1].trim();
  }

  const page = [
    `# Pattern: ${patternName}`,
    "",
    `> Last updated: ${now}`,
    "",
    "## Conditions",
    ...conditions.map(c => `- ${c}`),
    "",
    "## Expected Outcome",
    outcome,
    "",
    `## Confidence`,
    `${confidence}%`,
    "",
    "## Observations",
    existingObs || "| Date | Ticker | Result | Notes |\n|------|--------|--------|-------|\n_No observations yet._",
    "",
  ].join("\n");

  fs.writeFileSync(filePath, page);
  appendLog(`pattern | ${patternName} | confidence=${confidence}%`);
  rebuildIndex();
  console.log(`[wiki] Recorded pattern: ${patternName}`);
}

/**
 * Record macro regime observation.
 */
export async function recordMacroRegime(
  regime: string,
  vix: number,
  sp500Change: number,
  notes: string,
): Promise<void> {
  ensureDirs();
  const filePath = path.join(MACRO_DIR, "regime-log.md");
  const now = timestamp();

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, [
      "# Macro Regime Log",
      "",
      "> Chronological record of macro regime observations.",
      "",
      "| Date | Regime | VIX | S&P 500 Chg | Notes |",
      "|------|--------|-----|-------------|-------|",
      "",
    ].join("\n"));
  }

  const row = `| ${dateTag()} ${now.split(" ")[1]} | ${regime} | ${vix.toFixed(1)} | ${sp500Change >= 0 ? "+" : ""}${sp500Change.toFixed(1)}% | ${notes} |`;

  // Read existing, append row before trailing blank line
  const existing = fs.readFileSync(filePath, "utf-8");
  const content = existing.trimEnd() + "\n" + row + "\n";
  fs.writeFileSync(filePath, content);

  appendLog(`macro | regime=${regime} VIX=${vix.toFixed(1)} SP500=${sp500Change >= 0 ? "+" : ""}${sp500Change.toFixed(1)}%`);
  rebuildIndex();
}

/**
 * Get thesis context — reads ticker page + relevant pattern pages.
 * Returns concatenated content for thesis enhancement.
 */
export async function getThesisContext(ticker: string): Promise<string> {
  ensureDirs();
  const parts: string[] = [];
  const tickerUpper = ticker.toUpperCase();

  // Read ticker page
  const tickerPath = path.join(TICKERS_DIR, `${tickerUpper}.md`);
  if (fs.existsSync(tickerPath)) {
    const content = fs.readFileSync(tickerPath, "utf-8");
    parts.push(`--- Wiki: ${tickerUpper} ---`);
    parts.push(content);
  }

  // Read pattern pages that mention this ticker
  const patternFiles = safeReadDir(PATTERNS_DIR).filter(f => f.endsWith(".md"));
  for (const f of patternFiles) {
    try {
      const content = fs.readFileSync(path.join(PATTERNS_DIR, f), "utf-8");
      if (content.toUpperCase().includes(tickerUpper)) {
        parts.push(`--- Wiki Pattern: ${f.replace(".md", "")} ---`);
        parts.push(content);
      }
    } catch { /* skip unreadable files */ }
  }

  // Read macro regime log for context
  const macroPath = path.join(MACRO_DIR, "regime-log.md");
  if (fs.existsSync(macroPath)) {
    const content = fs.readFileSync(macroPath, "utf-8");
    // Only include last 10 lines to keep context manageable
    const lines = content.split("\n");
    const lastEntries = lines.slice(-12).join("\n");
    if (lastEntries.trim()) {
      parts.push("--- Wiki: Recent Macro Regime ---");
      parts.push(lastEntries);
    }
  }

  return parts.join("\n\n");
}

/**
 * Get the wiki index content.
 */
export async function getWikiIndex(): Promise<string> {
  ensureDirs();
  rebuildIndex();
  try {
    return fs.readFileSync(INDEX_PATH, "utf-8");
  } catch {
    return "# Wiki Index\n\n_Empty wiki._";
  }
}

/**
 * Get a specific ticker page.
 */
export async function getTickerPage(ticker: string): Promise<string | null> {
  ensureDirs();
  const filePath = path.join(TICKERS_DIR, `${ticker.toUpperCase()}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Search all wiki pages for relevant content (simple text search).
 */
export async function queryWiki(question: string): Promise<string> {
  ensureDirs();
  const terms = question.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return "Please provide search terms (3+ characters each).";

  const results: Array<{ file: string; score: number; excerpt: string }> = [];

  // Search all page directories
  const dirs = [
    { dir: TICKERS_DIR, prefix: "tickers" },
    { dir: PATTERNS_DIR, prefix: "patterns" },
    { dir: ANALYSIS_DIR, prefix: "analysis" },
    { dir: MACRO_DIR, prefix: "macro" },
  ];

  for (const { dir, prefix } of dirs) {
    const files = safeReadDir(dir).filter(f => f.endsWith(".md"));
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(dir, f), "utf-8");
        const lower = content.toLowerCase();
        let score = 0;
        for (const term of terms) {
          const matches = lower.split(term).length - 1;
          score += matches;
        }
        if (score > 0) {
          // Extract best matching excerpt
          const lines = content.split("\n").filter(l => l.trim());
          const bestLine = lines.find(l => terms.some(t => l.toLowerCase().includes(t))) || lines[0] || "";
          results.push({ file: `${prefix}/${f}`, score, excerpt: bestLine.slice(0, 120) });
        }
      } catch { /* skip */ }
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.score - a.score);

  if (results.length === 0) {
    return `No wiki pages match "${question}".`;
  }

  const output: string[] = [`## Wiki Search Results for "${question}"\n`];
  for (const r of results.slice(0, 10)) {
    output.push(`**${r.file}** (relevance: ${r.score})`);
    output.push(`> ${r.excerpt}`);
    output.push("");
  }

  // Include full content of top 3 results
  output.push("---\n### Top Results (Full Content)\n");
  for (const r of results.slice(0, 3)) {
    const [prefix, filename] = r.file.split("/");
    const dirMap: Record<string, string> = {
      tickers: TICKERS_DIR,
      patterns: PATTERNS_DIR,
      analysis: ANALYSIS_DIR,
      macro: MACRO_DIR,
    };
    const fullPath = path.join(dirMap[prefix] || PAGES_DIR, filename);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      output.push(`### ${r.file}\n`);
      output.push(content);
      output.push("");
    } catch { /* skip */ }
  }

  return output.join("\n");
}

/**
 * Get the last N lines from the event log.
 */
export async function getWikiLog(lines: number = 50): Promise<string> {
  try {
    const content = fs.readFileSync(LOG_PATH, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return "# Wiki Log\n\n_No log entries yet._";
  }
}
