import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { ActionBadge } from "@/components/conviction-badge";
import { TrendingUp, TrendingDown, Target, BarChart3, DollarSign, Percent, Activity, Shield, Zap, PieChart } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Legend } from "recharts";

interface PortfolioAnalytics {
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

interface Prediction {
  id: number;
  opportunityId: number;
  action: string;
  compositeScore: number;
  probabilityOfSuccess: number;
  expectedEdge: number;
  kellyFraction: number;
  convictionBand: string;
  suggestedAllocation: number;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  currentPrice: number | null;
  reasoning: string | null;
  timestamp: string;
}

interface Opportunity {
  id: number;
  name: string;
  ticker: string | null;
  domain: string;
  compositeScore: number | null;
  probabilityOfSuccess: number | null;
  suggestedAllocation: number | null;
  status: string;
  entryPrice: number | null;
}

interface LivePnlPosition {
  opportunityId: number;
  name: string;
  ticker: string;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  allocation: number;
  hasLiveData: boolean;
}

interface LivePnlResponse {
  positions: LivePnlPosition[];
  totals: {
    totalPnl: number;
    totalPnlPercent: number;
    totalAllocated: number;
    positionCount: number;
  };
}

const SECTOR_COLORS = [
  "#6366f1", "#22c55e", "#ef4444", "#f59e0b", "#06b6d4",
  "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#64748b",
];

function sharpeColor(val: number): string {
  if (val > 1) return "text-emerald-500";
  if (val > 0) return "text-yellow-500";
  return "text-red-500";
}

export default function PerformancePage() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<PortfolioAnalytics>({
    queryKey: ["/api/portfolio/analytics"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/portfolio/analytics"); return res.json(); },
    refetchInterval: 60000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: predictions } = useQuery<Prediction[]>({
    queryKey: ["/api/predictions"],
  });

  const { data: opportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const { data: livePnl, isLoading: pnlLoading } = useQuery<LivePnlResponse>({
    queryKey: ["/api/live-pnl"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/live-pnl"); return res.json(); },
    refetchInterval: 30000,
  });

  const portfolio = stats?.portfolio;
  const oppMap = new Map(opportunities?.map((o) => [o.id, o]) || []);
  const buyPredictions = predictions?.filter((p) => p.action === "BUY") || [];
  const sellPredictions = predictions?.filter((p) => p.action === "SELL") || [];
  const watchPredictions = predictions?.filter((p) => p.action === "WATCH") || [];

  if (statsLoading || analyticsLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  const totalPnl = livePnl?.totals.totalPnl ?? 0;
  const totalPnlPercent = livePnl?.totals.totalPnlPercent ?? 0;

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-xl font-semibold">Portfolio Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Risk-adjusted returns, benchmark comparison, and sector exposure
        </p>
      </div>

      {/* Analytics KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-card border border-card-border rounded-lg p-4" data-testid="kpi-sharpe">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sharpe Ratio</span>
            <Zap className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <span className={`text-xl font-semibold tabular-nums ${sharpeColor(analytics?.sharpeRatio ?? 0)}`}>
            {analytics?.sharpeRatio?.toFixed(2) ?? "0.00"}
          </span>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-4" data-testid="kpi-drawdown">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Max Drawdown</span>
            <Shield className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <span className="text-xl font-semibold tabular-nums text-red-500">
            -{analytics?.maxDrawdown?.toFixed(2) ?? "0.00"}%
          </span>
        </div>

        <KpiCard
          label="Total Return"
          value={`${(analytics?.totalReturn ?? 0) >= 0 ? "+" : ""}${analytics?.totalReturn?.toFixed(2) ?? "0.00"}%`}
          icon={TrendingUp}
        />

        <KpiCard
          label="Win Rate"
          value={`${analytics?.winRate?.toFixed(1) ?? "0.0"}%`}
          icon={Percent}
        />

        <div className="bg-card border border-card-border rounded-lg p-4" data-testid="kpi-alpha">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Alpha (vs S&P)</span>
            <Target className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <span className={`text-xl font-semibold tabular-nums ${(analytics?.alpha ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {(analytics?.alpha ?? 0) >= 0 ? "+" : ""}{analytics?.alpha?.toFixed(2) ?? "0.00"}%
          </span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily P&L Chart vs Benchmark */}
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Cumulative P&L vs S&P 500</h3>
          {analytics?.dailyPnL && analytics.dailyPnL.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={analytics.dailyPnL}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => d.slice(5)}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `$${v}`}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === "cumulative" ? "Portfolio" : "S&P 500"]}
                />
                <Line type="monotone" dataKey="cumulative" stroke="#6366f1" strokeWidth={2} dot={false} name="cumulative" />
                <Line type="monotone" dataKey="benchmark" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="benchmark" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">
              Waiting for market data...
            </div>
          )}
        </div>

