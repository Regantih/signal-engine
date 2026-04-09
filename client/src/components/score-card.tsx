import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Share2,
  ArrowRight,
  Zap,
  BarChart3,
  Activity,
  Eye,
  AlertTriangle,
  Users,
} from "lucide-react";

interface ScoreData {
  ticker: string;
  name: string;
  price: number | null;
  score: number;
  compositeScore: number;
  probabilityOfSuccess: number;
  expectedEdge: number;
  conviction: string;
  action: string;
  signals: {
    momentum: number;
    meanReversion: number;
    quality: number;
    flow: number;
    risk: number;
    crowding: number;
  };
  target: number | null;
  stopLoss: number | null;
  entry: number | null;
  fundamentals: {
    grade: string;
    score: number;
    pe: number | null;
    forwardPE: number | null;
    fairValue: number | null;
    fairValueUpside: number | null;
    profitMargin: number | null;
    revenueGrowth: number | null;
    dividendYield: number | null;
  } | null;
  thesis: string;
  scoredAt: string;
}

interface ScoreCardProps {
  data: ScoreData;
}

const CONVICTION_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  high: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", label: "High Conviction" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", label: "Medium" },
  low: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", label: "Low" },
  avoid: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "Avoid" },
};

const SIGNAL_META: Array<{ key: keyof ScoreData["signals"]; label: string; icon: typeof TrendingUp; negative?: boolean }> = [
  { key: "momentum", label: "Momentum", icon: TrendingUp },
  { key: "meanReversion", label: "Mean Reversion", icon: Activity },
  { key: "quality", label: "Quality", icon: BarChart3 },
  { key: "flow", label: "Flow", icon: Zap },
  { key: "risk", label: "Risk", icon: AlertTriangle, negative: true },
  { key: "crowding", label: "Crowding", icon: Users, negative: true },
];

function ScoreGauge({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 20) / 2;
  const circumference = Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - pct);

  const color =
    score >= 70 ? "#10b981" :
    score >= 55 ? "#f59e0b" :
    score >= 40 ? "#f97316" :
    "#ef4444";

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        {/* Background arc */}
        <path
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}

function SignalBarMini({ label, value, icon: Icon, negative }: { label: string; value: number; icon: typeof TrendingUp; negative?: boolean }) {
  const width = Math.min(100, Math.max(0, value));
  const color = negative
    ? (value > 60 ? "bg-red-500" : value > 40 ? "bg-amber-500" : "bg-emerald-500")
    : (value > 60 ? "bg-emerald-500" : value > 40 ? "bg-amber-500" : "bg-red-500");

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <span className="text-xs font-mono tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700 ease-out`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function ScoreCard({ data }: ScoreCardProps) {
  const conviction = CONVICTION_STYLES[data.conviction] || CONVICTION_STYLES.avoid;
  const upside = data.fundamentals?.fairValueUpside;

  function handleShare() {
    const url = `${window.location.origin}/#/score/${data.ticker}`;
    navigator.clipboard.writeText(url);
  }

  return (
    <Card className="w-full max-w-2xl mx-auto overflow-hidden border-border/50 shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 px-6 py-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">{data.ticker}</h2>
              <Badge className={`${conviction.bg} ${conviction.text} ${conviction.border} border text-xs font-semibold`}>
                {conviction.label}
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">{data.name !== data.ticker ? data.name : ""}</p>
            {data.price && (
              <p className="text-xl font-semibold mt-1 tabular-nums">${data.price.toFixed(2)}</p>
            )}
          </div>
          <ScoreGauge score={data.score} size={140} />
        </div>
      </div>

      <CardContent className="p-6 space-y-6">
        {/* AI Thesis */}
        <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Thesis</h3>
          <p className="text-sm leading-relaxed">{data.thesis}</p>
        </div>

        {/* Price Levels */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <Target className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {data.target ? `$${data.target.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30 border border-border/50">
            <TrendingUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Entry</p>
            <p className="text-lg font-bold tabular-nums">
              {data.entry ? `$${data.entry.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <Shield className="h-4 w-4 mx-auto mb-1 text-red-500" />
            <p className="text-xs text-muted-foreground">Stop Loss</p>
            <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
              {data.stopLoss ? `$${data.stopLoss.toFixed(2)}` : "—"}
            </p>
          </div>
        </div>

        {/* Signal Breakdown */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Signal Breakdown</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {SIGNAL_META.map(({ key, label, icon, negative }) => (
              <SignalBarMini
                key={key}
                label={label}
                value={data.signals[key]}
                icon={icon}
                negative={negative}
              />
            ))}
          </div>
        </div>

        {/* Fundamentals */}
        {data.fundamentals && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Fundamentals</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FundamentalPill label="Grade" value={data.fundamentals.grade} highlight />
              <FundamentalPill label="P/E" value={data.fundamentals.pe?.toFixed(1) || "—"} />
              <FundamentalPill
                label="Fair Value"
                value={data.fundamentals.fairValue ? `$${data.fundamentals.fairValue.toFixed(0)}` : "—"}
              />
              <FundamentalPill
                label="Upside"
                value={upside ? `${upside > 0 ? "+" : ""}${upside.toFixed(1)}%` : "—"}
                positive={upside ? upside > 0 : undefined}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground/50">Powered by Signal Engine</p>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleShare} className="text-xs">
                  <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy shareable link</TooltipContent>
            </Tooltip>
            <Button size="sm" className="text-xs" onClick={() => { window.location.hash = "#/"; }}>
              Track This <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FundamentalPill({ label, value, highlight, positive }: { label: string; value: string; highlight?: boolean; positive?: boolean }) {
  const gradeColors: Record<string, string> = {
    A: "text-emerald-500",
    B: "text-emerald-400",
    C: "text-amber-500",
    D: "text-orange-500",
    F: "text-red-500",
  };

  return (
    <div className="text-center p-2 rounded-md bg-muted/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${
        highlight ? (gradeColors[value] || "") :
        positive === true ? "text-emerald-500" :
        positive === false ? "text-red-500" : ""
      }`}>
        {value}
      </p>
    </div>
  );
}

export type { ScoreData };
