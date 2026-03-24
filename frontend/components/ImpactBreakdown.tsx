"use client";

import { SimulationResult } from "@/lib/events";

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

  const maxAbs = Math.max(...result.breakdown.map((b) => Math.abs(b.impact)), 1);

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-white mb-4">
        Event Impact Breakdown
      </h3>

      {/* Horizontal bar chart */}
      <div className="space-y-3">
        {result.breakdown.map((b, i) => {
          const widthPct = Math.max((Math.abs(b.impact) / maxAbs) * 100, 4);
          const isPositive = b.impact >= 0;

          return (
            <div key={i} className="flex items-center gap-3">
              {/* Label */}
              <div className="w-36 sm:w-44 text-xs text-[#94a3b8] truncate shrink-0 text-right">
                {b.eventName}
              </div>

              {/* Bar area */}
              <div className="flex-1 relative h-6 flex items-center">
                {/* Zero line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/15" />

                {/* Bar */}
                <div
                  className={`h-4 rounded-sm relative transition-all duration-300 ${
                    isPositive
                      ? "bg-[#00d4aa] ml-[50%]"
                      : "bg-[#ff4757] mr-[50%]"
                  }`}
                  style={{
                    width: `${widthPct * 0.45}%`,
                  }}
                />
              </div>

              {/* Value */}
              <div
                className={`w-16 text-xs font-mono text-right shrink-0 ${
                  isPositive ? "text-[#00d4aa]" : "text-[#ff4757]"
                }`}
              >
                {isPositive ? "+" : ""}${b.impact.toFixed(0)}
              </div>
            </div>
          );
        })}
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
