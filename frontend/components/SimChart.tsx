"use client";

import { useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { SimulationResult, StockData } from "@/lib/events";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  stock: StockData;
  result: SimulationResult | null;
}

export default function SimChart({ stock, result }: Props) {
  const plotRef = useRef<HTMLDivElement>(null);

  const buildTraces = useCallback(() => {
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

    return traces;
  }, [stock, result]);

  const allDates = [
    ...(stock.historicalPrices?.map((p) => p.date) || []),
    ...(result?.paths.dates || []),
  ];

  const allY = [
    ...(stock.historicalPrices?.map((p) => p.price) || []),
    ...(result?.paths.p5 || []),
    ...(result?.paths.p95 || []),
  ];

  const yMin = Math.min(...allY) * 0.97;
  const yMax = Math.max(...allY) * 1.03;

  return (
    <div ref={plotRef} className="w-full h-full min-h-[350px] sm:min-h-[450px]">
      <Plot
        data={buildTraces()}
        layout={{
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: {
            color: "#94a3b8",
            family: "Inter, system-ui, sans-serif",
            size: 12,
          },
          margin: { t: 20, r: 20, b: 50, l: 60 },
          xaxis: {
            gridcolor: "rgba(42, 42, 74, 0.5)",
            zerolinecolor: "rgba(42, 42, 74, 0.5)",
            tickfont: { size: 10 },
            dtick: 7,
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
          hovermode: "x unified",
          dragmode: "zoom",
        }}
        config={{
          displayModeBar: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
          displaylogo: false,
          responsive: true,
        }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
