"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type DeepPartial,
  type ChartOptions,
  type Time,
  CrosshairMode,
} from "lightweight-charts";
import { SimulationResult, StockData, ActiveEvent } from "@/lib/events";

export type TimeRange = "7d" | "15d" | "30d" | "60d" | "90d";
type ChartMode = "single" | "bands";

interface Props {
  stock: StockData;
  result: SimulationResult | null;
  events?: ActiveEvent[];
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

const COLORS = {
  bg: "#0a0a0f",
  chartBg: "#0d0d14",
  grid: "#2a2a4a",
  text: "#94a3b8",
  white: "#ffffff",
  historical: "#64748b",
  median: "#00d4aa",
  medianBearish: "#ff4757",
  outerBand: "rgba(0, 212, 170, 0.08)",
  outerLine: "rgba(0, 212, 170, 0.25)",
  innerBand: "rgba(0, 212, 170, 0.15)",
  innerLine: "rgba(0, 212, 170, 0.45)",
  outerBandBear: "rgba(255, 71, 87, 0.08)",
  outerLineBear: "rgba(255, 71, 87, 0.25)",
  innerBandBear: "rgba(255, 71, 87, 0.15)",
  innerLineBear: "rgba(255, 71, 87, 0.45)",
  crosshair: "#758696",
  bullish: "#00d4aa",
  bearish: "#ff4757",
  neutral: "#fbbf24",
};

const EVENT_ZONE_COLORS: Record<string, { bg: string; border: string }> = {
  geopolitical: { bg: "rgba(255, 71, 87, 0.06)", border: "rgba(255, 71, 87, 0.3)" },
  macro: { bg: "rgba(0, 212, 170, 0.06)", border: "rgba(0, 212, 170, 0.3)" },
  sector: { bg: "rgba(251, 191, 36, 0.06)", border: "rgba(251, 191, 36, 0.3)" },
  custom: { bg: "rgba(139, 92, 246, 0.06)", border: "rgba(139, 92, 246, 0.3)" },
};

/** Generate Pine Script for the current simulation */
function generatePineScript(
  stock: StockData,
  result: SimulationResult,
  events: ActiveEvent[],
  mode: ChartMode
): string {
  const { dates, median, p25, p75, p5, p95 } = result.paths;
  const ticker = stock.ticker;
  const currentPrice = stock.currentPrice;
  const days = dates.length - 1;

  // Calculate daily percentage moves from current price for the median
  const medianPcts = median.map((v) => ((v - currentPrice) / currentPrice) * 100);
  const p25Pcts = p25.map((v) => ((v - currentPrice) / currentPrice) * 100);
  const p75Pcts = p75.map((v) => ((v - currentPrice) / currentPrice) * 100);
  const p5Pcts = p5.map((v) => ((v - currentPrice) / currentPrice) * 100);
  const p95Pcts = p95.map((v) => ((v - currentPrice) / currentPrice) * 100);

  // Simplify to 10 data points for Pine Script (arrays limited)
  const step = Math.max(1, Math.floor(days / 10));
  const sampledMedian = medianPcts.filter((_, i) => i % step === 0 || i === medianPcts.length - 1).slice(0, 11);
  const sampledP25 = p25Pcts.filter((_, i) => i % step === 0 || i === p25Pcts.length - 1).slice(0, 11);
  const sampledP75 = p75Pcts.filter((_, i) => i % step === 0 || i === p75Pcts.length - 1).slice(0, 11);
  const sampledP5 = p5Pcts.filter((_, i) => i % step === 0 || i === p5Pcts.length - 1).slice(0, 11);
  const sampledP95 = p95Pcts.filter((_, i) => i % step === 0 || i === p95Pcts.length - 1).slice(0, 11);

  const eventDescriptions = events.map(
    (e) => `// ${e.emoji} ${e.name}: ${e.probability}% probability, ${e.duration}d, ${e.impact > 0 ? "+" : ""}${e.impact}% impact`
  ).join("\n");

  const medianArr = `array.from(${sampledMedian.map((v) => v.toFixed(2)).join(", ")})`;
  const isBullish = result.median30d >= currentPrice;

  let bandLines = "";
  if (mode === "bands") {
    bandLines = `
// Confidence bands
float p25_pct = get_projected_pct(p25_vals, bar_offset, horizon)
float p75_pct = get_projected_pct(p75_vals, bar_offset, horizon)
float p5_pct = get_projected_pct(p5_vals, bar_offset, horizon)
float p95_pct = get_projected_pct(p95_vals, bar_offset, horizon)

float p25_price = anchor_price * (1 + p25_pct / 100)
float p75_price = anchor_price * (1 + p75_pct / 100)
float p5_price = anchor_price * (1 + p5_pct / 100)
float p95_price = anchor_price * (1 + p95_pct / 100)

var p25_arr = array.from(${sampledP25.map((v) => v.toFixed(2)).join(", ")})
var p75_arr = array.from(${sampledP75.map((v) => v.toFixed(2)).join(", ")})
var p5_arr = array.from(${sampledP5.map((v) => v.toFixed(2)).join(", ")})
var p95_arr = array.from(${sampledP95.map((v) => v.toFixed(2)).join(", ")})

p25_line = plot(show_bands ? anchor_price * (1 + get_projected_pct(p25_arr, bar_offset, horizon) / 100) : na, "P25", color=color.new(proj_color, 70), linewidth=1)
p75_line = plot(show_bands ? anchor_price * (1 + get_projected_pct(p75_arr, bar_offset, horizon) / 100) : na, "P75", color=color.new(proj_color, 70), linewidth=1)
p5_line = plot(show_bands ? anchor_price * (1 + get_projected_pct(p5_arr, bar_offset, horizon) / 100) : na, "P5", color=color.new(proj_color, 85), linewidth=1, style=plot.style_circles)
p95_line = plot(show_bands ? anchor_price * (1 + get_projected_pct(p95_arr, bar_offset, horizon) / 100) : na, "P95", color=color.new(proj_color, 85), linewidth=1, style=plot.style_circles)
fill(p25_line, p75_line, color=color.new(proj_color, 88), title="25-75 Band")
fill(p5_line, p95_line, color=color.new(proj_color, 94), title="5-95 Band")`;
  }

  return `//@version=6
// ═══════════════════════════════════════════════════════════════
// AlphaEdge Event Simulation — ${ticker}
// Generated by AlphaEdge.io — Live event-driven stock simulation
// ═══════════════════════════════════════════════════════════════
//
// Scenario: ${events.length} event(s) applied
${eventDescriptions}
//
// Median target: $${result.median30d.toFixed(2)} | Prob. profit: ${result.probProfit}%
// Generated: ${new Date().toISOString().split("T")[0]}
//
// 🔗 Create your own: https://alphaedge.io/sim/${ticker}
//
indicator("AlphaEdge: ${ticker} Event Simulation", overlay=true, max_bars_back=500)

// ── Inputs ──
horizon     = input.int(${days}, "Projection Horizon (bars)", minval=5, maxval=365)
show_bands  = input.bool(${mode === "bands"}, "Show Confidence Bands")
proj_color  = input.color(${isBullish ? "color.teal" : "color.red"}, "Projection Color")

// ── Median projection data (% change from anchor) ──
var median_vals = ${medianArr}

// ── Helper: interpolate projected % at current bar offset ──
get_projected_pct(arr, offset, total_bars) =>
    if offset < 0 or offset > total_bars
        na
    else
        float frac = offset / total_bars * (array.size(arr) - 1)
        int idx = math.floor(frac)
        float t = frac - idx
        float v0 = array.get(arr, math.min(idx, array.size(arr) - 1))
        float v1 = array.get(arr, math.min(idx + 1, array.size(arr) - 1))
        v0 + (v1 - v0) * t

// ── Detect anchor bar (last confirmed bar when script loads) ──
var float anchor_price = na
var int anchor_bar = na
if barstate.islast
    anchor_price := close
    anchor_bar := bar_index

int bar_offset = bar_index - anchor_bar

// ── Plot median projection ──
float median_pct = get_projected_pct(median_vals, bar_offset, horizon)
float median_price = anchor_price * (1 + median_pct / 100)

plot(bar_offset >= 0 and bar_offset <= horizon ? median_price : na, "Median", color=proj_color, linewidth=2, style=plot.style_line)
${bandLines}

// ── Info table ──
if barstate.islast
    var table info = table.new(position.top_right, 2, 5, bgcolor=color.new(color.black, 80), border_width=1)
    table.cell(info, 0, 0, "AlphaEdge", text_color=proj_color, text_size=size.small)
    table.cell(info, 1, 0, "${ticker}", text_color=color.white, text_size=size.small)
    table.cell(info, 0, 1, "Target", text_color=color.gray, text_size=size.tiny)
    table.cell(info, 1, 1, "$${result.median30d.toFixed(0)}", text_color=proj_color, text_size=size.tiny)
    table.cell(info, 0, 2, "Prob Profit", text_color=color.gray, text_size=size.tiny)
    table.cell(info, 1, 2, "${result.probProfit}%", text_color=${result.probProfit >= 50 ? "color.teal" : "color.red"}, text_size=size.tiny)
    table.cell(info, 0, 3, "Events", text_color=color.gray, text_size=size.tiny)
    table.cell(info, 1, 3, "${events.length}", text_color=color.white, text_size=size.tiny)
    table.cell(info, 0, 4, "", text_color=color.gray, text_size=size.tiny)
    table.cell(info, 1, 4, "alphaedge.io", text_color=color.gray, text_size=size.tiny)
`;
}

export default function SimChart({
  stock,
  result,
  events = [],
  timeRange = "30d",
  onTimeRangeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any, Time>[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>("single");
  const [showPineScript, setShowPineScript] = useState(false);

  // Determine if projection is bullish or bearish
  const isBullish = result ? result.median30d >= stock.currentPrice : true;

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chartOptions: DeepPartial<ChartOptions> = {
      layout: {
        background: { type: ColorType.Solid, color: COLORS.chartBg },
        textColor: COLORS.text,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: COLORS.grid + "40" },
        horzLines: { color: COLORS.grid + "40" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: COLORS.crosshair,
          style: LineStyle.LargeDashed,
          labelBackgroundColor: "#1a1a2e",
        },
        horzLine: {
          color: COLORS.crosshair,
          style: LineStyle.LargeDashed,
          labelBackgroundColor: "#1a1a2e",
        },
      },
      rightPriceScale: {
        borderColor: COLORS.grid,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: false,
        minBarSpacing: 3,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        vertTouchDrag: false,
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
    };

    const chart = createChart(containerRef.current, chartOptions);
    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
    };
  }, []);

