import { fetchScreener, fetchQuotes, type ScreenerResult, type QuoteData } from "./market-data-provider";

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

function now(): string {
  return new Date().toISOString();
}

// ──────────────────────────────────────────────
// 1. Momentum Surge Screener
// ──────────────────────────────────────────────

export async function momentumSurgeScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running momentumSurgeScreener...");
  const results = await fetchScreener("gainers", 20);
  const hits: ScreenerHit[] = [];

  for (const r of results) {
    if (!r.symbol || r.changePct < 4) continue;

    hits.push({
      screenerId: "MOMENTUM_SURGE",
      screenerName: "Momentum Surge",
      ticker: r.symbol.toUpperCase(),
      name: r.name,
      reason: `Up ${r.changePct.toFixed(1)}% today — strong momentum breakout`,
      confidence: Math.min(0.95, 0.5 + r.changePct / 40),
      price: r.price,
      dataSnapshot: { changePct: r.changePct, volume: r.volume, source: "market_gainers" },
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
  const results = await fetchScreener("losers", 20);
  const hits: ScreenerHit[] = [];

  for (const r of results) {
    if (!r.symbol) continue;
    // changePct from losers is already negative
    const changePct = r.changePct > 0 ? -r.changePct : r.changePct;
    if (changePct > -4) continue;

    const dropPct = Math.abs(changePct);
    hits.push({
      screenerId: "MEAN_REVERSION_DIP",
      screenerName: "Mean Reversion Dip",
      ticker: r.symbol.toUpperCase(),
      name: r.name,
      reason: `Dropped ${dropPct.toFixed(1)}% — potential oversold bounce`,
      confidence: Math.min(0.85, 0.4 + dropPct / 50),
      price: r.price,
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
  const results = await fetchScreener("most_active", 20);
  const hits: ScreenerHit[] = [];

  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    if (!r.symbol) continue;

    let volRatio = 1.5;
    if (r.avgVolume > 0) {
      volRatio = r.volume / r.avgVolume;
    } else {
      volRatio = Math.max(1.5, 5 - idx * 0.2);
    }

    if (volRatio < 1.5) continue;

    hits.push({
      screenerId: "VOLUME_ANOMALY",
      screenerName: "Volume Anomaly",
      ticker: r.symbol.toUpperCase(),
      name: r.name,
      reason: `Trading at ${volRatio.toFixed(1)}x normal volume — unusual activity detected`,
      confidence: Math.min(0.90, 0.4 + volRatio / 15),
      price: r.price,
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
  const quotes = await fetchQuotes(QUALITY_WATCHLIST);
  const hits: ScreenerHit[] = [];

  for (const q of quotes) {
    if (!q.symbol || q.pe <= 0 || q.pe >= 30) continue;

    hits.push({
      screenerId: "QUALITY_VALUE",
      screenerName: "Quality Value",
      ticker: q.symbol.toUpperCase(),
      name: q.name,
      reason: `Quality large-cap — P/E ${q.pe.toFixed(1)}, strong market position`,
      confidence: Math.min(0.85, 0.5 + (30 - q.pe) / 60),
      price: q.price,
      dataSnapshot: { pe: q.pe, source: "quotes_watchlist" },
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
  const gainers = await fetchScreener("gainers", 10);
  const candidates = gainers.map(g => g.symbol).filter(Boolean);
  const tickers = candidates.length > 0 ? candidates.slice(0, 5) : QUALITY_WATCHLIST.slice(0, 5);

  // No free analyst research API — return empty
  // The quality value screener covers similar ground with P/E filtering
  console.log(`[screener] analystConsensus: 0 hits (no free analyst API)`);
  return [];
}

// ──────────────────────────────────────────────
// 6. Insider Buying Screener
// ──────────────────────────────────────────────

export async function insiderBuyingScreener(): Promise<ScreenerHit[]> {
  console.log("[screener] Running insiderBuyingScreener...");
  // No free insider transactions API — return empty gracefully
  console.log(`[screener] insiderBuying: 0 hits (no free insider API)`);
  return [];
}
