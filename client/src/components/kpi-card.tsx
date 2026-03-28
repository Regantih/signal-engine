import { type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number;
  icon: LucideIcon;
  suffix?: string;
}

export function KpiCard({ label, value, delta, icon: Icon, suffix }: KpiCardProps) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </span>
        <Icon className="w-4 h-4 text-muted-foreground/50" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">{value}{suffix}</span>
        {delta !== undefined && (
          <span
            className={`text-xs font-medium tabular-nums ${
              delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
            }`}
          >
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
