/**
 * Centralized Yahoo Finance data provider.
 * Replaces ALL external-tool CLI calls with free, no-API-key Yahoo Finance endpoints.
 * Uses curl for HTTP requests (Yahoo blocks Node.js fetch via TLS fingerprinting).
 *
 * Working endpoints (as of 2026-04):
 *   - query2.finance.yahoo.com/v8/finance/chart/{symbol}  (quotes + OHLCV)
 *   - query2.finance.yahoo.com/v1/finance/screener/predefined/saved  (gainers/losers/active)
 */

import { execSync } from "child_process";

// ── Cache ──────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number; }
const quoteCache = new Map<string, CacheEntry<QuoteData[]>>();
const ohlcvCache = new Map<string, CacheEntry<OHLCVData[]>>();
const screenerCache = new Map<string, CacheEntry<ScreenerResult[]>>();
const fundamentalsCache = new Map<string, CacheEntry<any>>();

const QUOTE_TTL = 30_000;       // 30 seconds
const OHLCV_TTL = 300_000;      // 5 minutes
const SCREENER_TTL = 60_000;    // 1 minute
const FUNDAMENTALS_TTL = 300_000; // 5 minutes

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ── Types ──────────────────────────────────────────────
export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  pe: number;
  yearLow: number;
  yearHigh: number;
  name: string;
}

export interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ScreenerResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
}

