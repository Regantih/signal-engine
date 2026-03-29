import {
  ScreenerHit,
  momentumSurgeScreener,
  meanReversionScreener,
  volumeAnomalyScreener,
  qualityValueScreener,
  analystConsensusScreener,
  insiderBuyingScreener,
} from "./screeners";
import { storage } from "./storage";

export interface ScanResult {
  ticker: string;
  name: string;
  screeners: ScreenerHit[];
  screenerCount: number;
  isNew: boolean; // true if not already tracked
  autoScored: boolean;
  opportunity?: any;
}

export async function scanUniverse(): Promise<ScanResult[]> {
  console.log("[scanner] Starting universe scan...");

  // Run all screeners (some may fail, that's ok)
  const allHits: ScreenerHit[] = [];

  try {
    allHits.push(...await momentumSurgeScreener());
  } catch (e: any) {
    console.error("Momentum screener error:", e.message);
  }
  try {
    allHits.push(...await meanReversionScreener());
  } catch (e: any) {
    console.error("MeanRev screener error:", e.message);
  }
  try {
    allHits.push(...await volumeAnomalyScreener());
  } catch (e: any) {
    console.error("Volume screener error:", e.message);
  }
  try {
    allHits.push(...await qualityValueScreener());
  } catch (e: any) {
    console.error("Quality screener error:", e.message);
  }
  try {
    allHits.push(...await analystConsensusScreener());
  } catch (e: any) {
    console.error("Analyst screener error:", e.message);
  }
  try {
    allHits.push(...await insiderBuyingScreener());
  } catch (e: any) {
    console.error("Insider screener error:", e.message);
  }

  console.log(`[scanner] Total hits: ${allHits.length}`);

  // Group by ticker
  const byTicker = new Map<string, ScreenerHit[]>();
  for (const hit of allHits) {
    const t = hit.ticker.toUpperCase();
    if (!byTicker.has(t)) byTicker.set(t, []);
    byTicker.get(t)!.push(hit);
  }

  // Check existing opportunities
  const existingOpps = await storage.getOpportunities();
  const existingTickers = new Set(
    existingOpps.filter((o) => o.ticker).map((o) => o.ticker!.toUpperCase())
  );

  // Build results, sorted by number of screeners (convergence)
  const results: ScanResult[] = [];
  for (const [ticker, hits] of byTicker) {
    results.push({
      ticker,
      name: hits[0].name || ticker,
      screeners: hits,
      screenerCount: hits.length,
      isNew: !existingTickers.has(ticker),
      autoScored: false,
    });
  }

  results.sort((a, b) => b.screenerCount - a.screenerCount);

  console.log(`[scanner] Found ${results.length} unique tickers across screeners`);
  return results;
}

// Add a scanned ticker as an opportunity with screener attribution
export async function addScannedOpportunity(
  ticker: string,
  name: string,
  screeners: ScreenerHit[]
): Promise<any> {
  const now = new Date().toISOString();
  const price = screeners[0]?.price || 0;

  const screenerFlags = screeners.map((s) => ({
    id: s.screenerId,
    name: s.screenerName,
    reason: s.reason,
    confidence: s.confidence,
    detectedAt: s.detectedAt,
  }));

  // Create the opportunity
  const opp = await storage.createOpportunity({
    name,
    ticker: ticker.toUpperCase(),
    domain: "public_markets",
    description: `Auto-discovered by ${screeners.length} screener(s): ${screeners.map((s) => s.screenerName).join(", ")}`,
    momentum: 50,
    meanReversion: 50,
    quality: 50,
    flow: 50,
    risk: 50,
    crowding: 50,
    entryPrice: price,
    status: "watch",
    screenerFlags: JSON.stringify(screenerFlags),
    createdAt: now,
    updatedAt: now,
  });

  return opp;
}
