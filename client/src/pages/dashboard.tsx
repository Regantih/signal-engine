import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { KpiCard } from "@/components/kpi-card";
import { ConvictionBadge, ActionBadge } from "@/components/conviction-badge";
import { SignalBar } from "@/components/signal-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { SIGNAL_DESCRIPTIONS } from "@/lib/scoring";
import {
  Target,
  DollarSign,
  TrendingUp,
  Activity,
  BarChart3,
  Wallet,
  Webhook,
  Copy,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useRealtime } from "@/hooks/use-realtime";

interface Stats {
  totalOpportunities: number;
  totalPredictions: number;
  byDomain: Record<string, number>;
  byConviction: Record<string, number>;
  byStatus: Record<string, number>;
  avgCompositeScore: number;
  totalAllocated: number;
  portfolio: {
    totalBudget: number;
    cashRemaining: number;
    totalPnl: number;
    totalPnlPercent: number;
    winRate: number;
    totalTrades: number;
  };
}

interface Opportunity {
  id: number;
  name: string;
  ticker: string | null;
  domain: string;
  compositeScore: number | null;
  probabilityOfSuccess: number | null;
  expectedEdge: number | null;
  convictionBand: string | null;
  suggestedAllocation: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  status: string;
  thesis: string | null;
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
}

interface FundamentalData {
  ticker: string;
  fundamentalScore: number;
  fundamentalGrade: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  B: "bg-teal-500/15 text-teal-600 border-teal-500/30",
  C: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  D: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  F: "bg-red-500/15 text-red-600 border-red-500/30",
};

const DOMAIN_LABELS: Record<string, string> = {
  public_markets: "Equities",
  crypto: "Crypto",
  etf: "ETFs",
  vc_themes: "VC Themes",
  content_brand: "Content / Brand",
  side_business: "Side Business",
};

const DOMAIN_COLORS: Record<string, string> = {
  public_markets: "bg-blue-500/70",
  crypto: "bg-orange-500/70",
  etf: "bg-violet-500/70",
  vc_themes: "bg-teal-500/70",
  content_brand: "bg-pink-500/70",
  side_business: "bg-amber-500/70",
};

const DOMAIN_FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "public_markets", label: "Equities" },
  { key: "crypto", label: "Crypto" },
  { key: "etf", label: "ETFs" },
];

