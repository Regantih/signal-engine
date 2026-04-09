import { storage } from "./storage";
import { fetchMacroSnapshot } from "./macro-monitor";

export interface DigestData {
  date: string;
  buySignalCount: number;
  portfolioPnl: number;
  portfolioPnlPercent: number;
  topPicks: Array<{
    name: string;
    ticker: string | null;
    compositeScore: number;
    probabilityOfSuccess: number;
    suggestedAllocation: number;
    convictionBand: string;
  }>;
  sellSignals: Array<{
    name: string;
    ticker: string | null;
    reason: string;
  }>;
  marketRegime: string;
  summary: string;
}

export async function generateDailyDigest(): Promise<DigestData> {
  const opps = await storage.getOpportunities();
  const portfolio = await storage.getPortfolio();

  // Top 3 high conviction picks sorted by composite score
  const buys = opps
    .filter(o => o.status === "buy" || (o.convictionBand === "high" && (o.expectedEdge ?? 0) > 0.3))
    .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
    .slice(0, 3);

  const topPicks = buys.map(o => ({
    name: o.name,
    ticker: o.ticker,
    compositeScore: o.compositeScore ?? 0,
    probabilityOfSuccess: o.probabilityOfSuccess ?? 0,
    suggestedAllocation: o.suggestedAllocation ?? 0,
    convictionBand: o.convictionBand ?? "low",
  }));

  // Sell signals
  const sellOpps = opps.filter(o => o.status === "sell");
  const sellSignals = sellOpps.map(o => ({
    name: o.name,
    ticker: o.ticker,
    reason: "Score below threshold or risk triggered",
  }));

  // Market regime
  let marketRegime = "NEUTRAL";
  try {
    const macro = await fetchMacroSnapshot();
    marketRegime = macro.regime || "NEUTRAL";
  } catch {
    // Use default
  }

  const buyCount = opps.filter(o => o.status === "buy").length;
  const pnl = portfolio?.totalPnl ?? 0;
  const pnlPct = portfolio?.totalPnlPercent ?? 0;

  // Generate summary
  const summaryParts = [];
  summaryParts.push(`${buyCount} active BUY signal${buyCount !== 1 ? "s" : ""} today.`);
  if (topPicks.length > 0) {
    summaryParts.push(`Top pick: ${topPicks[0].name}${topPicks[0].ticker ? ` (${topPicks[0].ticker})` : ""} at ${(topPicks[0].probabilityOfSuccess * 100).toFixed(0)}% conviction.`);
  }
  summaryParts.push(`Market regime: ${marketRegime}.`);
  if (sellSignals.length > 0) {
    summaryParts.push(`${sellSignals.length} sell signal${sellSignals.length !== 1 ? "s" : ""} triggered.`);
  }

  return {
    date: new Date().toISOString().split("T")[0],
    buySignalCount: buyCount,
    portfolioPnl: pnl,
    portfolioPnlPercent: pnlPct,
    topPicks,
    sellSignals,
    marketRegime,
    summary: summaryParts.join(" "),
  };
}

export function formatDigestHtml(digest: DigestData): string {
  const pickRows = digest.topPicks
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td><strong>${p.name}</strong>${p.ticker ? ` (${p.ticker})` : ""}</td><td>${(p.probabilityOfSuccess * 100).toFixed(1)}%</td><td>$${p.suggestedAllocation.toFixed(2)}</td></tr>`
    )
    .join("");

  const sellRows = digest.sellSignals
    .map(s => `<li><strong>${s.name}</strong>${s.ticker ? ` (${s.ticker})` : ""} — ${s.reason}</li>`)
    .join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0ea5e9;">Signal Engine Daily — ${digest.date}</h2>
      <p style="color: #64748b;">${digest.buySignalCount} BUY signals | Market: ${digest.marketRegime}</p>

      <h3 style="color: #f8fafc; margin-top: 24px;">Portfolio Snapshot</h3>
      <p style="font-size: 24px; font-weight: bold; color: ${digest.portfolioPnl >= 0 ? "#22c55e" : "#ef4444"};">
        ${digest.portfolioPnl >= 0 ? "+" : ""}$${digest.portfolioPnl.toFixed(2)} (${digest.portfolioPnlPercent >= 0 ? "+" : ""}${digest.portfolioPnlPercent.toFixed(2)}%)
      </p>

      <h3 style="color: #f8fafc; margin-top: 24px;">Top Picks Today</h3>
      ${digest.topPicks.length > 0
        ? `<table style="width: 100%; border-collapse: collapse;">
            <tr style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">
              <th style="text-align: left; padding: 8px;">#</th>
              <th style="text-align: left; padding: 8px;">Name</th>
              <th style="text-align: right; padding: 8px;">P(Win)</th>
              <th style="text-align: right; padding: 8px;">Alloc</th>
            </tr>
            ${pickRows}
          </table>`
        : `<p style="color: #64748b;">No high-conviction picks today.</p>`
      }

      ${digest.sellSignals.length > 0 ? `
        <h3 style="color: #ef4444; margin-top: 24px;">Sell Signals</h3>
        <ul style="color: #f8fafc;">${sellRows}</ul>
      ` : ""}

      <h3 style="color: #f8fafc; margin-top: 24px;">Market Regime</h3>
      <p style="color: ${digest.marketRegime === "CRISIS" ? "#ef4444" : digest.marketRegime === "OPPORTUNITY" ? "#22c55e" : "#f59e0b"}; font-weight: bold;">
        ${digest.marketRegime}
      </p>

      <p style="color: #94a3b8; margin-top: 24px; font-style: italic;">${digest.summary}</p>

      <hr style="border-color: #334155; margin-top: 32px;" />
      <p style="color: #475569; font-size: 11px;">Signal Engine — Renaissance-Style Allocator</p>
    </div>
  `;
}

let lastDigestDate: string | null = null;

export function shouldSendDigest(): boolean {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const hour = now.getHours();

  // Send at 8am if not already sent today
  if (hour >= 8 && lastDigestDate !== today) {
    return true;
  }
  return false;
}

export async function runDigestIfNeeded(): Promise<DigestData | null> {
  if (!shouldSendDigest()) return null;

  const digest = await generateDailyDigest();
  const today = new Date().toISOString().split("T")[0];
  lastDigestDate = today;

  // Check if email is configured
  const emailSetting = await storage.getSetting("digest_email");

  if (emailSetting?.value) {
    // Log instead of actually sending (nodemailer would require SMTP setup)
    console.log(`[daily-digest] Would send digest to ${emailSetting.value}`);
    console.log(`[daily-digest] Subject: Signal Engine Daily — ${digest.date} | ${digest.buySignalCount} BUY signals`);
  }

  // Always create a notification
  await storage.createNotification({
    type: "daily_summary",
    title: `Daily Digest — ${digest.date}`,
    message: digest.summary,
    ticker: null,
    read: 0,
    createdAt: new Date().toISOString(),
  });

  // Store the digest in settings for frontend preview
  await storage.upsertSetting("last_digest", JSON.stringify(digest));

  return digest;
}
