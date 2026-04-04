import { scanUniverse, addScannedOpportunity, setLastScanResults } from "./universe-scanner";
import { computeAutoSignals } from "./auto-signals";
import { scoreOpportunity, suggestAction, computePriceLevels } from "./scoring-engine";
import { storage } from "./storage";
import { DEFAULT_WEIGHTS } from "@shared/schema";
import { fetchOHLCV } from "./market-data-provider";
import { fetchBenzingaNews, rescoreZeroSentimentArticles } from "./benzinga-service";
import { executePaperTrade, getPaperPositions } from "./paper-trading";
import { isAlpacaConnected } from "./alpaca-service";

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 10 * 1000; // 10 seconds

async function autoScoreTicker(ticker: string): Promise<boolean> {
  try {
    const signals = await computeAutoSignals(ticker);
    if (!signals) {
      console.log(`[autopilot] Could not compute signals for ${ticker}, skipping`);
      return false;
    }

    const opps = await storage.getOpportunities();
    const opp = opps.find(o => o.ticker?.toUpperCase() === ticker.toUpperCase());
    if (!opp) return false;

    const now = new Date().toISOString();

    await storage.updateOpportunity(opp.id, {
      momentum: signals.momentum,
      meanReversion: signals.meanReversion,
      quality: signals.quality,
      flow: signals.flow,
      risk: signals.risk,
      crowding: signals.crowding,
      entryPrice: signals.metadata.price,
      updatedAt: now,
    });

    const weights = await storage.getWeights(opp.domain) || {
      momentum: DEFAULT_WEIGHTS.momentum,
      meanReversion: DEFAULT_WEIGHTS.mean_reversion,
      quality: DEFAULT_WEIGHTS.quality,
      flow: DEFAULT_WEIGHTS.flow,
      risk: DEFAULT_WEIGHTS.risk,
      crowding: DEFAULT_WEIGHTS.crowding,
    };

    const portfolio = await storage.getPortfolio();
    const budget = portfolio?.cashRemaining || 100;

    const result = scoreOpportunity(
      {
        momentum: signals.momentum,
        meanReversion: signals.meanReversion,
        quality: signals.quality,
        flow: signals.flow,
        risk: signals.risk,
        crowding: signals.crowding,
      },
      {
        momentum: weights.momentum,
        meanReversion: weights.meanReversion,
        quality: weights.quality,
        flow: weights.flow,
        risk: weights.risk,
        crowding: weights.crowding,
      },
      budget
    );

    const action = suggestAction(result);
    const priceLevels = computePriceLevels(signals.metadata.price, result.probabilityOfSuccess);

    await storage.updateOpportunity(opp.id, {
      compositeScore: result.compositeScore,
      probabilityOfSuccess: result.probabilityOfSuccess,
      expectedEdge: result.expectedEdge,
      kellyFraction: result.kellyFraction,
      convictionBand: result.convictionBand,
      suggestedAllocation: result.suggestedAllocation,
      targetPrice: priceLevels.targetPrice,
      stopLoss: priceLevels.stopLoss,
      status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
      updatedAt: now,
    });

    await storage.createPrediction({
      opportunityId: opp.id,
      action,
      compositeScore: result.compositeScore,
      probabilityOfSuccess: result.probabilityOfSuccess,
      expectedEdge: result.expectedEdge,
      kellyFraction: result.kellyFraction,
      convictionBand: result.convictionBand,
      suggestedAllocation: result.suggestedAllocation,
      entryPrice: signals.metadata.price,
      targetPrice: priceLevels.targetPrice,
      stopLoss: priceLevels.stopLoss,
      currentPrice: signals.metadata.price,
      reasoning: `Autopilot auto-scored: Mom=${signals.momentum} MR=${signals.meanReversion} Qual=${signals.quality} Flow=${signals.flow} Risk=${signals.risk} Crowd=${signals.crowding}`,
      signalSnapshot: JSON.stringify({ ...signals, weights }),
      timestamp: now,
    });

    return true;
  } catch (e: any) {
    console.error(`[autopilot] Error scoring ${ticker}: ${e.message}`);
    return false;
  }
}

async function autoSeedPriceHistory(tickers: string[]): Promise<void> {
  const now = new Date().toISOString();
  let seeded = 0;
  for (const ticker of tickers.slice(0, 20)) {
    try {
      const bars = await fetchOHLCV(ticker, "1mo", "1d");
      if (bars.length === 0) continue;

      const rows = bars.map(b => ({
        ticker: ticker.toUpperCase(),
        date: b.date,
        open: b.open ?? null,
        high: b.high ?? null,
        low: b.low ?? null,
        close: b.close,
        volume: b.volume ?? null,
        fetchedAt: now,
      }));

      await storage.seedMarketData(ticker.toUpperCase(), rows);
      seeded++;
    } catch (e: any) {
      console.error(`[autopilot] Error seeding price data for ${ticker}: ${e.message}`);
    }
  }
  console.log(`[autopilot] Seeded price history for ${seeded}/${Math.min(tickers.length, 20)} tickers`);
}

