import { useState, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScoreCard, type ScoreData } from "@/components/score-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  TrendingUp,
  Zap,
  Shield,
  ArrowRight,
  BarChart3,
} from "lucide-react";

export default function Landing() {
  const [, params] = useRoute("/score/:ticker");
  const initialTicker = params?.ticker?.toUpperCase() || "";

  const [inputValue, setInputValue] = useState(initialTicker);
  const [searchTicker, setSearchTicker] = useState(initialTicker);

  const { data, isLoading, error } = useQuery<ScoreData>({
    queryKey: ["/api/score", searchTicker],
    queryFn: async () => {
      const res = await fetch(`./api/score/${searchTicker}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to fetch" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: searchTicker.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const handleSearch = useCallback(() => {
    const ticker = inputValue.trim().toUpperCase();
    if (ticker && /^[A-Z]{1,10}$/.test(ticker)) {
      setSearchTicker(ticker);
      window.location.hash = `#/score/${ticker}`;
    }
  }, [inputValue]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3" />
        <div className="relative max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Zap className="h-3 w-3" /> AI-Powered Stock Scoring
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Get an AI Score on Any Stock.{" "}
            <span className="text-primary">Instantly.</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Type any ticker to get a comprehensive AI-generated score, thesis, price targets, and fundamental analysis. No signup required.
          </p>

          {/* Search Bar */}
          <div className="max-w-md mx-auto">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Enter ticker (e.g. AAPL, TSLA, NVDA)"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                  className="pl-10 h-12 text-lg font-mono uppercase"
                  maxLength={10}
                  autoFocus
                />
              </div>
              <Button type="submit" size="lg" className="h-12 px-6" disabled={isLoading}>
                {isLoading ? "Scoring..." : "Score"}
              </Button>
            </form>
          </div>

          {/* Quick tickers */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="text-xs text-muted-foreground">Try:</span>
            {["AAPL", "TSLA", "NVDA", "MSFT", "AMZN"].map((t) => (
              <button
                key={t}
                onClick={() => { setInputValue(t); setSearchTicker(t); window.location.hash = `#/score/${t}`; }}
                className="text-xs font-mono px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Score Card Result */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        {isLoading && (
          <div className="max-w-2xl mx-auto space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        )}

        {error && searchTicker && !isLoading && (
          <div className="max-w-2xl mx-auto text-center py-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              Could not score {searchTicker}: {(error as Error).message}
            </div>
          </div>
        )}

        {data && !isLoading && <ScoreCard data={data} />}
      </div>

      {/* Features Section (shown when no score yet) */}
      {!searchTicker && (
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6 text-primary" />}
              title="6-Signal Analysis"
              description="Momentum, Mean Reversion, Quality, Flow, Risk, and Crowding — each scored 0-100."
            />
            <FeatureCard
              icon={<TrendingUp className="h-6 w-6 text-emerald-500" />}
              title="AI Price Targets"
              description="Probability-calibrated target prices and stop losses using fractional Kelly sizing."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6 text-amber-500" />}
              title="Fundamental Grade"
              description="A-F fundamental grade based on valuation, profitability, growth, and financial health."
            />
          </div>

          {/* CTA */}
          <div className="text-center mt-16">
            <p className="text-muted-foreground mb-4">Want to track your portfolio and get real-time alerts?</p>
            <Button size="lg" onClick={() => { window.location.hash = "#/"; }}>
              Sign up to track your portfolio <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* CTA after score card */}
      {data && (
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground mb-3">Want to track {data.ticker} and get alerts?</p>
          <Button size="lg" onClick={() => { window.location.hash = "#/"; }}>
            Sign up to track your portfolio <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border/50 mt-8">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Signal Engine — AI-powered stock analysis. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl border border-border/50 bg-card/50 hover:bg-card transition-colors">
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
