"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type DeepPartial,
  type ChartOptions,
  type Time,
  CrosshairMode,
} from "lightweight-charts";
import { SimulationResult, StockData } from "@/lib/events";

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

const COLORS = {
  bg: "#0a0a0f",
  chartBg: "#0d0d14",
  grid: "#2a2a4a",
  text: "#94a3b8",
  white: "#ffffff",
  historical: "#64748b",
  median: "#00d4aa",
  outerBand: "rgba(0, 212, 170, 0.35)",
  innerBand: "rgba(0, 212, 170, 0.55)",
  crosshair: "#758696",
};

export default function SimChart({
  stock,
  result,
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
        vertLines: { color: COLORS.grid + "80" },
        horzLines: { color: COLORS.grid + "80" },
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
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: false,
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
        chart.applyOptions({ width, height });
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
      chart.removeSeries(s);
    }
    seriesRef.current = [];

    // --- Historical price line ---
    const historicalSeries = chart.addSeries(LineSeries, {
      color: COLORS.historical,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
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

    // --- Projection series ---
    if (result) {
      const { dates, median, p25, p75, p5, p95 } = result.paths;

      // P5 line (outer lower)
      const p5Series = chart.addSeries(LineSeries, {
        color: COLORS.outerBand,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(p5Series);
      p5Series.setData(dates.map((d, i) => ({ time: d as Time, value: p5[i] })));

      // P95 line (outer upper)
      const p95Series = chart.addSeries(LineSeries, {
        color: COLORS.outerBand,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(p95Series);
      p95Series.setData(dates.map((d, i) => ({ time: d as Time, value: p95[i] })));

      // P25 line (inner lower)
      const p25Series = chart.addSeries(LineSeries, {
        color: COLORS.innerBand,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(p25Series);
      p25Series.setData(dates.map((d, i) => ({ time: d as Time, value: p25[i] })));

      // P75 line (inner upper)
      const p75Series = chart.addSeries(LineSeries, {
        color: COLORS.innerBand,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(p75Series);
      p75Series.setData(dates.map((d, i) => ({ time: d as Time, value: p75[i] })));

      // Median (dashed, prominent)
      const medianSeries = chart.addSeries(LineSeries, {
        color: COLORS.median,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
      });
      seriesRef.current.push(medianSeries);
      medianSeries.setData(dates.map((d, i) => ({ time: d as Time, value: median[i] })));

      // "Now" vertical line — two-point tall line series
      const todayStr = new Date().toISOString().split("T")[0];
      const allPrices = [
        ...stock.historicalPrices.map((p) => p.price),
        ...p5,
        ...p95,
      ];
      const priceMin = Math.min(...allPrices) * 0.95;
      const priceMax = Math.max(...allPrices) * 1.05;

      const nowSeries = chart.addSeries(LineSeries, {
        color: COLORS.white + "60",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRef.current.push(nowSeries);
      nowSeries.setData([
        { time: todayStr as Time, value: priceMin },
        { time: todayStr as Time, value: priceMax },
      ]);
    }

    // Fit content then apply time range
    chart.timeScale().fitContent();

    const activeRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[2];
    if (result && result.paths.dates.length > 0) {
      const allDates = [
        ...(stock.historicalPrices.map((p) => p.date) || []),
        ...result.paths.dates,
      ];
      const totalDays = allDates.length;
      const visibleDays = activeRange.days;
      const fromIndex = Math.max(0, totalDays - visibleDays);
      const fromDate = allDates[fromIndex];
      const toDate = allDates[allDates.length - 1];

      if (fromDate && toDate) {
        try {
          chart.timeScale().setVisibleRange({
            from: fromDate as Time,
            to: toDate as Time,
          });
        } catch {
          // ignore range errors
        }
      }
    }
  }, [stock, result, timeRange]);

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
          Scroll to zoom / Drag to pan
        </span>
      </div>

      {/* Chart container */}
      <div className="relative w-full min-h-[350px] sm:min-h-[450px]">
        <div ref={containerRef} className="w-full h-full absolute inset-0" />

        {/* Custom Legend */}
        <div className="absolute top-2 left-3 z-10 flex flex-col gap-1 bg-[#0d0d14]/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs pointer-events-none">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-0.5 rounded"
              style={{ backgroundColor: COLORS.historical }}
            />
            <span className="text-[#94a3b8]">Historical</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-0.5 rounded"
              style={{ backgroundColor: COLORS.median, borderTop: "1px dashed #00d4aa" }}
            />
            <span className="text-[#94a3b8]">Median (projected)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-0.5 rounded"
              style={{ backgroundColor: COLORS.innerBand }}
            />
            <span className="text-[#94a3b8]">25th-75th %ile</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-0.5 rounded"
              style={{ backgroundColor: COLORS.outerBand }}
            />
            <span className="text-[#94a3b8]">5th-95th %ile</span>
          </div>
        </div>
      </div>
    </div>
  );
}
