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
  Bitcoin,
  Gem,
  Landmark,
  FlaskConical,
  ExternalLink,
  Users,
  Brain,
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

interface CryptoSnapshot {
  btc: { price: number; change: number };
  eth: { price: number; change: number };
  sol: { price: number; change: number };
  sentiment: string;
}

interface CommoditiesSnapshot {
  gold: { price: number; change: number };
  oil: { price: number; change: number };
  silver: { price: number; change: number };
  naturalGas: { price: number; change: number };
}

interface CongressionalTrade {
  politician: string;
  ticker: string;
  type: string;
  amount: string;
  date: string;
}

interface PolymarketEvent {
  title: string;
  probability: number;
  volume: string;
  category: string;
  url: string;
}

interface SentimentSnapshot {
  overall: string;
  details: string;
}

interface IntelligenceSnapshot {
  crypto: CryptoSnapshot;
  commodities: CommoditiesSnapshot;
  congressionalTrades: CongressionalTrade[];
  polymarket: PolymarketEvent[];
  sentiment: SentimentSnapshot;
  fetchedAt: string;
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

function formatChange(change: number | undefined | null): string {
  const c = change ?? 0;
  return `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`;
}

function formatPrice(value: number | undefined | null, decimals = 2): string {
  const v = value ?? 0;
  if (v === 0) return "—";
  if (v >= 10000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v.toFixed(decimals);
}

function formatCryptoPrice(value: number | undefined | null): string {
  const v = value ?? 0;
  if (v === 0) return "—";
  if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
}

function ChangeIndicator({ change }: { change: number | null | undefined }) {
  const safeChange = change ?? 0;
  const isUp = safeChange >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
      <Icon className="w-3.5 h-3.5" />
      {formatChange(safeChange)}
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
  const change = field?.change ?? 0;
  const changeColor =
    isVix
      ? change >= 0
        ? "text-red-400"   // VIX up = bad
        : "text-emerald-400"
      : change >= 0
      ? "text-emerald-400"
      : "text-red-400";

  const ChangeIcon = isVix
    ? change >= 0
      ? TrendingUp
      : TrendingDown
    : change >= 0
    ? TrendingUp
    : TrendingDown;

  const displayValue =
    isYield
      ? `${formatPrice(field?.value, 3)}%`
      : isFx
      ? formatPrice(field?.value, 4)
      : formatPrice(field?.value, priceDecimals);

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
          {(field?.value ?? 0) === 0 ? "—" : displayValue}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <ChangeIcon className={`w-3.5 h-3.5 ${changeColor}`} />
          <span className={`text-sm font-medium ${changeColor}`}>
            {formatChange(change)}
          </span>
        </div>
        {field?.signal && (
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

// ── Intelligence Sub-components ───────────────────────────────────────────────

interface SimpleAssetCardProps {
  label: string;
  price: number;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  formatFn?: (v: number) => string;
  testId: string;
}

function SimpleAssetCard({ label, price, change, icon: Icon, formatFn, testId }: SimpleAssetCardProps) {
  const safeChange = change ?? 0;
  const safePrice = price ?? 0;
  const isUp = safeChange >= 0;
  const displayPrice = formatFn ? formatFn(safePrice) : formatCryptoPrice(safePrice);
  return (
    <Card
      className="bg-card/60 border-border/50 hover:bg-card/80 transition-colors"
      data-testid={testId}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {label}
          </span>
          <Icon className="w-4 h-4 text-muted-foreground/60" />
        </div>
        <div className="text-xl font-bold text-foreground font-mono">
          {safePrice === 0 ? "—" : displayPrice}
        </div>
        <div className="mt-1 flex items-center gap-1">
          {isUp ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
          )}
          <span className={`text-sm font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            {formatChange(safeChange)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ProbabilityBar({ probability }: { probability: number | null | undefined }) {
  const safeProbability = probability ?? 0;
  const color =
    safeProbability >= 70
      ? "bg-emerald-500"
      : safeProbability >= 40
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, safeProbability))}%` }}
        />
      </div>
      <span className={`text-xs font-bold font-mono w-8 text-right ${
        safeProbability >= 70 ? "text-emerald-400" : safeProbability >= 40 ? "text-amber-400" : "text-red-400"
      }`}>
        {safeProbability}%
      </span>
    </div>
  );
}

function SentimentBadge({ overall }: { overall: string }) {
  if (overall === "bullish") return (
    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Bullish</Badge>
  );
  if (overall === "bearish") return (
    <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">Bearish</Badge>
  );
  return (
    <Badge className="bg-slate-500/20 text-slate-400 border border-slate-500/30">Neutral</Badge>
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
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/macro");
      return res.json();
    },
    staleTime: 60_000,
  });

  const {
    data: intelData,
    isLoading: intelLoading,
    isFetching: intelFetching,
  } = useQuery<IntelligenceSnapshot>({
    queryKey: ["/api/intelligence"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/intelligence");
      return res.json();
    },
    staleTime: 120_000,
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["/api/macro"] });
    queryClient.invalidateQueries({ queryKey: ["/api/intelligence"] });
  }

