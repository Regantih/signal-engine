import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, DollarSign, Radar, ArrowRight, Check, Loader2 } from "lucide-react";

interface OnboardingProps {
  onComplete: () => void;
}

const BUDGET_PRESETS = [100, 1000, 10000, 100000];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState(100);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ tickers: number; opportunities: number; highConviction: number } | null>(null);

  async function handleSetBudget() {
    try {
      await apiRequest("PATCH", "/api/portfolio", {
        totalBudget: budget,
        cashRemaining: budget,
      });
    } catch { /* portfolio update optional */ }
    setStep(2);
  }

  async function handleStartScan() {
    setScanning(true);
    try {
      const res = await apiRequest("POST", "/api/pipeline/run");
      const data = await res.json();
      setScanResult({
        tickers: data.scanResults ?? 0,
        opportunities: data.scored ?? 0,
        highConviction: data.buySignals ?? 0,
      });
    } catch {
      setScanResult({ tickers: 0, opportunities: 0, highConviction: 0 });
    }
    setScanning(false);
  }

  useEffect(() => {
    if (step === 2 && !scanResult && !scanning) {
      handleStartScan();
    }
  }, [step]);

  function handleFinish() {
    try {
      localStorage.setItem("signalEngine_onboarded", "true");
    } catch { /* localStorage may be blocked */ }
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
      <div className="w-full max-w-lg mx-4">
        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                s === step ? "bg-primary scale-125" : s < step ? "bg-primary/60" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-card border border-border rounded-2xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Welcome to Signal Engine</h2>
              <p className="text-muted-foreground mb-8">Your AI-powered capital allocation system</p>

              <div className="space-y-4 text-left mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Radar className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Scan the market automatically</p>
                    <p className="text-xs text-muted-foreground">Finds high-conviction opportunities using multi-signal scoring</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <DollarSign className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Paper trade with precision</p>
                    <p className="text-xs text-muted-foreground">Fractional Kelly sizing, trailing stops, and risk management built in</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Learn and adapt</p>
                    <p className="text-xs text-muted-foreground">Feedback loop optimizes weights based on realized outcomes</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full bg-primary text-primary-foreground rounded-lg py-3 px-6 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="budget"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-card border border-border rounded-2xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                <DollarSign className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Set Your Budget</h2>
              <p className="text-muted-foreground mb-6">How much capital do you want to allocate?</p>

              <div className="relative mb-6">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-background border border-border rounded-lg py-3 pl-8 pr-4 text-2xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex gap-2 mb-6 justify-center">
                {BUDGET_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setBudget(p)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      budget === p
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    ${p.toLocaleString()}
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mb-6">
                This is paper money — no real funds at risk
              </p>

              <button
                onClick={handleSetBudget}
                className="w-full bg-primary text-primary-foreground rounded-lg py-3 px-6 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-card border border-border rounded-2xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-6">
                {scanning ? (
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                ) : (
                  <Check className="w-8 h-8 text-emerald-500" />
                )}
              </div>

              {scanning ? (
                <>
                  <h2 className="text-2xl font-bold mb-2">Scanning the Market</h2>
                  <p className="text-muted-foreground mb-8">Finding opportunities and scoring them...</p>

                  <div className="space-y-3 mb-8">
                    {["Running screeners", "Fetching live data", "Computing signals", "Scoring opportunities"].map((label, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                          <Loader2 className="w-3 h-3 text-primary animate-spin" />
                        </div>
                        <span className="text-sm text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : scanResult ? (
                <>
                  <h2 className="text-2xl font-bold mb-2">Scan Complete!</h2>
                  <p className="text-muted-foreground mb-8">Your engine is ready to go</p>

                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-background rounded-lg p-4">
                      <span className="text-2xl font-bold tabular-nums">{scanResult.tickers}</span>
                      <p className="text-xs text-muted-foreground mt-1">Tickers Scanned</p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <span className="text-2xl font-bold tabular-nums">{scanResult.opportunities}</span>
                      <p className="text-xs text-muted-foreground mt-1">Scored</p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <span className="text-2xl font-bold text-emerald-500 tabular-nums">{scanResult.highConviction}</span>
                      <p className="text-xs text-muted-foreground mt-1">Buy Signals</p>
                    </div>
                  </div>

                  <button
                    onClick={handleFinish}
                    className="w-full bg-primary text-primary-foreground rounded-lg py-3 px-6 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    Go to Dashboard <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
