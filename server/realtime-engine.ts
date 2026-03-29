import { execSync } from "child_process";
import { storage } from "./storage";
import { evaluatePosition, type Position } from "./risk-manager";
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

function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
  try {
    const escaped = params.replace(/'/g, "'\\''");
    return JSON.parse(execSync(`external-tool call '${escaped}'`, { timeout: 30000, encoding: "utf-8" }));
  } catch { return null; }
}

function parseCSVContent(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter(l => l.trim().startsWith("|"));
  if (lines.length < 2) return [];
  const headers = lines[0].split("|").map(h => h.trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => row[h] = cells[idx]);
      rows.push(row);
    }
  }
  return rows;
}

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
  const allSymbols = [...tickers, "^VIX", "^GSPC", "BTCUSD"];

  // Batch into groups of 10 (API limit)
  for (let i = 0; i < allSymbols.length; i += 10) {
    const batch = allSymbols.slice(i, i + 10);
    const resp = callFinanceTool("finance_quotes", {
      ticker_symbols: batch,
      fields: ["price", "change", "changesPercentage", "volume"],
    });

    if (resp?.result?.content) {
      const rows = parseCSVContent(resp.result.content);
      const now = new Date().toISOString();

      for (const row of rows) {
        const symbol = row.symbol || "";
        const price = parseFloat(row.price?.replace(/,/g, "") || "0");
        const change = parseFloat(row.change?.replace(/,/g, "") || "0");
        const changePct = parseFloat(row.changesPercentage || "0");
        const volume = parseInt(row.volume?.replace(/,/g, "") || "0");

        if (price > 0) {
          priceCache.set(symbol, { price, change, changePct, volume, updatedAt: now });
        }
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
    // Add the live price as the most recent
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
  // Send current cache immediately
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
