import { storage } from "./storage";
import { fetchQuotes, fetchOHLCV, type QuoteData } from "./market-data-provider";
import { getPaperPositions } from "./paper-trading";

export interface PortfolioAnalytics {
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDate: string;
  totalReturn: number;
  annualizedReturn: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  beta: number;
  alpha: number;
  sectorExposure: { sector: string; weight: number; value: number }[];
  dailyPnL: { date: string; pnl: number; cumulative: number; benchmark: number }[];
  positionCount: number;
  cashPercent: number;
  investedPercent: number;
}

const RISK_FREE_RATE = 0.05; // 5% annualized

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function downsideDev(values: number[], target = 0): number {
  const downside = values.filter(v => v < target).map(v => (v - target) ** 2);
  if (downside.length < 2) return 0;
  return Math.sqrt(downside.reduce((s, v) => s + v, 0) / (downside.length - 1));
}

export async function computePortfolioAnalytics(): Promise<PortfolioAnalytics> {
  const portfolio = await storage.getPortfolio();
  const totalBudget = portfolio?.totalBudget || 100;
  const opps = await storage.getOpportunities();
  const paperPositions = await getPaperPositions();

  // Gather all paper orders for daily P&L reconstruction
  const allOpps = opps.filter(o => o.domain === "public_markets" && o.ticker);
  const buyOpps = allOpps.filter(o => o.status === "buy" && o.entryPrice);

  // Compute win/loss from closed paper positions
  const closedPositions = paperPositions.filter(p => p.status === "closed" && p.realizedPnl !== null);
  const wins = closedPositions.filter(p => (p.realizedPnl ?? 0) > 0);
  const losses = closedPositions.filter(p => (p.realizedPnl ?? 0) <= 0);
  const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + (p.realizedPnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + (p.realizedPnl ?? 0), 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : wins.length > 0 ? Infinity : 0;

  // Build daily returns from market data for portfolio tickers
  const tickers = [...new Set(allOpps.map(o => o.ticker!.toUpperCase()))];
  const tickerWeights: Record<string, number> = {};
  let totalInvested = 0;

  for (const opp of buyOpps) {
    const t = opp.ticker!.toUpperCase();
    const alloc = opp.suggestedAllocation || 0;
    tickerWeights[t] = (tickerWeights[t] || 0) + alloc;
    totalInvested += alloc;
  }

  // Normalize weights
  if (totalInvested > 0) {
    for (const t of Object.keys(tickerWeights)) {
      tickerWeights[t] /= totalInvested;
    }
  }

  // Fetch historical data for portfolio tickers and S&P 500 benchmark
  const dailyReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  const dailyPnL: PortfolioAnalytics["dailyPnL"] = [];

  // Get S&P 500 data for benchmark
  let spData: { date: string; close: number }[] = [];
  try {
    const spBars = await fetchOHLCV("^GSPC", "3mo", "1d");
    spData = spBars.filter(b => b.close > 0);
  } catch { /* no benchmark data */ }

  // Get portfolio price data per ticker
  const tickerPrices: Record<string, { date: string; close: number }[]> = {};
  for (const ticker of Object.keys(tickerWeights)) {
    try {
      const bars = await fetchOHLCV(ticker, "3mo", "1d");
      tickerPrices[ticker] = bars.filter(b => b.close > 0);
    } catch { /* skip */ }
  }

  // Compute daily portfolio and benchmark returns
  if (spData.length > 1) {
    const dateSet = new Set(spData.map(d => d.date));

    let cumPortfolio = 0;
    let cumBenchmark = 0;

    for (let i = 1; i < spData.length; i++) {
      const date = spData[i].date;
      const spReturn = (spData[i].close - spData[i - 1].close) / spData[i - 1].close;

      // Portfolio return: weighted average of ticker returns
      let portReturn = 0;
      let weightSum = 0;
      for (const [ticker, weight] of Object.entries(tickerWeights)) {
        const prices = tickerPrices[ticker];
        if (!prices) continue;
        const todayIdx = prices.findIndex(p => p.date === date);
        if (todayIdx > 0) {
          const ret = (prices[todayIdx].close - prices[todayIdx - 1].close) / prices[todayIdx - 1].close;
          portReturn += ret * weight;
          weightSum += weight;
        }
      }

      // If we have portfolio data, use it; otherwise use 0
      if (weightSum > 0) {
        portReturn /= weightSum;
      }

      dailyReturns.push(portReturn);
      benchmarkReturns.push(spReturn);

      cumPortfolio += portReturn * totalInvested;
      cumBenchmark += spReturn * 100; // Normalized to $100

      dailyPnL.push({
        date,
        pnl: Math.round(portReturn * totalInvested * 100) / 100,
        cumulative: Math.round(cumPortfolio * 100) / 100,
        benchmark: Math.round(cumBenchmark * 100) / 100,
      });
    }
  }

  // Sharpe Ratio
  const dailyRiskFree = RISK_FREE_RATE / 252;
  const excessReturns = dailyReturns.map(r => r - dailyRiskFree);
  const meanExcess = excessReturns.length > 0 ? excessReturns.reduce((s, v) => s + v, 0) / excessReturns.length : 0;
  const sdReturns = stdDev(dailyReturns);
  const sharpeRatio = sdReturns > 0 ? (meanExcess / sdReturns) * Math.sqrt(252) : 0;

  // Sortino Ratio
  const dd = downsideDev(excessReturns);
  const sortinoRatio = dd > 0 ? (meanExcess / dd) * Math.sqrt(252) : 0;

  // Max Drawdown
  let maxDrawdown = 0;
  let maxDrawdownDate = "";
  let peak = 0;
  let cumValue = totalBudget;
  for (const day of dailyPnL) {
    cumValue = totalBudget + day.cumulative;
    if (cumValue > peak) peak = cumValue;
    const drawdown = peak > 0 ? (peak - cumValue) / peak : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDate = day.date;
    }
  }

  // Beta and Alpha
  let beta = 0;
  let alpha = 0;
  if (dailyReturns.length > 5 && benchmarkReturns.length > 5) {
    const meanPort = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length;
    const meanBench = benchmarkReturns.reduce((s, v) => s + v, 0) / benchmarkReturns.length;
    let cov = 0;
    let varBench = 0;
    for (let i = 0; i < dailyReturns.length; i++) {
      cov += (dailyReturns[i] - meanPort) * (benchmarkReturns[i] - meanBench);
      varBench += (benchmarkReturns[i] - meanBench) ** 2;
    }
    beta = varBench > 0 ? cov / varBench : 0;
    // Alpha = annualized
    const annPortReturn = meanPort * 252;
    const annBenchReturn = meanBench * 252;
    alpha = annPortReturn - (RISK_FREE_RATE + beta * (annBenchReturn - RISK_FREE_RATE));
  }

  // Total and annualized return
  const totalReturn = totalInvested > 0
    ? (dailyPnL.length > 0 ? dailyPnL[dailyPnL.length - 1].cumulative / totalInvested : 0)
    : 0;
  const dayCount = dailyPnL.length || 1;
  const annualizedReturn = dayCount > 0 ? ((1 + totalReturn) ** (252 / dayCount) - 1) : 0;

  // Sector exposure — use simple heuristic based on ticker type
  const sectorMap: Record<string, string> = {};
  const sectorHeuristics: Record<string, string> = {
    "AAPL": "Technology", "MSFT": "Technology", "GOOGL": "Technology", "AMZN": "Consumer Cyclical",
    "META": "Technology", "NVDA": "Technology", "TSLA": "Consumer Cyclical", "JPM": "Financial",
    "BAC": "Financial", "WFC": "Financial", "JNJ": "Healthcare", "UNH": "Healthcare",
    "PFE": "Healthcare", "XOM": "Energy", "CVX": "Energy", "KO": "Consumer Defensive",
    "PEP": "Consumer Defensive", "NKE": "Consumer Cyclical", "DIS": "Communication",
    "NFLX": "Communication", "V": "Financial", "MA": "Financial", "HD": "Consumer Cyclical",
    "WMT": "Consumer Defensive", "COST": "Consumer Defensive", "CRM": "Technology",
  };

  const sectorValues: Record<string, number> = {};
  for (const [ticker, weight] of Object.entries(tickerWeights)) {
    const sector = sectorHeuristics[ticker] || "Other";
    sectorValues[sector] = (sectorValues[sector] || 0) + weight * totalInvested;
  }

  const sectorExposure = Object.entries(sectorValues).map(([sector, value]) => ({
    sector,
    weight: totalInvested > 0 ? Math.round((value / totalInvested) * 1000) / 10 : 0,
    value: Math.round(value * 100) / 100,
  })).sort((a, b) => b.value - a.value);

  const cashPercent = totalBudget > 0 ? Math.round(((totalBudget - totalInvested) / totalBudget) * 1000) / 10 : 100;
  const investedPercent = Math.round((100 - cashPercent) * 10) / 10;

  return {
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100, // as percentage
    maxDrawdownDate: maxDrawdownDate || new Date().toISOString().split("T")[0],
    totalReturn: Math.round(totalReturn * 10000) / 100,
    annualizedReturn: Math.round(annualizedReturn * 10000) / 100,
    winRate: Math.round(winRate * 10) / 10,
    profitFactor: profitFactor === Infinity ? 99.9 : Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    beta: Math.round(beta * 100) / 100,
    alpha: Math.round(alpha * 10000) / 100,
    sectorExposure,
    dailyPnL,
    positionCount: buyOpps.length,
    cashPercent,
    investedPercent,
  };
}