function TradingViewIntegration() {
  const webhookUrl = `${window.location.origin}/api/webhooks/tradingview`;
  const [copied, setCopied] = useState(false);

  const { data: alerts } = useQuery<any[]>({
    queryKey: ["/api/webhooks/alerts"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/webhooks/alerts?limit=5"); return res.json(); },
  });

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const examplePayload = JSON.stringify(
    { ticker: "NVDA", strategy: "MA_Cross", action: "BUY", price: 875.5, message: "Golden cross confirmed" },
    null,
    2
  );

  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Webhook className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium">TradingView Integration</h3>
        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-auto">
          {alerts?.length ?? 0} recent alerts
        </span>
      </div>

      <div className="space-y-3">
        {/* Webhook URL */}
        <div>
          <span className="text-xs text-muted-foreground block mb-1">Webhook URL</span>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
              {webhookUrl}
            </code>
            <button
              onClick={copyUrl}
              className="shrink-0 p-2 rounded hover:bg-muted transition-colors"
              data-testid="button-copy-webhook-url"
              title="Copy webhook URL"
            >
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          {copied && (
            <span className="text-xs text-emerald-500 mt-1 block">Copied!</span>
          )}
        </div>

        {/* Expected format */}
        <div>
          <span className="text-xs text-muted-foreground block mb-1">Expected JSON format</span>
          <pre className="text-xs bg-muted px-3 py-2 rounded font-mono overflow-x-auto text-muted-foreground">
            {examplePayload}
          </pre>
        </div>

        {/* Recent alerts */}
        {alerts && alerts.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Recent Alerts</span>
            <div className="space-y-1">
              {alerts.slice(0, 3).map((alert: any) => (
                <div key={alert.id} className="flex items-center justify-between text-xs bg-muted/50 px-2 py-1.5 rounded">
                  <span className="font-mono text-primary">{alert.ticker}</span>
                  <span className="text-muted-foreground truncate mx-2 flex-1">{alert.message}</span>
                  <span className="text-muted-foreground/60 shrink-0">
                    {new Date(alert.receivedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/50">
          Configure this URL in TradingView → Alerts → Webhook URL. Supports any JSON payload.{" "}
          <a
            href="https://www.tradingview.com/support/solutions/43000529348-about-webhooks/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/60 underline"
          >
            TradingView webhook docs →
          </a>
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { prices, connected, lastUpdate, alerts, tickCount } = useRealtime();

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: opportunities, isLoading: oppsLoading } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  // Fetch fundamentals for tickers that have them
  const tickers = opportunities?.filter(o => o.ticker).map(o => o.ticker!).filter(Boolean) || [];
  const fundamentalsMap = new Map<string, FundamentalData>();

  const { data: fundamentalsData } = useQuery<Record<string, FundamentalData>>({
    queryKey: ["/api/fundamentals/batch", tickers.join(",")],
    queryFn: async () => { const res = await apiRequest("POST", "/api/fundamentals/batch", { tickers }); return res.json(); },
    enabled: tickers.length > 0,
  });

  if (fundamentalsData) {
    Object.entries(fundamentalsData).forEach(([k, v]) => {
      fundamentalsMap.set(k.toUpperCase(), v as FundamentalData);
    });
  }

  const [domainFilter, setDomainFilter] = useState<string>("all");

  const filteredOpps = opportunities?.filter(
    (o) => domainFilter === "all" || o.domain === domainFilter
  );

  const topOpps = filteredOpps
    ?.filter((o) => o.compositeScore !== null)
    .sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0))
    .slice(0, 8);

  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  if (statsLoading || oppsLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4 lg:space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const portfolio = stats?.portfolio;

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1400px]">
      {/* Real-time Status Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-1 py-2 border-b border-border/30 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} data-testid="status-realtime-connection" />
          <span className="text-[10px] text-muted-foreground">
            {connected ? `Live · ${tickCount} ticks` : "Disconnected"}
          </span>
          {lastUpdate && (
            <span className="text-[10px] text-muted-foreground/50">
              Updated {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          )}
        </div>
        {/* Ticker tape */}
        <div className="flex items-center gap-3 overflow-x-auto w-full sm:w-auto" data-testid="ticker-tape">
          {Object.entries(prices).slice(0, 8).map(([symbol, data]) => (
            <div key={symbol} className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-mono text-muted-foreground">{symbol}</span>
              <span className="text-[10px] font-mono tabular-nums">${typeof data.price === 'number' ? data.price.toFixed(2) : data.price}</span>
              <span className={`text-[9px] font-mono tabular-nums ${(data.changePct || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {(data.changePct || 0) >= 0 ? "+" : ""}{typeof data.changePct === 'number' ? data.changePct.toFixed(2) : data.changePct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg" data-testid="risk-alerts-panel">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium text-red-500">Risk Alerts ({alerts.length})</span>
          </div>
          <div className="space-y-1">
            {alerts.slice(0, 3).map((alert, i) => (
              <div key={i} className="text-[11px] text-muted-foreground" data-testid={`risk-alert-${i}`}>
                <span className="font-mono font-medium text-foreground">{alert.ticker}</span> — {alert.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Signal Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-domain capital allocation OS with Renaissance-style signal aggregation
        </p>
      </div>

      {/* Autopilot info banner */}
      <div className="px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg text-xs text-muted-foreground">
        Allocations are recalculated every 5 minutes. Sell targets and stops are monitored continuously.
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 lg:gap-4">
        <KpiCard
          label="Opportunities"
          value={stats?.totalOpportunities || 0}
          icon={Target}
        />
        <KpiCard
          label="Avg Score"
          value={stats?.avgCompositeScore?.toFixed(3) || "0.000"}
          icon={Activity}
        />
        <KpiCard
          label="Budget"
          value={`$${portfolio?.totalBudget || 100}`}
          icon={Wallet}
        />
        <KpiCard
          label="Allocated"
          value={`$${stats?.totalAllocated?.toFixed(2) || "0.00"}`}
          icon={DollarSign}
        />
        <KpiCard
          label="Predictions"
          value={stats?.totalPredictions || 0}
          icon={BarChart3}
        />
        <KpiCard
          label="P&L"
          value={`$${portfolio?.totalPnl?.toFixed(2) || "0.00"}`}
          delta={portfolio?.totalPnlPercent}
          icon={TrendingUp}
        />
      </div>

      {/* Domain & Conviction Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        {/* Domain Distribution */}
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">By Domain</h3>
          <div className="space-y-2">
            {["public_markets", "crypto", "etf", "vc_themes", "content_brand", "side_business"].map((domain) => {
              const count = (stats?.byDomain?.[domain] || 0) as number;
              if (count === 0) return null;
              return (
                <div key={domain} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {DOMAIN_LABELS[domain] || domain}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${DOMAIN_COLORS[domain] || "bg-primary/70"}`}
                        style={{
                          width: `${Math.min(100, (count / (stats?.totalOpportunities || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs tabular-nums font-mono w-6 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
            {Object.keys(stats?.byDomain || {}).length === 0 && (
              <p className="text-xs text-muted-foreground/60">No opportunities yet</p>
            )}
          </div>
        </div>

        {/* Conviction Distribution */}
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">By Conviction</h3>
          <div className="space-y-2">
            {["high", "medium", "low", "avoid"].map((band) => {
              const count = (stats?.byConviction?.[band] || 0) as number;
              return (
                <div key={band} className="flex items-center justify-between">
                  <ConvictionBadge band={band} />
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          band === "high"
                            ? "bg-emerald-500"
                            : band === "medium"
                            ? "bg-amber-500"
                            : band === "low"
                            ? "bg-orange-500"
                            : "bg-red-500"
                        }`}
                        style={{
                          width: `${Math.min(100, (count / (stats?.totalOpportunities || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs tabular-nums font-mono w-6 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Domain Filter Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg w-fit" data-testid="domain-filter-tabs">
        {DOMAIN_FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setDomainFilter(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              domainFilter === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`filter-tab-${tab.key}`}
          >
            {tab.label}
            {tab.key !== "all" && stats?.byDomain?.[tab.key] ? (
              <span className="ml-1.5 text-[10px] tabular-nums opacity-60">
                {stats.byDomain[tab.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Top Ranked Opportunities */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Top Ranked Opportunities</h3>
          <span className="text-xs text-muted-foreground">
            {domainFilter === "all" ? "All domains" : DOMAIN_LABELS[domainFilter]} · Sorted by composite score
          </span>
        </div>

        {topOpps && topOpps.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-top-opportunities">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Domain</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Score</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">P(Success)</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Edge</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Conviction</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Allocation</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Target</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Stop</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Action</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Grade</th>
                </tr>
              </thead>
              <tbody>
                {topOpps.map((opp) => (
                  <>
                    <tr
                      key={opp.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === opp.id ? null : opp.id)}
                    >
                      <td className="py-2.5 px-3 font-medium">
                        <span className="inline-flex items-center gap-1">
                          {expandedRow === opp.id ? (
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          )}
                          {opp.name}
                          {opp.ticker && (
                            <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                              {opp.ticker}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">
                        {DOMAIN_LABELS[opp.domain] || opp.domain}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs">
                        {opp.compositeScore?.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs">
                        {opp.probabilityOfSuccess ? `${(opp.probabilityOfSuccess * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs">
                        {opp.expectedEdge?.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {opp.convictionBand && <ConvictionBadge band={opp.convictionBand} />}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs">
                        ${opp.suggestedAllocation?.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs text-emerald-600">
                        {opp.targetPrice ? `$${opp.targetPrice.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs text-red-500">
                        {opp.stopLoss ? `$${opp.stopLoss.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <ActionBadge action={opp.status.toUpperCase()} />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {(() => {
                          const f = opp.ticker ? fundamentalsMap.get(opp.ticker.toUpperCase()) : null;
                          if (!f) return <span className="text-xs text-muted-foreground/40">—</span>;
                          const grade = f.fundamentalGrade;
                          return (
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border ${GRADE_COLORS[grade] || "bg-muted text-muted-foreground"}`}>
                              {grade}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                    {expandedRow === opp.id && opp.thesis && (
                      <tr key={`${opp.id}-thesis`}>
                        <td colSpan={11} className="px-3 py-0">
                          <div className="bg-slate-800/50 border-l-2 border-primary rounded-r-md p-3 my-1.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              <span className="text-xs font-medium text-amber-400">AI Analysis</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{opp.thesis}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Target className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No opportunities scored yet</p>
            <p className="text-xs mt-1 opacity-60">
              Add opportunities to see them ranked here
            </p>
          </div>
        )}
      </div>

      {/* TradingView Integration */}
      <TradingViewIntegration />

      {/* Mathematical Framework Info */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2">Mathematical Framework</h3>
        <div className="text-xs text-muted-foreground space-y-2 font-mono">
          <p>
            Score<sub>i</sub> = w<sub>1</sub>Z(momentum) + w<sub>2</sub>Z(mean_reversion) + w<sub>3</sub>Z(quality) + w<sub>4</sub>Z(flow) − w<sub>5</sub>Z(risk) − w<sub>6</sub>Z(crowding)
          </p>
          <p>
            P(success) = σ(Score) = 1 / (1 + e<sup>−1.5·Score</sup>)
          </p>
          <p>
            f<sub>i</sub> = c · (p<sub>i</sub>·b − (1−p<sub>i</sub>)) / b &nbsp;&nbsp; [Fractional Kelly, c=0.25]
          </p>
        </div>
      </div>
    </div>
  );
}
