import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface Strategy {
  id: number;
  name: string;
  description: string | null;
  sharpeRatio: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  tradeCount: number | null;
  updatedAt: string;
  isPublic: number | null;
}

export default function Leaderboard() {
  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-semibold">Signal Engine Strategy Leaderboard</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Paper trading performance ranked by risk-adjusted returns
        </p>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="leaderboard-table">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">Rank</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Strategy</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sharpe</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Return</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Max DD</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Trades</th>
              </tr>
            </thead>
            <tbody>
              {strategies?.map((s, idx) => {
                const isTop = idx === 0;
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${isTop ? "bg-amber-500/5" : ""}`}
                    data-testid={`strategy-row-${s.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? "bg-amber-400/20 text-amber-400" :
                        idx === 1 ? "bg-slate-300/20 text-slate-300" :
                        idx === 2 ? "bg-orange-400/20 text-orange-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          {isTop && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-medium">
                              TOP
                            </span>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-sm truncate">{s.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono tabular-nums font-semibold ${
                        (s.sharpeRatio ?? 0) >= 1.5 ? "text-emerald-400" :
                        (s.sharpeRatio ?? 0) >= 1.0 ? "text-amber-400" :
                        "text-muted-foreground"
                      }`}>
                        {s.sharpeRatio?.toFixed(3) ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono tabular-nums flex items-center justify-end gap-1 ${
                        (s.totalReturn ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {(s.totalReturn ?? 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {s.totalReturn?.toFixed(2) ?? "0.00"}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono tabular-nums text-red-400">
                        -{s.maxDrawdown?.toFixed(2) ?? "0.00"}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono tabular-nums ${
                        (s.winRate ?? 0) >= 60 ? "text-emerald-400" : "text-muted-foreground"
                      }`}>
                        {s.winRate?.toFixed(1) ?? "0.0"}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {s.tradeCount ?? 0}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(!strategies || strategies.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No strategies yet</p>
                    <p className="text-xs mt-1 opacity-60">Run the daily pipeline to start tracking performance</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground/70">How rankings work</p>
            <p>Strategies are ranked by Sharpe ratio — a risk-adjusted measure of return. A higher Sharpe means better return per unit of risk.</p>
            <p>The baseline "Autoresearch v1.986" strategy uses optimized signal weights from 12 months of backtesting across 303 trades.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
