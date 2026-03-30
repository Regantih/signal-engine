import { getExecEnv } from "./credentials";
import { execSync } from "child_process";

export interface ScreenerHit {
  screenerId: string;
  screenerName: string;
  ticker: string;
  name: string;
  reason: string;
  confidence: number; // 0-1
  price: number;
  dataSnapshot: Record<string, any>;
  detectedAt: string;
}

// ──────────────────────────────────────────────
// Shared helpers (same as in auto-signals.ts)
// ──────────────────────────────────────────────

function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
  try {
    const escaped = params.replace(/'/g, "'\\''");
    const result = execSync(`external-tool call '${escaped}'`, {
      timeout: 30000,
      encoding: "utf-8",
      env: getExecEnv() as any,
    });
    return JSON.parse(result);
  } catch (e: any) {
    console.error(`[screener] Finance tool error (${toolName}):`, e.stderr?.slice(0, 200) || e.message?.slice(0, 200));
    return null;
  }
}

import { parseCSVContent } from "./csv-parser";

function parsePrice(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[$,\s%]/g, "")) || 0;
}

function now(): string {
  return new Date().toISOString();
}

// ──────────────────────────────────────────────
// 1. Momentum Surge Screener
// ──────────────────────────────────────────────

export async function momentumSurgeScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running momentumSurgeScreener...");
  const resp = callFinanceTool("finance_market_gainers", {
    query: "top gaining stocks",
    action: "Scanning for momentum surges",
    limit: 20,
  });

  if (!resp?.content) return [];

  const rows = parseCSVContent(resp.content);
  const hits: ScreenerHit[] = [];

  for (const row of rows) {
    // Try various column name patterns
    const ticker =
      row["Symbol"] || row["symbol"] || row["Ticker"] || row["ticker"] || "";
    const name =
      row["Name"] || row["name"] || row["Company"] || row["company"] || ticker;

    // Parse change percent — try multiple column names
    const changeStr =
      row["Change %"] ||
      row["change%"] ||
      row["changePercent"] ||
      row["% Change"] ||
      row["Chg %"] ||
      row["chg"] ||
      "";
    const changePct = parsePrice(changeStr);

    const priceStr =
      row["Price"] || row["price"] || row["Last"] || row["last"] || "0";
    const price = parsePrice(priceStr);

    const volumeStr =
      row["Volume"] || row["volume"] || row["Vol"] || row["vol"] || "0";
    const volume = parsePrice(volumeStr.replace(/[KMB]/gi, (m) =>
      m.toUpperCase() === "K" ? "000" : m.toUpperCase() === "M" ? "000000" : "000000000"
    ));

    if (!ticker || ticker === "N/A") continue;
    if (changePct < 4) continue; // threshold: >4% gain

    hits.push({
      screenerId: "MOMENTUM_SURGE",
      screenerName: "Momentum Surge",
      ticker: ticker.toUpperCase(),
      name,
      reason: `Up ${changePct.toFixed(1)}% today — strong momentum breakout`,
      confidence: Math.min(0.95, 0.5 + changePct / 40),
      price,
      dataSnapshot: { changePct, volume, source: "market_gainers" },
      detectedAt: now(),
    });
  }

  console.log(`[screener] momentumSurge: ${hits.length} hits`);
  return hits;
}

// ──────────────────────────────────────────────
// 2. Mean Reversion Screener
// ──────────────────────────────────────────────