// ── Yahoo Finance fetch via curl ───────────────────────
// Yahoo Finance blocks Node.js fetch (TLS fingerprinting), but curl works fine.
function yahooFetch(url: string): any {
  try {
    const safeUrl = url.replace(/'/g, "%27");
    const result = execSync(
      `curl -s '${safeUrl}' -H 'User-Agent: Mozilla/5.0'`,
      { timeout: 15000, encoding: "utf-8" },
    );
    return JSON.parse(result);
  } catch (e: any) {
    console.error(`[yahoo] Fetch error for ${url.slice(0, 80)}: ${e.message?.slice(0, 100)}`);
    return null;
  }
}

// ── Core: fetchQuotes (via chart endpoint) ─────────────
// The v7 quote endpoint requires crumb auth, so we use the chart endpoint
// which returns rich metadata including regularMarketPrice, 52wk range, etc.
export async function fetchQuotes(symbols: string[]): Promise<QuoteData[]> {
  if (symbols.length === 0) return [];

  const cacheKey = [...symbols].sort().join(",");
  const cached = getCached(quoteCache, cacheKey);
  if (cached) return cached;

  const allQuotes: QuoteData[] = [];

  for (const sym of symbols) {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`;
    const data = yahooFetch(url);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) continue;

    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
    const price = meta.regularMarketPrice ?? 0;
    const change = prevClose > 0 ? price - prevClose : 0;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    allQuotes.push({
      symbol: meta.symbol || sym,
      price,
      change,
      changePct,
      volume: meta.regularMarketVolume ?? 0,
      avgVolume: 0, // chart meta doesn't include avg volume
      marketCap: 0, // not in chart meta
      pe: 0,        // not in chart meta
      yearLow: meta.fiftyTwoWeekLow ?? 0,
      yearHigh: meta.fiftyTwoWeekHigh ?? 0,
      name: meta.shortName || meta.longName || meta.symbol || sym,
    });
  }

  setCache(quoteCache, cacheKey, allQuotes, QUOTE_TTL);
  return allQuotes;
}

// ── OHLCV History ──────────────────────────────────────
export async function fetchOHLCV(
  symbol: string,
  range: string = "3mo",
  interval: string = "1d",
): Promise<OHLCVData[]> {
  const cacheKey = `${symbol}:${range}:${interval}`;
  const cached = getCached(ohlcvCache, cacheKey);
  if (cached) return cached;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const data = yahooFetch(url);

  if (!data?.chart?.result?.[0]) return [];

  const result = data.chart.result[0];
  const timestamps: number[] = result.timestamp || [];
  const ohlcv = result.indicators?.quote?.[0] || {};

  const bars: OHLCVData[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = ohlcv.close?.[i];
    if (close == null) continue;
    bars.push({
      date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
      open: ohlcv.open?.[i] ?? close,
      high: ohlcv.high?.[i] ?? close,
      low: ohlcv.low?.[i] ?? close,
      close,
      volume: ohlcv.volume?.[i] ?? 0,
    });
  }

  setCache(ohlcvCache, cacheKey, bars, OHLCV_TTL);
  return bars;
}

// ── Screener: gainers / losers / most_active ───────────
export async function fetchScreener(
  type: "gainers" | "losers" | "most_active",
  count: number = 25,
): Promise<ScreenerResult[]> {
  const cached = getCached(screenerCache, type);
  if (cached) return cached.slice(0, count);

  const scrIdMap: Record<string, string> = {
    gainers: "day_gainers",
    losers: "day_losers",
    most_active: "most_actives",
  };

  const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrIdMap[type]}&count=${count}`;
  const data = yahooFetch(url);

  const quotes = data?.finance?.result?.[0]?.quotes;
  if (!Array.isArray(quotes)) return [];

  const results: ScreenerResult[] = quotes.map((q: any) => ({
    symbol: q.symbol || "",
    name: q.shortName || q.longName || q.symbol || "",
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePct: q.regularMarketChangePercent ?? 0,
    volume: q.regularMarketVolume ?? 0,
    avgVolume: q.averageDailyVolume3Month ?? 0,
    marketCap: q.marketCap ?? 0,
  }));

  setCache(screenerCache, type, results, SCREENER_TTL);
  return results.slice(0, count);
}

// ── Company Fundamentals / Ratios ──────────────────────
// quoteSummary requires crumb auth, so we return sensible defaults.
// These are the same fallback values the original code used.
export interface CompanyRatios {
  grossMargin: number;
  roe: number;
  fcfMargin: number;
  debtToEquity: number;
  currentRatio: number;
  evEbitda: number;
}

export async function fetchCompanyRatios(symbol: string): Promise<CompanyRatios> {
  const defaults: CompanyRatios = {
    grossMargin: 0.5, roe: 0.15, fcfMargin: 0.1,
    debtToEquity: 0.5, currentRatio: 1.5, evEbitda: 20,
  };

  const cached = getCached(fundamentalsCache, `ratios:${symbol}`);
  if (cached) return cached;

  setCache(fundamentalsCache, `ratios:${symbol}`, defaults, FUNDAMENTALS_TTL);
  return defaults;
}

// ── Macro Snapshot helper ──────────────────────────────
export interface MacroQuotes {
  vix: { price: number; change: number; changePct: number };
  sp500: { price: number; change: number; changePct: number };
  nasdaq: { price: number; change: number; changePct: number };
  dxy: { price: number; change: number; changePct: number };
  eurusd: { price: number; change: number; changePct: number };
  usdjpy: { price: number; change: number; changePct: number };
  gold: { price: number; change: number; changePct: number };
  oil: { price: number; change: number; changePct: number };
  yield10y: { price: number; change: number; changePct: number };
}

export async function fetchMacroQuotes(): Promise<MacroQuotes> {
  const symbols = ["^VIX", "^GSPC", "^IXIC", "DX-Y.NYB", "EURUSD=X", "USDJPY=X", "GC=F", "CL=F", "^TNX"];
  const quotes = await fetchQuotes(symbols);

  const find = (...syms: string[]) => {
    for (const s of syms) {
      const q = quotes.find(q => q.symbol.toUpperCase() === s.toUpperCase());
      if (q) return { price: q.price, change: q.change, changePct: q.changePct };
    }
    return { price: 0, change: 0, changePct: 0 };
  };

  return {
    vix: find("^VIX"),
    sp500: find("^GSPC"),
    nasdaq: find("^IXIC"),
    dxy: find("DX-Y.NYB"),
    eurusd: find("EURUSD=X"),
    usdjpy: find("USDJPY=X"),
    gold: find("GC=F"),
    oil: find("CL=F"),
    yield10y: find("^TNX"),
  };
}

// ── Sentiment derived from VIX ─────────────────────────
export function deriveSentiment(vixPrice: number, sp500ChangePct: number): string {
  if (vixPrice > 30) return "bearish";
  if (vixPrice < 18 && sp500ChangePct > 0.3) return "bullish";
  if (sp500ChangePct > 1.0) return "bullish";
  if (sp500ChangePct < -1.0) return "bearish";
  return "neutral";
}