        {/* Sector Exposure Pie Chart */}
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Sector Exposure</h3>
          {analytics?.sectorExposure && analytics.sectorExposure.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <RePieChart>
                <Pie
                  data={analytics.sectorExposure}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="sector"
                >
                  {analytics.sectorExposure.map((_, idx) => (
                    <Cell key={idx} fill={SECTOR_COLORS[idx % SECTOR_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">
              <PieChart className="w-6 h-6 mr-2 opacity-40" />
              No sector data yet
            </div>
          )}
        </div>
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Sortino Ratio" value={analytics?.sortinoRatio?.toFixed(2) ?? "0.00"} icon={Zap} />
        <KpiCard label="Beta" value={analytics?.beta?.toFixed(2) ?? "0.00"} icon={Activity} />
        <KpiCard label="Profit Factor" value={analytics?.profitFactor?.toFixed(2) ?? "0.00"} icon={TrendingUp} />
        <KpiCard
          label="Cash / Invested"
          value={`${analytics?.cashPercent?.toFixed(0) ?? "100"}% / ${analytics?.investedPercent?.toFixed(0) ?? "0"}%`}
          icon={DollarSign}
        />
      </div>

      {/* Live P&L Section */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">Live Open Positions</h3>
            <span className="text-xs text-muted-foreground/60 ml-1">(refreshes every 30s)</span>
          </div>
          {livePnl && livePnl.totals.positionCount > 0 && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Total Allocated</span>
                <span className="text-sm font-mono tabular-nums">${(livePnl.totals.totalAllocated ?? 0).toFixed(2)}</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Live P&L</span>
                <span className={`text-sm font-mono tabular-nums font-semibold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                  <span className="text-xs ml-1 font-normal">({totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(2)}%)</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {pnlLoading ? (
          <Skeleton className="h-32 rounded-md" />
        ) : livePnl && livePnl.positions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-live-pnl">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Ticker</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Entry</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Current</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Allocated</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">P&L $</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">P&L %</th>
                </tr>
              </thead>
              <tbody>
                {livePnl.positions.map((pos) => (
                  <tr key={pos.opportunityId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3 text-xs font-medium">{pos.name}</td>
                    <td className="py-2 px-3 text-xs font-mono text-primary">{pos.ticker}</td>
                    <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">${(pos.entryPrice ?? 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">${(pos.currentPrice ?? 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">${(pos.allocation ?? 0).toFixed(2)}</td>
                    <td className={`py-2 px-3 text-right text-xs tabular-nums font-mono font-medium ${(pos.pnl ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {(pos.pnl ?? 0) >= 0 ? "+" : ""}${(pos.pnl ?? 0).toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-right text-xs tabular-nums font-mono font-medium ${(pos.pnlPercent ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {(pos.pnlPercent ?? 0) >= 0 ? "+" : ""}{(pos.pnlPercent ?? 0).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <Activity className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No open buy positions</p>
          </div>
        )}
      </div>

      {/* Action Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Buy Signals</h3>
            <ActionBadge action="BUY" />
          </div>
          <span className="text-2xl font-semibold tabular-nums">{buyPredictions.length}</span>
          <p className="text-xs text-muted-foreground mt-1">
            Total allocated: ${buyPredictions.reduce((s, p) => s + p.suggestedAllocation, 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Sell Signals</h3>
            <ActionBadge action="SELL" />
          </div>
          <span className="text-2xl font-semibold tabular-nums">{sellPredictions.length}</span>
          <p className="text-xs text-muted-foreground mt-1">Risk avoidance active</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Watch Signals</h3>
            <ActionBadge action="WATCH" />
          </div>
          <span className="text-2xl font-semibold tabular-nums">{watchPredictions.length}</span>
          <p className="text-xs text-muted-foreground mt-1">Monitoring for edge improvement</p>
        </div>
      </div>

      {/* Prediction Ledger */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-4">Prediction Ledger</h3>
        {predictions && predictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-predictions">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Timestamp</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Action</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Score</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">P(Win)</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Edge</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Allocation</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Entry</th>
                </tr>
              </thead>
              <tbody>
                {predictions.slice(0, 50).map((pred) => {
                  const opp = oppMap.get(pred.opportunityId);
                  return (
                    <tr key={pred.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2 px-3 text-xs font-mono text-muted-foreground tabular-nums">
                        {new Date(pred.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-xs font-medium">
                        {opp?.name || `#${pred.opportunityId}`}
                        {opp?.ticker && <span className="ml-1 text-muted-foreground font-mono">{opp.ticker}</span>}
                      </td>
                      <td className="py-2 px-3 text-center"><ActionBadge action={pred.action} /></td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">{(pred.compositeScore ?? 0).toFixed(3)}</td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">{((pred.probabilityOfSuccess ?? 0) * 100).toFixed(1)}%</td>
                      <td className={`py-2 px-3 text-right text-xs tabular-nums font-mono ${(pred.expectedEdge ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {(pred.expectedEdge ?? 0) > 0 ? "+" : ""}{(pred.expectedEdge ?? 0).toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">${(pred.suggestedAllocation ?? 0).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                        {pred.entryPrice ? `$${pred.entryPrice.toFixed(2)}` : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No predictions to track yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
