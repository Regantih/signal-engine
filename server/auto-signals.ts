import { getExecEnv } from "./credentials";
import { execSync } from "child_process";

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

function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
  try {
    // Escape single quotes in JSON for shell
    const escaped = params.replace(/'/g, "'\\''");
    const result = execSync(`external-tool call '${escaped}'`, {
      timeout: 30000,
      encoding: "utf-8",
      env: getExecEnv() as any,
    });
    return JSON.parse(result);
  } catch (e: any) {
    console.error(`Finance tool error (${toolName}):`, e.message?.slice(0, 200));
    return null;
  }
}

function clamp(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

import { parseCSVContent } from "./csv-parser";

function computeMomentum(priceHistory: Array<{ close: number; volume?: number }>): { score: number; data: any } {
  if (priceHistory.length < 30) return { score: 50, data: { reason: "insufficient data" } };

  const latest = priceHistory[priceHistory.length - 1].close;
  const price20d = priceHistory.length >= 20 ? priceHistory[priceHistory.length - 20].close : latest;
  const price50d = priceHistory.length >= 50 ? priceHistory[priceHistory.length - 50].close : price20d;

  const return20d = (latest / price20d) - 1;
  const return50d = (latest / price50d) - 1;

  // Volume trend
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

  // 50-day SMA
  const sma50Prices = priceHistory.slice(-50);
  const sma50 = sma50Prices.reduce((sum, d) => sum + d.close, 0) / sma50Prices.length;
  const deviation = (latest - sma50) / sma50;

  // Position in 52-week range
  const range = yearHigh - yearLow;
  const rangePosition = range > 0 ? (latest - yearLow) / range : 0.5;

  // RSI-like computation
  const last14 = priceHistory.slice(-15);
  let gains = 0, losses = 0;
  for (let i = 1; i < last14.length; i++) {
    const change = last14[i].close - last14[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rs = losses > 0 ? gains / losses : 10;
  const rsi = 100 - (100 / (1 + rs));

  // Mean reversion: HIGH score = oversold (buying opportunity)
  // LOW score = overbought (extended)
  let score: number;
  if (deviation < -0.15) score = 85;
  else if (deviation < -0.08) score = 72;
  else if (deviation < -0.03) score = 60;
  else if (deviation < 0.03) score = 50;
  else if (deviation < 0.08) score = 40;
  else if (deviation < 0.15) score = 30;
  else score = 18;

  // RSI adjustment
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

  // Volume surge
  const vr = volumeRatio;
  total += vr > 2 ? 30 : vr > 1.5 ? 25 : vr > 1.1 ? 18 : vr > 0.8 ? 12 : 8;

  // Analyst buy %
  const bp = analystData.buyPct;
  total += bp > 80 ? 35 : bp > 60 ? 28 : bp > 40 ? 18 : bp > 20 ? 10 : 5;

  // Price target upside
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

  // Daily returns
  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    returns.push((priceHistory[i].close - priceHistory[i - 1].close) / priceHistory[i - 1].close);
  }

  // Annualized volatility
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252);

  // Max drawdown
  let peak = priceHistory[0].close;
  let maxDD = 0;
  for (const d of priceHistory) {
    if (d.close > peak) peak = d.close;
    const dd = (peak - d.close) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Distance to year low
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

  // P/E premium
  if (pe > 60) score += 35;
  else if (pe > 40) score += 28;
  else if (pe > 25) score += 20;
  else if (pe > 15) score += 12;
  else score += 6;

  // EV/EBITDA
  if (evEbitda > 40) score += 35;
  else if (evEbitda > 25) score += 28;
  else if (evEbitda > 15) score += 20;
  else if (evEbitda > 10) score += 12;
  else score += 6;

  // Mega-cap premium (everyone piles in)
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

export function computeAutoSignals(ticker: string): AutoSignals | null {
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const startDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  console.log(`[auto-signals] Computing signals for ${ticker}...`);

  // 1. Get price history (90+ days)
  const historyResp = callFinanceTool("finance_ohlcv_histories", {
    ticker_symbols: [ticker],
    start_date_yyyy_mm_dd: startDate,
    end_date_yyyy_mm_dd: endDate,
    fields: ["close", "volume"],
  });

  // 2. Get current quote
  const quoteResp = callFinanceTool("finance_quotes", {
    ticker_symbols: [ticker],
    fields: ["price", "volume", "avgVolume", "yearLow", "yearHigh", "pe", "marketCap"],
  });

  // 3. Get financial ratios
  const ratiosResp = callFinanceTool("finance_company_ratios", {
    ticker_symbols: [ticker],
    ratio_ids: [
      "ratio_gross_profit_margin",
      "ratio_return_on_equity",
      "ratio_fcf_margin",
      "ratio_debt_to_equity",
      "ratio_current_ratio",
      "ratio_ev_to_ebitda",
    ],
  });

  // 4. Get analyst research
  const analystResp = callFinanceTool("finance_analyst_research", {
    ticker_symbols: [ticker],
    limit: 30,
  });

  if (!quoteResp?.content) {
    console.error(`[auto-signals] No quote data for ${ticker}`);
    return null;
  }

  // Parse quote data from markdown table
  const quoteRows = parseCSVContent(quoteResp.content);
  const quote = quoteRows[0] || {};
  const currentPrice = parseFloat(quote.price) || 0;
  const volume = parseInt((quote.volume || "0").replace(/,/g, ""));
  const avgVolume = parseInt((quote.avgVolume || "1").replace(/,/g, "")) || 1;
  const yearLow = parseFloat(quote.yearLow) || currentPrice * 0.7;
  const yearHigh = parseFloat(quote.yearHigh) || currentPrice * 1.3;
  const pe = parseFloat(quote.pe) || 20;
  const marketCap = parseFloat((quote.marketCap || "0").replace(/,/g, "")) || 0;

  // Parse price history
  let priceHistory: Array<{ close: number; volume?: number }> = [];

  if (historyResp?.content) {
    const histContent = historyResp.content;
    const histRows = parseCSVContent(histContent);
    if (histRows.length > 0) {
      priceHistory = histRows
        .map(r => ({
          close: parseFloat(r.close || r.Close || "0") || 0,
          volume: parseInt((r.volume || r.Volume || "0").replace(/,/g, "")) || 0,
        }))
        .filter(d => d.close > 0);
    }

    // Fallback: try to extract date,price pairs from content text
    if (priceHistory.length === 0) {
      const lines = histContent.split("\n");
      for (const line of lines) {
        const match = line.match(/(\d{4}-\d{2}-\d{2})[,|]\s*([\d.]+)/);
        if (match) {
          priceHistory.push({ close: parseFloat(match[2]) });
        }
      }
    }
  }

  // Parse ratios
  let ratios = {
    grossMargin: 0.5,
    roe: 0.15,
    fcfMargin: 0.1,
    debtToEquity: 0.5,
    currentRatio: 1.5,
    evEbitda: 20,
  };

  if (ratiosResp?.content) {
    const ratioRows = parseCSVContent(ratiosResp.content);
    // Get most recent row (last one)
    const latest = ratioRows[ratioRows.length - 1] || {};

    // Try both snake_case keys and any format
    const gm = parseFloat(latest.ratio_gross_profit_margin || latest["Gross Profit Margin"] || "");
    const roe = parseFloat(latest.ratio_return_on_equity || latest["Return on Equity"] || "");
    const fcf = parseFloat(latest.ratio_fcf_margin || latest["FCF Margin"] || "");
    const de = parseFloat(latest.ratio_debt_to_equity || latest["Debt to Equity"] || "");
    const cr = parseFloat(latest.ratio_current_ratio || latest["Current Ratio"] || "");
    const ev = parseFloat(latest.ratio_ev_to_ebitda || latest["EV/EBITDA"] || "");

    if (!isNaN(gm)) ratios.grossMargin = gm > 1 ? gm / 100 : gm;
    if (!isNaN(roe)) ratios.roe = roe > 1 ? roe / 100 : roe;
    if (!isNaN(fcf)) ratios.fcfMargin = fcf > 1 ? fcf / 100 : fcf;
    if (!isNaN(de)) ratios.debtToEquity = de;
    if (!isNaN(cr)) ratios.currentRatio = cr;
    if (!isNaN(ev)) ratios.evEbitda = ev;
  }

  // Parse analyst data
  let analystData = { buyPct: 50, avgTargetUpside: 10 };

  if (analystResp?.content) {
    const content = analystResp.content;
    const analystRows = parseCSVContent(content);

    if (analystRows.length > 0) {
      let buyCount = 0, totalCount = 0;
      let targetSum = 0, targetCount = 0;

      for (const row of analystRows) {
        const rating = (
          row.rating_current ||
          row.current_rating ||
          row.rating ||
          row.Rating ||
          ""
        ).toLowerCase();

        if (rating) {
          totalCount++;
          if (
            rating.includes("buy") ||
            rating.includes("outperform") ||
            rating.includes("overweight") ||
            rating.includes("strong")
          ) {
            buyCount++;
          }
        }

        const target = parseFloat(
          (row.adj_price_target || row.price_target || row["Price Target"] || "0").replace(/,/g, "")
        );
        if (target > 0) {
          targetSum += target;
          targetCount++;
        }
      }

      if (totalCount > 0) analystData.buyPct = (buyCount / totalCount) * 100;
      if (targetCount > 0 && currentPrice > 0) {
        const avgTarget = targetSum / targetCount;
        analystData.avgTargetUpside = ((avgTarget - currentPrice) / currentPrice) * 100;
      }
    } else {
      // Try to extract from raw text
      const buyMatch = content.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:buy|strong.?buy|bullish)/i);
      const targetMatch =
        content.match(/average.*?target.*?\$?([\d,.]+)/i) ||
        content.match(/consensus.*?price.*?\$?([\d,.]+)/i);

      if (buyMatch) analystData.buyPct = parseFloat(buyMatch[1]);
      if (targetMatch) {
        const avgTarget = parseFloat(targetMatch[1].replace(/,/g, ""));
        if (avgTarget > 0 && currentPrice > 0) {
          analystData.avgTargetUpside = ((avgTarget - currentPrice) / currentPrice) * 100;
        }
      }
    }
  }

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
