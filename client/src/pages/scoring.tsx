import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConvictionBadge, ActionBadge } from "@/components/conviction-badge";
import { scoreLocally, DEFAULT_WEIGHTS, SIGNAL_DESCRIPTIONS, type Weights } from "@/lib/scoring";

export default function Scoring() {
  const [domain, setDomain] = useState("public_markets");
  const [signals, setSignals] = useState({
    momentum: 50,
    meanReversion: 50,
    quality: 50,
    flow: 50,
    risk: 50,
    crowding: 50,
  });
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });

  const result = scoreLocally(signals, weights);

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-xl font-semibold">Live Scoring Sandbox</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Adjust signals and weights to see real-time scoring output
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Signal Inputs */}
        <div className="lg:col-span-1 space-y-4 lg:space-y-6">
          <div className="bg-card border border-card-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">Signal Inputs</h3>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger className="w-40" data-testid="select-scoring-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public_markets">Public Markets</SelectItem>
                  <SelectItem value="vc_themes">VC Themes</SelectItem>
                  <SelectItem value="content_brand">Content / Brand</SelectItem>
                  <SelectItem value="side_business">Side Business</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              {Object.entries(SIGNAL_DESCRIPTIONS).map(([key, info]) => {
                const isNegative = key === "risk" || key === "crowding";
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium">
                        {info.label}
                        {isNegative && <span className="text-red-400 ml-1">(penalty)</span>}
                      </span>
                      <span className="text-xs tabular-nums font-mono text-muted-foreground w-8 text-right">
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
                      data-testid={`slider-scoring-${key}`}
                    />
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {info.domain[domain as keyof typeof info.domain] || info.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weights */}
          <div className="bg-card border border-card-border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-4">Weights</h3>
            <div className="space-y-3">
              {Object.entries(weights).map(([key, w]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                    <span className="text-xs tabular-nums font-mono text-muted-foreground">
                      {(w * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    value={[w * 100]}
                    onValueChange={([v]) =>
                      setWeights((prev) => ({ ...prev, [key]: v / 100 }))
                    }
                    min={0}
                    max={50}
                    step={1}
                    data-testid={`slider-weight-${key}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Score Output */}
        <div className="lg:col-span-2 space-y-4">
          {/* Primary metrics */}
          <div className="bg-card border border-card-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-medium">Scoring Output</h3>
              <div className="flex items-center gap-2">
                <ConvictionBadge band={result.convictionBand} size="md" />
                <ActionBadge action={result.action} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Composite Score</span>
                <span className="text-2xl font-semibold tabular-nums font-mono">
                  {result.compositeScore.toFixed(3)}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">P(Success)</span>
                <span className="text-2xl font-semibold tabular-nums font-mono">
                  {(result.probabilityOfSuccess * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Expected Edge</span>
                <span className={`text-2xl font-semibold tabular-nums font-mono ${
                  result.expectedEdge > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                }`}>
                  {result.expectedEdge > 0 ? "+" : ""}{result.expectedEdge.toFixed(3)}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Kelly Fraction</span>
                <span className="text-xl font-semibold tabular-nums font-mono">
                  {(result.kellyFraction * 100).toFixed(2)}%
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Suggested Allocation</span>
                <span className="text-xl font-semibold tabular-nums font-mono">
                  ${result.suggestedAllocation.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground block">of $100 budget</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Downside Risk</span>
                <span className="text-xl font-semibold tabular-nums font-mono text-red-500">
                  {result.downsideRisk.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Signal Contribution Waterfall */}
          <div className="bg-card border border-card-border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-4">Why This Score? (Signal Contributions)</h3>
            <div className="space-y-2">
              {Object.entries(result.signalContributions).map(([key, contribution]) => {
                const pct = contribution * 100;
                const isPositive = pct > 0;
                const absWidth = Math.min(100, Math.abs(pct) * 2);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-28 shrink-0 capitalize">
                      {key.replace(/([A-Z])/g, " $1")}
                    </span>
                    <div className="flex-1 flex items-center">
                      <div className="w-1/2 flex justify-end">
                        {!isPositive && (
                          <div
                            className="h-4 bg-red-500/60 rounded-l"
                            style={{ width: `${absWidth}%` }}
                          />
                        )}
                      </div>
                      <div className="w-px h-6 bg-border shrink-0" />
                      <div className="w-1/2">
                        {isPositive && (
                          <div
                            className="h-4 bg-emerald-500/60 rounded-r"
                            style={{ width: `${absWidth}%` }}
                          />
                        )}
                      </div>
                    </div>
                    <span className={`text-xs tabular-nums font-mono w-14 text-right ${
                      isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                    }`}>
                      {isPositive ? "+" : ""}{pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Formula reference */}
          <div className="bg-card border border-card-border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-2">Mathematical Framework</h3>
            <div className="text-xs text-muted-foreground space-y-1.5 font-mono">
              <p>1. Z-score: Z(x) = (x - 50) / 16.67</p>
              <p>2. Composite: Score = Σ w<sub>+</sub>Z(positive) − Σ w<sub>−</sub>Z(negative)</p>
              <p>3. Probability: P = 1 / (1 + e<sup>−1.5·Score</sup>)</p>
              <p>4. Edge: E = P·b − (1−P) − cost</p>
              <p>5. Kelly: f = 0.25 · (P·b − (1−P)) / b</p>
              <p>6. Allocation: $ = f × Budget</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