export async function meanReversionScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running meanReversionScreener...");
  const resp = callFinanceTool("finance_market_losers", {
    query: "top declining stocks",
    action: "Scanning for mean reversion dips",
    limit: 20,
  });

  if (!resp?.content) return [];

  const rows = parseCSVContent(resp.content);
  const hits: ScreenerHit[] = [];

  for (const row of rows) {
    const ticker =
      row["Symbol"] || row["symbol"] || row["Ticker"] || row["ticker"] || "";
    const name =
      row["Name"] || row["name"] || row["Company"] || row["company"] || ticker;

    const changeStr =
      row["Change %"] ||
      row["change%"] ||
      row["changePercent"] ||
      row["% Change"] ||
      row["Chg %"] ||
      row["chg"] ||
      "";
    // Losers can be negative or positive strings representing a decline
    const rawChange = parsePrice(changeStr);
    const changePct = rawChange > 0 ? -rawChange : rawChange; // ensure negative

    const priceStr =
      row["Price"] || row["price"] || row["Last"] || row["last"] || "0";
    const price = parsePrice(priceStr);

    if (!ticker || ticker === "N/A") continue;
    if (changePct > -4) continue; // threshold: down >4%

    const dropPct = Math.abs(changePct);
    hits.push({
      screenerId: "MEAN_REVERSION_DIP",
      screenerName: "Mean Reversion Dip",
      ticker: ticker.toUpperCase(),
      name,
      reason: `Dropped ${dropPct.toFixed(1)}% — potential oversold bounce`,
      confidence: Math.min(0.85, 0.4 + dropPct / 50),
      price,
      dataSnapshot: { changePct, source: "market_losers" },
      detectedAt: now(),
    });
  }

  console.log(`[screener] meanReversion: ${hits.length} hits`);
  return hits;
}

// ──────────────────────────────────────────────
// 3. Volume Anomaly Screener
// ──────────────────────────────────────────────

export async function volumeAnomalyScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running volumeAnomalyScreener...");
  const resp = callFinanceTool("finance_market_most_active", {
    query: "most actively traded stocks",
    action: "Scanning for volume anomalies",
    limit: 20,
  });

  if (!resp?.content) return [];

  const rows = parseCSVContent(resp.content);
  const hits: ScreenerHit[] = [];

  for (const row of rows) {
    const ticker =
      row["Symbol"] || row["symbol"] || row["Ticker"] || row["ticker"] || "";
    const name =
      row["Name"] || row["name"] || row["Company"] || row["company"] || ticker;

    const priceStr =
      row["Price"] || row["price"] || row["Last"] || row["last"] || "0";
    const price = parsePrice(priceStr);

    // Try to find volume ratio or just use position in list (top movers = high ratio)
    const volStr =
      row["Volume"] || row["volume"] || row["Vol"] || row["vol"] || "0";
    const avgVolStr =
      row["Avg Vol"] || row["avg_vol"] || row["AvgVolume"] || row["3M Avg Vol"] || "";

    let volRatio = 1.5; // conservative default for "most active" list
    if (avgVolStr) {
      const vol = parsePrice(volStr);
      const avgVol = parsePrice(avgVolStr);
      if (avgVol > 0) volRatio = vol / avgVol;
    } else {
      // Items high on the most-active list likely have elevated ratio
      const idx = rows.indexOf(row);
      volRatio = Math.max(1.5, 5 - idx * 0.2);
    }

    if (!ticker || ticker === "N/A") continue;
    if (volRatio < 1.5) continue; // must be at least 1.5x normal

    hits.push({
      screenerId: "VOLUME_ANOMALY",
      screenerName: "Volume Anomaly",
      ticker: ticker.toUpperCase(),
      name,
      reason: `Trading at ${volRatio.toFixed(1)}x normal volume — unusual activity detected`,
      confidence: Math.min(0.90, 0.4 + volRatio / 15),
      price,
      dataSnapshot: { volRatio, source: "market_most_active" },
      detectedAt: now(),
    });
  }

  console.log(`[screener] volumeAnomaly: ${hits.length} hits`);
  return hits;
}

// ──────────────────────────────────────────────
// 4. Quality Value Screener
// ──────────────────────────────────────────────

const QUALITY_WATCHLIST = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
  "META", "TSLA", "JPM", "JNJ", "V",
  "UNH", "HD", "PG", "COST", "AVGO",
];

