import { getExecEnv } from "./credentials";
import { execSync } from "child_process";

function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
  try {
    const escaped = params.replace(/'/g, "'\\''");
    const result = execSync(`external-tool call '${escaped}'`, { timeout: 30000, encoding: "utf-8", env: getExecEnv() as any });
    return JSON.parse(result);
  } catch (e: any) {
    console.error(`Intelligence tool error (${toolName}):`, e.message?.slice(0, 200));
    return null;
  }
}

import { parseCSVContent } from "./csv-parser";

// --- CRYPTO ---
export interface CryptoSnapshot {
  btc: { price: number; change: number };
  eth: { price: number; change: number };
  sol: { price: number; change: number };
  sentiment: string;
}

export function fetchCrypto(): CryptoSnapshot {
  const resp = callFinanceTool("finance_quotes", {
    ticker_symbols: ["BTCUSD", "ETHUSD", "SOLUSD"],
    fields: ["price", "change", "changesPercentage"],
  });

  const defaults = { btc: { price: 0, change: 0 }, eth: { price: 0, change: 0 }, sol: { price: 0, change: 0 }, sentiment: "neutral" };
  if (!resp?.content) return defaults;

  const rows = parseCSVContent(resp.content);
  for (const row of rows) {
    const sym = (row.symbol || "").toUpperCase();
    const price = parseFloat(row.price?.replace(/,/g, "") || "0");
    const change = parseFloat(row.changesPercentage || row.change || "0");
    if (sym.includes("BTC")) defaults.btc = { price, change };
    else if (sym.includes("ETH")) defaults.eth = { price, change };
    else if (sym.includes("SOL")) defaults.sol = { price, change };
  }

  // Simple crypto sentiment from price action
  const avgChange = (defaults.btc.change + defaults.eth.change + defaults.sol.change) / 3;
  defaults.sentiment = avgChange > 3 ? "bullish" : avgChange < -3 ? "bearish" : "neutral";

  return defaults;
}

// --- COMMODITIES ---
export interface CommoditiesSnapshot {
  gold: { price: number; change: number };
  oil: { price: number; change: number };
  silver: { price: number; change: number };
  naturalGas: { price: number; change: number };
}

export function fetchCommodities(): CommoditiesSnapshot {
  const resp = callFinanceTool("finance_quotes", {
    ticker_symbols: ["GC=F", "CL=F", "SI=F", "NG=F"],
    fields: ["price", "change", "changesPercentage"],
  });

  const defaults: CommoditiesSnapshot = {
    gold: { price: 0, change: 0 }, oil: { price: 0, change: 0 },
    silver: { price: 0, change: 0 }, naturalGas: { price: 0, change: 0 },
  };
  if (!resp?.content) return defaults;

  const rows = parseCSVContent(resp.content);
  for (const row of rows) {
    const sym = (row.symbol || "").toUpperCase();
    const price = parseFloat(row.price?.replace(/,/g, "") || "0");
    const change = parseFloat(row.changesPercentage || "0");
    if (sym.includes("GC")) defaults.gold = { price, change };
    else if (sym.includes("CL")) defaults.oil = { price, change };
    else if (sym.includes("SI")) defaults.silver = { price, change };
    else if (sym.includes("NG")) defaults.naturalGas = { price, change };
  }
  return defaults;
}

// --- CONGRESSIONAL TRADES ---
export interface CongressionalTrade {
  politician: string;
  ticker: string;
  type: string; // "buy" or "sell"
  amount: string;
  date: string;
}

export function fetchCongressionalTrades(): CongressionalTrade[] {
  const resp = callFinanceTool("finance_politician_trades", {
    limit: 15,
  });

  if (!resp?.content) return [];

  const rows = parseCSVContent(resp.content);
  return rows.slice(0, 15).map(row => ({
    politician: row.representative || row.politician || row.name || "Unknown",
    ticker: row.ticker || row.symbol || "N/A",
    type: (row.type || row.transaction_type || row.trade_type || "").toLowerCase().includes("sale") ? "sell" : "buy",
    amount: row.amount || row.est_amount || row.range || "N/A",
    date: row.transaction_date || row.date || row.disclosure_date || "N/A",
  }));
}

