import { execSync } from "child_process";
import { fetchQuotes } from "./market-data-provider";

// ========================
// TYPES
// ========================

export interface FundamentalData {
  ticker: string;
  // Valuation
  peRatio: number | null;
  forwardPE: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  pegRatio: number | null;
  // Profitability
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  // Growth
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  // Financial Health
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  freeCashFlow: number | null;
  // Dividends
  dividendYield: number | null;
  payoutRatio: number | null;
  // Fair Value
  fairValue: number | null;
  fairValueUpside: number | null;
  // Overall
  fundamentalScore: number;
  fundamentalGrade: string;
  currentPrice: number | null;
  fetchedAt: string;
}

// ========================
// CACHE (24-hour per ticker)
// ========================

const fundamentalCache = new Map<string, { data: FundamentalData; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedFundamentals(ticker: string): FundamentalData | null {
  const cached = fundamentalCache.get(ticker.toUpperCase());
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  fundamentalCache.delete(ticker.toUpperCase());
  return null;
}

function setCachedFundamentals(ticker: string, data: FundamentalData): void {
  fundamentalCache.set(ticker.toUpperCase(), {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ========================
// STOCKANALYSIS.COM FETCHER
// ========================

function stockAnalysisFetch(url: string): any {
  try {
    const safeUrl = url.replace(/'/g, "%27");
    const result = execSync(
      `curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" '${safeUrl}'`,
      { encoding: "utf-8", timeout: 10000 },
    );
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function fetchOverview(ticker: string): any {
  const url = `https://stockanalysis.com/api/symbol/s/${ticker}/overview`;
  return stockAnalysisFetch(url);
}

function fetchFinancials(ticker: string): any {
  const url = `https://stockanalysis.com/api/symbol/s/${ticker}/financials?p=annual`;
  return stockAnalysisFetch(url);
}

// ========================
// PARSE HELPERS
// ========================

function safeFloat(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null || val === "" || val === "N/A" || val === "—") return null;
  const s = String(val).replace(/[,%$]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseMarketCap(str: string | undefined | null): number | null {
  if (!str) return null;
  const s = String(str).trim();
  const match = s.match(/^([\d.]+)\s*([TBMK]?)$/i);
  if (!match) return safeFloat(s);
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2].toUpperCase();
  if (suffix === "T") return num * 1e12;
  if (suffix === "B") return num * 1e9;
  if (suffix === "M") return num * 1e6;
  if (suffix === "K") return num * 1e3;
  return num;
}

function parseDividendYield(str: string | undefined | null): number | null {
  if (!str) return null;
  // Format: "$1.04 (0.41%)" — extract the percentage
  const match = String(str).match(/\(([\d.]+)%\)/);
  if (match) return parseFloat(match[1]);
  return null;
}

function parseAnalystTarget(str: string | undefined | null): number | null {
  if (!str) return null;
  // Format: "$298.94" or "298.94 (+16.81%)"
  const match = String(str).match(/\$?([\d,.]+)/);
  if (match) return parseFloat(match[1].replace(/,/g, ""));
  return null;
}

function parseMoneyStr(str: string | undefined | null): number | null {
  if (!str) return null;
  const s = String(str).trim();
  const match = s.match(/^-?([\d.]+)\s*([TBMK]?)$/i);
  if (!match) return safeFloat(s);
  const sign = s.startsWith("-") ? -1 : 1;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2].toUpperCase();
  if (suffix === "T") return sign * num * 1e12;
  if (suffix === "B") return sign * num * 1e9;
  if (suffix === "M") return sign * num * 1e6;
  if (suffix === "K") return sign * num * 1e3;
  return sign * num;
}

// ========================
// FAIR VALUE (Simple DCF)
// ========================

export function calculateFairValue(
  fcf: number,
  growthRate: number,
  discountRate: number,
  terminalGrowth: number,
  sharesOutstanding: number
): number {
  if (sharesOutstanding <= 0 || fcf <= 0) return 0;

  let totalPV = 0;
  let projectedFCF = fcf;

  // 10-year projection
  for (let year = 1; year <= 10; year++) {
    projectedFCF *= 1 + growthRate;
    totalPV += projectedFCF / Math.pow(1 + discountRate, year);
  }

  // Terminal value (Gordon Growth Model)
  const terminalFCF = projectedFCF * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (discountRate - terminalGrowth);
  totalPV += terminalValue / Math.pow(1 + discountRate, 10);

  return totalPV / sharesOutstanding;
}

// ========================
// FUNDAMENTAL SCORE (0-100)
// ========================

export function computeFundamentalScore(data: Partial<FundamentalData>): number {
  let score = 0;
  let totalWeight = 0;

  // Valuation (30% weight)
  const valuationWeight = 30;
  let valuationScore = 0;
  let valuationParts = 0;

  const pe = data.peRatio;
  if (pe !== null && pe !== undefined && pe > 0) {
    if (pe < 12) valuationScore += 90;
    else if (pe < 18) valuationScore += 75;
    else if (pe < 25) valuationScore += 60;
    else if (pe < 35) valuationScore += 45;
    else if (pe < 50) valuationScore += 30;
    else valuationScore += 15;
    valuationParts++;
  }

  const pb = data.pbRatio;
  if (pb !== null && pb !== undefined && pb > 0) {
    if (pb < 1.5) valuationScore += 85;
    else if (pb < 3) valuationScore += 70;
    else if (pb < 5) valuationScore += 55;
    else if (pb < 10) valuationScore += 35;
    else valuationScore += 15;
    valuationParts++;
  }

  const evEbitda = data.evToEbitda;
  if (evEbitda !== null && evEbitda !== undefined && evEbitda > 0) {
    if (evEbitda < 8) valuationScore += 90;
    else if (evEbitda < 12) valuationScore += 75;
    else if (evEbitda < 18) valuationScore += 60;
    else if (evEbitda < 25) valuationScore += 40;
    else valuationScore += 20;
    valuationParts++;
  }

  if (valuationParts > 0) {
    score += (valuationScore / valuationParts) * (valuationWeight / 100);
    totalWeight += valuationWeight;
  }

  // Profitability (25% weight)
  const profitWeight = 25;
  let profitScore = 0;
  let profitParts = 0;

  const roe = data.returnOnEquity;
  if (roe !== null && roe !== undefined) {
    const roePct = Math.abs(roe) > 1 ? roe : roe * 100;
    if (roePct > 25) profitScore += 90;
    else if (roePct > 15) profitScore += 75;
    else if (roePct > 8) profitScore += 55;
    else if (roePct > 0) profitScore += 35;
    else profitScore += 10;
    profitParts++;
  }

  const gm = data.grossMargin;
  if (gm !== null && gm !== undefined) {
    const gmPct = Math.abs(gm) > 1 ? gm : gm * 100;
    if (gmPct > 60) profitScore += 90;
    else if (gmPct > 40) profitScore += 70;
    else if (gmPct > 20) profitScore += 50;
    else if (gmPct > 0) profitScore += 30;
    else profitScore += 10;
    profitParts++;
  }

  const pm = data.profitMargin;
  if (pm !== null && pm !== undefined) {
    const pmPct = Math.abs(pm) > 1 ? pm : pm * 100;
    if (pmPct > 25) profitScore += 90;
    else if (pmPct > 15) profitScore += 70;
    else if (pmPct > 5) profitScore += 50;
    else if (pmPct > 0) profitScore += 30;
    else profitScore += 10;
    profitParts++;
  }

  if (profitParts > 0) {
    score += (profitScore / profitParts) * (profitWeight / 100);
    totalWeight += profitWeight;
  }

  // Growth (20% weight)
  const growthWeight = 20;
  let growthScore = 0;
  let growthParts = 0;

  const revGrowth = data.revenueGrowth;
  if (revGrowth !== null && revGrowth !== undefined) {
    const rg = Math.abs(revGrowth) > 1 ? revGrowth : revGrowth * 100;
    if (rg > 30) growthScore += 90;
    else if (rg > 15) growthScore += 75;
    else if (rg > 5) growthScore += 55;
    else if (rg > 0) growthScore += 35;
    else growthScore += 15;
    growthParts++;
  }

  const earningsGrowth = data.earningsGrowth;
  if (earningsGrowth !== null && earningsGrowth !== undefined) {
    const eg = Math.abs(earningsGrowth) > 1 ? earningsGrowth : earningsGrowth * 100;
    if (eg > 30) growthScore += 90;
    else if (eg > 15) growthScore += 75;
    else if (eg > 5) growthScore += 55;
    else if (eg > 0) growthScore += 35;
    else growthScore += 15;
    growthParts++;
  }

  if (growthParts > 0) {
    score += (growthScore / growthParts) * (growthWeight / 100);
    totalWeight += growthWeight;
  }

  // Financial Health (15% weight)
  const healthWeight = 15;
  let healthScore = 0;
  let healthParts = 0;

  const de = data.debtToEquity;
  if (de !== null && de !== undefined) {
    if (de < 0.3) healthScore += 90;
    else if (de < 0.7) healthScore += 75;
    else if (de < 1.5) healthScore += 55;
    else if (de < 3) healthScore += 35;
    else healthScore += 15;
    healthParts++;
  }

  const cr = data.currentRatio;
  if (cr !== null && cr !== undefined) {
    if (cr > 2.5) healthScore += 90;
    else if (cr > 1.5) healthScore += 70;
    else if (cr > 1.0) healthScore += 50;
    else if (cr > 0.5) healthScore += 30;
    else healthScore += 10;
    healthParts++;
  }

  if (healthParts > 0) {
    score += (healthScore / healthParts) * (healthWeight / 100);
    totalWeight += healthWeight;
  }

  // Fair Value (10% weight)
  const fvWeight = 10;
  const upside = data.fairValueUpside;
  if (upside !== null && upside !== undefined) {
    let fvScore: number;
    if (upside > 50) fvScore = 95;
    else if (upside > 25) fvScore = 80;
    else if (upside > 10) fvScore = 65;
    else if (upside > 0) fvScore = 50;
    else if (upside > -15) fvScore = 35;
    else fvScore = 15;
    score += fvScore * (fvWeight / 100);
    totalWeight += fvWeight;
  }

  // Normalize if we didn't get all categories
  if (totalWeight > 0 && totalWeight < 100) {
    score = (score / totalWeight) * 100;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function gradeFromScore(score: number): string {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// ========================
// MAIN FETCH FUNCTION
// ========================

export async function fetchFundamentals(ticker: string): Promise<FundamentalData> {
  const upperTicker = ticker.toUpperCase();

  // Check cache first
  const cached = getCachedFundamentals(upperTicker);
  if (cached) {
    console.log(`[fundamentals] Cache hit for ${upperTicker}`);
    return cached;
  }

  console.log(`[fundamentals] Fetching data for ${upperTicker} from stockanalysis.com...`);

  // Fetch overview data from stockanalysis.com
  const overview = fetchOverview(upperTicker);
  const d = overview?.data || {};

  // Fetch financials for additional ratios
  const financials = fetchFinancials(upperTicker);
  const finData = financials?.data || {};

  // Get current price from Yahoo (more reliable for live price)
  const quotes = await fetchQuotes([upperTicker]);
  const currentPrice = quotes[0]?.price || null;

  // Parse overview fields
  const pe = safeFloat(d.peRatio);
  const forwardPE = safeFloat(d.forwardPE);
  const beta = safeFloat(d.beta);
  const marketCap = parseMarketCap(d.marketCap);
  const revenue = parseMoneyStr(d.revenue);
  const netIncome = parseMoneyStr(d.netIncome);
  const eps = safeFloat(d.eps);
  const dividendYield = parseDividendYield(d.dividend);

  // Parse analyst target as fair value proxy
  const analystTargetPrice = parseAnalystTarget(d.analystTarget?.target || d.target);

  // Growth from financialChart (latest year)
  let revenueGrowth: number | null = null;
  let earningsGrowth: number | null = null;
  if (Array.isArray(d.financialChart) && d.financialChart.length > 0) {
    const latest = d.financialChart[d.financialChart.length - 1];
    revenueGrowth = safeFloat(latest.revenueGrowth);
    earningsGrowth = safeFloat(latest.earningsGrowth);
  }

  // Compute profit margin from available data
  let profitMargin: number | null = null;
  if (revenue && revenue > 0 && netIncome !== null) {
    profitMargin = (netIncome / revenue) * 100;
  }

  // Fair value: use analyst target price as proxy
  let fairValue: number | null = analystTargetPrice;
  let fairValueUpside: number | null = null;
  if (fairValue && currentPrice && currentPrice > 0) {
    fairValueUpside = ((fairValue - currentPrice) / currentPrice) * 100;
    fairValueUpside = Math.round(fairValueUpside * 100) / 100;
  }

  // Try to extract additional ratios from financials endpoint
  let grossMargin: number | null = null;
  let operatingMargin: number | null = null;
  let returnOnEquity: number | null = null;
  let returnOnAssets: number | null = null;
  let debtToEquity: number | null = null;
  let currentRatioVal: number | null = null;
  let quickRatio: number | null = null;
  let freeCashFlow: number | null = null;
  let evEbitda: number | null = null;
  let evRevenue: number | null = null;
  let pegRatio: number | null = null;
  let pbRatio: number | null = null;
  let psRatio: number | null = null;
  let payoutRatio: number | null = null;

  // financials endpoint sometimes returns array data — extract latest row
  if (finData && Array.isArray(finData.data)) {
    const rows = finData.data;
    if (rows.length > 0) {
      const latest = rows[0]; // most recent year is typically first
      grossMargin = safeFloat(latest.grossMargin);
      operatingMargin = safeFloat(latest.operatingMargin);
      freeCashFlow = safeFloat(latest.fcf || latest.freeCashFlow);
    }
  }

  // Build the data object
  const partialData: Partial<FundamentalData> = {
    ticker: upperTicker,
    peRatio: pe,
    forwardPE,
    pbRatio: pbRatio,
    psRatio: psRatio,
    evToEbitda: evEbitda,
    evToRevenue: evRevenue,
    pegRatio,
    returnOnEquity: returnOnEquity,
    returnOnAssets: returnOnAssets,
    grossMargin: grossMargin,
    operatingMargin: operatingMargin,
    profitMargin,
    revenueGrowth,
    earningsGrowth,
    debtToEquity: debtToEquity,
    currentRatio: currentRatioVal,
    quickRatio: quickRatio,
    freeCashFlow: freeCashFlow,
    dividendYield,
    payoutRatio: payoutRatio,
    fairValue,
    fairValueUpside,
    currentPrice,
  };

  const fundamentalScore = computeFundamentalScore(partialData);
  const fundamentalGrade = gradeFromScore(fundamentalScore);

  const result: FundamentalData = {
    ...(partialData as FundamentalData),
    fundamentalScore,
    fundamentalGrade,
    fetchedAt: new Date().toISOString(),
  };

  // Cache the result
  setCachedFundamentals(upperTicker, result);

  console.log(`[fundamentals] ${upperTicker}: Score=${fundamentalScore} Grade=${fundamentalGrade} (P/E=${pe}, FwdPE=${forwardPE}, ProfitMargin=${profitMargin?.toFixed(1)}%, RevGrowth=${revenueGrowth}, FairValue=${fairValue})`);
  return result;
}

// ========================
// BATCH FETCH (rate-limited)
// ========================

export async function fetchFundamentalsBatch(tickers: string[]): Promise<Map<string, FundamentalData>> {
  const results = new Map<string, FundamentalData>();
  const toFetch: string[] = [];

  // Check cache first
  for (const ticker of tickers) {
    const cached = getCachedFundamentals(ticker);
    if (cached) {
      results.set(ticker.toUpperCase(), cached);
    } else {
      toFetch.push(ticker);
    }
  }

  // Fetch remaining with delays
  for (let i = 0; i < toFetch.length; i++) {
    try {
      const data = await fetchFundamentals(toFetch[i]);
      results.set(toFetch[i].toUpperCase(), data);
    } catch (e: any) {
      console.error(`[fundamentals] Failed to fetch ${toFetch[i]}:`, e.message);
    }
    // Small delay between fetches to avoid rate limiting
    if (i < toFetch.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