async function autoFetchNews(tickers: string[]): Promise<void> {
  try {
    const top = tickers.slice(0, 10);
    if (top.length === 0) return;
    const articles = await fetchBenzingaNews(top);
    console.log(`[autopilot] Fetched ${articles.length} news articles for ${top.length} tickers`);
  } catch (e: any) {
    console.error(`[autopilot] Error fetching news: ${e.message}`);
  }
}

async function runAutopilot(): Promise<void> {
  try {
    console.log("[autopilot] Scanning universe...");
    const scanResults = await scanUniverse();
    setLastScanResults(scanResults);
    console.log(`[autopilot] Found ${scanResults.length} tickers from screeners`);

    // Add new tickers as opportunities
    let added = 0;
    for (const result of scanResults) {
      if (result.isNew) {
        try {
          await addScannedOpportunity(result.ticker, result.name, result.screeners);
          added++;
        } catch (e: any) {
          console.error(`[autopilot] Error adding ${result.ticker}: ${e.message}`);
        }
      }
    }
    if (added > 0) {
      console.log(`[autopilot] Added ${added} new opportunities`);
    }

    // Auto-score ALL opportunities with tickers
    const allOpps = await storage.getOpportunities();
    const marketOpps = allOpps.filter(o => o.domain === "public_markets" && o.ticker);
    console.log(`[autopilot] Scoring ${marketOpps.length} opportunities...`);

    let scored = 0;
    for (const opp of marketOpps) {
      const ok = await autoScoreTicker(opp.ticker!);
      if (ok) scored++;
    }

    console.log(`[autopilot] Done. Scored ${scored}/${marketOpps.length} opportunities`);

    // Cap total allocations to budget — rank by score, allocate top-down
    try {
      const portfolio = await storage.getPortfolio();
      const totalBudget = portfolio?.totalBudget || 100;
      const freshOpps = await storage.getOpportunities();
      const buyOpps = freshOpps
        .filter(o => o.domain === "public_markets" && o.status === "buy" && (o.suggestedAllocation || 0) > 0)
        .sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));

      let remaining = totalBudget;
      let totalAllocated = 0;
      for (const opp of buyOpps) {
        const allocation = Math.min(opp.suggestedAllocation || 0, remaining);
        if (allocation !== opp.suggestedAllocation) {
          await storage.updateOpportunity(opp.id, {
            suggestedAllocation: allocation > 0 ? allocation : 0,
            status: allocation > 0 ? "buy" : "watch",
            updatedAt: new Date().toISOString(),
          });
        }
        remaining -= allocation;
        totalAllocated += allocation;
      }

      // Update portfolio allocated amount
      await storage.updatePortfolio({ allocatedAmount: totalAllocated });
      console.log(`[autopilot] Budget cap: $${totalAllocated.toFixed(2)} allocated of $${totalBudget} budget`);
    } catch (e: any) {
      console.error(`[autopilot] Budget cap error: ${e.message}`);
    }

    // Auto-execute paper trades for HIGH conviction opportunities (simulated, no real money)
    try {
      const alpacaConnected = await isAlpacaConnected();
      if (!alpacaConnected) {
        const freshOpps = await storage.getOpportunities();
        const highConviction = freshOpps.filter(
          o => o.domain === "public_markets" &&
               o.ticker &&
               o.convictionBand === "high" &&
               o.status === "buy" &&
               o.entryPrice && o.entryPrice > 0 &&
               o.suggestedAllocation && o.suggestedAllocation > 0
        );

        // Check existing paper positions to avoid duplicates
        const paperPositions = await getPaperPositions();
        const positionTickers = new Set(paperPositions.map(p => p.ticker.toUpperCase()));

        let paperTraded = 0;
        for (const opp of highConviction) {
          if (positionTickers.has(opp.ticker!.toUpperCase())) continue;

          const shares = opp.suggestedAllocation! / opp.entryPrice!;
          if (shares <= 0) continue;

          try {
            await executePaperTrade(opp.ticker!, "BUY", shares, opp.entryPrice!, opp.id);
            console.log(`[autopilot] Paper-traded ${opp.ticker}: BUY ${shares.toFixed(4)} shares @ $${opp.entryPrice!.toFixed(2)}`);
            paperTraded++;
          } catch (e: any) {
            console.error(`[autopilot] Paper trade failed for ${opp.ticker}: ${e.message}`);
          }
        }

        if (paperTraded > 0) {
          console.log(`[autopilot] Auto-executed ${paperTraded} paper trades (HIGH conviction)`);
        }
      }
    } catch (e: any) {
      console.error(`[autopilot] Paper trade auto-execution error: ${e.message}`);
    }

    // ── Sell-check loop: monitor open paper positions for exit conditions ──
    try {
      const paperPositions = await getPaperPositions();
      const openPositions = paperPositions.filter(p => p.status === "open");

      if (openPositions.length > 0) {
        console.log(`[autopilot] Checking ${openPositions.length} open paper positions for sell rules...`);
        const freshOpps = await storage.getOpportunities();

        for (const pos of openPositions) {
          const currentPrice = pos.currentPrice ?? pos.avgEntryPrice;
          if (!currentPrice || currentPrice <= 0) continue;

          // Find matching opportunity for target/stop levels
          const opp = freshOpps.find(o => o.ticker?.toUpperCase() === pos.ticker.toUpperCase());
          const stopLoss = opp?.stopLoss ?? null;
          const targetPrice = opp?.targetPrice ?? null;
          const entryPrice = pos.avgEntryPrice;

          // Track high water mark (peak price since entry)
          const highWaterMark = Math.max(entryPrice, currentPrice);
          const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
          const drawdownFromPeak = ((highWaterMark - currentPrice) / highWaterMark) * 100;

          // Hold duration in weeks
          const holdDays = Math.ceil((Date.now() - new Date(pos.openedAt).getTime()) / 86400000);
          const holdWeeks = holdDays / 7;

          let sellReason: string | null = null;

          // Rule 1: Stop loss hit
          if (stopLoss && currentPrice <= stopLoss) {
            sellReason = `trailing stop hit at $${currentPrice.toFixed(2)} (stop $${stopLoss.toFixed(2)}, entry $${entryPrice.toFixed(2)})`;
          }
          // Rule 2: Take profit hit
          else if (targetPrice && currentPrice >= targetPrice) {
            sellReason = `take profit hit at $${currentPrice.toFixed(2)} (target $${targetPrice.toFixed(2)}, entry $${entryPrice.toFixed(2)})`;
          }
          // Rule 3: Max hold period (6 weeks)
          else if (holdWeeks > 6) {
            sellReason = `max hold period exceeded (${holdWeeks.toFixed(1)} weeks, entry $${entryPrice.toFixed(2)})`;
          }
          // Rule 4: Trailing stop from high water mark (-2.5% from peak)
          else if (drawdownFromPeak > 2.5 && pnlPct < 0) {
            sellReason = `trailing stop from peak: -${drawdownFromPeak.toFixed(1)}% from high (entry $${entryPrice.toFixed(2)})`;
          }

          if (sellReason) {
            try {
              await executePaperTrade(pos.ticker, "SELL", pos.shares, currentPrice);
              console.log(`[autopilot] Auto-sold ${pos.ticker}: ${sellReason}`);

              // Update opportunity status to "sell" if matched
              if (opp) {
                await storage.updateOpportunity(opp.id, {
                  status: "sell",
                  updatedAt: new Date().toISOString(),
                });
              }
            } catch (e: any) {
              console.error(`[autopilot] Error auto-selling ${pos.ticker}: ${e.message}`);
            }
          }
        }
      }
    } catch (e: any) {
      console.error(`[autopilot] Sell-check error: ${e.message}`);
    }

    // Auto-seed price history for all tracked tickers
    const trackedTickers = Array.from(new Set(marketOpps.map(o => o.ticker!.toUpperCase())));
    console.log(`[autopilot] Seeding price history for ${trackedTickers.length} tickers...`);
    await autoSeedPriceHistory(trackedTickers);

    // Auto-fetch news for top tracked tickers
    console.log(`[autopilot] Fetching news...`);
    await autoFetchNews(trackedTickers);

    // Re-score any articles with zero sentiment
    try {
      await rescoreZeroSentimentArticles();
    } catch (e: any) {
      console.error(`[autopilot] Sentiment re-scoring error: ${e.message}`);
    }
  } catch (e: any) {
    console.error(`[autopilot] Error in autopilot cycle: ${e.message}`);
  }
}

export function startAutopilot(): void {
  console.log(`[autopilot] Will start in ${STARTUP_DELAY_MS / 1000}s, then repeat every ${INTERVAL_MS / 60000}min`);

  // Initial run after delay
  setTimeout(async () => {
    await runAutopilot();

    // Repeat every 5 minutes
    setInterval(runAutopilot, INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
