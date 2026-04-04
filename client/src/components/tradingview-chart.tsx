import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TradingView: any;
  }
}

interface TradingViewChartProps {
  symbol: string;
  height?: number;
}

export function TradingViewChart({ symbol, height = 220 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = "";
    widgetRef.current = null;

    const containerId = `tradingview_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
    const widgetDiv = document.createElement("div");
    widgetDiv.id = containerId;
    widgetDiv.style.height = `${height}px`;
    containerRef.current.appendChild(widgetDiv);

    function initWidget() {
      if (!window.TradingView || !document.getElementById(containerId)) return;
      try {
        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: "D",
          timezone: "America/New_York",
          theme: "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          hide_top_toolbar: true,
          hide_legend: true,
          save_image: false,
          hide_volume: false,
          allow_symbol_change: false,
          support_host: "https://www.tradingview.com",
          height: height,
          width: "100%",
          container_id: containerId,
        });
      } catch {
        // Widget init can fail silently if container is removed
      }
    }

    if (window.TradingView) {
      initWidget();
    } else {
      // Wait for script to load
      const checkInterval = setInterval(() => {
        if (window.TradingView) {
          clearInterval(checkInterval);
          initWidget();
        }
      }, 100);

      // Clean up interval after 10s max
      const timeout = setTimeout(() => clearInterval(checkInterval), 10000);

      return () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        widgetRef.current = null;
      };
    }

    return () => {
      widgetRef.current = null;
    };
  }, [symbol, height]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container rounded-md overflow-hidden"
      style={{ height: `${height}px`, width: "100%" }}
    />
  );
}
