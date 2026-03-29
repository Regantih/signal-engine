import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries } from "lightweight-charts";

interface ChartData {
  time: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

interface TVChartProps {
  data: ChartData[];
  entryPrice?: number | null;
  targetPrice?: number | null;
  stopLoss?: number | null;
  currentPrice?: number | null;
  height?: number;
  chartType?: "candlestick" | "line";
}

export function TVChart({
  data,
  entryPrice,
  targetPrice,
  stopLoss,
  currentPrice,
  height = 300,
  chartType = "candlestick",
}: TVChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    // Clear previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(containerRef.current, {
      layout: {
        textColor: isDark ? "rgba(210, 220, 235, 0.7)" : "rgba(30, 40, 60, 0.7)",
        background: { type: ColorType.Solid, color: "transparent" },
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
        horzLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
      },
      width: containerRef.current.clientWidth,
      height,
      rightPriceScale: {
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
      },
      timeScale: {
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
        timeVisible: false,
      },
      crosshair: {
        mode: 0,
        vertLine: { color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)" },
        horzLine: { color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)" },
      },
    });

    chartRef.current = chart;

    let mainSeries: any = null;

    if (chartType === "candlestick" && data[0]?.open !== undefined) {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      });
      mainSeries.setData(
        data.map((d) => ({
          time: d.time,
          open: d.open!,
          high: d.high!,
          low: d.low!,
          close: d.close,
        }))
      );
    } else {
      mainSeries = chart.addSeries(LineSeries, {
        color: "hsl(183, 60%, 42%)",
        lineWidth: 2,
      });
      mainSeries.setData(data.map((d) => ({ time: d.time, value: d.close })));
    }

    // Add price lines for entry, target, stop loss
    if (mainSeries) {
      if (entryPrice) {
        mainSeries.createPriceLine({
          price: entryPrice,
          color: "#2196F3",
          lineWidth: 1,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: "Entry",
        });
      }

      if (targetPrice) {
        mainSeries.createPriceLine({
          price: targetPrice,
          color: "#26a69a",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Target",
        });
      }

      if (stopLoss) {
        mainSeries.createPriceLine({
          price: stopLoss,
          color: "#ef5350",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Stop",
        });
      }

      if (currentPrice && currentPrice !== entryPrice) {
        mainSeries.createPriceLine({
          price: currentPrice,
          color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: true,
          title: "Current",
        });
      }
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data, entryPrice, targetPrice, stopLoss, currentPrice, height, chartType]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-xs"
        style={{ height }}
      >
        No price data available
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}
