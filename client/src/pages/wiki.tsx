import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Search,
  FileText,
  TrendingUp,
  Globe,
  Zap,
  ChevronRight,
  ScrollText,
  RefreshCw,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────

interface WikiPages {
  tickers: string[];
  patterns: string[];
  analysis: string[];
  macro: string[];
}

// ── Markdown renderer (simple) ────────────────────────────────

function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none font-mono text-xs leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold mt-4 mb-2 text-foreground">{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-sm font-semibold mt-3 mb-1.5 text-foreground">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-semibold mt-2 mb-1 text-foreground">{line.slice(4)}</h3>;
        if (line.startsWith("> ")) return <blockquote key={i} className="border-l-2 border-primary/30 pl-3 text-muted-foreground italic my-1">{line.slice(2)}</blockquote>;
        if (line.startsWith("- ")) return <li key={i} className="ml-4 list-disc text-muted-foreground">{renderInline(line.slice(2))}</li>;
        if (line.startsWith("| ")) return <div key={i} className="text-muted-foreground tabular-nums">{line}</div>;
        if (line.startsWith("---")) return <hr key={i} className="my-2 border-border" />;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="text-muted-foreground">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Tab Components ────────────────────────────────────────────

function IndexTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/wiki"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/wiki");
      return res.json();
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="bg-card border border-card-border rounded-lg p-5">
      <MarkdownBlock content={data?.content || "No index content available."} />
    </div>
  );
}

function TickersTab() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const { data: pages, isLoading: pagesLoading } = useQuery<WikiPages>({
    queryKey: ["/api/wiki/pages"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/wiki/pages");
      return res.json();
    },
  });

  const { data: tickerData, isLoading: tickerLoading } = useQuery({
    queryKey: ["/api/wiki/ticker", selectedTicker],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/wiki/ticker/${selectedTicker}`);
      return res.json();
    },
    enabled: !!selectedTicker,
  });

  if (pagesLoading) return <LoadingSkeleton />;

  const tickers = pages?.tickers || [];

  return (
    <div className="flex gap-4">
      {/* Ticker list */}
      <div className="w-48 shrink-0">
        <div className="bg-card border border-card-border rounded-lg p-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Tickers ({tickers.length})
          </h3>
          {tickers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No ticker pages yet. Run autopilot to generate.</p>
          ) : (
            <ul className="space-y-0.5">
              {tickers.map(t => (
                <li key={t}>
                  <button
                    onClick={() => setSelectedTicker(t)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                      selectedTicker === t
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t}
                    <ChevronRight className="w-3 h-3 opacity-40" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Ticker page content */}
      <div className="flex-1 min-w-0">
        {!selectedTicker ? (
          <div className="bg-card border border-card-border rounded-lg p-8 text-center">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a ticker to view its research page</p>
          </div>
        ) : tickerLoading ? (
          <LoadingSkeleton />
        ) : tickerData?.error ? (
          <div className="bg-card border border-card-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">{tickerData.error}</p>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-lg p-5">
            <MarkdownBlock content={tickerData?.content || "No content."} />
          </div>
        )}
      </div>
    </div>
  );
}

function PatternsTab() {
  const { data: pages, isLoading } = useQuery<WikiPages>({
    queryKey: ["/api/wiki/pages"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/wiki/pages");
      return res.json();
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  const patterns = pages?.patterns || [];

  return (
    <div className="bg-card border border-card-border rounded-lg p-5">
      <h3 className="text-sm font-semibold mb-3">Pattern Library</h3>
      {patterns.length === 0 ? (
        <p className="text-xs text-muted-foreground">No patterns discovered yet. Patterns emerge as predictions resolve over time.</p>
      ) : (
        <ul className="space-y-2">
          {patterns.map(p => (
            <li key={p} className="flex items-center gap-2 text-sm">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-mono text-xs">{p.replace(/-/g, " ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchTab() {
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await apiRequest("POST", "/api/wiki/query", { q: query });
      const data = await res.json();
      setSearchResult(data.result);
    } catch (e: any) {
      setSearchResult(`Error: ${e.message}`);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Search the wiki... (e.g. 'NKE momentum patterns')"
          className="flex-1 bg-card border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button onClick={handleSearch} disabled={searching} size="sm">
          <Search className="w-4 h-4 mr-1" />
          {searching ? "Searching..." : "Search"}
        </Button>
      </div>
      {searchResult && (
        <div className="bg-card border border-card-border rounded-lg p-5">
          <MarkdownBlock content={searchResult} />
        </div>
      )}
    </div>
  );
}

function LogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/wiki/log"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/wiki/log");
      return res.json();
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="bg-card border border-card-border rounded-lg p-5 max-h-[600px] overflow-y-auto dark-scrollbar">
      <MarkdownBlock content={data?.content || "No log entries yet."} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

type Tab = "index" | "tickers" | "patterns" | "search" | "log";

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "index", label: "Index", icon: BookOpen },
  { id: "tickers", label: "Tickers", icon: TrendingUp },
  { id: "patterns", label: "Patterns", icon: Zap },
  { id: "search", label: "Search", icon: Search },
  { id: "log", label: "Log", icon: ScrollText },
];

export default function WikiPage() {
  const [activeTab, setActiveTab] = useState<Tab>("index");

  const { data: pages } = useQuery<WikiPages>({
    queryKey: ["/api/wiki/pages"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/wiki/pages");
      return res.json();
    },
  });

  const totalPages =
    (pages?.tickers?.length || 0) +
    (pages?.patterns?.length || 0) +
    (pages?.analysis?.length || 0) +
    (pages?.macro?.length || 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Research Wiki</h1>
            <p className="text-xs text-muted-foreground">
              Karpathy-style knowledge base — grows with every autopilot cycle
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              {pages?.tickers?.length || 0} tickers
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              {pages?.patterns?.length || 0} patterns
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Globe className="w-3 h-3 mr-1" />
              {pages?.macro?.length || 0} macro
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/wiki"] });
              queryClient.invalidateQueries({ queryKey: ["/api/wiki/pages"] });
              queryClient.invalidateQueries({ queryKey: ["/api/wiki/log"] });
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-card-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Pages</p>
          <p className="text-xl font-bold font-mono tabular-nums">{totalPages}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ticker Pages</p>
          <p className="text-xl font-bold font-mono tabular-nums">{pages?.tickers?.length || 0}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Patterns</p>
          <p className="text-xl font-bold font-mono tabular-nums">{pages?.patterns?.length || 0}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Macro Obs.</p>
          <p className="text-xl font-bold font-mono tabular-nums">{pages?.macro?.length || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "index" && <IndexTab />}
        {activeTab === "tickers" && <TickersTab />}
        {activeTab === "patterns" && <PatternsTab />}
        {activeTab === "search" && <SearchTab />}
        {activeTab === "log" && <LogTab />}
      </div>
    </div>
  );
}
