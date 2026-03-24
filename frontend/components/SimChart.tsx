"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { SimulationResult, StockData } from "@/lib/events";

// Load Plotly from CDN at runtime instead of bundling (saves ~30MB, fixes Vercel build timeout)
declare global {
  interface Window {
    Plotly: any;
  }
}

function loadPlotly(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plotly) return resolve();
    const script = document.createElement("script");
    script.src = "https://cdn.plot.ly/plotly-2.35.3.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Plotly"));
    document.head.appendChild(script);
  });
}

interface Props {
  stock: StockData;
  result: SimulationResult | null;
}

export type TimeRange = "7d" | "15d" | "30d" | "60d" | "90d";

interface Props {
  stock: StockData;
  result: SimulationResult | null;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
}

const TIME_RANGES: { label: string; value: TimeRange; days: number }[] = [
  { label: "1W", value: "7d", days: 7 },
  { label: "2W", value: "15d", days: 15 },
  { label: "1M", value: "30d", days: 30 },
  { label: "2M", value: "60d", days: 60 },
  { label: "3M", value: "90d", days: 90 },
];

export default function SimChart({ stock, result, timeRange = "30d", onTimeRangeChange }: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const activeRange = TIME_RANGES.find(r => r.value === timeRange) || TIME_RANGES[2];

  useEffect(() => {
    loadPlotly()
      .then(() => setLoaded(true))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!loaded || !plotRef.current || !window.Plotly) return;

    const traces: any[] = [];

    // Historical price
    if (stock.historicalPrices.length > 0) {
      traces.push({
        x: stock.historicalPrices.map((p) => p.date),
        y: stock.historicalPrices.map((p) => p.price),
        type: "scatter",
        mode: "lines",
        name: "Historical",
        line: { color: "#64748b", width: 2 },
        hovertemplate: "%{x}<br>$%{y:.2f}<extra>Historical</extra>",
      });
    }

    if (result) {
      const { dates, median, p25, p75, p5, p95 } = result.paths;

      // 5th-95th percentile band
      traces.push({
        x: [...dates, ...dates.slice().reverse()],
        y: [...p95, ...p5.slice().reverse()],
        type: "scatter",
        mode: "lines",
        name: "5th–95th %ile",
        fill: "toself",
        fillcolor: "rgba(0, 212, 170, 0.06)",
        line: { color: "transparent", width: 0 },
        hoverinfo: "skip",
        showlegend: false,
      });

      // 25th-75th percentile band
      traces.push({
        x: [...dates, ...dates.slice().reverse()],
        y: [...p75, ...p25.slice().reverse()],
        type: "scatter",
        mode: "lines",
        name: "25th–75th %ile",
        fill: "toself",
        fillcolor: "rgba(0, 212, 170, 0.15)",
        line: { color: "transparent", width: 0 },
        hoverinfo: "skip",
        showlegend: false,
      });

      // Median projection
      traces.push({
        x: dates,
        y: median,
        type: "scatter",
        mode: "lines",
        name: "Median (projected)",
        line: { color: "#00d4aa", width: 2.5, dash: "dash" },
        hovertemplate: "%{x}<br>$%{y:.2f}<extra>Median</extra>",
      });

      // Current price line
      const nowStr = new Date().toISOString().split("T")[0];
      const allY = [
        ...stock.historicalPrices.map((p) => p.price),
        ...median,
      ];

      traces.push({
        x: [nowStr, nowStr],
        y: [Math.min(...allY) * 0.95, Math.max(...allY) * 1.05],
        type: "scatter",
        mode: "lines",
        name: "Now",
        line: { color: "#ffffff", width: 1.5, dash: "dot" },
        hoverinfo: "skip",
        showlegend: false,
      });

      // Current price annotation dot
      traces.push({
        x: [nowStr],
        y: [stock.currentPrice],
        type: "scatter",
        mode: "markers+text",
        name: "Current",
        marker: { color: "#ffffff", size: 8 },
        text: [`$${stock.currentPrice}`],
        textposition: "top center",
        textfont: { color: "#ffffff", size: 11, family: "JetBrains Mono" },
        hoverinfo: "skip",
        showlegend: false,
      });
    }

    const allDates = [
      ...(stock.historicalPrices?.map((p) => p.date) || []),
      ...(result?.paths.dates || []),
    ];

    const allYAxis = [
      ...(stock.historicalPrices?.map((p) => p.price) || []),
      ...(result?.paths.p5 || []),
      ...(result?.paths.p95 || []),
    ];

    const yMin = Math.min(...allYAxis) * 0.97;
    const yMax = Math.max(...allYAxis) * 1.03;

    // Dynamic tick spacing based on time range
    const rangeMs = activeRange.days * 86400000;
    let dtick: number;
    let tickformat: string;
    if (rangeMs <= 7 * 86400000) {
      dtick = 86400000; // 1 day
      tickformat = "%a %d";
    } else if (rangeMs <= 30 * 86400000) {
      dtick = 604800000; // 7 days
      tickformat = "%b %d";
    } else {
      dtick = 604800000 * 2; // 14 days
      tickformat = "%b %d";
    }

    const layout: any = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: "#94a3b8",
        family: "Inter, system-ui, sans-serif",
        size: 12,
      },
      margin: { t: 20, r: 20, b: 50, l: 60 },
      xaxis: {
        type: "date",
        gridcolor: "rgba(42, 42, 74, 0.5)",
        zerolinecolor: "rgba(42, 42, 74, 0.5)",
        tickfont: { size: 10 },
        dtick,
        tickformat,
      },
      yaxis: {
        gridcolor: "rgba(42, 42, 74, 0.5)",
        zerolinecolor: "rgba(42, 42, 74, 0.5)",
        tickfont: { size: 10, family: "JetBrains Mono" },
        range: [yMin, yMax],
        tickprefix: "$",
        nticks: 6,
      },
      legend: {
        orientation: "h",
        y: 1.12,
        x: 0,
        xanchor: "left",
        font: { size: 11 },
      },
      hovermode: "x unified" as const,
      dragmode: "zoom" as const,
      autosize: true,
    };

    const config: any = {
      displayModeBar: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
      displaylogo: false,
      responsive: true,
    };

    window.Plotly.newPlot(plotRef.current!, traces, layout, config);

    return () => {
      if (plotRef.current && window.Plotly) {
        window.Plotly.purge(plotRef.current);
      }
    };
  }, [loaded, stock, result, timeRange]);

  if (error) {
    return (
      <div className="w-full h-full min-h-[350px] flex items-center justify-center text-slate-500">
        Failed to load chart. Please refresh.
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="w-full h-full min-h-[350px] flex items-center justify-center text-slate-500">
        <div className="animate-pulse">Loading chart...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => onTimeRangeChange?.(r.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                timeRange === r.value
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-white hover:bg-bg"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-neutral">Scroll to zoom · Drag to pan</span>
      </div>
      <div ref={plotRef} className="w-full h-full min-h-[350px] sm:min-h-[450px]" />
    </div>
  );
}
