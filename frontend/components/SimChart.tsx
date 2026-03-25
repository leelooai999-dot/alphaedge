"use client";

import { useEffect, useRef, useMemo } from "react";
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
  outerBand: "rgba(0, 212, 170, 0.08)",
  outerLine: "rgba(0, 212, 170, 0.25)",
  innerBand: "rgba(0, 212, 170, 0.15)",
  innerLine: "rgba(0, 212, 170, 0.45)",
  crosshair: "#758696",
  bullish: "#00d4aa",
  bearish: "#ff4757",
  neutral: "#fbbf24",
};

// Event zone colors with transparency
const EVENT_ZONE_COLORS: Record<string, { bg: string; border: string }> = {
  geopolitical: { bg: "rgba(255, 71, 87, 0.06)", border: "rgba(255, 71, 87, 0.3)" },
  macro: { bg: "rgba(0, 212, 170, 0.06)", border: "rgba(0, 212, 170, 0.3)" },
  sector: { bg: "rgba(251, 191, 36, 0.06)", border: "rgba(251, 191, 36, 0.3)" },
  custom: { bg: "rgba(139, 92, 246, 0.06)", border: "rgba(139, 92, 246, 0.3)" },
};

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

    // Resize observer
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

  // Update series data when stock/result/timeRange change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove all existing series
    for (const s of seriesRef.current) {
      try { chart.removeSeries(s); } catch {}
    }
    seriesRef.current = [];

    // --- 1. Outer confidence band (5th-95th percentile area) ---
    if (result) {
      const { dates, p5, p95, p25, p75, median } = result.paths;

      // P5-P95 outer band (area between)
      const outerTopSeries = chart.addSeries(AreaSeries, {
        topColor: COLORS.outerBand,
        bottomColor: "transparent",
        lineColor: COLORS.outerLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(outerTopSeries);
      outerTopSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p95[i] })));

      const outerBottomSeries = chart.addSeries(AreaSeries, {
        topColor: "transparent",
        bottomColor: COLORS.outerBand,
        lineColor: COLORS.outerLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(outerBottomSeries);
      outerBottomSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p5[i] })));

      // P25-P75 inner band
      const innerTopSeries = chart.addSeries(AreaSeries, {
        topColor: COLORS.innerBand,
        bottomColor: "transparent",
        lineColor: COLORS.innerLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(innerTopSeries);
      innerTopSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p75[i] })));

      const innerBottomSeries = chart.addSeries(AreaSeries, {
        topColor: "transparent",
        bottomColor: COLORS.innerBand,
        lineColor: COLORS.innerLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(innerBottomSeries);
      innerBottomSeries.setData(dates.map((d, i) => ({ time: d as Time, value: p25[i] })));

      // Median projection line (prominent)
      const medianSeries = chart.addSeries(LineSeries, {
        color: COLORS.median,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      seriesRef.current.push(medianSeries);
      medianSeries.setData(dates.map((d, i) => ({ time: d as Time, value: median[i] })));
    }

    // --- 2. Historical price line (on top of projection) ---
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

    // --- 3. "Today" marker via price line ---
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

    // Fit content then apply time range
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
      const totalDays = allDates.length;
      const visibleDays = activeRange.days;
      // Show historical + projection centered around "today"
      const histLen = stock.historicalPrices.length;
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
  }, [stock, result, timeRange]);

  // Compute event zone summary for display below chart
  const eventZones = useMemo(() => {
    if (!events || events.length === 0 || !result) return [];
    return events.map((e) => {
      const breakdownItem = result.breakdown.find((b) =>
        b.eventName.includes(e.name) || b.eventName.includes(e.emoji)
      );
      const impact = breakdownItem?.impact || 0;
      const isBullish = impact >= 0;
      const zoneColor = EVENT_ZONE_COLORS[e.category] || EVENT_ZONE_COLORS.custom;

      return {
        id: e.id,
        emoji: e.emoji,
        name: e.name,
        category: e.category,
        probability: e.probability,
        duration: e.duration,
        impact,
        isBullish,
        zoneColor,
      };
    });
  }, [events, result]);

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
        <span className="text-[10px] text-neutral">
          Scroll to zoom · Drag to pan
        </span>
      </div>

      {/* Chart container */}
      <div className="relative w-full min-h-[350px] sm:min-h-[450px]">
        <div ref={containerRef} className="w-full h-full absolute inset-0" />

        {/* Legend */}
        <div className="absolute top-2 left-3 z-10 flex flex-col gap-1 bg-[#0d0d14]/90 backdrop-blur-sm rounded-lg px-3 py-2 text-[11px] pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: COLORS.historical }} />
            <span className="text-[#94a3b8]">Historical</span>
          </div>
          {result && (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-0.5 rounded border-t border-dashed" style={{ borderColor: COLORS.median, backgroundColor: "transparent" }} />
                <span className="text-[#94a3b8]">Median projection</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-2 rounded-sm" style={{ backgroundColor: COLORS.innerBand }} />
                <span className="text-[#94a3b8]">25-75th %ile</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-2 rounded-sm" style={{ backgroundColor: COLORS.outerBand }} />
                <span className="text-[#94a3b8]">5-95th %ile</span>
              </div>
            </>
          )}
        </div>

        {/* Probability badge overlay (top-right) */}
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

      {/* Event Zone Indicators (below chart) */}
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
