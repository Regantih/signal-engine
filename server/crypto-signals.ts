/**
 * Crypto signal computation via CoinGecko free API (no key required).
 * Maps CoinGecko market data to the 6-signal model.
 */

interface AutoSignals {
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
  metadata: {
    ticker: string;
    price: number;
    computedAt: string;
    dataPoints: Record<string, any>;
  };
}

// CoinGecko coin ID mapping
const COIN_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  DOGE: "dogecoin",
  XRP: "ripple",
  AVAX: "avalanche-2",
};

export const CRYPTO_TICKERS = Object.keys(COIN_MAP);

function clamp(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function fetchCoinGecko(coinId: string): Promise<any | null> {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error(`[crypto-signals] CoinGecko ${coinId}: HTTP ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch (e: any) {
    console.error(`[crypto-signals] CoinGecko fetch error (${coinId}):`, e.message?.slice(0, 200));
    return null;
  }
}

export async function computeCryptoSignals(ticker: string): Promise<AutoSignals | null> {
  const coinId = COIN_MAP[ticker.toUpperCase()];
  if (!coinId) {
    console.error(`[crypto-signals] Unknown ticker: ${ticker}`);
    return null;
  }

  console.log(`[crypto-signals] Computing signals for ${ticker} (${coinId})...`);
  const data = await fetchCoinGecko(coinId);
  if (!data?.market_data) {
    console.error(`[crypto-signals] No market data for ${ticker}`);
    return null;
  }

  const md = data.market_data;
  const currentPrice = md.current_price?.usd || 0;
  const change24h = md.price_change_percentage_24h || 0;
  const change7d = md.price_change_percentage_7d || 0;
  const change30d = md.price_change_percentage_30d || 0;
  const marketCapRank = data.market_cap_rank || 999;
  const totalVolume = md.total_volume?.usd || 0;
  const marketCap = md.market_cap?.usd || 0;
  const ath = md.ath?.usd || currentPrice;
  const atl = md.atl?.usd || currentPrice;
  const high24h = md.high_24h?.usd || currentPrice;
  const low24h = md.low_24h?.usd || currentPrice;
  const athChangePercent = md.ath_change_percentage?.usd || 0;
  const mcapChange24h = md.market_cap_change_percentage_24h || 0;

  // --- MOMENTUM: 7d price change ---
  let momentumScore: number;
  if (change7d > 20) momentumScore = 90;
  else if (change7d > 12) momentumScore = 80;
  else if (change7d > 5) momentumScore = 70;
  else if (change7d > 1) momentumScore = 60;
  else if (change7d > -2) momentumScore = 50;
  else if (change7d > -8) momentumScore = 40;
  else if (change7d > -15) momentumScore = 30;
  else momentumScore = 20;

  // Boost/penalize with 24h trend
  if (change24h > 5) momentumScore = Math.min(95, momentumScore + 5);
  else if (change24h < -5) momentumScore = Math.max(10, momentumScore - 5);

  // --- MEAN REVERSION: price vs 30d average ---
  // If price is significantly below 30d avg => oversold => high MR signal
  // We approximate 30d avg using 30d change: if -20% from 30d ago, price is well below avg
  let mrScore: number;
  if (change30d < -25) mrScore = 90;
  else if (change30d < -15) mrScore = 78;
  else if (change30d < -8) mrScore = 65;
  else if (change30d < -2) mrScore = 55;
  else if (change30d < 5) mrScore = 45;
  else if (change30d < 15) mrScore = 35;
  else if (change30d < 30) mrScore = 25;
  else mrScore = 15;

  // ATH distance adjustment — far from ATH = more MR potential
  if (athChangePercent < -70) mrScore = Math.min(95, mrScore + 8);
  else if (athChangePercent < -50) mrScore = Math.min(95, mrScore + 4);

  // --- QUALITY: market cap rank (top 10 = high quality) ---
  let qualityScore: number;
  if (marketCapRank <= 3) qualityScore = 90;
  else if (marketCapRank <= 5) qualityScore = 80;
  else if (marketCapRank <= 10) qualityScore = 70;
  else if (marketCapRank <= 20) qualityScore = 55;
  else if (marketCapRank <= 50) qualityScore = 40;
  else qualityScore = 25;

  // Longevity bonus for established coins
  if (["BTC", "ETH"].includes(ticker.toUpperCase())) qualityScore = Math.min(95, qualityScore + 5);

  // --- FLOW: 24h volume relative to market cap (volume/mcap ratio) ---
  const volMcapRatio = marketCap > 0 ? totalVolume / marketCap : 0;
  let flowScore: number;
  if (volMcapRatio > 0.3) flowScore = 90;
  else if (volMcapRatio > 0.15) flowScore = 75;
  else if (volMcapRatio > 0.08) flowScore = 60;
  else if (volMcapRatio > 0.04) flowScore = 50;
  else if (volMcapRatio > 0.02) flowScore = 40;
  else flowScore = 25;

  // Market cap change confirms flow
  if (mcapChange24h > 5) flowScore = Math.min(95, flowScore + 5);
  else if (mcapChange24h < -5) flowScore = Math.max(10, flowScore - 5);

  // --- RISK: volatility proxy from 24h range and 30d change ---
  const dayRange = currentPrice > 0 ? (high24h - low24h) / currentPrice : 0;
  const vol30d = Math.abs(change30d) / 100; // rough volatility proxy
  let riskScore: number;
  if (dayRange > 0.1 || vol30d > 0.4) riskScore = 90;
  else if (dayRange > 0.06 || vol30d > 0.25) riskScore = 75;
  else if (dayRange > 0.04 || vol30d > 0.15) riskScore = 60;
  else if (dayRange > 0.02 || vol30d > 0.08) riskScore = 45;
  else riskScore = 30;

  // Crypto is inherently volatile — floor at 40
  riskScore = Math.max(40, riskScore);

  // --- CROWDING: BTC dominance proxy + market cap concentration ---
  let crowdingScore: number;
  const mcapB = marketCap / 1e9;
  if (mcapB > 500) crowdingScore = 80;
  else if (mcapB > 100) crowdingScore = 65;
  else if (mcapB > 20) crowdingScore = 50;
  else if (mcapB > 5) crowdingScore = 35;
  else crowdingScore = 20;

  // Meme coins get crowding boost
  if (["DOGE"].includes(ticker.toUpperCase())) crowdingScore = Math.min(90, crowdingScore + 15);

  console.log(
    `[crypto-signals] ${ticker}: Mom=${clamp(momentumScore)} MR=${clamp(mrScore)} Qual=${clamp(qualityScore)} Flow=${clamp(flowScore)} Risk=${clamp(riskScore)} Crowd=${clamp(crowdingScore)}`
  );

  return {
    momentum: clamp(momentumScore),
    meanReversion: clamp(mrScore),
    quality: clamp(qualityScore),
    flow: clamp(flowScore),
    risk: clamp(riskScore),
    crowding: clamp(crowdingScore),
    metadata: {
      ticker: ticker.toUpperCase(),
      price: currentPrice,
      computedAt: new Date().toISOString(),
      dataPoints: {
        change24h,
        change7d,
        change30d,
        marketCapRank,
        marketCapB: +(mcapB).toFixed(2),
        volume24hM: +(totalVolume / 1e6).toFixed(2),
        volMcapRatio: +volMcapRatio.toFixed(4),
        athChangePercent: +athChangePercent.toFixed(1),
        dayRange: +(dayRange * 100).toFixed(2),
      },
    },
  };
}
