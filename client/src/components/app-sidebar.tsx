import { Link, useLocation } from "wouter";
import { useTheme } from "./theme-provider";
import { NotificationBell } from "./notification-bell";
import {
  LayoutDashboard,
  Target,
  History,
  Settings,
  TrendingUp,
  Sun,
  Moon,
  Activity,
  LineChart,
  Newspaper,
  Sliders,
  Radar,
  Wallet,
  Globe,
  Scale,
  Trophy,
  BookOpen,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/scanner", label: "Scanner", icon: Radar },
  { path: "/trading", label: "Trading", icon: Wallet },
  { path: "/macro", label: "Macro", icon: Globe },
  { path: "/market", label: "Live Market", icon: LineChart },
  { path: "/opportunities", label: "Opportunities", icon: Target },
  { path: "/scoring", label: "Live Scoring", icon: Activity },
  { path: "/news", label: "News", icon: Newspaper },
  { path: "/accountability", label: "Accountability", icon: Scale },
  { path: "/audit", label: "Audit Trail", icon: History },
  { path: "/performance", label: "Performance", icon: TrendingUp },
  { path: "/wiki", label: "Research Wiki", icon: BookOpen },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/weights", label: "Weights", icon: Settings },
  { path: "/settings", label: "Settings", icon: Sliders },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="w-60 h-screen flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border dark-scrollbar overflow-y-auto">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="Signal Engine logo">
            <rect width="32" height="32" rx="8" fill="hsl(var(--sidebar-primary))" />
            <path
              d="M8 22V18M12 22V14M16 22V10M20 22V14M24 22V18"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="16" cy="8" r="2" fill="white" />
          </svg>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Signal Engine</h1>
            <p className="text-xs text-sidebar-foreground/50">Renaissance-Style Allocator</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path;
            return (
              <li key={item.path}>
                <Link
                  href={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-sidebar-foreground/40">$100 Budget</span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-sidebar-foreground/60" />
              ) : (
                <Moon className="w-4 h-4 text-sidebar-foreground/60" />
              )}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-sidebar-foreground/30 px-3 mt-1">
          Inspired by Renaissance Technologies
        </p>
      </div>
    </aside>
  );
}
