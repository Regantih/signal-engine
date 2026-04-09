import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { ConvictionBadge, ActionBadge } from "@/components/conviction-badge";
import { SignalBar } from "@/components/signal-bar";
import { SIGNAL_DESCRIPTIONS, scoreLocally, DEFAULT_WEIGHTS } from "@/lib/scoring";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, Zap, ExternalLink, Sparkles, FlaskConical } from "lucide-react";

interface Opportunity {
  id: number;
  name: string;
  ticker: string | null;
  domain: string;
  description: string | null;
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
  compositeScore: number | null;
  probabilityOfSuccess: number | null;
  expectedEdge: number | null;
  kellyFraction: number | null;
  convictionBand: string | null;
  suggestedAllocation: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  status: string;
  thesis: string | null;
  screenerFlags: string | null;
  createdAt: string;
  updatedAt: string;
}

const SCREENER_COLORS: Record<string, string> = {
  MOMENTUM_SURGE: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  MEAN_REVERSION_DIP: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  VOLUME_ANOMALY: "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  QUALITY_VALUE: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  ANALYST_UPGRADE: "bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  INSIDER_BUYING: "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
};

const DOMAIN_LABELS: Record<string, string> = {
  public_markets: "Equities",
  crypto: "Crypto",
  etf: "ETFs",
  vc_themes: "VC Themes",
  content_brand: "Content / Brand",
  side_business: "Side Business",
};

