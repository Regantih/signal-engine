import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  ArrowDown,
  BarChart3,
  Shield,
  Star,
  Users,
  Radar,
  CheckCircle2,
  PlusCircle,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ScreenerHit {
  screenerId: string;
  screenerName: string;
  ticker: string;
  name: string;
  reason: string;
  confidence: number;
  price: number;
  dataSnapshot: Record<string, any>;
  detectedAt: string;
}

interface ScanResult {
  ticker: string;
  name: string;
  screeners: ScreenerHit[];
  screenerCount: number;
  isNew: boolean;
  autoScored: boolean;
  opportunity?: any;
}

interface ScanResponse {
  results: ScanResult[];
  totalHits: number;
  timestamp: string;
}

interface Opportunity {
  id: number;
  ticker: string | null;
  screenerFlags: string | null;
}

// ─────────────────────────────────────────────
// Screener metadata
// ─────────────────────────────────────────────

const SCREENER_META: Record<
  string,
  { color: string; bg: string; border: string; Icon: React.ElementType }
> = {
  MOMENTUM_SURGE: {
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
    Icon: Zap,
  },
  MEAN_REVERSION_DIP: {
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800",
    Icon: ArrowDown,
  },
  VOLUME_ANOMALY: {
    color: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    border: "border-purple-200 dark:border-purple-800",
    Icon: BarChart3,
  },
  QUALITY_VALUE: {
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800",
    Icon: Shield,
  },
  ANALYST_UPGRADE: {
    color: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    border: "border-teal-200 dark:border-teal-800",
    Icon: Star,
  },
  INSIDER_BUYING: {
    color: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-800",
    Icon: Users,
  },
};

const DEFAULT_META = {
  color: "text-muted-foreground",
  bg: "bg-muted",
  border: "border-border",
  Icon: Zap,
};

