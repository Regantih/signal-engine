// Polymarket prediction market data — free public API, no key required

export interface PolymarketEvent {
  title: string;
  probability: number;
  volume: string;
  category: string;
  url: string;
  slug?: string;
}

// Cache
let cachedEvents: PolymarketEvent[] = [];
let cacheExpiry = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Use /markets endpoint with volume sorting (the /events endpoint doesn't support ordering)
const POLYMARKET_API = "https://gamma-api.polymarket.com/markets";

interface PolymarketMarket {
  id?: string;
  question?: string;
  slug?: string;
  outcomePrices?: string; // JSON array like "[\"0.65\",\"0.35\"]"
  volume24hr?: number;
  groupItemTitle?: string;
  category?: string;
  tags?: Array<{ label?: string; slug?: string }>;
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${Math.round(volume)}`;
}

function extractCategory(market: PolymarketMarket): string {
  if (market.category) return market.category;
  if (market.tags && market.tags.length > 0) return market.tags[0].label || "General";
  return "General";
}

export async function fetchPolymarketEvents(limit = 20): Promise<PolymarketEvent[]> {
  // Return cached if fresh
  if (cachedEvents.length > 0 && Date.now() < cacheExpiry) {
    return cachedEvents.slice(0, limit);
  }

  console.log("[polymarket] Fetching prediction market data...");

  try {
    const url = `${POLYMARKET_API}?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SignalEngine/1.0)",
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(`[polymarket] API returned ${resp.status}`);
      return cachedEvents.slice(0, limit);
    }

    const data: PolymarketMarket[] = await resp.json();

    const events: PolymarketEvent[] = data
      .filter(m => m.question && m.question.length > 5)
      .map(m => {
        let probability = 0.5;
        try {
          if (m.outcomePrices) {
            const prices = JSON.parse(m.outcomePrices);
            if (Array.isArray(prices) && prices.length > 0) {
              probability = parseFloat(prices[0]) || 0.5;
            }
          }
        } catch {}

        // Clamp probability to [0, 1]
        probability = Math.max(0, Math.min(1, probability));

        const volume = m.volume24hr || 0;
        const slug = m.slug || m.id || "";

        return {
          title: m.question!,
          probability,
          volume: formatVolume(volume),
          category: extractCategory(m),
          url: `https://polymarket.com/event/${slug}`,
          slug,
        };
      });

    cachedEvents = events;
    cacheExpiry = Date.now() + CACHE_TTL;

    console.log(`[polymarket] Loaded ${events.length} prediction markets`);
    return events.slice(0, limit);
  } catch (e: any) {
    console.error("[polymarket] Error fetching markets:", e.message);
    return cachedEvents.slice(0, limit);
  }
}
