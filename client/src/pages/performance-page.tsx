import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { ActionBadge } from "@/components/conviction-badge";
import { TrendingUp, TrendingDown, Target, BarChart3, DollarSign, Percent, Activity } from "lucide-react";

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

export default function PerformancePage() {
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
    queryFn: () => apiRequest("GET", "/api/live-pnl"),
    refetchInterval: 30000,
  });

  const portfolio = stats?.portfolio;

  // Group predictions by opportunity
  const predsByOpp = new Map<number, Prediction[]>();
  predictions?.forEach((p) => {
    const existing = predsByOpp.get(p.opportunityId) || [];
    existing.push(p);
    predsByOpp.set(p.opportunityId, existing);
  });

  const oppMap = new Map(opportunities?.map((o) => [o.id, o]) || []);

  // Compute buy predictions
  const buyPredictions = predictions?.filter((p) => p.action === "BUY") || [];
  const sellPredictions = predictions?.filter((p) => p.action === "SELL") || [];
  const watchPredictions = predictions?.filter((p) => p.action === "WATCH") || [];

  if (statsLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalPnl = livePnl?.totals.totalPnl ?? 0;
  const totalPnlPercent = livePnl?.totals.totalPnlPercent ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-xl font-semibold">Performance Tracker</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Track prediction accuracy, P&L, and portfolio performance
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Budget"
          value={`$${portfolio?.totalBudget?.toFixed(2) || "100.00"}`}
          icon={DollarSign}
        />
        <KpiCard
          label="Cash Remaining"
          value={`$${portfolio?.cashRemaining?.toFixed(2) || "100.00"}`}
          icon={DollarSign}
        />
        <KpiCard
          label="Total P&L"
          value={`$${portfolio?.totalPnl?.toFixed(2) || "0.00"}`}
          delta={portfolio?.totalPnlPercent}
          icon={TrendingUp}
        />
        <KpiCard
          label="Win Rate"
          value={`${portfolio?.winRate?.toFixed(1) || "0.0"}%`}
          icon={Percent}
        />
      </div>

      {/* Live P&L Section */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">Live Open Positions</h3>
            <span className="text-xs text-muted-foreground/60 ml-1">
              (refreshes every 30s)
            </span>
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
                  <span className="text-xs ml-1 font-normal">
                    ({totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(2)}%)
                  </span>
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
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Data</th>
                </tr>
              </thead>
              <tbody>
                {livePnl.positions.map((pos) => (
                  <tr
                    key={pos.opportunityId}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    data-testid={`row-pnl-${pos.opportunityId}`}
                  >
                    <td className="py-2 px-3 text-xs font-medium">{pos.name}</td>
                    <td className="py-2 px-3 text-xs font-mono text-primary">{pos.ticker}</td>
                    <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                      ${(pos.entryPrice ?? 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                      ${(pos.currentPrice ?? 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                      ${(pos.allocation ?? 0).toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-right text-xs tabular-nums font-mono font-medium ${(pos.pnl ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {(pos.pnl ?? 0) >= 0 ? "+" : ""}${(pos.pnl ?? 0).toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-right text-xs tabular-nums font-mono font-medium ${(pos.pnlPercent ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      <span className="flex items-center justify-end gap-0.5">
                        {(pos.pnlPercent ?? 0) >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {(pos.pnlPercent ?? 0) >= 0 ? "+" : ""}{(pos.pnlPercent ?? 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${pos.hasLiveData ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                        {pos.hasLiveData ? "cached" : "entry"}
                      </span>
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
            <p className="text-xs mt-1 opacity-60">
              Mark opportunities as BUY with entry prices and tickers to track live P&L
            </p>
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

      {/* Prediction History with P&L */}
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
                        {opp?.ticker && (
                          <span className="ml-1 text-muted-foreground font-mono">{opp.ticker}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <ActionBadge action={pred.action} />
                      </td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                        {(pred.compositeScore ?? 0).toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                        {((pred.probabilityOfSuccess ?? 0) * 100).toFixed(1)}%
                      </td>
                      <td className={`py-2 px-3 text-right text-xs tabular-nums font-mono ${
                        (pred.expectedEdge ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                      }`}>
                        {(pred.expectedEdge ?? 0) > 0 ? "+" : ""}{(pred.expectedEdge ?? 0).toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                        ${(pred.suggestedAllocation ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums font-mono">
                        {pred.entryPrice ? `$${pred.entryPrice.toFixed(2)}` : "—"}
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

      {/* Operating Protocol */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2">Operating Protocol</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>1. Publish the signal at the moment of creation (timestamped)</p>
          <p>2. Do not edit the thesis after posting</p>
          <p>3. Update only the current mark and close status</p>
          <p>4. Export the ledger periodically for public proof</p>
          <p>5. Renaissance principle: many small edges, diversified positions, disciplined sizing</p>
        </div>
      </div>
    </div>
  );
}
