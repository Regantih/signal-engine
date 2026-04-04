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

const S3_HOUSE_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json";

interface HouseS3Transaction {
  representative?: string;
  ticker?: string;
  transaction_date?: string;
  disclosure_date?: string;
  type?: string;
  amount?: string;
  party?: string;
  district?: string;
}

function parseS3Trades(data: HouseS3Transaction[]): CongressionalTrade[] {
  return data
    .filter(t => t.ticker && t.ticker !== "--" && t.representative)
    .map(t => ({
      politician: t.representative || "Unknown",
      ticker: t.ticker!.replace(/\s+/g, ""),
      type: (t.type || "").toLowerCase().includes("sale") ? "Sale" : "Purchase",
      amount: t.amount || "Unknown",
      date: t.transaction_date || t.disclosure_date || "",
      party: t.party || "Unknown",
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchCongressionalTrades(limit = 50): Promise<CongressionalTrade[]> {
  // Return cached if fresh
  if (cachedTrades.length > 0 && Date.now() < cacheExpiry) {
    return cachedTrades.slice(0, limit);
  }

  console.log("[congress] Fetching congressional trades...");

  // Try Capitol Trades first
  let trades: CongressionalTrade[] = [];
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

    if (resp.ok) {
      const html = await resp.text();
      trades = parseCapitolTradesHtml(html);
    } else {
      console.warn(`[congress] Capitol Trades returned ${resp.status}, trying S3 fallback...`);
    }
  } catch (e: any) {
    console.warn("[congress] Capitol Trades failed, trying S3 fallback:", e.message);
  }

  // Fallback: S3 House stock watcher data
  if (trades.length === 0) {
    try {
      console.log("[congress] Fetching from S3 House stock watcher...");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const resp = await fetch(S3_HOUSE_URL, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalEngine/1.0)" },
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const data: HouseS3Transaction[] = await resp.json();
        trades = parseS3Trades(data);
        console.log(`[congress] S3 fallback loaded ${trades.length} trades`);
      } else {
        console.error(`[congress] S3 fallback returned ${resp.status}`);
      }
    } catch (e: any) {
      console.error("[congress] S3 fallback error:", e.message);
    }
  }

  // Sort by date descending
  trades.sort((a, b) => b.date.localeCompare(a.date));

  if (trades.length > 0) {
    cachedTrades = trades;
    cacheExpiry = Date.now() + CACHE_TTL;
    console.log(`[congress] Loaded ${trades.length} congressional trades`);
  }

  return (trades.length > 0 ? trades : cachedTrades).slice(0, limit);
}
