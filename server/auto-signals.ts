import { fetchQuotes, fetchOHLCV, fetchCompanyRatios } from "./market-data-provider";

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

function clamp(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function computeMomentum(priceHistory: Array<{ close: number; volume?: number }>): { score: number; data: any } {
  if (priceHistory.length < 30) return { score: 50, data: { reason: "insufficient data" } };

  const latest = priceHistory[priceHistory.length - 1].close;
  const price20d = priceHistory.length >= 20 ? priceHistory[priceHistory.length - 20].close : latest;
  const price50d = priceHistory.length >= 50 ? priceHistory[priceHistory.length - 50].close : price20d;

  const return20d = (latest / price20d) - 1;
  const return50d = (latest / price50d) - 1;

  const recentVols = priceHistory.slice(-5).map(d => d.volume || 0);
  const olderVols = priceHistory.slice(-20, -5).map(d => d.volume || 0);
  const avgRecent = recentVols.reduce((a, b) => a + b, 0) / (recentVols.length || 1);
  const avgOlder = olderVols.reduce((a, b) => a + b, 0) / (olderVols.length || 1);
  const volRatio = avgOlder > 0 ? avgRecent / avgOlder : 1;

  const combined = 0.4 * return20d + 0.4 * return50d + 0.2 * (volRatio - 1);

  let score: number;
  if (combined > 0.25) score = 90;
  else if (combined > 0.15) score = 80;
  else if (combined > 0.08) score = 70;
  else if (combined > 0.03) score = 60;
  else if (combined > -0.03) score = 50;
  else if (combined > -0.08) score = 40;
  else if (combined > -0.15) score = 30;
  else score = 20;

  return {
    score: clamp(score),
    data: {
      return20d: +(return20d * 100).toFixed(2),
      return50d: +(return50d * 100).toFixed(2),
      volRatio: +volRatio.toFixed(2),
    },
  };
}

function computeMeanReversion(
  priceHistory: Array<{ close: number }>,
  yearLow: number,
  yearHigh: number
): { score: number; data: any } {
  if (priceHistory.length < 20) return { score: 50, data: { reason: "insufficient data" } };

  const latest = priceHistory[priceHistory.length - 1].close;

  const sma50Prices = priceHistory.slice(-50);
  const sma50 = sma50Prices.reduce((sum, d) => sum + d.close, 0) / sma50Prices.length;
  const deviation = (latest - sma50) / sma50;

  const range = yearHigh - yearLow;
  const rangePosition = range > 0 ? (latest - yearLow) / range : 0.5;

  const last14 = priceHistory.slice(-15);
  let gains = 0, losses = 0;
  for (let i = 1; i < last14.length; i++) {
    const change = last14[i].close - last14[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rs = losses > 0 ? gains / losses : 10;
  const rsi = 100 - (100 / (1 + rs));

  let score: number;
  if (deviation < -0.15) score = 85;
  else if (deviation < -0.08) score = 72;
  else if (deviation < -0.03) score = 60;
  else if (deviation < 0.03) score = 50;
  else if (deviation < 0.08) score = 40;
  else if (deviation < 0.15) score = 30;
  else score = 18;

  if (rsi < 30) score = Math.min(95, score + 10);
  else if (rsi > 70) score = Math.max(10, score - 10);

  return {
    score: clamp(score),
    data: {
      sma50: +sma50.toFixed(2),
      deviation: +(deviation * 100).toFixed(2),
      rsi: +rsi.toFixed(1),
      rangePosition: +(rangePosition * 100).toFixed(1),
    },
  };
}

function computeQuality(ratios: Record<string, number>): { score: number; data: any } {
  let total = 0;

  const gm = ratios.grossMargin || 0;
  total += gm > 0.6 ? 20 : gm > 0.4 ? 16 : gm > 0.2 ? 12 : gm > 0 ? 8 : 4;

  const roe = ratios.roe || 0;
  total += roe > 0.3 ? 20 : roe > 0.15 ? 16 : roe > 0.08 ? 12 : roe > 0 ? 8 : 4;

  const fcfm = ratios.fcfMargin || 0;
  total += fcfm > 0.2 ? 20 : fcfm > 0.1 ? 16 : fcfm > 0 ? 12 : 4;

  const de = ratios.debtToEquity || 0;
  total += de < 0.3 ? 20 : de < 0.7 ? 16 : de < 1.5 ? 12 : de < 3 ? 8 : 4;

  const cr = ratios.currentRatio || 1;
  total += cr > 2.5 ? 20 : cr > 1.5 ? 16 : cr > 1 ? 12 : cr > 0.5 ? 8 : 4;

  return {
    score: clamp(total),
    data: {
      grossMargin: +(gm * 100).toFixed(1),
      roe: +(roe * 100).toFixed(1),
      fcfMargin: +(fcfm * 100).toFixed(1),
      debtToEquity: +de.toFixed(2),
      currentRatio: +cr.toFixed(2),
    },
  };
}

function computeFlow(
  volumeRatio: number,
  analystData: { buyPct: number; avgTargetUpside: number }
): { score: number; data: any } {
  let total = 0;

  const vr = volumeRatio;
  total += vr > 2 ? 30 : vr > 1.5 ? 25 : vr > 1.1 ? 18 : vr > 0.8 ? 12 : 8;

  const bp = analystData.buyPct;
  total += bp > 80 ? 35 : bp > 60 ? 28 : bp > 40 ? 18 : bp > 20 ? 10 : 5;

  const upside = analystData.avgTargetUpside;
  total += upside > 30 ? 35 : upside > 15 ? 28 : upside > 5 ? 18 : upside > 0 ? 10 : 5;

  return {
    score: clamp(total),
    data: {
      volumeRatio: +vr.toFixed(2),
      analystBuyPct: +bp.toFixed(1),
      targetUpside: +upside.toFixed(1),
    },
  };
}

function computeRisk(
  priceHistory: Array<{ close: number }>,
  yearLow: number,
  currentPrice: number
): { score: number; data: any } {
  if (priceHistory.length < 20) return { score: 50, data: { reason: "insufficient data" } };

  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    returns.push((priceHistory[i].close - priceHistory[i - 1].close) / priceHistory[i - 1].close);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252);

  let peak = priceHistory[0].close;
  let maxDD = 0;
  for (const d of priceHistory) {
    if (d.close > peak) peak = d.close;
    const dd = (peak - d.close) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const distToLow = yearLow > 0 ? (currentPrice - yearLow) / yearLow : 1;

  let score: number;
  if (annualizedVol > 0.6) score = 85;
  else if (annualizedVol > 0.45) score = 72;
  else if (annualizedVol > 0.3) score = 58;
  else if (annualizedVol > 0.2) score = 45;
  else if (annualizedVol > 0.12) score = 32;
  else score = 20;

  if (maxDD > 0.3) score = Math.min(95, score + 10);
  if (distToLow < 0.1) score = Math.min(95, score + 8);

  return {
    score: clamp(score),
    data: {
      annualizedVol: +(annualizedVol * 100).toFixed(1),
      maxDrawdown: +(maxDD * 100).toFixed(1),
      distToYearLow: +(distToLow * 100).toFixed(1),
    },
  };
}

function computeCrowding(pe: number, evEbitda: number, marketCap: number): { score: number; data: any } {
  let score = 0;

  if (pe > 60) score += 35;
  else if (pe > 40) score += 28;
  else if (pe > 25) score += 20;
  else if (pe > 15) score += 12;
  else score += 6;

  if (evEbitda > 40) score += 35;
  else if (evEbitda > 25) score += 28;
  else if (evEbitda > 15) score += 20;
  else if (evEbitda > 10) score += 12;
  else score += 6;

  const mcapB = marketCap / 1e9;
  if (mcapB > 1000) score += 30;
  else if (mcapB > 500) score += 22;
  else if (mcapB > 100) score += 15;
  else if (mcapB > 10) score += 8;
  else score += 4;

  return {
    score: clamp(score),
    data: {
      pe: +pe.toFixed(1),
      evEbitda: +evEbitda.toFixed(1),
      marketCapB: +mcapB.toFixed(1),
    },
  };
}

export async function computeAutoSignals(ticker: string): Promise<AutoSignals | null> {
  console.log(`[auto-signals] Computing signals for ${ticker}...`);

  // 1. Get price history (100 days)
  const ohlcv = await fetchOHLCV(ticker, "6mo", "1d");
  const priceHistory = ohlcv.slice(-100).map(bar => ({ close: bar.close, volume: bar.volume }));

  // 2. Get current quote
  const quotes = await fetchQuotes([ticker]);
  const quote = quotes[0];

  if (!quote) {
    console.error(`[auto-signals] No quote data for ${ticker}`);
    return null;
  }

  const currentPrice = quote.price;
  const volume = quote.volume;
  const avgVolume = quote.avgVolume || 1;
  const yearLow = quote.yearLow || currentPrice * 0.7;
  const yearHigh = quote.yearHigh || currentPrice * 1.3;
  const pe = quote.pe || 20;
  const marketCap = quote.marketCap || 0;

  // 3. Get financial ratios
  const ratios = await fetchCompanyRatios(ticker);

  // 4. Analyst data — no free API, use defaults
  const analystData = { buyPct: 50, avgTargetUpside: 10 };

  // Compute all 6 signals
  const momentum = computeMomentum(priceHistory);
  const meanReversion = computeMeanReversion(priceHistory, yearLow, yearHigh);
  const quality = computeQuality(ratios);
  const flow = computeFlow(avgVolume > 0 ? volume / avgVolume : 1, analystData);
  const risk = computeRisk(priceHistory, yearLow, currentPrice);
  const crowding = computeCrowding(pe, ratios.evEbitda, marketCap);

  console.log(
    `[auto-signals] ${ticker}: Mom=${momentum.score} MR=${meanReversion.score} Qual=${quality.score} Flow=${flow.score} Risk=${risk.score} Crowd=${crowding.score}`
  );

  return {
    momentum: momentum.score,
    meanReversion: meanReversion.score,
    quality: quality.score,
    flow: flow.score,
    risk: risk.score,
    crowding: crowding.score,
    metadata: {
      ticker,
      price: currentPrice,
      computedAt: new Date().toISOString(),
      dataPoints: {
        momentum: momentum.data,
        meanReversion: meanReversion.data,
        quality: quality.data,
        flow: flow.data,
        risk: risk.data,
        crowding: crowding.data,
      },
    },
  };
}