  const regime = snapshot?.regime ?? "NEUTRAL";
  const cfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.NEUTRAL;
  const RegimeIcon = cfg.icon;

  const anyFetching = isFetching || intelFetching;

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Market Intelligence</h1>
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
          disabled={anyFetching}
          data-testid="button-refresh-macro"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${anyFetching ? "animate-spin" : ""}`} />
          Refresh All
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
                ×{(snapshot.adjustmentFactor ?? 1).toFixed(1)}
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
                field={snapshot.sp500 ?? { value: 0, change: 0, signal: "" }}
                icon={TrendingUp}
                priceDecimals={0}
              />
              <MarketCard
                label="NASDAQ"
                field={snapshot.nasdaq ?? { value: 0, change: 0, signal: "" }}
                icon={Activity}
                priceDecimals={0}
              />
              <MarketCard
                label="VIX Fear Index"
                field={snapshot.vix ?? { value: 0, change: 0, signal: "" }}
                icon={Shield}
                isVix
              />
              <MarketCard
                label="10Y Yield"
                field={snapshot.yield10y ?? { value: 0, change: 0, signal: "" }}
                icon={BarChart3}
                isYield
              />
              <MarketCard
                label="EUR / USD"
                field={snapshot.eurusd ?? { value: 0, change: 0, signal: "" }}
                icon={DollarSign}
                isFx
              />
              <MarketCard
                label="USD / JPY"
                field={snapshot.usdjpy ?? { value: 0, change: 0, signal: "" }}
                icon={DollarSign}
                isFx
                priceDecimals={3}
              />
              <MarketCard
                label="Gold Futures"
                field={snapshot.gold ?? { value: 0, change: 0, signal: "" }}
                icon={TrendingUp}
                priceDecimals={0}
              />
              <MarketCard
                label="Crude Oil"
                field={snapshot.oil ?? { value: 0, change: 0, signal: "" }}
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
              <EconIndicator label="GDP Growth" value={snapshot.macro?.gdpGrowth ?? null} />
              <EconIndicator label="Inflation" value={snapshot.macro?.inflationRate ?? null} />
              <EconIndicator label="Interest Rate" value={snapshot.macro?.interestRate ?? null} />
              <EconIndicator label="Unemployment" value={snapshot.macro?.unemploymentRate ?? null} />
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

      {/* ── INTELLIGENCE LAYER ─────────────────────────────────────────────── */}

      {/* Crypto Section */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Bitcoin className="w-4 h-4" />
          Crypto
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {intelLoading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : intelData?.crypto ? (
            <>
              <SimpleAssetCard
                label="Bitcoin"
                price={intelData.crypto.btc?.price ?? 0}
                change={intelData.crypto.btc?.change ?? 0}
                icon={Bitcoin}
                testId="card-crypto-btc"
              />
              <SimpleAssetCard
                label="Ethereum"
                price={intelData.crypto.eth?.price ?? 0}
                change={intelData.crypto.eth?.change ?? 0}
                icon={Gem}
                testId="card-crypto-eth"
              />
              <SimpleAssetCard
                label="Solana"
                price={intelData.crypto.sol?.price ?? 0}
                change={intelData.crypto.sol?.change ?? 0}
                icon={Activity}
                testId="card-crypto-sol"
              />
            </>
          ) : (
            <div className="col-span-3 text-sm text-muted-foreground py-4 text-center">
              Crypto data unavailable
            </div>
          )}
        </div>
        {intelData?.crypto && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Crypto sentiment:</span>
            <SentimentBadge overall={intelData.crypto.sentiment ?? "neutral"} />
          </div>
        )}
      </div>

      {/* Commodities Section */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <FlaskConical className="w-4 h-4" />
          Commodities
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {intelLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : intelData?.commodities ? (
            <>
              <SimpleAssetCard
                label="Gold"
                price={intelData.commodities.gold?.price ?? 0}
                change={intelData.commodities.gold?.change ?? 0}
                icon={Gem}
                formatFn={(v) => v === 0 ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                testId="card-commodity-gold"
              />
              <SimpleAssetCard
                label="Crude Oil"
                price={intelData.commodities.oil?.price ?? 0}
                change={intelData.commodities.oil?.change ?? 0}
                icon={Fuel}
                formatFn={(v) => v === 0 ? "—" : `$${v.toFixed(2)}`}
                testId="card-commodity-oil"
              />
              <SimpleAssetCard
                label="Silver"
                price={intelData.commodities.silver?.price ?? 0}
                change={intelData.commodities.silver?.change ?? 0}
                icon={Gem}
                formatFn={(v) => v === 0 ? "—" : `$${v.toFixed(2)}`}
                testId="card-commodity-silver"
              />
              <SimpleAssetCard
                label="Natural Gas"
                price={intelData.commodities.naturalGas?.price ?? 0}
                change={intelData.commodities.naturalGas?.change ?? 0}
                icon={Fuel}
                formatFn={(v) => v === 0 ? "—" : `$${v.toFixed(3)}`}
                testId="card-commodity-natgas"
              />
            </>
          ) : (
            <div className="col-span-4 text-sm text-muted-foreground py-4 text-center">
              Commodities data unavailable
            </div>
          )}
        </div>
      </div>

      {/* Congressional Trades Section — hidden when empty */}
      {intelData?.congressionalTrades && intelData.congressionalTrades.length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Landmark className="w-4 h-4" />
          Congressional Trades — What politicians are buying
        </h2>
        <Card className="bg-card/60 border-border/50" data-testid="card-congressional-trades">
          <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Politician</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Ticker</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Type</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Amount</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intelData.congressionalTrades.map((trade, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-border/20 hover:bg-muted/20 transition-colors"
                        data-testid={`row-trade-${idx}`}
                      >
                        <td className="px-4 py-2.5 text-foreground font-medium">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                            <span className="truncate max-w-[180px]">{trade.politician}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs bg-muted/40 px-1.5 py-0.5 rounded text-primary font-bold">
                            {trade.ticker}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {trade.type === "sell" ? (
                            <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] uppercase tracking-wide font-bold">
                              SELL
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase tracking-wide font-bold">
                              BUY
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{trade.amount}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">{trade.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Polymarket Predictions Section — hidden when empty */}
      {intelData?.polymarket && intelData.polymarket.length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Brain className="w-4 h-4" />
          Prediction Markets — What the crowd expects
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {intelData.polymarket.slice(0, 12).map((event, idx) => (
              <a
                key={idx}
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
                data-testid={`card-polymarket-${idx}`}
              >
                <Card className="bg-card/60 border-border/50 hover:bg-card/80 hover:border-primary/30 transition-all h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wide border-border/50 text-muted-foreground shrink-0"
                      >
                        {event.category}
                      </Badge>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                    </div>
                    <p className="text-sm font-medium text-foreground leading-snug mb-3 line-clamp-2">
                      {event.title}
                    </p>
                    <ProbabilityBar probability={event.probability} />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/60">YES probability</span>
                      <span className="text-[10px] text-muted-foreground/60 font-mono">
                        Vol {event.volume} / 24h
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
        </div>
      </div>
      )}

      {/* Detailed Market Sentiment Section */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Detailed Market Sentiment Analysis
        </h2>
        <Card className="bg-card/60 border-border/50" data-testid="card-detailed-sentiment">
          <CardContent className="p-5">
            {intelLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            ) : intelData?.sentiment ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {intelData.sentiment.overall === "bullish" && (
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  )}
                  {intelData.sentiment.overall === "bearish" && (
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  )}
                  {intelData.sentiment.overall === "neutral" && (
                    <Shield className="w-5 h-5 text-slate-400" />
                  )}
                  <SentimentBadge overall={intelData.sentiment.overall ?? "neutral"} />
                  {intelData.fetchedAt && (
                    <span className="text-xs text-muted-foreground/50 ml-auto font-mono">
                      {new Date(intelData.fetchedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {intelData.sentiment.details ? (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {intelData.sentiment.details}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No sentiment details available.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sentiment data unavailable</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
