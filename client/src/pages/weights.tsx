import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Save, RotateCcw } from "lucide-react";

interface WeightConfig {
  id: number;
  domain: string;
  momentum: number;
  meanReversion: number;
  quality: number;
  flow: number;
  risk: number;
  crowding: number;
}

const DOMAIN_LABELS: Record<string, string> = {
  public_markets: "Public Markets",
  vc_themes: "VC Themes",
  content_brand: "Content / Brand",
  side_business: "Side Business",
};

const WEIGHT_INFO: Record<string, { label: string; description: string }> = {
  momentum: { label: "Momentum", description: "Weight for trend strength signals" },
  meanReversion: { label: "Mean Reversion", description: "Weight for deviation-from-fair-value signals" },
  quality: { label: "Quality", description: "Weight for fundamental strength signals" },
  flow: { label: "Flow", description: "Weight for capital/attention flow signals" },
  risk: { label: "Risk (penalty)", description: "Weight for downside risk penalty" },
  crowding: { label: "Crowding (penalty)", description: "Weight for crowding/competition penalty" },
};

const DEFAULTS: Record<string, number> = {
  momentum: 0.20,
  meanReversion: 0.15,
  quality: 0.25,
  flow: 0.15,
  risk: 0.15,
  crowding: 0.10,
};

export default function Weights() {
  const { toast } = useToast();
  const { data: weights, isLoading } = useQuery<WeightConfig[]>({
    queryKey: ["/api/weights"],
  });

  const [localWeights, setLocalWeights] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    if (weights) {
      const map: Record<string, Record<string, number>> = {};
      for (const w of weights) {
        map[w.domain] = {
          momentum: w.momentum,
          meanReversion: w.meanReversion,
          quality: w.quality,
          flow: w.flow,
          risk: w.risk,
          crowding: w.crowding,
        };
      }
      setLocalWeights(map);
    }
  }, [weights]);

  const saveMutation = useMutation({
    mutationFn: async ({ domain, data }: { domain: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/weights/${domain}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weights"] });
      toast({ title: "Weights saved" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleSave = (domain: string) => {
    const w = localWeights[domain];
    if (w) {
      saveMutation.mutate({ domain, data: w });
    }
  };

  const handleReset = (domain: string) => {
    setLocalWeights((prev) => ({ ...prev, [domain]: { ...DEFAULTS } }));
  };

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-xl font-semibold">Weight Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Adjust signal weights per domain. Renaissance principle: the model matters more than any single signal.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {Object.entries(DOMAIN_LABELS).map(([domain, label]) => {
          const w = localWeights[domain] || { ...DEFAULTS };
          const totalWeight = Object.values(w).reduce((s, v) => s + v, 0);

          return (
            <div key={domain} className="bg-card border border-card-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">{label}</h3>
                <span className={`text-xs tabular-nums font-mono ${
                  Math.abs(totalWeight - 1) < 0.02 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"
                }`}>
                  Σ = {(totalWeight * 100).toFixed(0)}%
                </span>
              </div>

              <div className="space-y-3">
                {Object.entries(WEIGHT_INFO).map(([key, info]) => {
                  const val = w[key] ?? DEFAULTS[key];
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{info.label}</span>
                        <span className="text-xs tabular-nums font-mono text-muted-foreground">
                          {(val * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Slider
                        value={[val * 100]}
                        onValueChange={([v]) => {
                          setLocalWeights((prev) => ({
                            ...prev,
                            [domain]: { ...prev[domain], [key]: v / 100 },
                          }));
                        }}
                        min={0}
                        max={50}
                        step={1}
                        data-testid={`slider-weight-${domain}-${key}`}
                      />
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{info.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
                <Button
                  size="sm"
                  onClick={() => handleSave(domain)}
                  disabled={saveMutation.isPending}
                  data-testid={`button-save-weights-${domain}`}
                >
                  <Save className="w-3 h-3 mr-1.5" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReset(domain)}
                  data-testid={`button-reset-weights-${domain}`}
                >
                  <RotateCcw className="w-3 h-3 mr-1.5" />
                  Reset
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Theory */}
      <div className="bg-card border border-card-border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2">Weight Theory</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Weights control how much each signal contributes to the composite score.</p>
          <p>Positive signals (momentum, mean reversion, quality, flow) are additive.</p>
          <p>Penalty signals (risk, crowding) are subtractive — higher values reduce the score.</p>
          <p>
            The Renaissance approach: no single signal dominates. The edge comes from combining many
            weak signals with proper weighting and cost control.
          </p>
          <p>Adjust weights per domain to reflect different market dynamics.</p>
        </div>
      </div>
    </div>
  );
}
