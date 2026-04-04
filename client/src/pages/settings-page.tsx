import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  Key,
  CheckCircle,
  Newspaper,
  ExternalLink,
  Plug,
  Eye,
  EyeOff,
  Wallet,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AlpacaStatus {
  connected: boolean;
  account?: {
    equity: string;
    buyingPower: string;
    cash: string;
    portfolioValue: string;
  };
  error?: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Benzinga status
  const { data: benzingaStatus } = useQuery<{ connected: boolean; source: string }>({
    queryKey: ["/api/benzinga/status"],
  });

  // Alpaca status
  const { data: alpacaStatus, isLoading: alpacaLoading, refetch: refetchAlpaca } = useQuery<AlpacaStatus>({
    queryKey: ["/api/alpaca/status"],
    retry: false,
  });

  // Alpaca key form state
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  const saveAlpacaMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/settings", { key: "alpaca_api_key", value: apiKey });
      await apiRequest("POST", "/api/settings", { key: "alpaca_secret_key", value: secretKey });
    },
    onSuccess: () => {
      toast({ title: "Alpaca Keys Saved", description: "API keys saved. Testing connection..." });
      setApiKey("");
      setSecretKey("");
      qc.invalidateQueries({ queryKey: ["/api/alpaca/status"] });
      setTimeout(() => refetchAlpaca(), 500);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save Failed", description: e.message });
    },
  });

  return (
    <div className="p-6 max-w-[800px] space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Settings</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Integrations and data sources
        </p>
      </div>

      {/* Benzinga — Connected */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-amber-500/10 flex items-center justify-center">
                <Newspaper className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Benzinga News</h3>
                <p className="text-xs text-muted-foreground">Headlines, WIIM alerts, sentiment scoring</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-500">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Connected</span>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-muted-foreground/60 space-y-1.5">
            <p className="flex items-center gap-1.5">
              <Plug className="w-3 h-3" />
              Pulling from Benzinga's public news feed — no API key required
            </p>
            <p>News is fetched per ticker from your tracked opportunities. Go to the News page and click "Fetch News" to pull the latest headlines.</p>
            <p>
              For real-time streaming and full article bodies, get an API key from the{" "}
              <a href="https://docs.benzinga.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                Benzinga Developer Portal <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Alpaca Paper Trading */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Alpaca Paper Trading</h3>
                <p className="text-xs text-muted-foreground">Execute bracket orders via Alpaca paper trading API</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {alpacaLoading ? (
                <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
              ) : alpacaStatus?.connected ? (
                <span className="flex items-center gap-1 text-emerald-500 text-xs font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                  <XCircle className="w-4 h-4" />
                  Not Connected
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Connected: show account summary */}
        {alpacaStatus?.connected && alpacaStatus.account && (
          <div className="px-4 pt-4 pb-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Equity</p>
                <p className="font-semibold">${(parseFloat(alpacaStatus.account.equity || "0") || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cash</p>
                <p className="font-semibold">${(parseFloat(alpacaStatus.account.cash || "0") || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Buying Power</p>
                <p className="font-semibold">${(parseFloat(alpacaStatus.account.buyingPower || "0") || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Portfolio</p>
                <p className="font-semibold">${(parseFloat(alpacaStatus.account.portfolioValue || "0") || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 space-y-4">
          <div className="text-xs text-muted-foreground/70 space-y-1">
            <p className="flex items-center gap-1.5">
              <Plug className="w-3 h-3" />
              Uses Alpaca paper trading — real API with fake money, no risk
            </p>
            <p>
              Get free paper trading keys at{" "}
              <a
                href="https://app.alpaca.markets/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                app.alpaca.markets/signup <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="input-alpaca-api-key" className="text-xs font-medium">
                API Key ID
              </Label>
              <div className="relative">
                <Input
                  id="input-alpaca-api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="PKXXXXXXXXXXXXXXXXXXXXXXXX"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                  data-testid="input-alpaca-api-key"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  data-testid="button-toggle-api-key"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="input-alpaca-secret-key" className="text-xs font-medium">
                Secret Key
              </Label>
              <div className="relative">
                <Input
                  id="input-alpaca-secret-key"
                  type={showSecretKey ? "text" : "password"}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                  data-testid="input-alpaca-secret-key"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showSecretKey ? "Hide secret key" : "Show secret key"}
                  data-testid="button-toggle-secret-key"
                >
                  {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => saveAlpacaMutation.mutate()}
              disabled={
                !apiKey.trim() ||
                !secretKey.trim() ||
                saveAlpacaMutation.isPending
              }
              data-testid="button-save-alpaca-keys"
            >
              {saveAlpacaMutation.isPending ? (
                <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <Key className="w-3 h-3 mr-1.5" />
              )}
              Save & Connect
            </Button>
          </div>

          {alpacaStatus?.error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              {alpacaStatus.error}
            </p>
          )}
        </div>
      </div>

      {/* Future integrations */}
      <div className="bg-card border border-card-border rounded-lg p-4 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Key className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">More Integrations</h3>
            <p className="text-xs text-muted-foreground/60">TradingView webhooks, live broker feeds, and more coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
