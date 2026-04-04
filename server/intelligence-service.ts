import { fetchQuotes, deriveSentiment } from "./market-data-provider";

// --- CRYPTO ---
export interface CryptoSnapshot {
  btc: { price: number; change: number };
  eth: { price: number; change: number };
  sol: { price: number; change: number };
  sentiment: string;
}

export async function fetchCrypto(): Promise<CryptoSnapshot> {
  const defaults: CryptoSnapshot = { btc: { price: 0, change: 0 }, eth: { price: 0, change: 0 }, sol: { price: 0, change: 0 }, sentiment: "neutral" };

  const quotes = await fetchQuotes(["BTC-USD", "ETH-USD", "SOL-USD"]);
  for (const q of quotes) {
    const sym = q.symbol.toUpperCase();
    if (sym.includes("BTC")) defaults.btc = { price: q.price, change: q.changePct };
    else if (sym.includes("ETH")) defaults.eth = { price: q.price, change: q.changePct };
    else if (sym.includes("SOL")) defaults.sol = { price: q.price, change: q.changePct };
  }

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

export async function fetchCommodities(): Promise<CommoditiesSnapshot> {
  const defaults: CommoditiesSnapshot = {
    gold: { price: 0, change: 0 }, oil: { price: 0, change: 0 },
    silver: { price: 0, change: 0 }, naturalGas: { price: 0, change: 0 },
  };

  const quotes = await fetchQuotes(["GC=F", "CL=F", "SI=F", "NG=F"]);
  for (const q of quotes) {
    const sym = q.symbol.toUpperCase();
    if (sym.includes("GC")) defaults.gold = { price: q.price, change: q.changePct };
    else if (sym === "CL=F") defaults.oil = { price: q.price, change: q.changePct };
    else if (sym.includes("SI")) defaults.silver = { price: q.price, change: q.changePct };
    else if (sym.includes("NG")) defaults.naturalGas = { price: q.price, change: q.changePct };
  }
  return defaults;
}

// --- CONGRESSIONAL TRADES ---
export interface CongressionalTrade {
  politician: string;
  ticker: string;
  type: string;
  amount: string;
  date: string;
}

export function fetchCongressionalTrades(): CongressionalTrade[] {
  // No free API available — return empty gracefully
  return [];
}

// --- POLYMARKET PREDICTIONS ---
export interface PolymarketEvent {
  title: string;
  probability: number;
  volume: string;
  category: string;
  url: string;
}

export function fetchPolymarket(): PolymarketEvent[] {
  // No free API available — return empty gracefully
  return [];
}

// --- MARKET SENTIMENT (detailed) ---
export interface SentimentSnapshot {
  overall: string;
  details: string;
}

export async function fetchDetailedSentiment(): Promise<SentimentSnapshot> {
  // Derive sentiment from VIX and S&P 500 price action
  const quotes = await fetchQuotes(["^VIX", "^GSPC"]);
  const vix = quotes.find(q => q.symbol === "^VIX");
  const sp500 = quotes.find(q => q.symbol === "^GSPC");

  const vixPrice = vix?.price ?? 20;
  const sp500Pct = sp500?.changePct ?? 0;
  const overall = deriveSentiment(vixPrice, sp500Pct);

  let details = `VIX at ${vixPrice.toFixed(1)}, S&P 500 ${sp500Pct >= 0 ? "+" : ""}${sp500Pct.toFixed(2)}%.`;
  if (overall === "bullish") details += " Markets showing optimism.";
  else if (overall === "bearish") details += " Markets under pressure.";
  else details += " Markets trading in a neutral range.";

  return { overall, details };
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

export async function fetchFullIntelligence(): Promise<IntelligenceSnapshot> {
  console.log("[intelligence] Fetching full market intelligence...");

  let crypto: CryptoSnapshot = { btc: { price: 0, change: 0 }, eth: { price: 0, change: 0 }, sol: { price: 0, change: 0 }, sentiment: "neutral" };
  let commodities: CommoditiesSnapshot = { gold: { price: 0, change: 0 }, oil: { price: 0, change: 0 }, silver: { price: 0, change: 0 }, naturalGas: { price: 0, change: 0 } };
  let congressionalTrades: CongressionalTrade[] = [];
  let polymarket: PolymarketEvent[] = [];
  let sentiment: SentimentSnapshot = { overall: "neutral", details: "" };

  try { crypto = await fetchCrypto(); } catch (e: any) { console.error("Crypto fetch failed:", e.message); }
  try { commodities = await fetchCommodities(); } catch (e: any) { console.error("Commodities fetch failed:", e.message); }
  try { congressionalTrades = fetchCongressionalTrades(); } catch (e: any) { console.error("Congressional trades failed:", e.message); }
  try { polymarket = fetchPolymarket(); } catch (e: any) { console.error("Polymarket fetch failed:", e.message); }
  try { sentiment = await fetchDetailedSentiment(); } catch (e: any) { console.error("Sentiment fetch failed:", e.message); }

  console.log(`[intelligence] Done: crypto=${crypto.btc.price > 0}, commodities=${commodities.gold.price > 0}, congress=${congressionalTrades.length}, polymarket=${polymarket.length}`);

  return { crypto, commodities, congressionalTrades, polymarket, sentiment, fetchedAt: new Date().toISOString() };
}
