import { storage } from "./storage";
import { evaluatePosition, type Position } from "./risk-manager";
import { fetchQuotes, type QuoteData } from "./market-data-provider";
import type { Response } from "express";

// Connected SSE clients
const clients: Set<Response> = new Set();

// Latest prices cache
const priceCache: Map<string, { price: number; change: number; changePct: number; volume: number; updatedAt: string }> = new Map();

// Risk alerts
const riskAlerts: Array<{ ticker: string; rule: string; reason: string; urgency: string; timestamp: string }> = [];

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;
let tickCount = 0;

// No-op: kept for backward compatibility with any callers
export function refreshCredentials() {}

// Broadcast to all connected SSE clients
function broadcast(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(message); } catch { clients.delete(client); }
  }
}

// Fetch latest prices for all tracked tickers
async function pollPrices() {
  const opps = await storage.getOpportunities();
  const tickers = [...new Set(opps.filter(o => o.ticker).map(o => o.ticker!.toUpperCase()))];

  if (tickers.length === 0) return;

  // Also add key market indicators
  const allSymbols = [...tickers, "^VIX", "^GSPC", "BTC-USD"];

  // Batch into groups of 20
  for (let i = 0; i < allSymbols.length; i += 20) {
    const batch = allSymbols.slice(i, i + 20);
    const quotes = await fetchQuotes(batch);
    const now = new Date().toISOString();

    for (const q of quotes) {
      if (q.price > 0) {
        priceCache.set(q.symbol, {
          price: q.price,
          change: q.change,
          changePct: q.changePct,
          volume: q.volume,
          updatedAt: now,
        });
      }
    }
  }

  tickCount++;

  // Broadcast price updates
  const prices: Record<string, any> = {};
  for (const [symbol, data] of priceCache) {
    prices[symbol] = data;
  }
  broadcast("prices", { prices, tickCount, timestamp: new Date().toISOString() });

  // Check risk rules for open positions on every 3rd tick (every ~90 seconds)
  if (tickCount % 3 === 0) {
    await checkRiskRules(opps);
  }
}

// Check all open positions against risk rules
async function checkRiskRules(opps: any[]) {
  const openPositions = opps.filter(o => o.status === "buy" && o.entryPrice && o.ticker);

  for (const opp of openPositions) {
    const ticker = opp.ticker!.toUpperCase();
    const cached = priceCache.get(ticker);
    if (!cached) continue;

    const allData = await storage.getMarketData(ticker);
    const recentPrices = allData.slice(-6).map(d => d.close);
    recentPrices.push(cached.price);

    const highWaterMark = Math.max(opp.entryPrice!, ...recentPrices);

    const position: Position = {
      ticker,
      entryPrice: opp.entryPrice!,
      entryDate: opp.createdAt,
      currentPrice: cached.price,
      highWaterMark,
      shares: opp.suggestedAllocation ? opp.suggestedAllocation / opp.entryPrice! : 0,
      allocation: opp.suggestedAllocation || 0,
      partialTaken: false,
      compositeScore: opp.compositeScore || 0,
      screenerCount: opp.screenerFlags ? JSON.parse(opp.screenerFlags).length : 0,
    };

    const decision = evaluatePosition(position, recentPrices);

    if (decision.action !== "HOLD") {
      const alert = {
        ticker,
        rule: decision.rule,
        reason: decision.reason,
        urgency: decision.urgency,
        timestamp: new Date().toISOString(),
      };
      riskAlerts.unshift(alert);
      if (riskAlerts.length > 50) riskAlerts.pop();

      broadcast("risk_alert", alert);
    }
  }
}

// Start the real-time polling loop
export function startRealtime(intervalMs: number = 30000) {
  if (isRunning) return;
  isRunning = true;
  console.log(`[realtime] Starting price polling every ${intervalMs / 1000}s`);

  // Initial poll
  pollPrices().catch(e => console.error("[realtime] Poll error:", e.message));

  // Schedule recurring polls
  pollInterval = setInterval(() => {
    pollPrices().catch(e => console.error("[realtime] Poll error:", e.message));
  }, intervalMs);
}

export function stopRealtime() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  isRunning = false;
  console.log("[realtime] Stopped");
}

export function addClient(res: Response) {
  clients.add(res);
  const prices: Record<string, any> = {};
  for (const [symbol, data] of priceCache) prices[symbol] = data;
  res.write(`event: prices\ndata: ${JSON.stringify({ prices, tickCount, timestamp: new Date().toISOString() })}\n\n`);
}

export function removeClient(res: Response) {
  clients.delete(res);
}

export function getRealtimeStatus() {
  return {
    isRunning,
    connectedClients: clients.size,
    cachedTickers: priceCache.size,
    tickCount,
    recentAlerts: riskAlerts.slice(0, 10),
    prices: Object.fromEntries(priceCache),
  };
}
