import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ConvictionBadge, ActionBadge } from "@/components/conviction-badge";
import { useToast } from "@/hooks/use-toast";
import { History, Shield, Share2 } from "lucide-react";

interface Prediction {
  id: number;
  opportunityId: number;
  action: string;
  compositeScore: number;
  probabilityOfSuccess: number;
  expectedEdge: number;
  kellyFraction: number;
  convictionBand: string;
  suggestedAllocation: number;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  currentPrice: number | null;
  reasoning: string | null;
  signalSnapshot: string;
  timestamp: string;
}

interface Opportunity {
  id: number;
  name: string;
  ticker: string | null;
  domain: string;
}

export default function Audit() {
  const { toast } = useToast();

  const { data: predictions, isLoading: predsLoading } = useQuery<Prediction[]>({
    queryKey: ["/api/predictions"],
  });

  const { data: opportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const oppMap = new Map(opportunities?.map((o) => [o.id, o]) || []);

  const publishMutation = useMutation({
    mutationFn: (predictionId: number) =>
      apiRequest("POST", "/api/publish", { predictionId, platform: "clipboard" }),
    onSuccess: (data: any) => {
      // Copy to clipboard
      if (navigator.clipboard && data.content) {
        navigator.clipboard.writeText(data.content).catch(() => {});
      }
      toast({
        title: "Signal post copied to clipboard",
        description: "Paste to LinkedIn/X to publish your signal",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Publish failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  if (predsLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Audit Trail</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Immutable, timestamped record of every prediction. No edits after posting.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          <span>{predictions?.length || 0} records</span>
        </div>
      </div>

      {predictions && predictions.length > 0 ? (
        <div className="space-y-2">
          {predictions.map((pred) => {
            const opp = oppMap.get(pred.opportunityId);
            let snapshot: any = {};
            try { snapshot = JSON.parse(pred.signalSnapshot); } catch {}

            return (
              <div
                key={pred.id}
                className="bg-card border border-card-border rounded-lg p-4"
                data-testid={`audit-record-${pred.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <History className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {opp?.name || `Opportunity #${pred.opportunityId}`}
                        </span>
                        {opp?.ticker && (
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {opp.ticker}
                          </span>
                        )}
                        <ActionBadge action={pred.action} />
                        <ConvictionBadge band={pred.convictionBand} />
                      </div>
                      {pred.reasoning && (
                        <p className="text-xs text-muted-foreground mt-0.5">{pred.reasoning}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground font-mono block">
                        {new Date(pred.timestamp).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 font-mono">
                        ID: {pred.id}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => publishMutation.mutate(pred.id)}
                      disabled={publishMutation.isPending}
                      data-testid={`button-publish-${pred.id}`}
                    >
                      <Share2 className="w-3 h-3" />
                      Publish
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Score</span>
                    <span className="text-xs tabular-nums font-mono font-medium">
                      {(pred.compositeScore ?? 0).toFixed(3)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">P(Win)</span>
                    <span className="text-xs tabular-nums font-mono font-medium">
                      {((pred.probabilityOfSuccess ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Edge</span>
                    <span className="text-xs tabular-nums font-mono font-medium">
                      {(pred.expectedEdge ?? 0).toFixed(3)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Kelly %</span>
                    <span className="text-xs tabular-nums font-mono font-medium">
                      {((pred.kellyFraction ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Allocation</span>
                    <span className="text-xs tabular-nums font-mono font-medium">
                      ${(pred.suggestedAllocation ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Entry</span>
                    <span className="text-xs tabular-nums font-mono font-medium">
                      {pred.entryPrice ? `$${pred.entryPrice.toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>

                {/* Signal snapshot */}
                <div className="mt-3 pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground/50 block mb-1">Signal Snapshot</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {["momentum", "meanReversion", "quality", "flow", "risk", "crowding"].map((key) => (
                      <span key={key} className="text-[10px] font-mono text-muted-foreground">
                        {key}: <span className="text-foreground/70">{snapshot[key] ?? "—"}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <History className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No predictions recorded yet</p>
          <p className="text-xs mt-1 opacity-60">
            Add opportunities to generate timestamped predictions
          </p>
        </div>
      )}
    </div>
  );
}
