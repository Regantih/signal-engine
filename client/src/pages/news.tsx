import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Newspaper,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Zap,
  Star,
} from "lucide-react";

interface NewsItem {
  id: number;
  benzingaId: string;
  ticker: string | null;
  title: string;
  body: string | null;
  url: string | null;
  author: string | null;
  source: string | null;
  channels: string | null;
  tags: string | null;
  sentiment: number | null;
  isWiim: number;
  publishedAt: string;
  fetchedAt: string;
}

function SentimentIndicator({ sentiment }: { sentiment: number | null }) {
  if (sentiment === null || sentiment === undefined) return null;
  
  if (sentiment > 0.1) return (
    <div className="flex items-center gap-1 text-emerald-500">
      <TrendingUp className="w-3.5 h-3.5" />
      <span className="text-xs font-mono tabular-nums">+{sentiment.toFixed(2)}</span>
    </div>
  );
  if (sentiment < -0.1) return (
    <div className="flex items-center gap-1 text-red-500">
      <TrendingDown className="w-3.5 h-3.5" />
      <span className="text-xs font-mono tabular-nums">{sentiment.toFixed(2)}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Minus className="w-3.5 h-3.5" />
      <span className="text-xs font-mono tabular-nums">{sentiment.toFixed(2)}</span>
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const timeAgo = getTimeAgo(item.publishedAt);
  let channels: string[] = [];
  try { channels = item.channels ? JSON.parse(item.channels) : []; } catch {}

  return (
    <div className="bg-card border border-card-border rounded-lg p-4 hover:border-primary/30 transition-colors" data-testid={`news-card-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {item.isWiim === 1 && (
              <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                <Zap className="w-3 h-3 mr-0.5" /> WIIM
              </Badge>
            )}
            {item.ticker && item.ticker.split(",").map(t => (
              <span key={t.trim()} className="text-[10px] font-mono font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {t.trim()}
              </span>
            ))}
            {channels.slice(0, 3).map(ch => (
              <span key={ch} className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">{ch}</span>
            ))}
          </div>
          <h3 className="text-sm font-medium leading-snug">{item.title}</h3>
          {item.body && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{item.body}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-muted-foreground/50">{timeAgo}</span>
            {item.author && <span className="text-[10px] text-muted-foreground/50">by {item.author}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <SentimentIndicator sentiment={item.sentiment} />
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-primary transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export default function News() {
  const { toast } = useToast();
  const [tickerFilter, setTickerFilter] = useState("");

  const { data: newsData, isLoading } = useQuery<{ news: NewsItem[]; count: number }>({
    queryKey: ["/api/benzinga/news", tickerFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tickerFilter) params.set("ticker", tickerFilter);
      params.set("limit", "100");
      const res = await apiRequest("GET", `/api/benzinga/news?${params}`);
      return res.json();
    },
  });

  const { data: opps } = useQuery<Array<{ id: number; name: string; ticker: string | null; domain: string }>>({
    queryKey: ["/api/opportunities"],
  });

  const refreshMutation = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams({ refresh: "true" });
      if (tickerFilter) params.set("ticker", tickerFilter);
      return apiRequest("GET", `/api/benzinga/news?${params}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benzinga/news"] });
      toast({ title: "News refreshed from Benzinga" });
    },
    onError: (e: any) => {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    },
  });

  const trackedTickers = [...new Set((opps || []).filter(o => o.ticker).map(o => o.ticker!.toUpperCase()))];
  const news = newsData?.news || [];
  const wiimNews = news.filter(n => n.isWiim === 1);
  const regularNews = news.filter(n => n.isWiim !== 1);

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Newspaper className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">News & Insights</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Benzinga-powered news feed with sentiment scoring
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          data-testid="button-refresh-news"
          className="w-full sm:w-auto min-h-[44px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          {refreshMutation.isPending ? "Fetching..." : "Fetch News"}
        </Button>
      </div>

      {/* Ticker filter chips */}
      {trackedTickers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTickerFilter("")}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !tickerFilter ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            data-testid="filter-all"
          >
            All News
          </button>
          {trackedTickers.map(ticker => (
            <button
              key={ticker}
              onClick={() => setTickerFilter(ticker === tickerFilter ? "" : ticker)}
              className={`text-xs font-mono px-3 py-1.5 rounded-full border transition-colors ${
                tickerFilter === ticker ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
              }`}
              data-testid={`filter-${ticker}`}
            >
              {ticker}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Newspaper className="w-10 h-10 mx-auto mb-4 opacity-40" />
          <h3 className="text-sm font-medium mb-1">No news yet</h3>
          <p className="text-xs opacity-60 max-w-sm mx-auto">
            {trackedTickers.length > 0
              ? "Click \"Fetch News\" to pull the latest Benzinga headlines for your tracked tickers."
              : "Add opportunities with ticker symbols first, then fetch news here."}
          </p>
        </div>
      ) : (
        <>
          {/* WIIM Section */}
          {wiimNews.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-medium text-amber-500">Why Is It Moving</h3>
                <span className="text-[10px] text-muted-foreground/50">({wiimNews.length})</span>
              </div>
              <div className="space-y-2">
                {wiimNews.map(item => <NewsCard key={item.id} item={item} />)}
              </div>
            </div>
          )}

          {/* Regular News */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-muted-foreground/60" />
              <h3 className="text-sm font-medium text-muted-foreground">Headlines</h3>
              <span className="text-[10px] text-muted-foreground/50">({regularNews.length})</span>
            </div>
            <div className="space-y-2">
              {regularNews.map(item => <NewsCard key={item.id} item={item} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
