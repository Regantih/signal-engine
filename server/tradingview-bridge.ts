import { execSync } from "child_process";

// ============================================================
// TradingView MCP Bridge
// Wraps the `tv` CLI (tradingview-mcp-jackson) with graceful
// fallback — every function returns null/false when TV is
// unavailable so the rest of the engine keeps running.
// ============================================================

export interface LiveQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

export interface OHLCVSummary {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  period: string;
}

export interface IndicatorValues {
  symbol: string;
  rsi?: number;
  macd?: { value: number; signal: number; histogram: number };
  ema20?: number;
  ema50?: number;
  ema200?: number;
}

export interface MorningBrief {
  summary: string;
  marketStatus: string;
  topMovers: Array<{ symbol: string; change: number }>;
  alerts: string[];
  timestamp: string;
}

export interface TVConnectionStatus {
  connected: boolean;
  message: string;
  lastChecked: string;
  version?: string;
}

// Cache the availability check for 60 seconds
let _availableCache: { value: boolean; checkedAt: number } | null = null;
const AVAILABILITY_CACHE_MS = 60_000;

function runTV(args: string, timeout = 5000): string | null {
  try {
    return execSync(`tv ${args}`, {
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function tryParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// Public API
// ----------------------------------------------------------

/** Check if the TradingView MCP CLI (`tv`) is installed and responsive. */
export function isTVMCPAvailable(): boolean {
  const now = Date.now();
  if (_availableCache && now - _availableCache.checkedAt < AVAILABILITY_CACHE_MS) {
    return _availableCache.value;
  }

  const result = runTV("status", 3000);
  const available = result !== null;

  _availableCache = { value: available, checkedAt: now };
  return available;
}

/** Full connection status object for the /api/tradingview/status endpoint. */
export function getTVConnectionStatus(): TVConnectionStatus {
  const now = new Date().toISOString();
  try {
    const result = runTV("status", 3000);
    if (result !== null) {
      // Try to extract version from status output
      const versionMatch = result.match(/v?(\d+\.\d+\.\d+)/);
      return {
        connected: true,
        message: "TradingView MCP connected via Chrome DevTools Protocol.",
        lastChecked: now,
        version: versionMatch?.[1] || undefined,
      };
    }
  } catch { /* fall through */ }

  // Determine whether it's not installed vs not running
  const whichResult = runTV("--version", 2000);
  if (whichResult === null) {
    return {
      connected: false,
      message: "TradingView MCP not installed. See setup instructions.",
      lastChecked: now,
    };
  }

  return {
    connected: false,
    message: "TradingView MCP installed but TradingView Desktop is not running. Launch TradingView with --remote-debugging-port=9222.",
    lastChecked: now,
    version: whichResult.match(/v?(\d+\.\d+\.\d+)/)?.[1] || undefined,
  };
}

/** Navigate to a symbol and fetch its live quote. */
export async function getLiveQuote(ticker: string): Promise<LiveQuote | null> {
  try {
    if (!isTVMCPAvailable()) return null;

    // Set the active symbol first
    runTV(`symbol ${ticker}`, 3000);

    const raw = runTV("quote", 5000);
    const parsed = tryParseJSON<any>(raw);
    if (!parsed) return null;

    return {
      symbol: parsed.symbol || ticker,
      price: parseFloat(parsed.price ?? parsed.last ?? 0),
      change: parseFloat(parsed.change ?? 0),
      changePercent: parseFloat(parsed.changePercent ?? parsed.change_percent ?? 0),
      volume: parseInt(String(parsed.volume ?? 0).replace(/,/g, ""), 10),
      high: parseFloat(parsed.high ?? 0),
      low: parseFloat(parsed.low ?? 0),
      open: parseFloat(parsed.open ?? 0),
      previousClose: parseFloat(parsed.previousClose ?? parsed.prev_close ?? 0),
      timestamp: parsed.timestamp || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Get OHLCV summary for the current session/period. */
export async function getOHLCVSummary(ticker: string): Promise<OHLCVSummary | null> {
  try {
    if (!isTVMCPAvailable()) return null;

    runTV(`symbol ${ticker}`, 3000);
    const raw = runTV("ohlcv --summary", 5000);
    const parsed = tryParseJSON<any>(raw);
    if (!parsed) return null;

    return {
      symbol: parsed.symbol || ticker,
      open: parseFloat(parsed.open ?? 0),
      high: parseFloat(parsed.high ?? 0),
      low: parseFloat(parsed.low ?? 0),
      close: parseFloat(parsed.close ?? 0),
      volume: parseInt(String(parsed.volume ?? 0).replace(/,/g, ""), 10),
      vwap: parsed.vwap ? parseFloat(parsed.vwap) : undefined,
      period: parsed.period || "1D",
    };
  } catch {
    return null;
  }
}

/** Get indicator values (RSI, MACD, EMA) from TradingView. */
export async function getIndicators(ticker: string): Promise<IndicatorValues | null> {
  try {
    if (!isTVMCPAvailable()) return null;

    runTV(`symbol ${ticker}`, 3000);
    const raw = runTV("indicators", 5000);
    const parsed = tryParseJSON<any>(raw);
    if (!parsed) return null;

    return {
      symbol: parsed.symbol || ticker,
      rsi: parsed.rsi != null ? parseFloat(parsed.rsi) : undefined,
      macd: parsed.macd ? {
        value: parseFloat(parsed.macd.value ?? 0),
        signal: parseFloat(parsed.macd.signal ?? 0),
        histogram: parseFloat(parsed.macd.histogram ?? 0),
      } : undefined,
      ema20: parsed.ema20 != null ? parseFloat(parsed.ema20) : undefined,
      ema50: parsed.ema50 != null ? parseFloat(parsed.ema50) : undefined,
      ema200: parsed.ema200 != null ? parseFloat(parsed.ema200) : undefined,
    };
  } catch {
    return null;
  }
}

/** Get a combined morning brief from TradingView watchlist. */
export async function getMorningBrief(): Promise<MorningBrief | null> {
  try {
    if (!isTVMCPAvailable()) return null;

    const raw = runTV("morning-brief", 10000);
    const parsed = tryParseJSON<any>(raw);
    if (!parsed) return null;

    return {
      summary: parsed.summary || "",
      marketStatus: parsed.marketStatus || parsed.market_status || "unknown",
      topMovers: Array.isArray(parsed.topMovers || parsed.top_movers)
        ? (parsed.topMovers || parsed.top_movers).map((m: any) => ({
            symbol: m.symbol || m.ticker || "",
            change: parseFloat(m.change ?? m.changePercent ?? 0),
          }))
        : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      timestamp: parsed.timestamp || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Create a simple price alert on TradingView. */
export async function createAlert(
  ticker: string,
  price: number,
  condition: "crossing" | "above" | "below" = "crossing"
): Promise<boolean> {
  try {
    if (!isTVMCPAvailable()) return false;

    runTV(`symbol ${ticker}`, 3000);
    const result = runTV(`alert --price ${price} --condition ${condition}`, 5000);
    return result !== null;
  } catch {
    return false;
  }
}

/** Generate a Pine Script alert for a Signal Engine pick and deploy it to TradingView. */
export async function deploySignalAlertPineScript(
  ticker: string,
  targetPrice: number,
  stopLoss: number
): Promise<boolean> {
  try {
    if (!isTVMCPAvailable()) return false;

    // Navigate to the ticker
    runTV(`symbol ${ticker}`, 3000);

    // Create target alert
    const targetOk = runTV(
      `alert --price ${targetPrice.toFixed(2)} --condition crossing --message "Signal Engine: ${ticker} hit target $${targetPrice.toFixed(2)}"`,
      5000
    );

    // Create stop-loss alert
    const stopOk = runTV(
      `alert --price ${stopLoss.toFixed(2)} --condition crossing --message "Signal Engine: ${ticker} hit stop $${stopLoss.toFixed(2)}"`,
      5000
    );

    const success = targetOk !== null || stopOk !== null;
    if (success) {
      console.log(`[tv-bridge] TradingView alerts created: ${ticker} target $${targetPrice.toFixed(2)} / stop $${stopLoss.toFixed(2)}`);
    }
    return success;
  } catch {
    return false;
  }
}

/** Clear the availability cache (useful after user clicks "Test Connection"). */
export function clearTVCache(): void {
  _availableCache = null;
}
