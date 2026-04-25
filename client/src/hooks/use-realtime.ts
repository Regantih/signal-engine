import { useState, useEffect, useRef, useCallback } from "react";

function getApiBase(): string {
  const base = (typeof window !== "undefined") ? (window as any).__API_BASE__ : "";
  return (base && base !== "__PORT_5000__") ? base : "";
}

interface PriceData {
  price: number;
  change: number;
  changePct: number;
  volume: number;
  updatedAt: string;
}

interface RiskAlert {
  ticker: string;
  rule: string;
  reason: string;
  urgency: string;
  timestamp: string;
}

interface RealtimeState {
  prices: Record<string, PriceData>;
  alerts: RiskAlert[];
  connected: boolean;
  tickCount: number;
  lastUpdate: string | null;
}

export function useRealtime() {
  const [state, setState] = useState<RealtimeState>({
    prices: {},
    alerts: [],
    connected: false,
    tickCount: 0,
    lastUpdate: null,
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to SSE stream
    const baseUrl = getApiBase();
    const es = new EventSource(`${baseUrl}/api/realtime/stream`);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setState(prev => ({ ...prev, connected: true }));
    });

    es.addEventListener("prices", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setState(prev => ({
          ...prev,
          prices: { ...prev.prices, ...data.prices },
          tickCount: data.tickCount,
          lastUpdate: data.timestamp,
        }));
      } catch {}
    });

    es.addEventListener("risk_alert", (event) => {
      try {
        const alert: RiskAlert = JSON.parse((event as MessageEvent).data);
        setState(prev => ({
          ...prev,
          alerts: [alert, ...prev.alerts].slice(0, 20),
        }));
      } catch {}
    });

    es.onerror = () => {
      setState(prev => ({ ...prev, connected: false }));
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const getPrice = useCallback((ticker: string): PriceData | null => {
    return state.prices[ticker.toUpperCase()] || null;
  }, [state.prices]);

  return { ...state, getPrice };
}
