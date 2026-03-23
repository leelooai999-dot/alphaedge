"use client";

import dynamic from "next/dynamic";
import { SimulationResult } from "@/lib/events";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  result: SimulationResult | null;
}

export default function ImpactBreakdown({ result }: Props) {
  if (!result || result.breakdown.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted">
          Add events to see their individual impact on the stock
        </p>
      </div>
    );
  }

  const events = result.breakdown.map((b) => b.eventName);
  const impacts = result.breakdown.map((b) => b.impact);
  const colors = result.breakdown.map((b) => b.color);

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-white mb-4">
        Event Impact Breakdown
      </h3>
      <div className="h-48 sm:h-56">
        <Plot
          data={[
            {
              x: impacts,
              y: events,
              type: "bar",
              orientation: "h",
              marker: {
                color: colors,
                line: { color: "rgba(0,0,0,0.3)", width: 1 },
                // cornerradius removed for type compatibility
              },
              text: impacts.map(
                (v) => `${v >= 0 ? "+" : ""}$${v.toFixed(0)}`
              ),
              textposition: "outside",
              textfont: {
                color: "#e2e8f0",
                size: 11,
                family: "JetBrains Mono",
              },
              hovertemplate: "$%{x:.2f}<extra></extra>",
            },
          ]}
          layout={{
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { color: "#94a3b8", family: "Inter", size: 12 },
            margin: { t: 10, r: 70, b: 30, l: 10 },
            xaxis: {
              gridcolor: "rgba(42, 42, 74, 0.4)",
              zeroline: true,
              zerolinecolor: "rgba(255,255,255,0.15)",
              zerolinewidth: 1.5,
              tickfont: { size: 10, family: "JetBrains Mono" },
              tickprefix: "$",
              title: { text: "Impact ($)", font: { size: 11 } },
            },
            yaxis: {
              tickfont: { size: 11 },
            },
            showlegend: false,
            bargap: 0.3,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>

      {/* Summary */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-sm text-muted">Combined Event Impact</span>
        <span
          className={`text-lg font-mono font-semibold ${
            result.eventImpact >= 0 ? "text-bullish" : "text-bearish"
          }`}
        >
          {result.eventImpact >= 0 ? "+" : ""}${result.eventImpact.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
