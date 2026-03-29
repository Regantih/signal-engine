import { storage } from "./storage";

const BENZINGA_BASE = "https://www.benzinga.com";

// Simple sentiment heuristic from title text
function computeSentiment(title: string, body?: string | null): number {
  const text = `${title} ${body || ""}`.toLowerCase();
  const bullish = ["surge", "soar", "rally", "beat", "upgrade", "outperform", "bullish", "record", "growth", "strong", "positive", "gain", "rise", "jump", "boom", "breakout", "buy", "higher", "raises", "maintains buy", "upside", "optimistic"];
  const bearish = ["crash", "plunge", "drop", "miss", "downgrade", "underperform", "bearish", "weak", "negative", "loss", "fall", "decline", "selloff", "sell", "warning", "risk", "fear", "lower", "cuts", "concern", "slump", "sinks"];
  
  let score = 0;
  for (const word of bullish) if (text.includes(word)) score += 0.15;
  for (const word of bearish) if (text.includes(word)) score -= 0.15;
  return Math.max(-1, Math.min(1, score));
}

// Detect WIIM-style articles from title patterns
function isWiimArticle(title: string): boolean {
  const patterns = [
    /why is .+ (moving|trading|rising|falling|dropping|surging|sinking)/i,
    /what'?s going on with/i,
    /what'?s moving/i,
    /here'?s why/i,
    /shares are trading (higher|lower)/i,
  ];
  return patterns.some(p => p.test(title));
}

// Extract article links and titles from Benzinga HTML
function parseArticlesFromHtml(html: string, sourceTicker: string): Array<{
  title: string;
  url: string;
  author: string | null;
  benzingaId: string;
}> {
  const articles: Array<{ title: string; url: string; author: string | null; benzingaId: string }> = [];
  
  // Match href links to benzinga.com articles with titles
  // Pattern: <a href="https://www.benzinga.com/..." ...>TITLE</a>
  const linkRegex = /href="(https?:\/\/www\.benzinga\.com\/[^"]*?\/(\d{2}\/\d{2})\/[^"]*?)"[^>]*>([^<]{15,})<\/a>/gi;
  let match;
  const seen = new Set<string>();
  
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const title = match[3].trim().replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    
    // Skip non-article links
    if (url.includes("/author/") || url.includes("/quote/") || url.includes("/topic/") || url.includes("/pro/")) continue;
    if (title.length < 20) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    
    // Extract article ID from URL (last path segment often has numbers)
    const idMatch = url.match(/\/(\d+)\/?$/);
    const benzingaId = idMatch ? idMatch[1] : url.replace(/[^a-z0-9]/gi, "").slice(-12);
    
    articles.push({ title, url, author: null, benzingaId });
  }
  
  // Fallback: try to extract structured article data from JSON-LD or data attributes
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data["@type"] === "NewsArticle" || data["@type"] === "Article") {
        const url = data.url || data.mainEntityOfPage;
        if (url && data.headline && !seen.has(url)) {
          seen.add(url);
          articles.push({
            title: data.headline,
            url,
            author: typeof data.author === "string" ? data.author : data.author?.name || null,
            benzingaId: String(data.identifier || url.replace(/[^a-z0-9]/gi, "").slice(-12)),
          });
        }
      }
    } catch {}
  }
  
  return articles;
}

export async function fetchBenzingaNews(
  tickers?: string[],
  _pageSize: number = 30
): Promise<any[]> {
  const tickerList = tickers && tickers.length > 0 ? tickers : [];
  if (tickerList.length === 0) return [];
  
  const allArticles: any[] = [];
  const now = new Date().toISOString();
  
  for (const ticker of tickerList.slice(0, 5)) { // Limit to 5 tickers per refresh
    try {
      const url = `${BENZINGA_BASE}/quote/${ticker.toUpperCase()}/news`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      
      if (!resp.ok) {
        console.error(`Benzinga page fetch error for ${ticker}: ${resp.status}`);
        continue;
      }
      
      const html = await resp.text();
      const parsed = parseArticlesFromHtml(html, ticker);
      
      for (const article of parsed.slice(0, _pageSize)) {
        const sentiment = computeSentiment(article.title);
        const isWiim = isWiimArticle(article.title) ? 1 : 0;
        
        try {
          await storage.saveBenzingaNews({
            benzingaId: article.benzingaId,
            ticker: ticker.toUpperCase(),
            title: article.title,
            body: null,
            url: article.url,
            author: article.author,
            source: "benzinga",
            channels: isWiim ? JSON.stringify(["WIIM"]) : null,
            tags: null,
            sentiment,
            isWiim,
            publishedAt: now,
            fetchedAt: now,
          });
        } catch (e) {
          // Skip duplicate
        }
        
        allArticles.push({
          id: article.benzingaId,
          title: article.title,
          url: article.url,
          author: article.author,
          ticker: ticker.toUpperCase(),
          sentiment,
          isWiim,
        });
      }
    } catch (e: any) {
      console.error(`Benzinga fetch error for ${ticker}:`, e.message);
    }
  }
  
  return allArticles;
}

// Compute aggregate news sentiment for a ticker
export async function getNewsSentimentScore(ticker: string): Promise<{ sentimentScore: number; newsCount: number; avgSentiment: number }> {
  const news = await storage.getNewsForTicker(ticker.toUpperCase(), 20);
  if (news.length === 0) return { sentimentScore: 50, newsCount: 0, avgSentiment: 0 };
  
  const avgSentiment = news.reduce((sum, n) => sum + (n.sentiment || 0), 0) / news.length;
  const sentimentScore = Math.round(((avgSentiment + 1) / 2) * 100);
  
  return { sentimentScore, newsCount: news.length, avgSentiment };
}
