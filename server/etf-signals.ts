/**
 * ETF signal computation via Yahoo Finance (public endpoints).
 * Maps price/volume data to the 6-signal model with ETF-specific adjustments.
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

// ETF universe with metadata for quality scoring
const ETF_META: Record<string, { name: string; expenseRatio: number; category: string }> = {
  SPY:  { name: "S&P 500 ETF",         expenseRatio: 0.09, category: "broad_market" },
  QQQ:  { name: "Nasdaq-100 ETF",      expenseRatio: 0.20, category: "tech" },
  IWM:  { name: "Russell 2000 ETF",    expenseRatio: 0.19, category: "small_cap" },
  GLD:  { name: "Gold ETF",            expenseRatio: 0.40, category: "commodity" },
  TLT:  { name: "20+ Year Treasury",   expenseRatio: 0.15, category: "bonds" },
  XLK:  { name: "Technology Select",   expenseRatio: 0.09, category: "sector" },
  XLE:  { name: "Energy Select",       expenseRatio: 0.09, category: "sector" },
  ARKK: { name: "ARK Innovation",      expenseRatio: 0.75, category: "thematic" },
};

export const ETF_TICKERS = Object.keys(ETF_META);

function clamp(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

interface YahooQuote {
  regularMarketPrice?: number;
  regularMarketVolume?: number;
  averageDailyVolume10Day?: number;
  averageDailyVolume3Month?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  trailingPE?: number;
}

async function fetchYahooQuote(ticker: string): Promise<YahooQuote | null> {
  // Use Yahoo Finance v8 quote endpoint (publicly accessible)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=3mo&interval=1d&includePrePost=false`;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error(`[etf-signals] Yahoo ${ticker}: HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];

    // Filter nulls
    const validCloses = closes.filter((c: any) => c !== null && c !== undefined);
    const validVolumes = volumes.filter((v: any) => v !== null && v !== undefined);

    const currentPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1] || 0;

    // Compute 50d and 200d averages from available data
    const last50 = validCloses.slice(-50);
    const fiftyDayAvg = last50.length > 0 ? last50.reduce((a: number, b: number) => a + b, 0) / last50.length : currentPrice;

    // 52-week range from meta
    const fiftyTwoWeekLow = meta.fiftyTwoWeekLow || Math.min(...validCloses);
    const fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh || Math.max(...validCloses);

    // Volume analysis
    const recentVol = validVolumes.slice(-5);
    const olderVol = validVolumes.slice(-20, -5);
    const avgRecentVol = recentVol.length > 0 ? recentVol.reduce((a: number, b: number) => a + b, 0) / recentVol.length : 0;
    const avgOlderVol = olderVol.length > 0 ? olderVol.reduce((a: number, b: number) => a + b, 0) / olderVol.length : 1;

    // Compute returns
    const price20d = validCloses.length >= 20 ? validCloses[validCloses.length - 20] : currentPrice;
    const price50d = validCloses.length >= 50 ? validCloses[validCloses.length - 50] : price20d;
    const return20d = price20d > 0 ? (currentPrice / price20d) - 1 : 0;
    const return50d = price50d > 0 ? (currentPrice / price50d) - 1 : 0;

    // Compute daily volatility
    const dailyReturns: number[] = [];
    for (let i = 1; i < validCloses.length; i++) {
      if (validCloses[i - 1] > 0) {
        dailyReturns.push((validCloses[i] - validCloses[i - 1]) / validCloses[i - 1]);
      }
    }
    const mean = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 0 ? dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length : 0;
    const annualizedVol = Math.sqrt(variance) * Math.sqrt(252);

    // Max drawdown
    let peak = validCloses[0] || currentPrice;
    let maxDD = 0;
    for (const c of validCloses) {
      if (c > peak) peak = c;
      const dd = (peak - c) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    // RSI (14-day)
    const last15 = validCloses.slice(-15);
    let gains = 0, losses = 0;
    for (let i = 1; i < last15.length; i++) {
      const change = last15[i] - last15[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rs = losses > 0 ? gains / losses : 10;
    const rsi = 100 - (100 / (1 + rs));

    return {
      regularMarketPrice: currentPrice,
      regularMarketVolume: avgRecentVol,
      averageDailyVolume10Day: avgRecentVol,
      averageDailyVolume3Month: avgOlderVol,
      fiftyTwoWeekLow,
      fiftyTwoWeekHigh,
      fiftyDayAverage: fiftyDayAvg,
      regularMarketChangePercent: return20d * 100,
      // Stash computed data in the object for use by signal functions
      _return20d: return20d,
      _return50d: return50d,
      _annualizedVol: annualizedVol,
      _maxDD: maxDD,
      _rsi: rsi,
      _volRatio: avgOlderVol > 0 ? avgRecentVol / avgOlderVol : 1,
      _deviation: fiftyDayAvg > 0 ? (currentPrice - fiftyDayAvg) / fiftyDayAvg : 0,
      _rangePosition: (fiftyTwoWeekHigh - fiftyTwoWeekLow) > 0
        ? (currentPrice - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)
        : 0.5,
    } as any;
  } catch (e: any) {
    console.error(`[etf-signals] Yahoo fetch error (${ticker}):`, e.message?.slice(0, 200));
    return null;
  }
}

export async function computeETFSignals(ticker: string): Promise<AutoSignals | null> {
  const etfMeta = ETF_META[ticker.toUpperCase()];
  if (!etfMeta) {
    console.error(`[etf-signals] Unknown ETF ticker: ${ticker}`);
    return null;
  }

  console.log(`[etf-signals] Computing signals for ${ticker} (${etfMeta.name})...`);
  const quote = await fetchYahooQuote(ticker.toUpperCase()) as any;
  if (!quote) {
    console.error(`[etf-signals] No data for ${ticker}`);
    return null;
  }

  const currentPrice = quote.regularMarketPrice || 0;
  const return20d = quote._return20d || 0;
  const return50d = quote._return50d || 0;
  const volRatio = quote._volRatio || 1;
  const deviation = quote._deviation || 0;
  const rsi = quote._rsi || 50;
  const annualizedVol = quote._annualizedVol || 0.2;
  const maxDD = quote._maxDD || 0;
  const rangePosition = quote._rangePosition || 0.5;
  const yearLow = quote.fiftyTwoWeekLow || currentPrice * 0.8;

  // --- MOMENTUM: Same logic as equities ---
  const combined = 0.4 * return20d + 0.4 * return50d + 0.2 * (volRatio - 1);
  let momentumScore: number;
  if (combined > 0.25) momentumScore = 90;
  else if (combined > 0.15) momentumScore = 80;
  else if (combined > 0.08) momentumScore = 70;
  else if (combined > 0.03) momentumScore = 60;
  else if (combined > -0.03) momentumScore = 50;
  else if (combined > -0.08) momentumScore = 40;
  else if (combined > -0.15) momentumScore = 30;
  else momentumScore = 20;

  // --- MEAN REVERSION: deviation from 50d SMA + RSI ---
  let mrScore: number;
  if (deviation < -0.15) mrScore = 85;
  else if (deviation < -0.08) mrScore = 72;
  else if (deviation < -0.03) mrScore = 60;
  else if (deviation < 0.03) mrScore = 50;
  else if (deviation < 0.08) mrScore = 40;
  else if (deviation < 0.15) mrScore = 30;
  else mrScore = 18;

  if (rsi < 30) mrScore = Math.min(95, mrScore + 10);
  else if (rsi > 70) mrScore = Math.max(10, mrScore - 10);

  // --- QUALITY: expense ratio + AUM/category quality ---
  let qualityScore = 0;
  const er = etfMeta.expenseRatio;
  // Low expense ratio = higher quality
  if (er <= 0.10) qualityScore += 40;
  else if (er <= 0.20) qualityScore += 32;
  else if (er <= 0.40) qualityScore += 22;
  else if (er <= 0.75) qualityScore += 12;
  else qualityScore += 5;

  // Category quality bonus
  const catScores: Record<string, number> = {
    broad_market: 40, bonds: 35, commodity: 30, sector: 25, tech: 30, small_cap: 25, thematic: 15,
  };
  qualityScore += catScores[etfMeta.category] || 20;

  // Established ETFs get a bonus
  if (["SPY", "QQQ", "GLD", "TLT"].includes(ticker.toUpperCase())) qualityScore += 10;

  qualityScore = Math.min(100, qualityScore);

  // --- FLOW: volume surge ratio ---
  let flowScore: number;
  if (volRatio > 2) flowScore = 85;
  else if (volRatio > 1.5) flowScore = 70;
  else if (volRatio > 1.1) flowScore = 55;
  else if (volRatio > 0.8) flowScore = 42;
  else flowScore = 28;

  // --- RISK: annualized volatility + max drawdown ---
  let riskScore: number;
  if (annualizedVol > 0.4) riskScore = 85;
  else if (annualizedVol > 0.3) riskScore = 72;
  else if (annualizedVol > 0.2) riskScore = 58;
  else if (annualizedVol > 0.12) riskScore = 42;
  else if (annualizedVol > 0.08) riskScore = 30;
  else riskScore = 20;

  if (maxDD > 0.2) riskScore = Math.min(95, riskScore + 8);
  const distToLow = yearLow > 0 ? (currentPrice - yearLow) / yearLow : 1;
  if (distToLow < 0.1) riskScore = Math.min(95, riskScore + 6);

  // Bond and gold ETFs are lower risk
  if (["TLT", "GLD"].includes(ticker.toUpperCase())) riskScore = Math.max(15, riskScore - 10);

  // --- CROWDING: based on popularity / AUM concentration ---
  let crowdingScore: number;
  // SPY/QQQ are the most crowded ETFs on the planet
  if (["SPY"].includes(ticker.toUpperCase())) crowdingScore = 85;
  else if (["QQQ"].includes(ticker.toUpperCase())) crowdingScore = 75;
  else if (["GLD", "TLT", "IWM"].includes(ticker.toUpperCase())) crowdingScore = 55;
  else if (["XLK", "XLE"].includes(ticker.toUpperCase())) crowdingScore = 45;
  else if (["ARKK"].includes(ticker.toUpperCase())) crowdingScore = 60;
  else crowdingScore = 35;

  console.log(
    `[etf-signals] ${ticker}: Mom=${clamp(momentumScore)} MR=${clamp(mrScore)} Qual=${clamp(qualityScore)} Flow=${clamp(flowScore)} Risk=${clamp(riskScore)} Crowd=${clamp(crowdingScore)}`
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
        return20d: +(return20d * 100).toFixed(2),
        return50d: +(return50d * 100).toFixed(2),
        volRatio: +volRatio.toFixed(2),
        deviation: +(deviation * 100).toFixed(2),
        rsi: +rsi.toFixed(1),
        annualizedVol: +(annualizedVol * 100).toFixed(1),
        maxDD: +(maxDD * 100).toFixed(1),
        expenseRatio: etfMeta.expenseRatio,
        category: etfMeta.category,
        etfName: etfMeta.name,
      },
    },
  };
}
