"use client";

import { SimulationResult } from "@/lib/events";

interface Props {
  result: SimulationResult | null;
}

const COMMODITY_LABELS: Record<string, string> = {
  WTI: "🛢️ WTI Crude",
  BRENT: "🛢️ Brent Crude",
  NATGAS: "🔥 Natural Gas",
  GOLD: "🥇 Gold",
  SILVER: "🥈 Silver",
  COPPER: "🟤 Copper",
  VIX: "📊 VIX",
  USD: "💵 US Dollar",
  "10Y": "📈 10Y Treasury",
  WHEAT: "🌾 Wheat",
  CORN: "🌽 Corn",
  SOY: "🫘 Soybeans",
};

function getCommodityLabel(key: string): string {
  return COMMODITY_LABELS[key] || key;
}

export default function CommodityChain({ result }: Props) {
  if (!result) return null;

  const { commodityImpacts, stockBetas, stockImpactBreakdown } = result;

  // Need at least stockBetas to show the chain
  if (!stockBetas || Object.keys(stockBetas).length === 0) return null;

  // Filter to commodities with meaningful impact or beta
  const commodities = Object.keys(stockBetas).filter((k) => {
    const beta = Math.abs(stockBetas[k] || 0);
    const impact = Math.abs(stockImpactBreakdown?.[k] || 0);
    const commodityChange = Math.abs(commodityImpacts?.[k] || 0);
    return beta > 0.01 && (impact > 0.5 || commodityChange > 0.5);
  });

  // Sort by absolute impact (highest first)
  commodities.sort((a, b) => {
    const impA = Math.abs(stockImpactBreakdown?.[a] || commodityImpacts?.[a] || 0);
    const impB = Math.abs(stockImpactBreakdown?.[b] || commodityImpacts?.[b] || 0);
    return impB - impA;
  });

  if (commodities.length === 0) return null;

  const totalImpact = commodities.reduce(
    (sum, k) => sum + (stockImpactBreakdown?.[k] || 0),
    0
  );

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">
          Commodity Exposure Chain
        </h3>
        {totalImpact !== 0 && (
          <span
            className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
              totalImpact >= 0
                ? "bg-[#00d4aa]/10 text-[#00d4aa]"
                : "bg-[#ff4757]/10 text-[#ff4757]"
            }`}
          >
            Net: {totalImpact >= 0 ? "+" : ""}
            {totalImpact.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="text-xs text-muted mb-3">
        Event → Commodity impact → Stock beta exposure
      </div>

      <div className="space-y-2">
        {commodities.map((key) => {
          const commodityPct = commodityImpacts?.[key] || 0;
          const beta = stockBetas[key] || 0;
          const stockPct = stockImpactBreakdown?.[key] || commodityPct * beta;
          const isPositive = stockPct >= 0;

          return (
            <div
              key={key}
              className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0"
            >
              {/* Commodity name */}
              <div className="w-28 sm:w-36 text-xs text-[#94a3b8] truncate shrink-0">
                {getCommodityLabel(key)}
              </div>

              {/* Commodity % change */}
              <div
                className={`w-16 text-right text-xs font-mono shrink-0 ${
                  commodityPct >= 0 ? "text-[#00d4aa]" : "text-[#ff4757]"
                }`}
              >
                {commodityPct >= 0 ? "+" : ""}
                {commodityPct.toFixed(1)}%
              </div>

              {/* Arrow + beta */}
              <div className="flex items-center gap-1 shrink-0 text-muted">
                <span className="text-[10px]">→</span>
                <span className="text-[10px] font-mono text-muted/70">
                  β{beta.toFixed(2)}
                </span>
                <span className="text-[10px]">→</span>
              </div>

              {/* Stock impact bar + value */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-3 bg-white/5 rounded-sm relative overflow-hidden">
                  <div
                    className={`absolute top-0 h-full rounded-sm transition-all duration-300 ${
                      isPositive ? "bg-[#00d4aa]/60 left-1/2" : "bg-[#ff4757]/60 right-1/2"
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(stockPct) * 3, 50)}%`,
                    }}
                  />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/15" />
                </div>
                <span
                  className={`text-xs font-mono font-semibold w-14 text-right shrink-0 ${
                    isPositive ? "text-[#00d4aa]" : "text-[#ff4757]"
                  }`}
                >
                  {stockPct >= 0 ? "+" : ""}
                  {stockPct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center gap-4 text-[10px] text-muted">
        <span>Commodity Δ%</span>
        <span>→ β = Stock Beta</span>
        <span>→ Stock Impact = Δ% × β</span>
      </div>
    </div>
  );
}
