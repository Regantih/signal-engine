import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Brain,
  BarChart2,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  Settings,
  TrendingUp,
  TrendingDown,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlpacaStatus {
  connected: boolean;
  account?: {
    equity: string;
    buyingPower: string;
    cash: string;
    portfolioValue: string;
  };
  error?: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  market_value: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  notional: string | null;
  side: string;
  type: string;
  status: string;
  created_at: string;
  filled_avg_price: string | null;
}

interface Opportunity {
  id: number;
  name: string;
  ticker: string | null;
  status: string;
  suggestedAllocation: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  compositeScore: number | null;
  convictionBand: string | null;
}

interface FeedbackSummary {
  outcomes: Array<{
    predictionId: number;
    ticker: string | null;
    outcome: "win" | "loss" | "open";
    pnlPercent: number;
    holdingDays: number;
  }>;
  summary: {
    totalWins: number;
    totalLosses: number;
    totalOpen: number;
    hitRate: number;
    total: number;
  };
}

interface SignalAccuracy {
  accuracy: Record<
    string,
    { hitRate: number; avgPnlWin: number; avgPnlLoss: number; count: number }
  >;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined, prefix = "$"): string {
  if (val === null || val === undefined) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pnlColor(val: string | number | null | undefined): string {
  const n = typeof val === "string" ? parseFloat(val as string) : (val ?? 0);
  return n >= 0 ? "text-emerald-500" : "text-red-500";
}

function orderStatusBadge(status: string) {
  const map: Record<string, string> = {
    filled: "bg-emerald-500/15 text-emerald-500",
    partially_filled: "bg-amber-500/15 text-amber-500",
    cancelled: "bg-muted text-muted-foreground",
    pending_new: "bg-blue-500/15 text-blue-500",
    new: "bg-blue-500/15 text-blue-500",
    accepted: "bg-blue-500/15 text-blue-500",
    rejected: "bg-red-500/15 text-red-500",
    expired: "bg-muted text-muted-foreground",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

const SIGNAL_LABELS: Record<string, string> = {
  momentum: "Momentum",
  meanReversion: "Mean Reversion",
  quality: "Quality",
  flow: "Flow",
  risk: "Risk",
  crowding: "Crowding",
};

// ─── Section Components ───────────────────────────────────────────────────────

function AccountCard({ status }: { status: AlpacaStatus | undefined }) {
  if (!status) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Alpaca Not Connected</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Configure your Alpaca API keys in{" "}
              <a href="#/settings" className="text-primary hover:underline">
                Settings
              </a>{" "}
              to enable paper trading execution.
            </p>
            <a
              href="https://app.alpaca.markets/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              Get free Alpaca paper trading account{" "}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  const a = status.account!;
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Alpaca Paper Trading</h3>
            <p className="text-xs text-emerald-500">Connected</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Portfolio Value</p>
          <p className="text-base font-semibold mt-0.5">{fmt(a.portfolioValue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Equity</p>
          <p className="text-base font-semibold mt-0.5">{fmt(a.equity)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Cash</p>
          <p className="text-base font-semibold mt-0.5">{fmt(a.cash)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Buying Power</p>
          <p className="text-base font-semibold mt-0.5">{fmt(a.buyingPower)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Trading() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closingAll, setClosingAll] = useState(false);

  // Queries
  const { data: alpacaStatus, isLoading: statusLoading } = useQuery<AlpacaStatus>({
    queryKey: ["/api/alpaca/status"],
    refetchInterval: 30000,
  });

  const { data: positionsData, isLoading: positionsLoading } = useQuery<{
    positions: AlpacaPosition[];
  }>({
    queryKey: ["/api/alpaca/positions"],
    enabled: alpacaStatus?.connected === true,
    refetchInterval: 30000,
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{
    orders: AlpacaOrder[];
  }>({
    queryKey: ["/api/alpaca/orders"],
    enabled: alpacaStatus?.connected === true,
  });

  const { data: opps } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<FeedbackSummary>({
    queryKey: ["/api/feedback/outcomes"],
  });

  const { data: accuracyData } = useQuery<SignalAccuracy>({
    queryKey: ["/api/feedback/signal-accuracy"],
  });

  // Filter buy-ready opportunities
  const buyOpps = (opps ?? []).filter(
    (o) => o.status === "buy" && o.ticker && o.suggestedAllocation && o.suggestedAllocation > 0
  );

  // Mutations
  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      setExecutingId(id);
      return apiRequest("POST", `/api/alpaca/execute/${id}`);
    },
    onSuccess: (_data, id) => {
      setExecutingId(null);
      toast({ title: "Order Placed", description: `Bracket order submitted for opportunity #${id}` });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/positions"] });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
    onError: (e: any, _id) => {
      setExecutingId(null);
      toast({ variant: "destructive", title: "Order Failed", description: e.message });
    },
  });

  const executeAllMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const opp of buyOpps) {
        try {
          const r = await apiRequest("POST", `/api/alpaca/execute/${opp.id}`);
          results.push({ id: opp.id, ok: true, data: r });
        } catch (e: any) {
          results.push({ id: opp.id, ok: false, error: e.message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok).length;
      toast({ title: "Execute All Complete", description: `${ok}/${results.length} orders placed` });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/positions"] });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Execute All Failed", description: e.message });
    },
  });

  const sellMutation = useMutation({
    mutationFn: async (id: number) => {
      setClosingId(id);
      return apiRequest("POST", `/api/alpaca/sell/${id}`);
    },
    onSuccess: (_data, id) => {
      setClosingId(null);
      toast({ title: "Position Closed", description: `Sell order submitted for opportunity #${id}` });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/positions"] });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
    onError: (e: any) => {
      setClosingId(null);
      toast({ variant: "destructive", title: "Close Failed", description: e.message });
    },
  });

  const closeAllMutation = useMutation({
    mutationFn: async () => {
      setClosingAll(true);
      return apiRequest("POST", "/api/alpaca/close-all");
    },
    onSuccess: () => {
      setClosingAll(false);
      toast({ title: "All Positions Closed" });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/positions"] });
      qc.invalidateQueries({ queryKey: ["/api/alpaca/orders"] });
    },
    onError: (e: any) => {
      setClosingAll(false);
      toast({ variant: "destructive", title: "Close All Failed", description: e.message });
    },
  });

  const autoTuneMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/feedback/auto-tune"),
    onSuccess: (data: any) => {
      toast({
        title: "Weights Auto-Tuned",
        description: `${data.rescoredCount} opportunities rescored with new weights`,
      });
      qc.invalidateQueries({ queryKey: ["/api/opportunities"] });
      qc.invalidateQueries({ queryKey: ["/api/weights"] });
      qc.invalidateQueries({ queryKey: ["/api/feedback/signal-accuracy"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Auto-Tune Failed", description: e.message });
    },
  });

  const positions = positionsData?.positions ?? [];
  const orders = (ordersData?.orders ?? []).slice(0, 20);
  const summary = feedbackData?.summary;
  const accuracy = accuracyData?.accuracy ?? {};

  return (
    <div className="p-6 max-w-[1100px] space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Wallet className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Trading</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Alpaca paper trading execution, live positions, and signal feedback
        </p>
      </div>

      {/* ── 1. Account Status ──────────────────────────────── */}
      {statusLoading ? (
        <div className="bg-card border border-border rounded-lg p-5">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <AccountCard status={alpacaStatus} />
      )}

      {/* ── 2. Open Positions ──────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Open Positions</h3>
            {positions.length > 0 && (
              <Badge variant="secondary">{positions.length}</Badge>
            )}
          </div>
          {positions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => closeAllMutation.mutate()}
              disabled={closingAll || closeAllMutation.isPending}
              data-testid="button-close-all"
            >
              {closingAll ? (
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <ArrowDownCircle className="w-3 h-3 mr-1" />
              )}
              Close All
            </Button>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {positionsLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : positions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {alpacaStatus?.connected
                ? "No open positions"
                : "Connect Alpaca to view positions"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Symbol</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Entry</th>
                  <th className="px-4 py-2 text-right font-medium">Current</th>
                  <th className="px-4 py-2 text-right font-medium">P&L</th>
                  <th className="px-4 py-2 text-right font-medium">P&L %</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  const plPct = parseFloat(pos.unrealized_plpc) * 100;
                  // Find matching opportunity for sell action
                  const matchingOpp = opps?.find(
                    (o) => o.ticker?.toUpperCase() === pos.symbol.toUpperCase()
                  );
                  return (
                    <tr
                      key={pos.symbol}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      data-testid={`row-position-${pos.symbol}`}
                    >
                      <td className="px-4 py-3 font-semibold">{pos.symbol}</td>
                      <td className="px-4 py-3 text-right">{pos.qty}</td>
                      <td className="px-4 py-3 text-right">{fmt(pos.avg_entry_price)}</td>
                      <td className="px-4 py-3 text-right">{fmt(pos.current_price)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${pnlColor(pos.unrealized_pl)}`}>
                        {fmt(pos.unrealized_pl)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${pnlColor(plPct)}`}>
                        {plPct >= 0 ? "+" : ""}
                        {plPct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        {matchingOpp ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sellMutation.mutate(matchingOpp.id)}
                            disabled={closingId === matchingOpp.id}
                            data-testid={`button-close-${pos.symbol}`}
                          >
                            {closingId === matchingOpp.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              "Close"
                            )}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── 3. Ready to Execute ───────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Ready to Execute</h3>
            {buyOpps.length > 0 && (
              <Badge variant="secondary">{buyOpps.length}</Badge>
            )}
          </div>
          {buyOpps.length > 0 && (
            <Button
              size="sm"
              onClick={() => executeAllMutation.mutate()}
              disabled={executeAllMutation.isPending || !alpacaStatus?.connected}
              data-testid="button-execute-all"
            >
              {executeAllMutation.isPending ? (
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <ArrowUpCircle className="w-3 h-3 mr-1" />
              )}
              Execute All
            </Button>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {buyOpps.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No opportunities ready for execution. Score opportunities and mark as BUY to execute.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Ticker</th>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-right font-medium">Allocation</th>
                  <th className="px-4 py-2 text-right font-medium">Entry</th>
                  <th className="px-4 py-2 text-right font-medium">Target</th>
                  <th className="px-4 py-2 text-right font-medium">Stop</th>
                  <th className="px-4 py-2 text-right font-medium">Conviction</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {buyOpps.map((opp) => (
                  <tr
                    key={opp.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    data-testid={`row-execute-${opp.id}`}
                  >
                    <td className="px-4 py-3 font-semibold">{opp.ticker ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                      {opp.name}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-primary">
                      {fmt(opp.suggestedAllocation)}
                    </td>
                    <td className="px-4 py-3 text-right">{fmt(opp.entryPrice)}</td>
                    <td className="px-4 py-3 text-right text-emerald-500">
                      {fmt(opp.targetPrice)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-500">
                      {fmt(opp.stopLoss)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {opp.convictionBand ? (
                        <Badge
                          className={
                            opp.convictionBand === "high"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : opp.convictionBand === "medium"
                              ? "bg-amber-500/15 text-amber-500"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {opp.convictionBand}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        onClick={() => executeMutation.mutate(opp.id)}
                        disabled={
                          executingId === opp.id ||
                          executeMutation.isPending ||
                          !alpacaStatus?.connected
                        }
                        data-testid={`button-execute-${opp.id}`}
                      >
                        {executingId === opp.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          "Execute"
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!alpacaStatus?.connected && buyOpps.length > 0 && (
          <p className="text-xs text-amber-500 flex items-center gap-1 mt-2">
            <AlertCircle className="w-3 h-3" />
            Connect Alpaca in Settings to execute trades
          </p>
        )}
      </section>

      {/* ── 4. Recent Orders ─────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Recent Orders</h3>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {ordersLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {alpacaStatus?.connected ? "No recent orders" : "Connect Alpaca to view orders"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Symbol</th>
                  <th className="px-4 py-2 text-left font-medium">Side</th>
                  <th className="px-4 py-2 text-right font-medium">Qty / Notional</th>
                  <th className="px-4 py-2 text-right font-medium">Filled At</th>
                  <th className="px-4 py-2 text-right font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    data-testid={`row-order-${order.id}`}
                  >
                    <td className="px-4 py-2.5 font-semibold">{order.symbol}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          order.side === "buy" ? "text-emerald-500" : "text-red-500"
                        }
                      >
                        {order.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {order.notional ? fmt(order.notional) : order.qty}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {order.filled_avg_price ? fmt(order.filled_avg_price) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${orderStatusBadge(order.status)}`}
                      >
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── 5. Feedback Panel ────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Signal Feedback & Learning</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoTuneMutation.mutate()}
            disabled={autoTuneMutation.isPending}
            data-testid="button-auto-tune"
          >
            {autoTuneMutation.isPending ? (
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Brain className="w-3 h-3 mr-1" />
            )}
            Auto-Tune Weights
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Hit Rate Summary */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Outcome Summary
            </h4>
            {feedbackLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !summary || summary.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closed predictions yet. Execute trades and return here to see outcomes.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-emerald-500/10 rounded-lg p-3">
                    <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                    <p className="text-xl font-bold text-emerald-500">{summary.totalWins}</p>
                    <p className="text-xs text-muted-foreground">Wins</p>
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-3">
                    <TrendingDown className="w-4 h-4 text-red-500 mx-auto mb-1" />
                    <p className="text-xl font-bold text-red-500">{summary.totalLosses}</p>
                    <p className="text-xs text-muted-foreground">Losses</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <BarChart2 className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xl font-bold">{summary.totalOpen}</p>
                    <p className="text-xs text-muted-foreground">Open</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Hit Rate</span>
                    <span className="font-semibold">{summary.hitRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={summary.hitRate} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on {summary.totalWins + summary.totalLosses} closed predictions of{" "}
                  {summary.total} total
                </p>
              </div>
            )}
          </div>

          {/* Per-Signal Accuracy */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Per-Signal Hit Rate
            </h4>
            {Object.keys(accuracy).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enough data for signal analysis yet.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(accuracy).map(([sig, stats]) => (
                  <div key={sig}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {SIGNAL_LABELS[sig] ?? sig}
                      </span>
                      <span className="font-medium">
                        {stats.hitRate.toFixed(0)}%
                        {stats.count > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({stats.count} obs)
                          </span>
                        )}
                      </span>
                    </div>
                    <Progress
                      value={stats.hitRate}
                      className={`h-1.5 ${stats.hitRate >= 60 ? "[&>div]:bg-emerald-500" : stats.hitRate < 40 ? "[&>div]:bg-red-500" : "[&>div]:bg-amber-500"}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
