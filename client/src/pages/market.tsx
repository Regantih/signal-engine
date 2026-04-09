import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TradingViewChart } from "@/components/tradingview-chart";
import { ConvictionBadge, ActionBadge } from "@/components/conviction-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LineChart, TrendingUp, TrendingDown, Zap, Sparkles } from "lucide-react";

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
  status: string;
  thesis: string | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
}

interface QuoteResponse {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  date: string | null;
}

interface FundamentalData {
  ticker: string;
  peRatio: number | null;
  forwardPE: number | null;
  pbRatio: number | null;
  evToEbitda: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  grossMargin: number | null;
  profitMargin: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  fairValue: number | null;
  fairValueUpside: number | null;
  fundamentalScore: number;
  fundamentalGrade: string;
  currentPrice: number | null;
  fetchedAt: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  B: "bg-teal-500/15 text-teal-600 border-teal-500/30",
  C: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  D: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  F: "bg-red-500/15 text-red-600 border-red-500/30",
};

function MarketCard({ opp }: { opp: Opportunity }) {
  const { data: quote } = useQuery<QuoteResponse>({
    queryKey: ["/api/market-data", opp.ticker, "quote"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/market-data/${opp.ticker}/quote`); return res.json(); },
    enabled: !!opp.ticker,
    refetchInterval: 30000,
  });

  const { data: fundamentals } = useQuery<FundamentalData>({
    queryKey: ["/api/fundamentals", opp.ticker],
    queryFn: async () => { const res = await apiRequest("GET", `/api/fundamentals/${opp.ticker}`); return res.json(); },
    enabled: !!opp.ticker,
  });

  const currentPrice = quote?.price ?? opp.entryPrice;
  const changePercent = quote?.changePercent;
  const pnl =
    currentPrice && opp.entryPrice && opp.suggestedAllocation
      ? ((currentPrice - opp.entryPrice) / opp.entryPrice) * opp.suggestedAllocation
      : null;

  const isProfit = pnl !== null && pnl >= 0;

  return (
    <div
      className="bg-card border border-card-border rounded-lg overflow-hidden"
      data-testid={`market-card-${opp.id}`}
    >
      {/* Card Header */}
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            {opp.ticker && (
              <span className="text-xs font-mono font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                {opp.ticker}
              </span>
            )}
            <ActionBadge action={opp.status.toUpperCase()} />
          </div>
          {opp.convictionBand && <ConvictionBadge band={opp.convictionBand} />}
        </div>
        <h3 className="text-sm font-medium mt-1">{opp.name}</h3>

        {/* Price Info */}
        <div className="flex items-center gap-4 mt-2">
          <div>
            <span className="text-xs text-muted-foreground block">Current</span>
            <span className="text-base font-semibold tabular-nums font-mono">
              {currentPrice ? `$${currentPrice.toFixed(2)}` : "—"}
            </span>
          </div>
          {changePercent !== null && changePercent !== undefined && (
            <div className={`flex items-center gap-1 ${changePercent >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {changePercent >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span className="text-sm font-mono tabular-nums">
                {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
              </span>
            </div>
          )}
          {opp.entryPrice && (
            <div>
              <span className="text-xs text-muted-foreground block">Entry</span>
              <span className="text-xs tabular-nums font-mono">${opp.entryPrice.toFixed(2)}</span>
            </div>
          )}
          {pnl !== null && opp.suggestedAllocation && (
            <div>
              <span className="text-xs text-muted-foreground block">P&L</span>
              <span className={`text-xs tabular-nums font-mono font-medium ${isProfit ? "text-emerald-500" : "text-red-500"}`}>
                {isProfit ? "+" : ""}${pnl.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-2">
        {opp.ticker ? (
          <TradingViewChart symbol={opp.ticker} height={220} />
        ) : (
          <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground text-xs gap-2 border border-dashed border-border rounded-md">
            <LineChart className="w-6 h-6 opacity-40" />
            <span>No ticker symbol</span>
          </div>
        )}
      </div>

      {/* Fundamental Analysis */}
      {fundamentals && (
        <div className="px-4 pb-2">
          <div className="border-t border-border/50 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Fundamental Analysis</span>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold border ${GRADE_COLORS[fundamentals.fundamentalGrade] || "bg-muted text-muted-foreground"}`}>
                {fundamentals.fundamentalGrade}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
              {[
                { label: "P/E", value: fundamentals.peRatio?.toFixed(1) },
                { label: "ROE", value: fundamentals.returnOnEquity != null ? `${(Math.abs(fundamentals.returnOnEquity) > 1 ? fundamentals.returnOnEquity : fundamentals.returnOnEquity * 100).toFixed(1)}%` : null },
                { label: "D/E", value: fundamentals.debtToEquity?.toFixed(2) },
                { label: "Fair Val", value: fundamentals.fairValue ? `$${fundamentals.fairValue.toFixed(0)}` : null },
                { label: "Upside", value: fundamentals.fairValueUpside != null ? `${fundamentals.fairValueUpside > 0 ? "+" : ""}${fundamentals.fairValueUpside.toFixed(1)}%` : null },
                { label: "Score", value: `${fundamentals.fundamentalScore}/100` },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/70">{label}</span>
                  <span className={`text-[10px] font-mono tabular-nums ${
                    label === "Upside" && fundamentals.fairValueUpside != null
                      ? fundamentals.fairValueUpside >= 0 ? "text-emerald-500" : "text-red-500"
                      : "text-muted-foreground"
                  }`}>
                    {value ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Finbox Charts */}
      {opp.ticker && (
        <div className="px-2 pb-2">
          <iframe
            src={`https://finbox.com/NASDAQGS:${opp.ticker}/charts/`}
            width="100%"
            height="300"
            frameBorder="0"
            style={{ border: "none", borderRadius: "8px" }}
            title={`Finbox charts for ${opp.ticker}`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      )}

      {/* Signal Summary */}
      <div className="px-4 pb-4">
        <div className="border-t border-border/50 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Signals</span>
            {opp.compositeScore != null && (
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                Score: <span className="text-foreground">{(opp.compositeScore ?? 0).toFixed(3)}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {[
              { label: "Mom", value: opp.momentum },
              { label: "MR", value: opp.meanReversion },
              { label: "Qual", value: opp.quality },
              { label: "Flow", value: opp.flow },
              { label: "Risk", value: opp.risk },
              { label: "Crowd", value: opp.crowding },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground/70 w-8">{label}</span>
                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      label === "Risk" || label === "Crowd"
                        ? "bg-red-400/70"
                        : "bg-primary/60"
                    }`}
                    style={{ width: `${value}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60 w-5 text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {opp.thesis && (
        <div className="px-4 pb-4">
          <div className="bg-slate-800/50 border-l-2 border-amber-400/60 rounded-r-md p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">AI Analysis</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{opp.thesis}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Market() {
  const { toast } = useToast();

  const { data: opportunities, isLoading } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const autoScoreAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auto-score-all");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: `Auto-scored ${data?.count ?? 0} tickers from live finance data` });
    },
    onError: (e: any) => {
      toast({ title: "Auto-score failed", description: e.message, variant: "destructive" });
    },
  });

  // Filter to public markets with tickers first, then all others
  const marketOpps = opportunities?.filter(
    (o) => o.domain === "public_markets" && o.ticker
  ) || [];

  const otherOpps = opportunities?.filter(
    (o) => !(o.domain === "public_markets" && o.ticker)
  ) || [];

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Live Market</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time TradingView charts for all tracked instruments
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoScoreAllMutation.mutate()}
            disabled={autoScoreAllMutation.isPending}
            data-testid="button-auto-score-all"
            className="w-full sm:w-auto min-h-[44px]"
          >
            <Zap className={`w-3.5 h-3.5 mr-1.5 ${autoScoreAllMutation.isPending ? "animate-pulse" : ""}`} />
            {autoScoreAllMutation.isPending ? "Auto-Scoring..." : "Auto-Score All"}
          </Button>
        </div>
      </div>

      {/* Market Cards — Public Markets with tickers */}
      {marketOpps.length > 0 ? (
        <>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Public Markets</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
              {marketOpps.map((opp) => (
                <MarketCard key={opp.id} opp={opp} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <LineChart className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No public market opportunities with tickers</p>
          <p className="text-xs mt-1 opacity-60">
            Add opportunities with domain "Public Markets" and a ticker symbol to see charts here
          </p>
        </div>
      )}

      {/* Other opps (no ticker) */}
      {otherOpps.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Other Opportunities</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {otherOpps.map((opp) => (
              <div
                key={opp.id}
                className="bg-card border border-card-border rounded-lg p-4"
                data-testid={`market-card-other-${opp.id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">{opp.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <ActionBadge action={opp.status.toUpperCase()} />
                    {opp.convictionBand && <ConvictionBadge band={opp.convictionBand} />}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{opp.domain.replace(/_/g, " ")}</span>
                  {opp.compositeScore != null && (
                    <span className="font-mono">Score: {(opp.compositeScore ?? 0).toFixed(3)}</span>
                  )}
                </div>
                {opp.suggestedAllocation != null && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Allocation: <span className="font-mono text-foreground">${(opp.suggestedAllocation ?? 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
