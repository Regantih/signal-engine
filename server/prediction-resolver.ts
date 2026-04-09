import { execSync } from "child_process";
import { storage } from "./storage";
import { getExecEnv } from "./credentials";
import { parseCSVContent } from "./csv-parser";
import type { Prediction } from "@shared/schema";

function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
  try {
    const escaped = params.replace(/'/g, "'\\''");
    return JSON.parse(execSync(`external-tool call '${escaped}'`, { timeout: 30000, encoding: "utf-8", env: getExecEnv() as any }));
  } catch { return null; }
}

function fetchCurrentPrices(tickers: string[]): Map<string, number> {
  const prices = new Map<string, number>();
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i + 10);
    const resp = callFinanceTool("finance_quotes", {
      ticker_symbols: batch,
      fields: ["price"],
    });
    if (resp?.content) {
      const rows = parseCSVContent(resp.content);
      for (const row of rows) {
        const symbol = row.symbol || "";
        const price = parseFloat(row.price?.replace(/,/g, "") || "0");
        if (price > 0) prices.set(symbol, price);
      }
    }
  }
  return prices;
}

export interface ResolutionResult {
  predictionId: number;
  ticker: string;
  wasCorrect: number;
  actualReturn: number;
  resolvedPrice: number;
  notes: string;
}

export async function resolveOldPredictions(): Promise<ResolutionResult[]> {
  const allPreds = await storage.getPredictions();
  const opps = await storage.getOpportunities();
  const results: ResolutionResult[] = [];

  // Filter to unresolved BUY predictions older than 1 day
  const now = Date.now();
  const oneDayMs = 86400000;
  const thirtyDaysMs = 30 * oneDayMs;

  const unresolved = allPreds.filter(p =>
    p.action === "BUY" &&
    p.wasCorrect === null &&
    p.entryPrice &&
    (now - new Date(p.timestamp).getTime()) > oneDayMs
  );

  if (unresolved.length === 0) return results;

  // Collect tickers we need prices for
  const tickerSet = new Set<string>();
  for (const pred of unresolved) {
    const opp = opps.find(o => o.id === pred.opportunityId);
    if (opp?.ticker) tickerSet.add(opp.ticker.toUpperCase());
  }

  // Batch fetch current prices
  const livePrices = fetchCurrentPrices([...tickerSet]);

  // Also check latest market data in DB as fallback
  for (const pred of unresolved) {
    const opp = opps.find(o => o.id === pred.opportunityId);
    if (!opp?.ticker || !pred.entryPrice) continue;

    const ticker = opp.ticker.toUpperCase();
    let currentPrice = livePrices.get(ticker);

    // Fallback to latest market data in DB
    if (!currentPrice) {
      const latest = await storage.getLatestMarketData(ticker);
      currentPrice = latest?.close;
    }
    if (!currentPrice) continue;

    const entryPrice = pred.entryPrice;
    const daysSince = Math.floor((now - new Date(pred.timestamp).getTime()) / oneDayMs);
    let wasCorrect: number | null = null;
    let actualReturn: number;
    let notes: string;

    // Check if target was hit
    if (pred.targetPrice && currentPrice >= pred.targetPrice) {
      wasCorrect = 1;
      actualReturn = ((pred.targetPrice - entryPrice) / entryPrice) * 100;
      notes = `Target $${pred.targetPrice.toFixed(2)} hit. Price: $${currentPrice.toFixed(2)}`;
    }
    // Check if stop loss was hit
    else if (pred.stopLoss && currentPrice <= pred.stopLoss) {
      wasCorrect = -1;
      actualReturn = ((pred.stopLoss - entryPrice) / entryPrice) * 100;
      notes = `Stop loss $${pred.stopLoss.toFixed(2)} hit. Price: $${currentPrice.toFixed(2)}`;
    }
    // Check if held > 30 days — resolve at current price
    else if (daysSince > 30) {
      actualReturn = ((currentPrice - entryPrice) / entryPrice) * 100;
      wasCorrect = actualReturn > 0 ? 1 : -1;
      notes = `Auto-resolved after ${daysSince} days. Price: $${currentPrice.toFixed(2)} (${actualReturn > 0 ? "+" : ""}${actualReturn.toFixed(2)}%)`;
    }
    // Still open
    else {
      continue;
    }

    actualReturn = Math.round(actualReturn * 100) / 100;

    await storage.updatePrediction(pred.id, {
      resolvedAt: new Date().toISOString(),
      resolvedPrice: currentPrice,
      actualReturn,
      wasCorrect,
      resolutionNotes: notes,
    });

    results.push({
      predictionId: pred.id,
      ticker,
      wasCorrect,
      actualReturn,
      resolvedPrice: currentPrice,
      notes,
    });
  }

  console.log(`[resolver] Resolved ${results.length} predictions: ${results.filter(r => r.wasCorrect === 1).length} wins, ${results.filter(r => r.wasCorrect === -1).length} losses`);
  return results;
}
