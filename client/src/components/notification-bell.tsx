import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Bell, Check, TrendingUp, TrendingDown, Zap, BarChart3 } from "lucide-react";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  ticker: string | null;
  read: number;
  createdAt: string;
}

function notifIcon(type: string) {
  switch (type) {
    case "sell_triggered": return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    case "new_high_conviction": return <Zap className="w-3.5 h-3.5 text-emerald-500" />;
    case "conviction_change": return <TrendingUp className="w-3.5 h-3.5 text-amber-500" />;
    case "daily_summary": return <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />;
    default: return <Bell className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 15000,
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors"
        aria-label="Notifications"
        data-testid="button-notifications"
      >
        <Bell className="w-4 h-4 text-sidebar-foreground/60" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50 max-h-96 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-[10px] text-primary hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications && notifications.length > 0 ? (
              notifications.slice(0, 30).map((n) => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.read) markRead.mutate(n.id); }}
                  className={`px-3 py-2.5 border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">{notifIcon(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium truncate ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-1" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="w-5 h-5 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No notifications yet</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
