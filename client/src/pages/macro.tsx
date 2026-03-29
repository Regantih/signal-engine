import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Globe,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  DollarSign,
  Fuel,
  BarChart3,
  RefreshCw,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

// ── Types ────────────────────────────────────────────────────────────────────

interface MacroField {
  value: number;
  change: number;
  signal: string;
}

interface MacroSnapshot {
  regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "CRISIS";
  adjustmentFactor: number;
  vix: MacroField;
  sp500: MacroField;
  nasdaq: MacroField;
  dxy: MacroField;
  eurusd: MacroField;
  usdjpy: MacroField;
  gold: MacroField;
  oil: MacroField;
  yield10y: MacroField;
  sentiment: string;
  macro: {
    gdpGrowth: number | null;
    inflationRate: number | null;
    interestRate: number | null;
    unemploymentRate: number | null;
  };
  computedAt: string;
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const REGIME_CONFIG = {
  RISK_ON: {
    label: "Risk On",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    badgeBg: "bg-emerald-500",
    textColor: "text-emerald-400",
    icon: TrendingUp,
    description: "Favorable conditions — aggressive buys supported.",
  },
  NEUTRAL: {
    label: "Neutral",
    bg: "bg-slate-500/10 border-slate-500/30",
    badgeBg: "bg-slate-500",
    textColor: "text-slate-300",
    icon: Shield,
    description: "Mixed signals — normal operation.",
  },
  RISK_OFF: {
    label: "Risk Off",
    bg: "bg-amber-500/10 border-amber-500/30",
    badgeBg: "bg-amber-500",
    textColor: "text-amber-400",
    icon: AlertTriangle,
    description: "Elevated caution — reduce positions, tighten stops.",
  },
  CRISIS: {
    label: "Crisis",
    bg: "bg-red-600/10 border-red-600/40",
    badgeBg: "bg-red-600",
    textColor: "text-red-400",
    icon: AlertTriangle,
    description: "Kill switch active — no new positions.",
  },
} as const;

function formatChange(change: number): string {
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}

function formatPrice(value: number, decimals = 2): string {
  if (value === 0) return "—";
  if (value >= 10000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toFixed(decimals);
}

function ChangeIndicator({ change }: { change: number }) {
  const isUp = change >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
      <Icon className="w-3.5 h-3.5" />
      {formatChange(change)}
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MarketCardProps {
  label: string;
  field: MacroField;
  icon: React.ComponentType<{ className?: string }>;
  priceDecimals?: number;
  isVix?: boolean;
  isFx?: boolean;
  isYield?: boolean;
}

function MarketCard({ label, field, icon: Icon, priceDecimals = 2, isVix, isFx, isYield }: MarketCardProps) {
  const changeColor =
    isVix
      ? field.change >= 0
        ? "text-red-400"   // VIX up = bad
        : "text-emerald-400"
      : field.change >= 0
      ? "text-emerald-400"
      : "text-red-400";

  const ChangeIcon = isVix
    ? field.change >= 0
      ? TrendingUp
      : TrendingDown
    : field.change >= 0
    ? TrendingUp
    : TrendingDown;

  const displayValue =
    isYield
      ? `${formatPrice(field.value, 3)}%`
      : isFx
      ? formatPrice(field.value, 4)
      : formatPrice(field.value, priceDecimals);

  return (
    <Card
      className="bg-card/60 border-border/50 hover:bg-card/80 transition-colors"
      data-testid={`card-market-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {label}
          </span>
          <Icon className="w-4 h-4 text-muted-foreground/60" />
        </div>
        <div className="text-xl font-bold text-foreground font-mono">
          {field.value === 0 ? "—" : displayValue}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <ChangeIcon className={`w-3.5 h-3.5 ${changeColor}`} />
          <span className={`text-sm font-medium ${changeColor}`}>
            {formatChange(field.change)}
          </span>
        </div>
        {field.signal && (
          <div className="mt-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-mono">
              {field.signal}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EconIndicator({
  label,
  value,
  unit = "%",
}: {
  label: string;
  value: number | null;
  unit?: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 bg-card/40 rounded-lg px-4 py-3 border border-border/30 min-w-[120px]"
      data-testid={`indicator-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
        {label}
      </span>
      <span className="text-lg font-bold font-mono text-foreground">
        {value !== null ? `${value.toFixed(1)}${unit}` : "—"}
      </span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card className="bg-card/60 border-border/50">
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-16" />
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MacroPage() {
  const {
    data: snapshot,
    isLoading,
    error,
    isFetching,
  } = useQuery<MacroSnapshot>({
    queryKey: ["/api/macro"],
    queryFn: () => apiRequest("GET", "/api/macro"),
    staleTime: 60_000,
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["/api/macro"] });
  }

  const regime = snapshot?.regime ?? "NEUTRAL";
  const cfg = REGIME_CONFIG[regime];
  const RegimeIcon = cfg.icon;

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Macro Environment</h1>
            <p className="text-sm text-muted-foreground">
              Global market context · Updated{" "}
              {snapshot?.computedAt
                ? new Date(snapshot.computedAt).toLocaleTimeString()
                : "—"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          data-testid="button-refresh-macro"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Regime Banner */}
      {isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-400 text-sm">
          Failed to load macro data. Check finance tool connectivity.
        </div>
      ) : snapshot ? (
        <div
          className={`rounded-xl border p-5 ${cfg.bg}`}
          data-testid="banner-regime"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-black/20`}>
                <RegimeIcon className={`w-6 h-6 ${cfg.textColor}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-lg font-bold ${cfg.textColor}`}>
                    {cfg.label}
                  </span>
                  <Badge className={`${cfg.badgeBg} text-white text-[10px] uppercase tracking-wide`}>
                    {regime.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  {snapshot.summary}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Adjustment Factor
              </span>
              <span className={`text-2xl font-bold font-mono ${cfg.textColor}`}>
                ×{snapshot.adjustmentFactor.toFixed(1)}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                Applied to all allocations
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Market Pulse Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Market Pulse
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          ) : snapshot ? (
            <>
              <MarketCard
                label="S&P 500"
                field={snapshot.sp500}
                icon={TrendingUp}
                priceDecimals={0}
              />
              <MarketCard
                label="NASDAQ"
                field={snapshot.nasdaq}
                icon={Activity}
                priceDecimals={0}
              />
              <MarketCard
                label="VIX Fear Index"
                field={snapshot.vix}
                icon={Shield}
                isVix
              />
              <MarketCard
                label="10Y Yield"
                field={snapshot.yield10y}
                icon={BarChart3}
                isYield
              />
              <MarketCard
                label="EUR / USD"
                field={snapshot.eurusd}
                icon={DollarSign}
                isFx
              />
              <MarketCard
                label="USD / JPY"
                field={snapshot.usdjpy}
                icon={DollarSign}
                isFx
                priceDecimals={3}
              />
              <MarketCard
                label="Gold Futures"
                field={snapshot.gold}
                icon={TrendingUp}
                priceDecimals={0}
              />
              <MarketCard
                label="Crude Oil"
                field={snapshot.oil}
                icon={Fuel}
                priceDecimals={2}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* Bottom row: Economic Indicators + Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Economic Indicators */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Economic Indicators · US
          </h2>
          {isLoading ? (
            <div className="flex gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
          ) : snapshot ? (
            <div className="flex flex-wrap gap-3">
              <EconIndicator label="GDP Growth" value={snapshot.macro.gdpGrowth} />
              <EconIndicator label="Inflation" value={snapshot.macro.inflationRate} />
              <EconIndicator label="Interest Rate" value={snapshot.macro.interestRate} />
              <EconIndicator label="Unemployment" value={snapshot.macro.unemploymentRate} />
            </div>
          ) : null}
        </div>

        {/* Market Sentiment */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Market Sentiment
          </h2>
          {isLoading ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : snapshot ? (
            <Card
              className="bg-card/60 border-border/50 h-full"
              data-testid="card-sentiment"
            >
              <CardContent className="p-5 flex flex-col items-center justify-center h-full gap-3">
                {snapshot.sentiment === "bullish" && (
                  <>
                    <TrendingUp className="w-8 h-8 text-emerald-400" />
                    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm px-3 py-1">
                      Bullish
                    </Badge>
                  </>
                )}
                {snapshot.sentiment === "bearish" && (
                  <>
                    <TrendingDown className="w-8 h-8 text-red-400" />
                    <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 text-sm px-3 py-1">
                      Bearish
                    </Badge>
                  </>
                )}
                {snapshot.sentiment === "neutral" && (
                  <>
                    <Shield className="w-8 h-8 text-slate-400" />
                    <Badge className="bg-slate-500/20 text-slate-400 border border-slate-500/30 text-sm px-3 py-1">
                      Neutral
                    </Badge>
                  </>
                )}
                <p className="text-xs text-muted-foreground text-center capitalize">
                  {snapshot.sentiment} market sentiment · US equities
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
