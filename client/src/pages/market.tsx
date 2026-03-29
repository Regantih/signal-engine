import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TVChart } from "@/components/tv-chart";
import { ConvictionBadge, ActionBadge } from "@/components/conviction-badge";
import { SignalBar } from "@/components/signal-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, LineChart, TrendingUp, TrendingDown, Database, Zap } from "lucide-react";

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

interface MarketDataResponse {
  ticker: string;
  data: Array<{
    id: number;
    ticker: string;
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number;
    volume: number | null;
    fetchedAt: string;
  }>;
  isFresh: boolean;
  count: number;
}

interface QuoteResponse {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  date: string | null;
}

// Generate realistic demo OHLCV data
function generateDemoOHLCV(ticker: string, basePrice: number, days = 90) {
  const data = [];
  let price = basePrice * 0.85; // start 15% below current
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const change = (Math.random() - 0.48) * price * 0.03;
    const open = price;
    price = Math.max(price + change, price * 0.95);
    const high = Math.max(open, price) * (1 + Math.random() * 0.015);
    const low = Math.min(open, price) * (1 - Math.random() * 0.015);
    data.push({
      date: dateStr,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +price.toFixed(2),
      volume: Math.floor(Math.random() * 50000000) + 10000000,
    });
  }
  return data;
}

const DEMO_BASES: Record<string, number> = {
  NVDA: 875,
  PLTR: 22,
  AAPL: 185,
  MSFT: 415,
  TSLA: 175,
  AMZN: 190,
  GOOGL: 165,
  META: 500,
};

function MarketCard({ opp }: { opp: Opportunity }) {
  const { toast } = useToast();

  const { data: marketDataResp } = useQuery<MarketDataResponse>({
    queryKey: ["/api/market-data", opp.ticker],
    queryFn: () => apiRequest("GET", `/api/market-data/${opp.ticker}`),
    enabled: !!opp.ticker,
    refetchInterval: 30000,
  });

  const { data: quote } = useQuery<QuoteResponse>({
    queryKey: ["/api/market-data", opp.ticker, "quote"],
    queryFn: () => apiRequest("GET", `/api/market-data/${opp.ticker}/quote`),
    enabled: !!opp.ticker,
    refetchInterval: 30000,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!opp.ticker) throw new Error("No ticker");
      const basePrice = DEMO_BASES[opp.ticker.toUpperCase()] || opp.entryPrice || 100;
      const demoData = generateDemoOHLCV(opp.ticker, basePrice);
      return apiRequest("POST", "/api/market-data/seed", {
        ticker: opp.ticker,
        data: demoData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-data", opp.ticker] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-pnl"] });
      toast({ title: `Demo data seeded for ${opp.ticker}` });
    },
    onError: (e: any) => {
      toast({ title: "Seed failed", description: e.message, variant: "destructive" });
    },
  });

  const chartData = (marketDataResp?.data || []).map((d) => ({
    time: d.date,
    open: d.open ?? undefined,
    high: d.high ?? undefined,
    low: d.low ?? undefined,
    close: d.close,
    volume: d.volume ?? undefined,
  }));

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
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground text-xs gap-2 border border-dashed border-border rounded-md">
            <LineChart className="w-6 h-6 opacity-40" />
            <span>No price data</span>
            {opp.ticker && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                data-testid={`button-seed-${opp.ticker}`}
              >
                {seedMutation.isPending ? "Seeding..." : "Seed Demo Data"}
              </Button>
            )}
          </div>
        ) : (
          <TVChart
            data={chartData}
            entryPrice={opp.entryPrice}
            targetPrice={opp.targetPrice}
            stopLoss={opp.stopLoss}
            currentPrice={currentPrice}
            height={200}
            chartType="candlestick"
          />
        )}
      </div>

      {/* Signal Summary */}
      <div className="px-4 pb-4">
        <div className="border-t border-border/50 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Signals</span>
            {opp.compositeScore !== null && (
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                Score: <span className="text-foreground">{opp.compositeScore.toFixed(3)}</span>
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
    </div>
  );
}

export default function Market() {
  const { toast } = useToast();

  const { data: opportunities, isLoading } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const { data: livePnl } = useQuery({
    queryKey: ["/api/live-pnl"],
    refetchInterval: 30000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/refresh-prices", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-data"] });
      toast({ title: "Prices refreshed from cache" });
    },
    onError: (e: any) => {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    },
  });

  const seedAllMutation = useMutation({
    mutationFn: async () => {
      if (!opportunities) return;
      const marketOpps = opportunities.filter(
        (o) => o.domain === "public_markets" && o.ticker
      );
      for (const opp of marketOpps) {
        const basePrice = DEMO_BASES[opp.ticker!.toUpperCase()] || opp.entryPrice || 100;
        const demoData = generateDemoOHLCV(opp.ticker!, basePrice);
        await apiRequest("POST", "/api/market-data/seed", {
          ticker: opp.ticker,
          data: demoData,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-pnl"] });
      toast({ title: "Demo data seeded for all tickers" });
    },
    onError: (e: any) => {
      toast({ title: "Seed failed", description: e.message, variant: "destructive" });
    },
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
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Live Market</h2>
          <p className="text-sm text-muted-foreground mt-1">
            TradingView-style charts for all tracked instruments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoScoreAllMutation.mutate()}
            disabled={autoScoreAllMutation.isPending}
            data-testid="button-auto-score-all"
          >
            <Zap className={`w-3.5 h-3.5 mr-1.5 ${autoScoreAllMutation.isPending ? "animate-pulse" : ""}`} />
            {autoScoreAllMutation.isPending ? "Auto-Scoring..." : "Auto-Score All"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedAllMutation.mutate()}
            disabled={seedAllMutation.isPending}
            data-testid="button-seed-all"
          >
            <Database className="w-3.5 h-3.5 mr-1.5" />
            {seedAllMutation.isPending ? "Seeding..." : "Seed Demo Data"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh-prices"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Fetch Latest Prices
          </Button>
        </div>
      </div>

      {/* Market Cards — Public Markets with tickers */}
      {marketOpps.length > 0 ? (
        <>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Public Markets</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
                  {opp.compositeScore !== null && (
                    <span className="font-mono">Score: {opp.compositeScore.toFixed(3)}</span>
                  )}
                </div>
                {opp.suggestedAllocation !== null && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Allocation: <span className="font-mono text-foreground">${opp.suggestedAllocation.toFixed(2)}</span>
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