function DecisionPipeline({ opp }: { opp: Opportunity }) {
  const w = DEFAULT_WEIGHTS;
  const signals = [
    { name: "Momentum", raw: opp.momentum, weight: w.momentum, isNeg: false },
    { name: "Mean Rev.", raw: opp.meanReversion, weight: w.meanReversion, isNeg: false },
    { name: "Quality", raw: opp.quality, weight: w.quality, isNeg: false },
    { name: "Flow", raw: opp.flow, weight: w.flow, isNeg: false },
    { name: "Risk", raw: opp.risk, weight: w.risk, isNeg: true },
    { name: "Crowding", raw: opp.crowding, weight: w.crowding, isNeg: true },
  ];

  const zScore = (v: number) => (v - 50) / 16.67;
  const compositeScore = opp.compositeScore ?? 0;
  const zScoreVal = compositeScore; // composite IS the z-score weighted sum
  const prob = opp.probabilityOfSuccess ?? 0;
  const edge = opp.expectedEdge ?? 0;
  const kelly = opp.kellyFraction ?? 0;
  const alloc = opp.suggestedAllocation ?? 0;

  return (
    <div className="mt-4 bg-slate-900/60 border border-slate-700/50 rounded-lg p-4 space-y-4" data-testid="decision-pipeline">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold text-cyan-400">Decision Pipeline — How was this scored?</span>
      </div>

      {/* Step 1: Raw Signals x Weights = Contribution */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Step 1: Raw Signals x Weights = Contribution</p>
        <div className="bg-black/30 rounded-md p-3 font-mono text-xs space-y-1">
          <div className="grid grid-cols-[1fr_0.6fr_0.5fr_0.8fr] gap-1 text-muted-foreground/50 mb-1">
            <span>SIGNAL</span><span className="text-right">RAW/100</span><span className="text-right">WEIGHT</span><span className="text-right">CONTRIB</span>
          </div>
          {signals.map(({ name, raw, weight, isNeg }) => {
            const z = zScore(raw);
            const contrib = isNeg ? -(weight * z) : weight * z;
            return (
              <div key={name} className="grid grid-cols-[1fr_0.6fr_0.5fr_0.8fr] gap-1">
                <span className="text-muted-foreground">{name}</span>
                <span className="text-right tabular-nums">{raw.toFixed(0)}/100</span>
                <span className="text-right tabular-nums text-muted-foreground/70">x {weight.toFixed(2)}</span>
                <span className={`text-right tabular-nums font-medium ${contrib >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {contrib >= 0 ? "+" : ""}{contrib.toFixed(3)} {isNeg ? "(penalty)" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 2-5: Score Pipeline */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Step 2: Composite Score to Allocation</p>
        <div className="bg-black/30 rounded-md p-3 font-mono text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Composite Score (weighted sum)</span>
            <span className="tabular-nums font-medium text-cyan-300">{compositeScore.toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">P(Success) = 1 / (1 + e^(-1.5 x {compositeScore.toFixed(2)}))</span>
            <span className="tabular-nums font-medium text-amber-300">{(prob * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Edge = P x 2.0 - (1-P) - 0.005</span>
            <span className={`tabular-nums font-medium ${edge >= 0 ? "text-emerald-400" : "text-red-400"}`}>{edge >= 0 ? "+" : ""}{edge.toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kelly = 0.25 x (P x 2.0 - (1-P)) / 2.0</span>
            <span className="tabular-nums font-medium text-violet-300">{(kelly * 100).toFixed(2)}%</span>
          </div>
          <div className="border-t border-slate-700/50 pt-2 flex justify-between">
            <span className="text-muted-foreground">Allocation = $100 x {(kelly * 100).toFixed(2)}%</span>
            <span className="tabular-nums font-bold text-white">${alloc.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/40">
        Based on the scoring model. See full math on the Live Scoring page.
      </p>
    </div>
  );
}

export default function Opportunities() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const [filterDomain, setFilterDomain] = useState<string>("all");
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [domain, setDomain] = useState("public_markets");
  const [description, setDescription] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [signals, setSignals] = useState({
    momentum: 50,
    meanReversion: 50,
    quality: 50,
    flow: 50,
    risk: 50,
    crowding: 50,
  });

  const { data: opportunities, isLoading } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/opportunities", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Opportunity created and scored" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/opportunities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Opportunity deleted" });
    },
  });

  const rescoreAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/rescore-all");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      toast({ title: "All opportunities re-scored" });
    },
  });

  const autoScoreAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auto-score-all");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-pnl"] });
      toast({ title: `Auto-scored ${data?.count ?? 0} opportunities from live finance data` });
    },
    onError: (e: any) => {
      toast({ title: "Auto-score failed", description: e.message, variant: "destructive" });
    },
  });

  const autoScoreMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest("POST", `/api/auto-score/${ticker}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-pnl"] });
      const ticker = data?.metadata?.ticker || "";
      toast({ title: `Auto-scored ${ticker} from live data`, description: `Mom=${data?.signals?.momentum} MR=${data?.signals?.meanReversion} Qual=${data?.signals?.quality} Flow=${data?.signals?.flow} Risk=${data?.signals?.risk} Crowd=${data?.signals?.crowding}` });
    },
    onError: (e: any) => {
      toast({ title: "Auto-score failed", description: e.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setTicker("");
    setDomain("public_markets");
    setDescription("");
    setEntryPrice("");
    setSignals({ momentum: 50, meanReversion: 50, quality: 50, flow: 50, risk: 50, crowding: 50 });
  };

  const handleCreate = () => {
    createMutation.mutate({
      name,
      ticker: ticker || null,
      domain,
      description: description || null,
      momentum: signals.momentum,
      meanReversion: signals.meanReversion,
      quality: signals.quality,
      flow: signals.flow,
      risk: signals.risk,
      crowding: signals.crowding,
      entryPrice: entryPrice ? parseFloat(entryPrice) : null,
      targetPrice: null,
      stopLoss: null,
      status: "watch",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  // Live preview of score
  const liveScore = scoreLocally(signals, DEFAULT_WEIGHTS);

  const filtered = opportunities?.filter(
    (o) => filterDomain === "all" || o.domain === filterDomain
  );

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Opportunities</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add and score candidate opportunities across all domains
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
            onClick={() => rescoreAllMutation.mutate()}
            disabled={rescoreAllMutation.isPending}
            data-testid="button-rescore-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${rescoreAllMutation.isPending ? "animate-spin" : ""}`} />
            Rescore All
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-opportunity">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Opportunity
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Opportunity</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. NVIDIA, AI Infra Thesis"
                      data-testid="input-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Ticker (optional)</label>
                    <Input
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      placeholder="e.g. NVDA"
                      data-testid="input-ticker"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Domain</label>
                    <Select value={domain} onValueChange={setDomain}>
                      <SelectTrigger data-testid="select-domain">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public_markets">Equities</SelectItem>
                        <SelectItem value="crypto">Crypto</SelectItem>
                        <SelectItem value="etf">ETFs</SelectItem>
                        <SelectItem value="vc_themes">VC Themes</SelectItem>
                        <SelectItem value="content_brand">Content / Brand</SelectItem>
                        <SelectItem value="side_business">Side Business</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Entry Price ($)</label>
                    <Input
                      type="number"
                      value={entryPrice}
                      onChange={(e) => setEntryPrice(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-entry-price"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Why this opportunity? What's the thesis?"
                    rows={2}
                    data-testid="input-description"
                  />
                </div>

                {/* Signal sliders */}
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Signal Inputs (0-100)
                  </h4>
                  {Object.entries(SIGNAL_DESCRIPTIONS).map(([key, info]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{info.label}</span>
                        <span className="text-xs tabular-nums font-mono text-muted-foreground">
                          {signals[key as keyof typeof signals]}
                        </span>
                      </div>
                      <Slider
                        value={[signals[key as keyof typeof signals]]}
                        onValueChange={([v]) =>
                          setSignals((prev) => ({ ...prev, [key]: v }))
                        }
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                        data-testid={`slider-${key}`}
                      />
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {info.domain[domain as keyof typeof info.domain] || info.description}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Live preview */}
                <div className="bg-muted/50 rounded-md p-3 border border-border/50">
                  <h4 className="text-xs font-medium mb-2">Live Score Preview</h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Score</span>
                      <p className="tabular-nums font-mono font-medium">{liveScore.compositeScore.toFixed(3)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">P(Success)</span>
                      <p className="tabular-nums font-mono font-medium">{(liveScore.probabilityOfSuccess * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Edge</span>
                      <p className="tabular-nums font-mono font-medium">{liveScore.expectedEdge.toFixed(3)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Kelly %</span>
                      <p className="tabular-nums font-mono font-medium">{(liveScore.kellyFraction * 100).toFixed(2)}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Allocation</span>
                      <p className="tabular-nums font-mono font-medium">${liveScore.suggestedAllocation.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Action</span>
                      <p><ActionBadge action={liveScore.action} /></p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={!name || createMutation.isPending}
                  className="w-full"
                  data-testid="button-submit-opportunity"
                >
                  {createMutation.isPending ? "Scoring..." : "Create & Score"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className="w-48" data-testid="select-filter-domain">
            <SelectValue placeholder="All domains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            <SelectItem value="public_markets">Equities</SelectItem>
            <SelectItem value="crypto">Crypto</SelectItem>
            <SelectItem value="etf">ETFs</SelectItem>
            <SelectItem value="vc_themes">VC Themes</SelectItem>
            <SelectItem value="content_brand">Content / Brand</SelectItem>
            <SelectItem value="side_business">Side Business</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered?.length || 0} opportunities
        </span>
      </div>

      {/* Opportunity Cards */}
      <div className="space-y-3">
        {filtered?.map((opp) => {
          const isExpanded = expandedId === opp.id;
          return (
            <div
              key={opp.id}
              className="bg-card border border-card-border rounded-lg overflow-hidden"
              data-testid={`card-opportunity-${opp.id}`}
            >
              {/* Header row */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : opp.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button className="shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{opp.name}</span>
                      {opp.ticker && (
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {opp.ticker}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {DOMAIN_LABELS[opp.domain]}
                      </span>
                    </div>
                    {opp.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-md">
                        {opp.description}
                      </p>
                    )}
                    {(() => {
                      const flags = opp.screenerFlags ? (() => { try { return JSON.parse(opp.screenerFlags); } catch { return []; } })() : [];
                      return flags.length > 0 ? (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {flags.map((f: any) => (
                            <span
                              key={f.id}
                              className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                SCREENER_COLORS[f.id] || "bg-muted text-muted-foreground"
                              }`}
                            >
                              {f.name}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Score</span>
                    <p className="text-sm tabular-nums font-mono font-medium">
                      {opp.compositeScore?.toFixed(3) ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">P(Win)</span>
                    <p className="text-sm tabular-nums font-mono font-medium">
                      {opp.probabilityOfSuccess
                        ? `${(opp.probabilityOfSuccess * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Alloc</span>
                    <p className="text-sm tabular-nums font-mono font-medium">
                      ${opp.suggestedAllocation?.toFixed(2) ?? "0.00"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Target</span>
                    <p className="text-sm tabular-nums font-mono font-medium text-emerald-600">
                      {opp.targetPrice ? `$${opp.targetPrice.toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Stop</span>
                    <p className="text-sm tabular-nums font-mono font-medium text-red-500">
                      {opp.stopLoss ? `$${opp.stopLoss.toFixed(2)}` : "—"}
                    </p>
                  </div>
                  {opp.convictionBand && <ConvictionBadge band={opp.convictionBand} size="md" />}
                  <ActionBadge action={opp.status.toUpperCase()} />
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 bg-muted/10">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Signals */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Signal Values
                      </h4>
                      <SignalBar
                        label="Momentum"
                        value={opp.momentum}
                        description={SIGNAL_DESCRIPTIONS.momentum.domain[opp.domain as keyof typeof SIGNAL_DESCRIPTIONS.momentum.domain]}
                      />
                      <SignalBar
                        label="Mean Reversion"
                        value={opp.meanReversion}
                        description={SIGNAL_DESCRIPTIONS.meanReversion.domain[opp.domain as keyof typeof SIGNAL_DESCRIPTIONS.meanReversion.domain]}
                      />
                      <SignalBar
                        label="Quality"
                        value={opp.quality}
                        description={SIGNAL_DESCRIPTIONS.quality.domain[opp.domain as keyof typeof SIGNAL_DESCRIPTIONS.quality.domain]}
                      />
                      <SignalBar
                        label="Flow"
                        value={opp.flow}
                        description={SIGNAL_DESCRIPTIONS.flow.domain[opp.domain as keyof typeof SIGNAL_DESCRIPTIONS.flow.domain]}
                      />
                      <SignalBar
                        label="Risk"
                        value={opp.risk}
                        description={SIGNAL_DESCRIPTIONS.risk.domain[opp.domain as keyof typeof SIGNAL_DESCRIPTIONS.risk.domain]}
                        isNegative
                      />
                      <SignalBar
                        label="Crowding"
                        value={opp.crowding}
                        description={SIGNAL_DESCRIPTIONS.crowding.domain[opp.domain as keyof typeof SIGNAL_DESCRIPTIONS.crowding.domain]}
                        isNegative
                      />
                    </div>

                    {/* Scoring details */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Scoring Output
                      </h4>
                      <div className="space-y-2">
                        {[
                          { label: "Composite Score", value: opp.compositeScore?.toFixed(3) },
                          { label: "P(Success)", value: opp.probabilityOfSuccess ? `${(opp.probabilityOfSuccess * 100).toFixed(1)}%` : null },
                          { label: "Expected Edge", value: opp.expectedEdge?.toFixed(3) },
                          { label: "Kelly Fraction", value: opp.kellyFraction ? `${(opp.kellyFraction * 100).toFixed(2)}%` : null },
                          { label: "Conviction", value: opp.convictionBand },
                          { label: "Allocation", value: opp.suggestedAllocation ? `$${opp.suggestedAllocation.toFixed(2)}` : null },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono tabular-nums font-medium">{value ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Price levels & actions */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Position
                      </h4>
                      <div className="space-y-2">
                        {[
                          { label: "Entry Price", value: opp.entryPrice ? `$${opp.entryPrice.toFixed(2)}` : null },
                          { label: "Target Price", value: opp.targetPrice ? `$${opp.targetPrice.toFixed(2)}` : null },
                          { label: "Stop Loss", value: opp.stopLoss ? `$${opp.stopLoss.toFixed(2)}` : null },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono tabular-nums font-medium">{value ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 flex gap-2 flex-wrap">
                        {opp.ticker && ["public_markets", "crypto", "etf"].includes(opp.domain) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              autoScoreMutation.mutate(opp.ticker!);
                            }}
                            disabled={autoScoreMutation.isPending}
                            data-testid={`button-auto-score-${opp.id}`}
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            Auto-Score
                          </Button>
                        )}
                        {opp.ticker && (
                          <a
                            href={`https://finbox.com/NASDAQGS:${opp.ticker}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                            data-testid={`link-fundamentals-${opp.id}`}
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Fundamentals
                          </a>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(opp.id);
                          }}
                          data-testid={`button-delete-${opp.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground/50">
                        Created: {new Date(opp.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* AI Thesis */}
                  {opp.thesis && (
                    <div className="mt-4 bg-slate-800/50 border-l-2 border-amber-400/60 rounded-r-md p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-medium text-amber-400">AI Analysis</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{opp.thesis}</p>
                    </div>
                  )}

                  {/* Why this score? */}
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 px-2 h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPipelineId(pipelineId === opp.id ? null : opp.id);
                      }}
                      data-testid={`button-why-score-${opp.id}`}
                    >
                      <FlaskConical className="w-3 h-3 mr-1" />
                      {pipelineId === opp.id ? "Hide pipeline" : "Why this score?"}
                    </Button>
                    {pipelineId === opp.id && <DecisionPipeline opp={opp} />}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {(!filtered || filtered.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No opportunities yet</p>
            <p className="text-xs mt-1 opacity-60">
              Click "Add Opportunity" to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
