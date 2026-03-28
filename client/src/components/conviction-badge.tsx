import { Badge } from "@/components/ui/badge";

interface ConvictionBadgeProps {
  band: string;
  size?: "sm" | "md";
}

const CONVICTION_CONFIG: Record<string, { label: string; className: string }> = {
  high: {
    label: "High Conviction",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  medium: {
    label: "Medium",
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  low: {
    label: "Low",
    className: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  },
  avoid: {
    label: "Avoid",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  },
};

export function ConvictionBadge({ band, size = "sm" }: ConvictionBadgeProps) {
  const config = CONVICTION_CONFIG[band] || CONVICTION_CONFIG.avoid;
  return (
    <Badge
      variant="outline"
      className={`${config.className} ${size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"} font-medium border`}
      data-testid={`badge-conviction-${band}`}
    >
      {config.label}
    </Badge>
  );
}

export function ActionBadge({ action }: { action: string }) {
  const config: Record<string, string> = {
    BUY: "bg-emerald-600 text-white dark:bg-emerald-700",
    SELL: "bg-red-600 text-white dark:bg-red-700",
    WATCH: "bg-amber-600 text-white dark:bg-amber-700",
    CLOSE: "bg-slate-600 text-white dark:bg-slate-700",
  };
  return (
    <Badge className={`${config[action] || config.WATCH} text-[10px] px-1.5 py-0 font-semibold`} data-testid={`badge-action-${action}`}>
      {action}
    </Badge>
  );
}
