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
  Mail,
  Send,
  LineChart,
  Zap,
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

interface DigestData {
  date: string;
  buySignalCount: number;
  portfolioPnl: number;
  portfolioPnlPercent: number;
  topPicks: Array<{
    name: string;
    ticker: string | null;
    compositeScore: number;
    probabilityOfSuccess: number;
    suggestedAllocation: number;
    convictionBand: string;
  }>;
  sellSignals: Array<{
    name: string;
    ticker: string | null;
    reason: string;
  }>;
  marketRegime: string;
  summary: string;
}

function DigestPreview() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: digest, isLoading } = useQuery<DigestData>({
    queryKey: ["/api/digest/preview"],
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/digest/generate");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/digest/preview"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "Digest generated", description: "Daily digest created and notification sent." });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Digest failed", description: e.message });
    },
  });

  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden" data-testid="digest-preview">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-cyan-500/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-cyan-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Daily Digest</h3>
              <p className="text-xs text-muted-foreground">Daily 8am summary of portfolio, picks & market</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-digest"
          >
            {generateMutation.isPending ? (
              <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-3 h-3 mr-1.5" />
            )}
            Generate Now
          </Button>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
          </div>
        ) : digest ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">Date: <span className="text-foreground font-medium">{digest.date}</span></span>
              <span className="text-muted-foreground">BUY Signals: <span className="text-emerald-400 font-medium">{digest.buySignalCount}</span></span>
              <span className="text-muted-foreground">Regime: <span className={`font-medium ${
                digest.marketRegime === "CRISIS" ? "text-red-400" :
                digest.marketRegime === "OPPORTUNITY" ? "text-emerald-400" :
                "text-amber-400"
              }`}>{digest.marketRegime}</span></span>
            </div>

            <div className={`text-sm font-semibold ${digest.portfolioPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              P&L: {digest.portfolioPnl >= 0 ? "+" : ""}${digest.portfolioPnl.toFixed(2)} ({digest.portfolioPnlPercent >= 0 ? "+" : ""}{digest.portfolioPnlPercent.toFixed(2)}%)
            </div>

            {digest.topPicks.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Top Picks</p>
                <div className="space-y-1">
                  {digest.topPicks.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span>
                        <span className="text-muted-foreground/50 mr-1">{i + 1}.</span>
                        <span className="font-medium">{p.name}</span>
                        {p.ticker && <span className="text-muted-foreground ml-1">({p.ticker})</span>}
                      </span>
                      <span className="font-mono tabular-nums text-emerald-400">{(p.probabilityOfSuccess * 100).toFixed(0)}% | ${p.suggestedAllocation.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground/70 italic">{digest.summary}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No digest generated yet. Click "Generate Now" to create one.</p>
        )}
      </div>
    </div>
  );
}

interface TVStatus {
  connected: boolean;
  message: string;
  lastChecked: string;
  version?: string;
}

function TradingViewMCPSection() {
  const { toast } = useToast();

  const { data: tvStatus, isLoading: tvLoading } = useQuery<TVStatus>({
    queryKey: ["/api/tradingview/status"],
    retry: false,
    refetchInterval: 60000,
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tradingview/test");
      return res.json();
    },
    onSuccess: (data: TVStatus) => {
      if (data.connected) {
        toast({ title: "TradingView Connected", description: `MCP bridge active${data.version ? ` (v${data.version})` : ""}.` });
      } else {
        toast({ variant: "destructive", title: "Not Connected", description: data.message });
      }
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Test Failed", description: e.message });
    },
  });

  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden" data-testid="tv-mcp-section">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-purple-500/10 flex items-center justify-center">
              <LineChart className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium">TradingView MCP</h3>
              <p className="text-xs text-muted-foreground">Real-time quotes, indicators & alerts via Chrome DevTools</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {tvLoading ? (
              <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
            ) : tvStatus?.connected ? (
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

      <div className="p-4 space-y-4">
        {tvStatus?.connected && (
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1 text-emerald-400">
              <Zap className="w-3 h-3" />
              Live data active
            </span>
            {tvStatus.version && (
              <span className="text-muted-foreground">Version: v{tvStatus.version}</span>
            )}
            <span className="text-muted-foreground">
              Checked: {new Date(tvStatus.lastChecked).toLocaleTimeString()}
            </span>
          </div>
        )}

        <div className="text-xs text-muted-foreground/70 space-y-1.5">
          <p className="flex items-center gap-1.5">
            <Plug className="w-3 h-3" />
            Connects to TradingView Desktop via Chrome DevTools Protocol (port 9222)
          </p>
          <p>
            When connected, Signal Engine uses real-time TradingView prices instead of delayed Yahoo Finance data. HIGH conviction picks automatically create TradingView alerts.
          </p>
          <p className="font-medium text-muted-foreground/90">Setup:</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>
              Install the MCP server from{" "}
              <a
                href="https://github.com/LewisWJackson/tradingview-mcp-jackson"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                github.com/LewisWJackson/tradingview-mcp-jackson <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Launch TradingView Desktop with <code className="bg-muted px-1 rounded text-[10px]">--remote-debugging-port=9222</code></li>
            <li>Ensure the <code className="bg-muted px-1 rounded text-[10px]">tv</code> CLI command is in your PATH</li>
            <li>Click "Test Connection" below</li>
          </ol>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
          data-testid="button-test-tv-connection"
        >
          {testMutation.isPending ? (
            <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
          ) : (
            <LineChart className="w-3 h-3 mr-1.5" />
          )}
          Test Connection
        </Button>

        {tvStatus && !tvStatus.connected && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
            <XCircle className="w-3 h-3 text-muted-foreground/40" />
            {tvStatus.message}
          </p>
        )}
      </div>
    </div>
  );
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
    <div className="p-4 lg:p-6 max-w-[800px] space-y-4 lg:space-y-6">
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

      {/* Daily Digest Preview */}
      <DigestPreview />

      {/* TradingView MCP */}
      <TradingViewMCPSection />

      {/* Future integrations */}
      <div className="bg-card border border-card-border rounded-lg p-4 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Key className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">More Integrations</h3>
            <p className="text-xs text-muted-foreground/60">Live broker feeds, advanced screener APIs, and more coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