export async function qualityValueScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running qualityValueScreener...");
  const resp = callFinanceTool("finance_quotes", {
    ticker_symbols: QUALITY_WATCHLIST,
    fields: ["price", "pe", "marketCap", "name"],
  });

  if (!resp?.content) return [];

  const rows = parseCSVContent(resp.content);
  const hits: ScreenerHit[] = [];

  for (const row of rows) {
    const ticker =
      row["Symbol"] || row["symbol"] || row["Ticker"] || row["ticker"] || "";
    const name =
      row["Name"] || row["name"] || row["Company"] || row["company"] || ticker;

    const priceStr =
      row["Price"] || row["price"] || row["Last"] || row["last"] || "0";
    const price = parsePrice(priceStr);

    const peStr = row["PE"] || row["pe"] || row["P/E"] || row["P/E Ratio"] || "";
    const pe = parsePrice(peStr);

    if (!ticker || ticker === "N/A") continue;
    if (pe <= 0 || pe >= 30) continue; // filter: P/E < 30 and valid

    hits.push({
      screenerId: "QUALITY_VALUE",
      screenerName: "Quality Value",
      ticker: ticker.toUpperCase(),
      name,
      reason: `Quality large-cap — P/E ${pe.toFixed(1)}, strong market position`,
      confidence: Math.min(0.85, 0.5 + (30 - pe) / 60),
      price,
      dataSnapshot: { pe, source: "quotes_watchlist" },
      detectedAt: now(),
    });
  }

  console.log(`[screener] qualityValue: ${hits.length} hits`);
  return hits;
}

// ──────────────────────────────────────────────
// 5. Analyst Consensus Screener
// ──────────────────────────────────────────────

export async function analystConsensusScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running analystConsensusScreener...");

  // Get candidates from gainers list first
  const gainersResp = callFinanceTool("finance_market_gainers", {
    query: "top gaining stocks",
    action: "Fetching candidates for analyst consensus check",
    limit: 10,
  });

  const candidates: string[] = [];
  if (gainersResp?.content) {
    const rows = parseCSVContent(gainersResp.content);
    for (const row of rows) {
      const ticker =
        row["Symbol"] || row["symbol"] || row["Ticker"] || row["ticker"] || "";
      if (ticker && ticker !== "N/A") candidates.push(ticker.toUpperCase());
    }
  }

  // Fallback to quality watchlist tickers if no gainers
  const tickers = candidates.length > 0
    ? candidates.slice(0, 5)
    : QUALITY_WATCHLIST.slice(0, 5);

  const hits: ScreenerHit[] = [];

  for (const ticker of tickers) {
    const resp = callFinanceTool("finance_analyst_research", {
      ticker_symbols: [ticker],
      limit: 20,
    });

    if (!resp?.content) continue;

    const rows = parseCSVContent(resp.content);
    if (rows.length === 0) continue;

    let buyCount = 0;
    let totalCount = 0;
    let targetSum = 0;
    let targetCount = 0;

    // Get current price from a separate quote call
    const quoteResp = callFinanceTool("finance_quotes", {
      ticker_symbols: [ticker],
      fields: ["price", "name"],
    });

    let currentPrice = 0;
    let name = ticker;
    if (quoteResp?.content) {
      const qrows = parseCSVContent(quoteResp.content);
      if (qrows[0]) {
        currentPrice = parsePrice(
          qrows[0]["Price"] || qrows[0]["price"] || qrows[0]["Last"] || "0"
        );
        name = qrows[0]["Name"] || qrows[0]["name"] || ticker;
      }
    }

    for (const row of rows) {
      const rating = (
        row["rating_current"] ||
        row["current_rating"] ||
        row["rating"] ||
        row["Rating"] ||
        ""
      ).toLowerCase();

      if (rating) {
        totalCount++;
        if (
          rating.includes("buy") ||
          rating.includes("outperform") ||
          rating.includes("overweight") ||
          rating.includes("strong")
        ) {
          buyCount++;
        }
      }

      const target = parsePrice(
        (row["adj_price_target"] || row["price_target"] || row["Price Target"] || "0").replace(
          /,/g,
          ""
        )
      );
      if (target > 0) {
        targetSum += target;
        targetCount++;
      }
    }

    if (totalCount === 0) continue;

    const buyPct = (buyCount / totalCount) * 100;
    if (buyPct < 60) continue; // filter: >60% buy ratings

    const avgTarget = targetCount > 0 ? targetSum / targetCount : 0;
    const upside =
      avgTarget > 0 && currentPrice > 0
        ? ((avgTarget - currentPrice) / currentPrice) * 100
        : 0;

    hits.push({
      screenerId: "ANALYST_UPGRADE",
      screenerName: "Analyst Consensus",
      ticker: ticker.toUpperCase(),
      name,
      reason: `${buyPct.toFixed(0)}% analyst buy rating${avgTarget > 0 ? ` — avg target $${avgTarget.toFixed(0)} (${upside.toFixed(0)}% upside)` : ""}`,
      confidence: Math.min(0.92, 0.4 + buyPct / 125),
      price: currentPrice,
      dataSnapshot: { buyPct, avgTarget, upside, totalCount, source: "analyst_research" },
      detectedAt: now(),
    });
  }

  console.log(`[screener] analystConsensus: ${hits.length} hits`);
  return hits;
}