  // Update series data when stock/result/timeRange/chartMode change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove all existing series
    for (const s of seriesRef.current) {
      try { chart.removeSeries(s); } catch {}
    }
    seriesRef.current = [];

    // Determine color scheme based on bullish/bearish
    const projBullish = result ? result.median30d >= stock.currentPrice : true;
    const medianColor = projBullish ? COLORS.median : COLORS.medianBearish;
    const outerBand = projBullish ? COLORS.outerBand : COLORS.outerBandBear;
    const outerLine = projBullish ? COLORS.outerLine : COLORS.outerLineBear;
    const innerBand = projBullish ? COLORS.innerBand : COLORS.innerBandBear;
    const innerLine = projBullish ? COLORS.innerLine : COLORS.innerLineBear;

    if (result) {
      const { dates, p5, p95, p25, p75, median } = result.paths;

      // Only show bands in "bands" mode
      if (chartMode === "bands") {
        // P5-P95 outer band
        const outerTopSeries = chart.addSeries(AreaSeries, {
          topColor: outerBand,
          bottomColor: "transparent",
          lineColor: outerLine,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        seriesRef.current.push(outerTopSeries);
        outerTopSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p95[i] })));

        const outerBottomSeries = chart.addSeries(AreaSeries, {
          topColor: "transparent",
          bottomColor: outerBand,
          lineColor: outerLine,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        seriesRef.current.push(outerBottomSeries);
        outerBottomSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p5[i] })));

        // P25-P75 inner band
        const innerTopSeries = chart.addSeries(AreaSeries, {
          topColor: innerBand,
          bottomColor: "transparent",
          lineColor: innerLine,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        seriesRef.current.push(innerTopSeries);
        innerTopSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p75[i] })));

        const innerBottomSeries = chart.addSeries(AreaSeries, {
          topColor: "transparent",
          bottomColor: innerBand,
          lineColor: innerLine,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        seriesRef.current.push(innerBottomSeries);
        innerBottomSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p25[i] })));
      }

      // Median projection line — always shown, prominent in single mode
      const medianSeries = chart.addSeries(LineSeries, {
        color: medianColor,
        lineWidth: chartMode === "single" ? 3 : 2,
        lineStyle: chartMode === "single" ? LineStyle.Solid : LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      seriesRef.current.push(medianSeries);
      medianSeries.setData(dates.map((d, i) => ({ time: d as Time, value: median[i] })));

      // Add target price line at median end
      const targetPrice = median[median.length - 1];
      if (targetPrice) {
        medianSeries.createPriceLine({
          price: targetPrice,
          color: medianColor + "60",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `Target $${targetPrice.toFixed(0)}`,
        });
      }
    }

    // Historical price line (on top)
    const historicalSeries = chart.addSeries(LineSeries, {
      color: COLORS.historical,
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: COLORS.historical + "80",
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });
    seriesRef.current.push(historicalSeries);

    if (stock.historicalPrices.length > 0) {
      historicalSeries.setData(
        stock.historicalPrices.map((p) => ({
          time: p.date as Time,
          value: p.price,
        }))
      );
    }

    // "Today" marker
    if (stock.historicalPrices.length > 0) {
      const lastPrice = stock.historicalPrices[stock.historicalPrices.length - 1].price;
      historicalSeries.createPriceLine({
        price: lastPrice,
        color: COLORS.white + "40",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Now",
      });
    }

    // Fit and set visible range
    chart.timeScale().fitContent();

    const activeRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[2];
    const allDates: string[] = [];
    if (stock.historicalPrices.length > 0) {
      allDates.push(...stock.historicalPrices.map((p) => p.date));
    }
    if (result) {
      allDates.push(...result.paths.dates);
    }
    if (allDates.length > 0) {
      const histLen = stock.historicalPrices.length;
      const visibleDays = activeRange.days;
      const fromIndex = Math.max(0, histLen - Math.floor(visibleDays * 0.4));
      const toIndex = Math.min(allDates.length - 1, histLen + Math.floor(visibleDays * 0.6));
      const fromDate = allDates[fromIndex];
      const toDate = allDates[toIndex];

      if (fromDate && toDate && fromDate !== toDate) {
        try {
          chart.timeScale().setVisibleRange({
            from: fromDate as Time,
            to: toDate as Time,
          });
        } catch {
          chart.timeScale().fitContent();
        }
      }
    }
  }, [stock, result, timeRange, chartMode]);

  // Event zones
  const eventZones = useMemo(() => {
    if (!events || events.length === 0 || !result) return [];
    return events.map((e) => {
      const breakdownItem = result.breakdown.find((b) =>
        b.eventName.includes(e.name) || b.eventName.includes(e.emoji)
      );
      const impact = breakdownItem?.impact || 0;
      const isBullish = impact >= 0;
      const zoneColor = EVENT_ZONE_COLORS[e.category] || EVENT_ZONE_COLORS.custom;
      return { id: e.id, emoji: e.emoji, name: e.name, category: e.category, probability: e.probability, duration: e.duration, impact, isBullish, zoneColor };
    });
  }, [events, result]);

  // Pine Script generation
  const pineScript = useMemo(() => {
    if (!result || !stock) return "";
    return generatePineScript(stock, result, events, chartMode);
  }, [stock, result, events, chartMode]);

  const handleCopyPineScript = () => {
    if (navigator.clipboard && pineScript) {
      navigator.clipboard.writeText(pineScript);
    }
    setShowPineScript(false);
  };

  return (
    <div className="w-full h-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Time range */}
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

          {/* Divider */}
          <div className="w-px h-5 bg-border" />

          {/* Chart mode toggle */}
          <div className="flex gap-1 bg-bg/80 rounded-lg p-0.5">
            <button
              onClick={() => setChartMode("single")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                chartMode === "single"
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-white"
              }`}
              title="Single median line"
            >
              Line
            </button>
            <button
              onClick={() => setChartMode("bands")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                chartMode === "bands"
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-white"
              }`}
              title="Show confidence bands (P5-P95)"
            >
              Bands
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Pine Script export */}
          {result && (
            <div className="relative">
              <button
                onClick={() => setShowPineScript(!showPineScript)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted hover:text-white hover:bg-bg transition-colors border border-border/50"
                title="Export to TradingView Pine Script"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Pine Script
              </button>

              {showPineScript && (
                <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-[#0d0d14] border border-border rounded-xl p-3 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white">TradingView Pine Script</span>
                    <button
                      onClick={() => setShowPineScript(false)}
                      className="p-1 text-muted hover:text-white"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-[10px] text-muted mb-2 leading-tight">
                    Copy this Pine Script and paste it into TradingView&apos;s Pine Editor to overlay this simulation on your chart.
                  </p>
                  <pre className="text-[9px] text-green-400/80 bg-black/50 rounded-lg p-2 max-h-32 overflow-y-auto font-mono leading-tight">
                    {pineScript.slice(0, 500)}...
                  </pre>
                  <button
                    onClick={handleCopyPineScript}
                    className="mt-2 w-full py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    📋 Copy Full Script
                  </button>
                  <p className="text-[9px] text-neutral mt-1.5 text-center">
                    Open TradingView → Pine Editor → Paste → Add to Chart
                  </p>
                </div>
              )}
            </div>
          )}

          <span className="text-[10px] text-neutral hidden sm:inline">
            Scroll to zoom · Drag to pan
          </span>
        </div>
      </div>

      {/* Chart container */}
      <div className="relative w-full min-h-[350px] sm:min-h-[450px]">
        <div ref={containerRef} className="w-full h-full absolute inset-0" />

        {/* Legend — simplified for single mode */}
        <div className="absolute top-2 left-3 z-10 flex flex-col gap-1 bg-[#0d0d14]/90 backdrop-blur-sm rounded-lg px-3 py-2 text-[11px] pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: COLORS.historical }} />
            <span className="text-[#94a3b8]">Historical</span>
          </div>
          {result && (
            <>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-0.5 rounded"
                  style={{
                    backgroundColor: isBullish ? COLORS.median : COLORS.medianBearish,
                    borderTop: chartMode === "single" ? "none" : "1px dashed",
                  }}
                />
                <span className="text-[#94a3b8]">
                  {chartMode === "single" ? "Projection" : "Median projection"}</span>
              </div>
              {chartMode === "bands" && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-2 rounded-sm" style={{ backgroundColor: isBullish ? COLORS.innerBand : COLORS.innerBandBear }} />
                    <span className="text-[#94a3b8]">25-75th %ile</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-2 rounded-sm" style={{ backgroundColor: isBullish ? COLORS.outerBand : COLORS.outerBandBear }} />
                    <span className="text-[#94a3b8]">5-95th %ile</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Probability badge overlay */}
        {result && (
          <div className="absolute top-2 right-3 z-10 flex items-center gap-2">
            <div
              className={`px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-sm ${
                result.probProfit >= 55
                  ? "bg-[#00d4aa]/15 text-[#00d4aa]"
                  : result.probProfit <= 45
                  ? "bg-[#ff4757]/15 text-[#ff4757]"
                  : "bg-[#fbbf24]/15 text-[#fbbf24]"
              }`}
            >
              {result.probProfit}% profit
            </div>
          </div>
        )}
      </div>

      {/* Event Zone Indicators */}
      {eventZones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {eventZones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border"
              style={{
                backgroundColor: zone.zoneColor.bg,
                borderColor: zone.zoneColor.border,
              }}
            >
              <span>{zone.emoji}</span>
              <span className="text-[#94a3b8] max-w-[120px] truncate">{zone.name}</span>
              <span
                className={`font-mono font-medium ${
                  zone.isBullish ? "text-[#00d4aa]" : "text-[#ff4757]"
                }`}
              >
                {zone.isBullish ? "+" : ""}${zone.impact.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}