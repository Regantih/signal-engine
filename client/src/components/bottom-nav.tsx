import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Radar,
  Wallet,
  Globe,
  LineChart,
  MoreHorizontal,
  Target,
  Activity,
  Newspaper,
  History,
  TrendingUp,
  Trophy,
  Settings,
  Sliders,
  Scale,
  X,
} from "lucide-react";
import { useState } from "react";

const PRIMARY_NAV = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/scanner", label: "Scanner", icon: Radar },
  { path: "/trading", label: "Trading", icon: Wallet },
  { path: "/market", label: "Market", icon: LineChart },
];

const MORE_NAV = [
  { path: "/macro", label: "Macro", icon: Globe },
  { path: "/opportunities", label: "Opportunities", icon: Target },
  { path: "/scoring", label: "Live Scoring", icon: Activity },
  { path: "/news", label: "News", icon: Newspaper },
  { path: "/accountability", label: "Accountability", icon: Scale },
  { path: "/audit", label: "Audit Trail", icon: History },
  { path: "/performance", label: "Performance", icon: TrendingUp },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/weights", label: "Weights", icon: Settings },
  { path: "/settings", label: "Settings", icon: Sliders },
];

export function BottomNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_NAV.some((item) => item.path === location);

  return (
    <>
      {/* "More" overlay menu */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-background border-t border-border rounded-t-xl p-4 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">More Pages</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-md hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MORE_NAV.map((item) => {
                const isActive = location === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg min-h-[64px] transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[10px] leading-tight text-center">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background border-t border-border safe-area-bottom"
        data-testid="bottom-nav"
      >
        <div className="flex items-center justify-around h-16">
          {PRIMARY_NAV.map((item) => {
            const isActive = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] px-2 py-1 rounded-md transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
                data-testid={`bottom-nav-${item.label.toLowerCase()}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                <span className={`text-[10px] leading-tight ${isActive ? "font-medium" : ""}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] px-2 py-1 rounded-md transition-colors ${
              isMoreActive || moreOpen
                ? "text-primary"
                : "text-muted-foreground"
            }`}
            data-testid="bottom-nav-more"
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className={`text-[10px] leading-tight ${isMoreActive ? "font-medium" : ""}`}>
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