function getScreenerMeta(id: string) {
  return SCREENER_META[id] ?? DEFAULT_META;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function ScreenerBadge({ hit }: { hit: ScreenerHit }) {
  const meta = getScreenerMeta(hit.screenerId);
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.color} ${meta.bg} ${meta.border}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {hit.screenerName}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 60
      ? "bg-amber-500"
      : "bg-blue-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────

export default function Scanner() {
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [trackingSet, setTrackingSet] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: opportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const trackedTickers = new Set(
    (opportunities || []).filter((o) => o.ticker).map((o) => o.ticker!.toUpperCase())
  );

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scan-universe");
      return res.json() as Promise<ScanResponse>;
    },
    onSuccess: (data) => {
      setScanData(data);
      toast({
        title: `Scan complete — ${data.totalHits} tickers found`,
        description: `${data.results.filter((r) => r.isNew).length} new opportunities detected`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    },
  });

  const trackMutation = useMutation({
    mutationFn: async ({ ticker, name, screeners }: { ticker: string; name: string; screeners: ScreenerHit[] }) => {
      const res = await apiRequest("POST", "/api/scan-universe/add", {
        ticker,
        name,
        screeners,
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setTrackingSet((prev) => new Set([...prev, vars.ticker.toUpperCase()]));
      toast({ title: `${vars.ticker} added to opportunities` });
    },
    onError: (e: any) => {
      toast({ title: "Track failed", description: e.message, variant: "destructive" });
    },
  });

  const isTracked = (ticker: string) =>
    trackedTickers.has(ticker.toUpperCase()) || trackingSet.has(ticker.toUpperCase());

  const totalScreenerHits = scanData?.results.reduce((sum, r) => sum + r.screenerCount, 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Universe Scanner</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Run all 6 screeners in parallel to discover new opportunities via convergence signals
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="gap-2"
          data-testid="button-scan-universe"
        >
          <Radar className={`w-4 h-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
          {scanMutation.isPending ? "Scanning..." : "Scan Universe"}
        </Button>
      </div>

      {/* Loading state */}
      {scanMutation.isPending && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground animate-pulse">
            Running 6 screeners across market data sources...
          </p>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      )}

      {/* Summary stats */}
      {scanData && !scanMutation.isPending && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="bg-card border border-card-border rounded-lg px-4 py-3 text-center min-w-[110px]">
              <p className="text-2xl font-semibold tabular-nums">{scanData.totalHits}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Tickers Found</p>
            </div>
            <div className="bg-card border border-card-border rounded-lg px-4 py-3 text-center min-w-[110px]">
              <p className="text-2xl font-semibold tabular-nums">{totalScreenerHits}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Screener Hits</p>
            </div>
            <div className="bg-card border border-card-border rounded-lg px-4 py-3 text-center min-w-[110px]">
              <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {scanData.results.filter((r) => r.isNew).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">New Opportunities</p>
            </div>
            <div className="bg-card border border-card-border rounded-lg px-4 py-3 text-center min-w-[110px]">
              <p className="text-2xl font-semibold tabular-nums">
                {scanData.results.filter((r) => r.screenerCount >= 2).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Convergence Picks</p>
            </div>
            <p className="text-xs text-muted-foreground ml-auto">
              Scanned at {new Date(scanData.timestamp).toLocaleTimeString()}
            </p>
          </div>

          {/* Results grid */}
          <div className="space-y-3">
            {scanData.results.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Radar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No results returned from screeners</p>
                <p className="text-xs mt-1 opacity-60">
                  Finance data may be unavailable outside market hours
                </p>
              </div>
            )}

            {scanData.results.map((result) => (
              <div
                key={result.ticker}
                className="bg-card border border-card-border rounded-lg overflow-hidden"
                data-testid={`card-scan-result-${result.ticker}`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Ticker + name */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm font-mono bg-muted px-2 py-0.5 rounded">
                          {result.ticker}
                        </span>
                        <span className="text-sm font-medium truncate">{result.name}</span>
                        {result.screeners[0]?.price > 0 && (
                          <span className="text-sm tabular-nums text-muted-foreground">
                            ${result.screeners[0].price.toFixed(2)}
                          </span>
                        )}
                        {result.screenerCount >= 2 && (
                          <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {result.screenerCount} screeners
                          </span>
                        )}
                        {!result.isNew && (
                          <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                            Already tracked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Track button */}
                  <div className="shrink-0 ml-3">
                    {isTracked(result.ticker) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800 gap-1.5 text-xs"
                        disabled
                        data-testid={`button-tracked-${result.ticker}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Tracked
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() =>
                          trackMutation.mutate({
                            ticker: result.ticker,
                            name: result.name,
                            screeners: result.screeners,
                          })
                        }
                        disabled={trackMutation.isPending}
                        data-testid={`button-track-${result.ticker}`}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Track This
                      </Button>
                    )}
                  </div>
                </div>

                {/* Screener hits */}
                <div className="px-4 pb-4 space-y-3">
                  {/* Badge row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {result.screeners.map((hit, idx) => (
                      <ScreenerBadge key={`${hit.screenerId}-${idx}`} hit={hit} />
                    ))}
                  </div>

                  {/* Individual screener details */}
                  <div className="space-y-2">
                    {result.screeners.map((hit, idx) => {
                      const meta = getScreenerMeta(hit.screenerId);
                      const { Icon } = meta;
                      return (
                        <div
                          key={`detail-${hit.screenerId}-${idx}`}
                          className={`rounded-md border px-3 py-2 ${meta.bg} ${meta.border}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className={`w-3 h-3 ${meta.color}`} />
                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>
                              {hit.screenerName}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80 mb-1.5">{hit.reason}</p>
                          <ConfidenceBar value={hit.confidence} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state (pre-scan) */}
      {!scanData && !scanMutation.isPending && (
        <div className="text-center py-24 text-muted-foreground">
          <Radar className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium">No scan results yet</p>
          <p className="text-xs mt-1 opacity-60">
            Click "Scan Universe" to run all 6 screeners and discover new opportunities
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            {Object.entries(SCREENER_META).map(([id, meta]) => {
              const { Icon } = meta;
              return (
                <span
                  key={id}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.color} ${meta.bg} ${meta.border}`}
                >
                  <Icon className="w-2.5 h-2.5" />
                  {id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
