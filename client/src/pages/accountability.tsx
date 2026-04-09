import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, TrendingDown, Percent, BarChart3 } from "lucide-react";

interface LedgerEntry {
  id: number;
  ticker: string;
  action: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  compositeScore: number;
  probabilityOfSuccess: number;
  convictionBand: string;
  timestamp: string;
  resolvedAt: string | null;
  resolvedPrice: number | null;
  actualReturn: number | null;
  wasCorrect: number | null;
  resolutionNotes: string | null;
}

interface AccountabilityData {
  stats: {
    totalPredictions: number;
    resolved: number;
    wins: number;
    losses: number;
    open: number;
    winRate: number;
    avgReturnWins: number;
    avgReturnLosses: number;
    overallAlpha: number;
  };
  ledger: LedgerEntry[];
}

type Filter = "all" | "wins" | "losses" | "open";

export default function Accountability() {
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading } = useQuery<AccountabilityData>({
    queryKey: ["/api/accountability"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const stats = data?.stats;
  const ledger = data?.ledger || [];

  const filtered = ledger.filter(entry => {
    if (filter === "wins") return entry.wasCorrect === 1;
    if (filter === "losses") return entry.wasCorrect === -1;
    if (filter === "open") return entry.wasCorrect === null || entry.wasCorrect === undefined;
    return true;
  });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats?.totalPredictions || 0 },
    { key: "wins", label: "Wins", count: stats?.wins || 0 },
    { key: "losses", label: "Losses", count: stats?.losses || 0 },
    { key: "open", label: "Open", count: stats?.open || 0 },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prediction Accountability Ledger</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every signal timestamped at creation, resolved at actual market prices. No backfilling, no cherry-picking.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total Predictions" value={stats?.totalPredictions || 0} icon={Target} />
        <KpiCard
          label="Win Rate (Verified)"
          value={`${stats?.winRate || 0}%`}
          icon={Percent}
        />
        <KpiCard
          label="Avg Win"
          value={`${stats?.avgReturnWins ? "+" : ""}${stats?.avgReturnWins || 0}%`}
          icon={TrendingUp}
        />
        <KpiCard
          label="Avg Loss"
          value={`${stats?.avgReturnLosses || 0}%`}
          icon={TrendingDown}
        />
        <KpiCard
          label="Overall Alpha"
          value={`${(stats?.overallAlpha || 0) > 0 ? "+" : ""}${stats?.overallAlpha || 0}%`}
          icon={BarChart3}
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">Ticker</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Signal</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Entry</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Target</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Stop</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Entry Date</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Resolution</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Actual Return</th>
              <th className="text-center p-3 font-medium text-muted-foreground">Correct?</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center p-8 text-muted-foreground">
                  No predictions yet. Run the pipeline to generate signals.
                </td>
              </tr>
            ) : (
              filtered.map(entry => {
                const isWin = entry.wasCorrect === 1;
                const isLoss = entry.wasCorrect === -1;
                const isOpen = entry.wasCorrect === null || entry.wasCorrect === undefined;

                const rowBg = isWin
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                  : isLoss
                  ? "bg-red-50/50 dark:bg-red-950/20"
                  : "";

                return (
                  <tr key={entry.id} className={`border-b border-border/50 ${rowBg}`}>
                    <td className="p-3 font-mono font-medium">{entry.ticker}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        entry.convictionBand === "high"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                          : entry.convictionBand === "medium"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {entry.convictionBand} ({(entry.probabilityOfSuccess * 100).toFixed(0)}%)
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      ${entry.entryPrice?.toFixed(2) || "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      ${entry.targetPrice?.toFixed(2) || "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-red-500 dark:text-red-400">
                      ${entry.stopLoss?.toFixed(2) || "—"}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {new Date(entry.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3 text-xs">
                      {isOpen ? (
                        <span className="text-muted-foreground">Open</span>
                      ) : (
                        <span className="text-muted-foreground" title={entry.resolutionNotes || ""}>
                          {entry.resolvedAt ? new Date(entry.resolvedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          }) : "—"}
                          {entry.resolvedPrice ? ` @ $${entry.resolvedPrice.toFixed(2)}` : ""}
                        </span>
                      )}
                    </td>
                    <td className={`p-3 text-right font-mono tabular-nums font-medium ${
                      isWin ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
                    }`}>
                      {entry.actualReturn !== null && entry.actualReturn !== undefined
                        ? `${entry.actualReturn > 0 ? "+" : ""}${entry.actualReturn.toFixed(2)}%`
                        : "—"
                      }
                    </td>
                    <td className="p-3 text-center">
                      {isWin ? (
                        <span className="inline-block w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 leading-6 text-xs font-bold">W</span>
                      ) : isLoss ? (
                        <span className="inline-block w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 text-red-500 dark:text-red-400 leading-6 text-xs font-bold">L</span>
                      ) : (
                        <span className="inline-block w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground leading-6 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer disclaimer */}
      <div className="text-center py-4 border-t border-border">
        <p className="text-xs text-muted-foreground max-w-xl mx-auto">
          All signals are timestamped at creation and resolved at actual market prices. No backfilling, no cherry-picking.
        </p>
      </div>
    </div>
  );
}