// --- POLYMARKET PREDICTIONS ---
export interface PolymarketEvent {
  title: string;
  probability: number; // 0-100 for "yes"
  volume: string;
  category: string;
  url: string;
}

export function fetchPolymarket(): PolymarketEvent[] {
  try {
    const result = execSync(
      `curl -s "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=20&order=volume24hr&ascending=false"`,
      { timeout: 15000, encoding: "utf-8" }
    );
    const events = JSON.parse(result);
    if (!Array.isArray(events)) return [];

    return events.slice(0, 15).map((event: any) => {
      // Get the primary market's probability
      const market = event.markets?.[0];
      const outcomePrices = market?.outcomePrices ? JSON.parse(market.outcomePrices) : [];
      const yesPrice = parseFloat(outcomePrices[0] || "0.5");

      return {
        title: event.title || "Unknown",
        probability: Math.round(yesPrice * 100),
        volume: market?.volume24hr ? `$${(parseFloat(market.volume24hr) / 1000).toFixed(0)}K` : "N/A",
        category: event.tags?.[0]?.label || event.category || "Other",
        url: `https://polymarket.com/event/${event.slug || ""}`,
      };
    }).filter((e: any) => e.title !== "Unknown");
  } catch (e: any) {
    console.error("Polymarket fetch error:", e.message?.slice(0, 200));
    return [];
  }
}

// --- MARKET SENTIMENT (detailed) ---
export interface SentimentSnapshot {
  overall: string; // "bullish" | "bearish" | "neutral"
  details: string;
}

export function fetchDetailedSentiment(): SentimentSnapshot {
  const resp = callFinanceTool("finance_market_sentiment", {
    market_type: "market",
    country: "US",
    query: "current overall US market sentiment",
    action: "Analyzing comprehensive market sentiment",
  });

  if (!resp?.content) return { overall: "neutral", details: "Unable to fetch sentiment data" };

  const content = resp.content.toLowerCase();
  let overall: string = "neutral";
  if (content.includes("bullish") || content.includes("positive") || content.includes("optimistic")) overall = "bullish";
  else if (content.includes("bearish") || content.includes("negative") || content.includes("pessimistic") || content.includes("fear")) overall = "bearish";

  return { overall, details: resp.content.slice(0, 500) };
}

// --- FULL INTELLIGENCE SNAPSHOT ---
export interface IntelligenceSnapshot {
  crypto: CryptoSnapshot;
  commodities: CommoditiesSnapshot;
  congressionalTrades: CongressionalTrade[];
  polymarket: PolymarketEvent[];
  sentiment: SentimentSnapshot;
  fetchedAt: string;
}

export function fetchFullIntelligence(): IntelligenceSnapshot {
  console.log("[intelligence] Fetching full market intelligence...");

  let crypto: CryptoSnapshot = { btc: { price: 0, change: 0 }, eth: { price: 0, change: 0 }, sol: { price: 0, change: 0 }, sentiment: "neutral" };
  let commodities: CommoditiesSnapshot = { gold: { price: 0, change: 0 }, oil: { price: 0, change: 0 }, silver: { price: 0, change: 0 }, naturalGas: { price: 0, change: 0 } };
  let congressionalTrades: CongressionalTrade[] = [];
  let polymarket: PolymarketEvent[] = [];
  let sentiment: SentimentSnapshot = { overall: "neutral", details: "" };

  try { crypto = fetchCrypto(); } catch (e: any) { console.error("Crypto fetch failed:", e.message); }
  try { commodities = fetchCommodities(); } catch (e: any) { console.error("Commodities fetch failed:", e.message); }
  try { congressionalTrades = fetchCongressionalTrades(); } catch (e: any) { console.error("Congressional trades failed:", e.message); }
  try { polymarket = fetchPolymarket(); } catch (e: any) { console.error("Polymarket fetch failed:", e.message); }
  try { sentiment = fetchDetailedSentiment(); } catch (e: any) { console.error("Sentiment fetch failed:", e.message); }

  console.log(`[intelligence] Done: crypto=${crypto.btc.price > 0}, commodities=${commodities.gold.price > 0}, congress=${congressionalTrades.length}, polymarket=${polymarket.length}`);

  return { crypto, commodities, congressionalTrades, polymarket, sentiment, fetchedAt: new Date().toISOString() };
}
