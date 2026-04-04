import { getExecEnv } from "./credentials";
import { execSync } from "child_process";
import { parseCSVContent } from "./csv-parser";

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
// EXTERNAL DATA FETCHING
// ========================

function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
  try {
    const escaped = params.replace(/'/g, "'\\''");
    const result = execSync(`external-tool call '${escaped}'`, {
      timeout: 30000,
      encoding: "utf-8",
      env: getExecEnv() as any,
    });
    return JSON.parse(result);
  } catch (e: any) {
    console.error(`[fundamentals] Finance tool error (${toolName}):`, e.message?.slice(0, 200));
    return null;
  }
}

function safeFloat(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null || val === "" || val === "N/A" || val === "—") return null;
  const s = String(val).replace(/[,%$]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
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

  console.log(`[fundamentals] Fetching data for ${upperTicker}...`);

  // Fetch quote data
  const quoteResp = callFinanceTool("finance_quotes", {
    ticker_symbols: [upperTicker],
    fields: [
      "price", "pe", "forwardPE", "priceToBook", "priceToSales",
      "marketCap", "sharesOutstanding", "yearLow", "yearHigh",
      "dividendYield", "payoutRatio",
    ],
  });

  // Fetch financial ratios
  const ratiosResp = callFinanceTool("finance_company_ratios", {
    ticker_symbols: [upperTicker],
    ratio_ids: [
      "ratio_gross_profit_margin",
      "ratio_return_on_equity",
      "ratio_return_on_assets",
      "ratio_operating_margin",
      "ratio_profit_margin",
      "ratio_fcf_margin",
      "ratio_debt_to_equity",
      "ratio_current_ratio",
      "ratio_quick_ratio",
      "ratio_ev_to_ebitda",
      "ratio_ev_to_revenue",
      "ratio_peg_ratio",
      "ratio_revenue_growth",
      "ratio_earnings_growth",
    ],
  });

  // Fetch financials for FCF
  const financialsResp = callFinanceTool("finance_annual_financials", {
    ticker_symbols: [upperTicker],
    fields: ["freeCashFlow", "totalRevenue", "netIncome"],
  });

  // Parse quote data
  let currentPrice: number | null = null;
  let pe: number | null = null;
  let forwardPE: number | null = null;
  let pb: number | null = null;
  let ps: number | null = null;
  let marketCap: number | null = null;
  let sharesOutstanding: number | null = null;
  let dividendYield: number | null = null;
  let payoutRatio: number | null = null;

  if (quoteResp?.content) {
    const rows = parseCSVContent(quoteResp.content);
    const q = rows[0] || {};
    currentPrice = safeFloat(q.price);
    pe = safeFloat(q.pe);
    forwardPE = safeFloat(q.forwardPE);
    pb = safeFloat(q.priceToBook);
    ps = safeFloat(q.priceToSales);
    marketCap = safeFloat(q.marketCap);
    sharesOutstanding = safeFloat(q.sharesOutstanding);
    dividendYield = safeFloat(q.dividendYield);
    payoutRatio = safeFloat(q.payoutRatio);
  }

  // Parse ratios
  let roe: number | null = null;
  let roa: number | null = null;
  let grossMargin: number | null = null;
  let operatingMargin: number | null = null;
  let profitMargin: number | null = null;
  let debtToEquity: number | null = null;
  let currentRatioVal: number | null = null;
  let quickRatio: number | null = null;
  let evEbitda: number | null = null;
  let evRevenue: number | null = null;
  let pegRatio: number | null = null;
  let revenueGrowth: number | null = null;
  let earningsGrowth: number | null = null;

  if (ratiosResp?.content) {
    const ratioRows = parseCSVContent(ratiosResp.content);
    const latest = ratioRows[ratioRows.length - 1] || {};

    grossMargin = safeFloat(latest.ratio_gross_profit_margin || latest["Gross Profit Margin"]);
    roe = safeFloat(latest.ratio_return_on_equity || latest["Return on Equity"]);
    roa = safeFloat(latest.ratio_return_on_assets || latest["Return on Assets"]);
    operatingMargin = safeFloat(latest.ratio_operating_margin || latest["Operating Margin"]);
    profitMargin = safeFloat(latest.ratio_profit_margin || latest["Profit Margin"]);
    debtToEquity = safeFloat(latest.ratio_debt_to_equity || latest["Debt to Equity"]);
    currentRatioVal = safeFloat(latest.ratio_current_ratio || latest["Current Ratio"]);
    quickRatio = safeFloat(latest.ratio_quick_ratio || latest["Quick Ratio"]);
    evEbitda = safeFloat(latest.ratio_ev_to_ebitda || latest["EV/EBITDA"]);
    evRevenue = safeFloat(latest.ratio_ev_to_revenue || latest["EV/Revenue"]);
    pegRatio = safeFloat(latest.ratio_peg_ratio || latest["PEG Ratio"]);
    revenueGrowth = safeFloat(latest.ratio_revenue_growth || latest["Revenue Growth"]);
    earningsGrowth = safeFloat(latest.ratio_earnings_growth || latest["Earnings Growth"]);
  }

  // Parse financials for FCF
  let freeCashFlow: number | null = null;
  if (financialsResp?.content) {
    const finRows = parseCSVContent(financialsResp.content);
    const latestFin = finRows[finRows.length - 1] || {};
    freeCashFlow = safeFloat(latestFin.freeCashFlow || latestFin["Free Cash Flow"]);
  }

  // Calculate fair value via simple DCF
  let fairValue: number | null = null;
  let fairValueUpside: number | null = null;

  if (freeCashFlow && freeCashFlow > 0 && sharesOutstanding && sharesOutstanding > 0) {
    const growthRate = revenueGrowth !== null ? Math.min(Math.max(revenueGrowth > 1 ? revenueGrowth / 100 : revenueGrowth, 0.02), 0.30) : 0.08;
    const discountRate = 0.10;
    const terminalGrowth = 0.03;
    fairValue = calculateFairValue(freeCashFlow, growthRate, discountRate, terminalGrowth, sharesOutstanding);
    fairValue = Math.round(fairValue * 100) / 100;

    if (currentPrice && currentPrice > 0) {
      fairValueUpside = ((fairValue - currentPrice) / currentPrice) * 100;
      fairValueUpside = Math.round(fairValueUpside * 100) / 100;
    }
  }

  // Build the data object
  const partialData: Partial<FundamentalData> = {
    ticker: upperTicker,
    peRatio: pe,
    forwardPE,
    pbRatio: pb,
    psRatio: ps,
    evToEbitda: evEbitda,
    evToRevenue: evRevenue,
    pegRatio,
    returnOnEquity: roe,
    returnOnAssets: roa,
    grossMargin,
    operatingMargin,
    profitMargin,
    revenueGrowth,
    earningsGrowth,
    debtToEquity,
    currentRatio: currentRatioVal,
    quickRatio,
    freeCashFlow,
    dividendYield,
    payoutRatio,
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

  console.log(`[fundamentals] ${upperTicker}: Score=${fundamentalScore} Grade=${fundamentalGrade}`);
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

  // Fetch remaining, max 20 at a time with delays
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
