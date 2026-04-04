import { db } from "./storage";
import { paperPositions, paperOrders } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { fetchQuotes } from "./market-data-provider";

export interface PaperPosition {
  id: number;
  ticker: string;
  shares: number;
  avgEntryPrice: number;
  currentPrice: number | null;
  side: string;
  openedAt: string;
  closedAt: string | null;
  realizedPnl: number | null;
  status: string;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  marketValue?: number;
}

export interface PaperOrder {
  id: number;
  ticker: string;
  action: string;
  shares: number;
  price: number;
  opportunityId: number | null;
  status: string;
  createdAt: string;
}

// Execute a paper trade (buy or sell)
export async function executePaperTrade(
  ticker: string,
  action: "BUY" | "SELL",
  shares: number,
  price: number,
  opportunityId?: number
): Promise<PaperOrder> {
  const now = new Date().toISOString();

  // Record the order
  const order = db.insert(paperOrders).values({
    ticker: ticker.toUpperCase(),
    action,
    shares,
    price,
    opportunityId: opportunityId ?? null,
    status: "filled",
    createdAt: now,
  }).returning().get();

  if (action === "BUY") {
    // Check if we already have an open position for this ticker
    const existing = db.select().from(paperPositions)
      .where(and(
        eq(paperPositions.ticker, ticker.toUpperCase()),
        eq(paperPositions.status, "open")
      ))
      .get();

    if (existing) {
      // Average into existing position
      const totalShares = existing.shares + shares;
      const totalCost = (existing.shares * existing.avgEntryPrice) + (shares * price);
      const newAvg = totalCost / totalShares;

      db.update(paperPositions)
        .set({ shares: totalShares, avgEntryPrice: newAvg, currentPrice: price })
        .where(eq(paperPositions.id, existing.id))
        .run();
    } else {
      // Open new position
      db.insert(paperPositions).values({
        ticker: ticker.toUpperCase(),
        shares,
        avgEntryPrice: price,
        currentPrice: price,
        side: "long",
        openedAt: now,
        status: "open",
      }).run();
    }
  } else if (action === "SELL") {
    // Close or reduce position
    const existing = db.select().from(paperPositions)
      .where(and(
        eq(paperPositions.ticker, ticker.toUpperCase()),
        eq(paperPositions.status, "open")
      ))
      .get();

    if (existing) {
      const sellShares = Math.min(shares, existing.shares);
      const pnl = (price - existing.avgEntryPrice) * sellShares;

      if (sellShares >= existing.shares) {
        // Close entire position
        db.update(paperPositions)
          .set({
            shares: 0,
            currentPrice: price,
            closedAt: now,
            realizedPnl: (existing.realizedPnl || 0) + pnl,
            status: "closed",
          })
          .where(eq(paperPositions.id, existing.id))
          .run();
      } else {
        // Partial close
        db.update(paperPositions)
          .set({
            shares: existing.shares - sellShares,
            currentPrice: price,
            realizedPnl: (existing.realizedPnl || 0) + pnl,
          })
          .where(eq(paperPositions.id, existing.id))
          .run();
      }
    }
  }

  return order;
}

// Get all open paper positions with live P&L
export async function getPaperPositions(): Promise<PaperPosition[]> {
  const positions = db.select().from(paperPositions)
    .where(eq(paperPositions.status, "open"))
    .orderBy(desc(paperPositions.openedAt))
    .all();

  if (positions.length === 0) return [];

  // Fetch live prices for all position tickers
  const tickers = positions.map(p => p.ticker);
  let priceMap: Record<string, number> = {};
  try {
    const quotes = await fetchQuotes(tickers);
    for (const q of quotes) {
      priceMap[q.symbol.toUpperCase()] = q.price;
    }
  } catch (e: any) {
    console.error("[paper-trading] Error fetching live prices:", e.message);
  }

  return positions.map(p => {
    const livePrice = priceMap[p.ticker] || p.currentPrice || p.avgEntryPrice;
    const unrealizedPnl = (livePrice - p.avgEntryPrice) * p.shares;
    const unrealizedPnlPct = ((livePrice - p.avgEntryPrice) / p.avgEntryPrice) * 100;
    const marketValue = livePrice * p.shares;

    // Update current price in DB
    if (priceMap[p.ticker]) {
      db.update(paperPositions)
        .set({ currentPrice: livePrice })
        .where(eq(paperPositions.id, p.id))
        .run();
    }

    return {
      ...p,
      currentPrice: livePrice,
      unrealizedPnl,
      unrealizedPnlPct,
      marketValue,
    };
  });
}

// Get paper order history
export async function getPaperOrders(limit = 50): Promise<PaperOrder[]> {
  return db.select().from(paperOrders)
    .orderBy(desc(paperOrders.createdAt))
    .limit(limit)
    .all();
}

// Close a specific paper position
export async function closePaperPosition(ticker: string): Promise<PaperOrder | null> {
  const position = db.select().from(paperPositions)
    .where(and(
      eq(paperPositions.ticker, ticker.toUpperCase()),
      eq(paperPositions.status, "open")
    ))
    .get();

  if (!position) return null;

  // Get current price
  let currentPrice = position.currentPrice || position.avgEntryPrice;
  try {
    const quotes = await fetchQuotes([ticker]);
    if (quotes.length > 0 && quotes[0].price > 0) {
      currentPrice = quotes[0].price;
    }
  } catch {}

  return executePaperTrade(ticker, "SELL", position.shares, currentPrice);
}

// Close all paper positions
export async function closeAllPaperPositions(): Promise<{ closed: number }> {
  const positions = db.select().from(paperPositions)
    .where(eq(paperPositions.status, "open"))
    .all();

  let closed = 0;
  for (const pos of positions) {
    try {
      await closePaperPosition(pos.ticker);
      closed++;
    } catch (e: any) {
      console.error(`[paper-trading] Error closing ${pos.ticker}:`, e.message);
    }
  }

  return { closed };
}

// Get paper account summary (simulates Alpaca account response)
export async function getPaperAccountSummary(): Promise<{
  equity: string;
  buyingPower: string;
  cash: string;
  portfolioValue: string;
}> {
  const positions = await getPaperPositions();
  const totalMarketValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);

  // Start with $100 paper trading budget
  const startingCapital = 100;
  const equity = startingCapital + totalUnrealizedPnl;
  const cash = startingCapital - positions.reduce((sum, p) => sum + (p.avgEntryPrice * p.shares), 0);

  return {
    equity: equity.toFixed(2),
    buyingPower: Math.max(0, cash * 2).toFixed(2), // 2x buying power
    cash: Math.max(0, cash).toFixed(2),
    portfolioValue: equity.toFixed(2),
  };
}
