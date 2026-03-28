import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SignalBarProps {
  label: string;
  value: number;
  description?: string;
  isNegative?: boolean;
}

export function SignalBar({ label, value, description, isNegative = false }: SignalBarProps) {
  const width = Math.min(100, Math.max(0, value));
  const color = isNegative
    ? value > 60
      ? "bg-red-500/80"
      : value > 40
      ? "bg-amber-500/80"
      : "bg-emerald-500/80"
    : value > 60
    ? "bg-emerald-500/80"
    : value > 40
    ? "bg-amber-500/80"
    : "bg-red-500/80";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group cursor-default" data-testid={`signal-${label.toLowerCase()}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <span className="text-xs tabular-nums font-mono text-foreground/70">{value.toFixed(0)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full signal-bar ${color}`}
              style={{ "--signal-width": `${width}%`, width: `${width}%` } as any}
            />
          </div>
        </div>
      </TooltipTrigger>
      {description && (
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {description}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
