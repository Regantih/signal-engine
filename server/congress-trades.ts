// Congressional stock trade data from Capitol Trades (free, no API key required)

export interface CongressionalTrade {
  politician: string;
  ticker: string;
  type: string; // "Purchase" | "Sale"
  amount: string;
  date: string;
  party?: string;
  chamber?: string;
}

// Cache
let cachedTrades: CongressionalTrade[] = [];
let cacheExpiry = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const CAPITOL_TRADES_URL = "https://www.capitoltrades.com/trades?page=1&pageSize=96";

function formatAmount(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function parseCapitolTradesHtml(html: string): CongressionalTrade[] {
  const trades: CongressionalTrade[] = [];

  // Capitol Trades uses Next.js RSC protocol — data is embedded in self.__next_f.push chunks
  const chunkRegex = /self\.__next_f\.push\(\[1,(".*?")\]\)/gs;
  let match;

  while ((match = chunkRegex.exec(html)) !== null) {
    let decoded: string;
    try {
      decoded = JSON.parse(match[1]);
    } catch {
      continue;
    }

    // Skip chunks without trade data
    if (!decoded.includes("issuerTicker") || !decoded.includes("txDate")) continue;

    // Extract politician names
    const politicians = [...decoded.matchAll(/"firstName":"([^"]+)","gender":"[^"]+","lastName":"([^"]+)"/g)];
    const tickers = [...decoded.matchAll(/"issuerTicker":"([^"]+)"/g)];
    const types = [...decoded.matchAll(/"txType":"([^"]+)"/g)];
    const dates = [...decoded.matchAll(/"txDate":"([^"]+)"/g)];
    const values = [...decoded.matchAll(/"value":(\d+)/g)];
    const parties = [...decoded.matchAll(/"party":"([^"]+)"/g)];
    const chambers = [...decoded.matchAll(/"chamber":"([^"]+)"/g)];

    const count = Math.min(politicians.length, tickers.length, types.length, dates.length);

    for (let i = 0; i < count; i++) {
      const name = `${politicians[i][1]} ${politicians[i][2]}`;
      const ticker = tickers[i][1].replace(/:US$/, "");
      const txType = types[i][1];
      const date = dates[i][1];
      const value = parseInt(values[i]?.[1] || "0", 10);
      const party = parties[i]?.[1] || "unknown";
      const chamber = chambers[i]?.[1] || "unknown";

      trades.push({
        politician: name,
        ticker,
        type: txType === "sell" ? "Sale" : "Purchase",
        amount: formatAmount(value),
        date,
        party: party.charAt(0).toUpperCase() + party.slice(1),
        chamber: chamber.charAt(0).toUpperCase() + chamber.slice(1),
      });
    }
  }

  return trades;
}

export async function fetchCongressionalTrades(limit = 50): Promise<CongressionalTrade[]> {
  // Return cached if fresh
  if (cachedTrades.length > 0 && Date.now() < cacheExpiry) {
    return cachedTrades.slice(0, limit);
  }

  console.log("[congress] Fetching congressional trades from Capitol Trades...");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch(CAPITOL_TRADES_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(`[congress] Capitol Trades returned ${resp.status}`);
      return cachedTrades.slice(0, limit);
    }

    const html = await resp.text();
    const trades = parseCapitolTradesHtml(html);

    // Sort by date descending
    trades.sort((a, b) => b.date.localeCompare(a.date));

    cachedTrades = trades;
    cacheExpiry = Date.now() + CACHE_TTL;

    console.log(`[congress] Loaded ${trades.length} congressional trades`);
    return trades.slice(0, limit);
  } catch (e: any) {
    console.error("[congress] Error fetching trades:", e.message);
    return cachedTrades.slice(0, limit);
  }
}
