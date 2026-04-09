import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BookOpen, Search, FileText, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

function renderMarkdown(md: string): JSX.Element {
  const lines = md.split("\n");
  const elements: JSX.Element[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = `line-${i}`;

    if (line.startsWith("# ")) {
      elements.push(<h1 key={key} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key} className="text-xl font-semibold mt-4 mb-2 text-primary">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key} className="text-lg font-medium mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={key} className="border-l-4 border-muted-foreground/30 pl-3 text-muted-foreground text-sm italic my-1">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.startsWith("| ") && line.endsWith(" |")) {
      // Collect table rows
      const tableRows: string[] = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith("|")) {
        tableRows.push(lines[j]);
        j++;
      }
      i = j - 1;

      const headerRow = tableRows[0];
      const dataRows = tableRows.slice(2); // skip separator row
      const headers = headerRow.split("|").filter(c => c.trim()).map(c => c.trim());

      elements.push(
        <div key={key} className="overflow-x-auto my-2">
          <table className="min-w-full text-sm border border-border rounded">
            <thead>
              <tr className="bg-muted">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-3 py-1.5 text-left font-medium border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => {
                const cells = row.split("|").filter(c => c.trim()).map(c => c.trim());
                return (
                  <tr key={ri} className="border-b border-border/50 hover:bg-muted/50">
                    {cells.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5">{cell}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    } else if (line.startsWith("- **")) {
      const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
      if (match) {
        elements.push(
          <div key={key} className="flex gap-1 text-sm py-0.5">
            <span className="font-medium">{match[1]}:</span>
            <span className="text-muted-foreground">{match[2]}</span>
          </div>
        );
      } else {
        elements.push(<p key={key} className="text-sm text-muted-foreground py-0.5">{line.slice(2)}</p>);
      }
    } else if (line.startsWith("- ")) {
      elements.push(<p key={key} className="text-sm pl-4 py-0.5">• {line.slice(2)}</p>);
    } else if (line.startsWith("---")) {
      elements.push(<hr key={key} className="my-3 border-border" />);
    } else if (line.startsWith("_") && line.endsWith("_")) {
      elements.push(<p key={key} className="text-sm italic text-muted-foreground my-1">{line.slice(1, -1)}</p>);
    } else if (line.trim()) {
      elements.push(<p key={key} className="text-sm my-0.5">{line}</p>);
    }
  }

  return <>{elements}</>;
}

export default function Wiki() {
  const [tickerSearch, setTickerSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [activeTab, setActiveTab] = useState<"index" | "ticker" | "search" | "log">("index");

  // Fetch wiki index
  const { data: indexData, isLoading: indexLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/wiki"],
  });

  // Fetch ticker page
  const { data: tickerData, isLoading: tickerLoading, refetch: refetchTicker } = useQuery<{ ticker: string; content: string }>({
    queryKey: ["/api/wiki/ticker", tickerSearch.toUpperCase()],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/wiki/ticker/${tickerSearch.toUpperCase()}`);
      return res.json();
    },
    enabled: false,
  });

  // Fetch wiki log
  const { data: logData, isLoading: logLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/wiki/log"],
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/wiki/query", { q });
      return res.json();
    },
  });

  function handleTickerSearch() {
    if (tickerSearch.trim()) {
      setActiveTab("ticker");
      refetchTicker();
    }
  }

  function handleQuery() {
    if (queryText.trim()) {
      setActiveTab("search");
      searchMutation.mutate(queryText);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Research Wiki</h1>
            <p className="text-sm text-muted-foreground">Karpathy-style institutional knowledge base</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/wiki"] });
            queryClient.invalidateQueries({ queryKey: ["/api/wiki/log"] });
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Ticker Lookup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. NKE, AAPL, TSLA"
                value={tickerSearch}
                onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleTickerSearch()}
                className="font-mono"
              />
              <Button onClick={handleTickerSearch} disabled={!tickerSearch.trim()}>
                Lookup
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="w-4 h-4" />
              Wiki Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. high conviction momentum"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuery()}
              />
              <Button onClick={handleQuery} disabled={!queryText.trim() || searchMutation.isPending}>
                {searchMutation.isPending ? "..." : "Search"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "index" as const, label: "Index", icon: BookOpen },
          { id: "ticker" as const, label: "Ticker", icon: FileText },
          { id: "search" as const, label: "Search", icon: Search },
          { id: "log" as const, label: "Event Log", icon: Clock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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

      {/* Tab Content */}
      <Card>
        <CardContent className="pt-6">
          {activeTab === "index" && (
            indexLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ) : indexData?.content ? (
              renderMarkdown(indexData.content)
            ) : (
              <p className="text-sm text-muted-foreground italic">Wiki index is empty. Wait for the autopilot to populate it.</p>
            )
          )}

          {activeTab === "ticker" && (
            tickerLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : tickerData?.content ? (
              renderMarkdown(tickerData.content)
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {tickerSearch
                  ? `No wiki page found for ${tickerSearch}. The autopilot populates pages for top-scored tickers.`
                  : "Enter a ticker symbol above to look up its research page."}
              </p>
            )
          )}

          {activeTab === "search" && (
            searchMutation.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : searchMutation.data ? (
              renderMarkdown((searchMutation.data as any).result || "No results.")
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Enter a search query above to find relevant wiki content.
              </p>
            )
          )}

          {activeTab === "log" && (
            logLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : logData?.content ? (
              <div className="font-mono text-xs space-y-0.5 max-h-[500px] overflow-y-auto">
                {logData.content.split("\n").map((line, i) => (
                  <p key={i} className={line.startsWith("##") ? "font-semibold text-primary mt-2" : "text-muted-foreground"}>
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No log entries yet. Wait for the autopilot to generate events.</p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