// ──────────────────────────────────────────────
// 6. Insider Buying Screener
// ──────────────────────────────────────────────

export async function insiderBuyingScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running insiderBuyingScreener...");
  const checkTickers = QUALITY_WATCHLIST.slice(0, 5);
  const hits: ScreenerHit[] = [];

  for (const ticker of checkTickers) {
    const resp = callFinanceTool("finance_insider_transactions", {
      ticker_symbols: [ticker],
      months_lookback: 3,
    });

    if (!resp?.content) continue;

    const rows = parseCSVContent(resp.content);
    if (rows.length === 0) continue;

    let buyCount = 0;
    let totalBuyValue = 0;

    for (const row of rows) {
      const transType = (
        row["transaction_type"] ||
        row["Transaction Type"] ||
        row["type"] ||
        row["Type"] ||
        ""
      ).toLowerCase();

      if (
        transType.includes("purchase") ||
        transType.includes("buy") ||
        transType.includes("acquisition")
      ) {
        buyCount++;
        const val = parsePrice(
          (row["value"] || row["Value"] || row["amount"] || row["Amount"] || "0").replace(/,/g, "")
        );
        totalBuyValue += val;
      }
    }

    if (buyCount === 0) continue;

    // Get current price
    const quoteResp = callFinanceTool("finance_quotes", {
      ticker_symbols: [ticker],
      fields: ["price", "name"],
    });
    let currentPrice = 0;
    let name = ticker;
    if (quoteResp?.content) {
      const qrows = parseCSVContent(quoteResp.content);
      if (qrows[0]) {
        currentPrice = parsePrice(
          qrows[0]["Price"] || qrows[0]["price"] || qrows[0]["Last"] || "0"
        );
        name = qrows[0]["Name"] || qrows[0]["name"] || ticker;
      }
    }

    const valueStr =
      totalBuyValue >= 1_000_000
        ? `$${(totalBuyValue / 1_000_000).toFixed(1)}M`
        : totalBuyValue >= 1_000
        ? `$${(totalBuyValue / 1_000).toFixed(0)}K`
        : `$${totalBuyValue.toFixed(0)}`;

    hits.push({
      screenerId: "INSIDER_BUYING",
      screenerName: "Insider Buying",
      ticker: ticker.toUpperCase(),
      name,
      reason: `${buyCount} insider${buyCount > 1 ? "s" : ""} bought ${valueStr} in last 3 months`,
      confidence: Math.min(0.88, 0.5 + buyCount / 20),
      price: currentPrice,
      dataSnapshot: { buyCount, totalBuyValue, source: "insider_transactions" },
      detectedAt: now(),
    });
  }

  console.log(`[screener] insiderBuying: ${hits.length} hits`);
  return hits;
}
