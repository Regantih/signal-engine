import { useQuery } from "@tanstack/react-query";
import {
  Settings,
  Key,
  CheckCircle,
  Newspaper,
  ExternalLink,
  Plug,
} from "lucide-react";

export default function SettingsPage() {
  const { data: benzingaStatus } = useQuery<{ connected: boolean; source: string }>({
    queryKey: ["/api/benzinga/status"],
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

      {/* Future integrations */}
      <div className="bg-card border border-card-border rounded-lg p-4 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Key className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">More Integrations</h3>
            <p className="text-xs text-muted-foreground/60">TradingView webhooks, brokerage APIs, and more coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
