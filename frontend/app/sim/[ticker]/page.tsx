"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import StockSearch from "@/components/StockSearch";
import EventPanel from "@/components/EventPanel";
import ImpactBreakdown from "@/components/ImpactBreakdown";
import { ActiveEvent, EVENT_TEMPLATES, StockData, SimulationResult } from "@/lib/events";
import { MOCK_STOCKS, mockSimulate } from "@/lib/mock";
import { getStock, runSimulation, getStockHistory } from "@/lib/api";
import type { TimeRange } from "@/components/SimChart";

const SimChart = dynamic(() => import("@/components/SimChart"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function SimulatorPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params.ticker as string)?.toUpperCase() || "AAPL";

  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [stock, setStock] = useState<StockData | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(!!API_BASE);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  // Track last simulation request to prevent stale responses
  const simSeqRef = useRef(0);

  // Load stock data and historical prices
  useEffect(() => {
    let cancelled = false;

    const loadStock = async () => {
      setStock(null);
      setResult(null);
      setEvents([]);

      if (apiAvailable) {
        try {
          const [data, history] = await Promise.all([
            getStock(ticker),
            getStockHistory(ticker, 90),
          ]);

          if (cancelled) return;

          const historicalPrices: { date: string; price: number }[] = [];
          if (history?.dates && history?.prices) {
            history.dates.forEach((d: string, i: number) => {
              historicalPrices.push({ date: d, price: history.prices[i] });
            });
          }

          const newStock: StockData = {
            ticker: data.ticker,
            name: data.name || data.ticker,
            currentPrice: data.current_price,
            historicalPrices,
            sector: data.sector,
          };
          setStock(newStock);

          // Populate related events from API
          if (data.related_events && data.related_events.length > 0) {
            const apiEvents = data.related_events
              .map((re: any) => {
                const tmpl = EVENT_TEMPLATES.find((t) => t.id === re.id);
                if (!tmpl) return null;
                return {
                  ...tmpl,
                  probability: re.probability * 100 || tmpl.polymarketOdds,
                  duration: tmpl.defaultDuration,
                  impact: tmpl.defaultImpact,
                };
              })
              .filter(Boolean) as ActiveEvent[];
            if (apiEvents.length > 0) setEvents(apiEvents);
          }
          return;
        } catch (e) {
          console.warn("API unavailable, falling back to mock:", e);
          if (!cancelled) setApiAvailable(false);
        }
      }

      // Mock fallback
      if (cancelled) return;
      const s = MOCK_STOCKS[ticker];
      if (s) {
        setStock(s);
      } else {
        setStock({
          ticker,
          name: ticker,
          currentPrice: 100 + Math.random() * 200,
          historicalPrices: generateHistorical(150, 90),
          sector: "Unknown",
        });
      }

      // Mock default events
      const defaults: Record<string, string[]> = {
        CVX: ["iran_escalation"],
        NVDA: ["chip_export_control"],
        SPY: ["fed_rate_cut"],
        AAPL: ["china_taiwan"],
        TSLA: ["ev_subsidy"],
      };
      if (defaults[ticker]) {
        const newEvents = defaults[ticker]
          .map((id) => EVENT_TEMPLATES.find((t) => t.id === id))
          .filter(Boolean)
          .map((t) => ({
            ...t!,
            probability: t!.polymarketOdds,
            duration: t!.defaultDuration,
            impact: t!.defaultImpact,
          }));
        setEvents(newEvents);
      }
    };

    loadStock();
    return () => { cancelled = true; };
  }, [ticker, apiAvailable]);

  // Map frontend impact (-30 to +30) to backend severity (1-10)
  function impactToSeverity(impact: number): number {
    const normalized = (impact + 30) / 60;
    return Math.round(1 + normalized * 9);
  }

  // Run simulation — NO re-renders, NO SWR loops
  const runSim = useCallback(
    async (fast: boolean = false) => {
      if (!stock) return;

      const seq = ++simSeqRef.current;
      setLoading(true);

      const apiEvents = events.map((e) => {
        const backendEvent: Record<string, any> = {
          id: e.id,
          params: {
            severity: impactToSeverity(e.impact),
            duration_days: e.duration,
          },
          probability: e.probability / 100,
        };
        if (e.id === "fed_rate_cut" || e.id === "fed_rate_hike") {
          backendEvent.params.basis_points = 50;
        }
        if (e.id === "tariff_increase") {
          backendEvent.params.tariff_pct = 25;
        }
        if (e.id === "oil_disruption") {
          backendEvent.params.supply_cut_pct = 10;
        }
        return backendEvent;
      });

      const daysMap: Record<TimeRange, number> = { "7d": 7, "15d": 15, "30d": 30, "60d": 60, "90d": 90 };
      const days = daysMap[timeRange] || 30;
      const dates: string[] = [];
      const now = new Date();
      for (let i = 0; i <= days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split("T")[0]);
      }

      try {
        const res = await runSimulation(ticker, apiEvents, { fast });

        // Check for stale response
        if (seq !== simSeqRef.current) {
          setLoading(false);
          return;
        }

        const paths = res.paths_sample || [];
        if (paths.length > 0) {
          const median: number[] = [];
          const p25: number[] = [];
          const p75: number[] = [];
          const p5: number[] = [];
          const p95: number[] = [];

          for (let t = 0; t <= days; t++) {
            const values = paths.map((p: number[]) => p[t] || p[p.length - 1]).sort((a: number, b: number) => a - b);
            const n = values.length;
            median.push(values[Math.floor(n * 0.5)]);
            p25.push(values[Math.floor(n * 0.25)]);
            p75.push(values[Math.floor(n * 0.75)]);
            p5.push(values[Math.floor(n * 0.05)]);
            p95.push(values[Math.floor(n * 0.95)]);
          }

          const breakdown = Object.entries(res.event_impact_breakdown || {}).map(
            ([id, pct]: [string, any]) => {
              const tmpl = EVENT_TEMPLATES.find((t) => t.id === id);
              const dollarImpact = (pct / 100) * res.current_price;
              return {
                eventName: (tmpl?.emoji || "") + " " + (tmpl?.name || id),
                impact: Math.round(dollarImpact * 100) / 100,
                color: dollarImpact >= 0 ? "#00d4aa" : "#ff4757",
              };
            }
          );

          setResult({
            ticker: res.ticker,
            currentPrice: res.current_price,
            median30d: res.median_target,
            probProfit: Math.round(res.probability_above_current * 100),
            maxDrawdown5p: res.current_price - res.percentile_5,
            eventImpact: res.event_impact_usd || 0,
            paths: { dates, median, p25, p75, p5, p95 },
            breakdown,
          });
        } else {
          // Fallback: interpolate from percentile values
          const currentPrice = res.current_price;
          const medianArr = Array(days + 1).fill(currentPrice);
          for (let i = 1; i <= days; i++) {
            const t = i / days;
            medianArr[i] = currentPrice + (res.median_target - currentPrice) * t;
          }
          const spread = (res.percentile_95 - res.percentile_5) / 2;
          const qSpread = (res.percentile_75 - res.percentile_25) / 2;

          const p5 = medianArr.map((v: number, i: number) => v - spread * (1 + (i / days) * 0.3));
          const p95 = medianArr.map((v: number, i: number) => v + spread * (1 + (i / days) * 0.3));
          const p25 = medianArr.map((v: number, i: number) => v - qSpread * (1 + (i / days) * 0.3));
          const p75 = medianArr.map((v: number, i: number) => v + qSpread * (1 + (i / days) * 0.3));

          const breakdown = Object.entries(res.event_impact_breakdown || {}).map(
            ([id, pct]: [string, any]) => {
              const tmpl = EVENT_TEMPLATES.find((t) => t.id === id);
              const dollarImpact = (pct / 100) * res.current_price;
              return {
                eventName: (tmpl?.emoji || "") + " " + (tmpl?.name || id),
                impact: Math.round(dollarImpact * 100) / 100,
                color: dollarImpact >= 0 ? "#00d4aa" : "#ff4757",
              };
            }
          );

          setResult({
            ticker: res.ticker,
            currentPrice: res.current_price,
            median30d: res.median_target,
            probProfit: Math.round(res.probability_above_current * 100),
            maxDrawdown5p: res.current_price - res.percentile_5,
            eventImpact: res.event_impact_usd || 0,
            paths: { dates, median: medianArr, p25, p75, p5, p95 },
            breakdown,
          });
        }
      } catch (e) {
        if (seq !== simSeqRef.current) {
          setLoading(false);
          return;
        }
        console.warn("API simulation failed:", e);
        setResult(mockSimulate(ticker, events));
      }

      setLoading(false);
    },
    [ticker, stock, apiAvailable, events, timeRange]
  );

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run initial simulation when stock + events are loaded
  useEffect(() => {
    if (!stock || events.length === 0 || result) return;
    const timer = setTimeout(() => runSim(false), 100);
    return () => clearTimeout(timer);
  }, [stock, events.length, result, runSim]);

  // Debounced re-simulation on slider changes or time range changes
  useEffect(() => {
    if (!stock || !result) return; // Only re-simulate after initial result exists
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSim(true), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [events, stock, result, runSim, timeRange]);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleFullSim = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSim(false);
  }, [runSim]);

  const handleSave = () => {
    const id = Math.random().toString(36).substr(2, 8);
    router.push(`/s/${id}`);
  };

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  };

  const changeColor =
    result && result.eventImpact > 0
      ? "text-bullish"
      : result && result.eventImpact < 0
      ? "text-bearish"
      : "text-muted";

  if (!stock) {
    return (
      <main className="min-h-screen pt-14">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-4 h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] flex flex-col overflow-hidden">
              <StockSearchSkeleton />
              <div className="mt-3">
                <EventPanelSkeleton />
              </div>
            </div>
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-card rounded-2xl border border-border p-4">
                <ChartSkeleton />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-14">
      <Navbar />

      <div className="sticky top-14 z-40 bg-bg/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="w-full sm:w-64">
            <StockSearch currentTicker={ticker} />
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto sm:ml-auto">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white text-lg">
                ${stock.currentPrice.toFixed(2)}
              </span>
              <span className="text-xs text-muted px-2 py-0.5 bg-card rounded-md">
                {stock.sector}
              </span>
              {loading && <span className="text-xs text-accent animate-pulse">Simulating...</span>}
            </div>
            <div className="flex items-center gap-2 ml-auto sm:ml-0">
              <button
                onClick={handleFullSim}
                className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/80 transition-colors"
                disabled={loading}
              >
                Run Full Sim
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-accent/10 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 transition-colors"
              >
                Save Scenario
              </button>
              <button
                onClick={handleShare}
                className="px-3 py-1.5 border border-border text-xs text-muted rounded-lg hover:text-white hover:border-white/20 transition-colors"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-4 h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] flex flex-col overflow-hidden">
            <EventPanel events={events} onEventsChange={setEvents} />
          </div>
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-card rounded-2xl border border-border p-4">
              <SimChart stock={stock} result={result} events={events} timeRange={timeRange} onTimeRangeChange={setTimeRange} />
            </div>
            {result && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="30-day target"
                  value={`$${result.median30d.toFixed(0)}`}
                  sub="median"
                  color="text-white"
                />
                <StatCard
                  label="Prob. of profit"
                  value={`${result.probProfit}%`}
                  sub=""
                  color={result.probProfit >= 50 ? "text-bullish" : "text-bearish"}
                />
                <StatCard
                  label="Max drawdown"
                  value={`$${result.maxDrawdown5p.toFixed(0)}`}
                  sub="5th percentile"
                  color="text-bearish"
                />
                <StatCard
                  label="Event impact"
                  value={`${result.eventImpact >= 0 ? "+" : ""}$${result.eventImpact.toFixed(0)}`}
                  sub="vs base case"
                  color={changeColor}
                />
              </div>
            )}
            <ImpactBreakdown result={result} />
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`font-mono font-bold text-lg ${color}`}>{value}</div>
      {sub && <div className="text-xs text-neutral mt-0.5">{sub}</div>}
    </div>
  );
}

function StockSearchSkeleton() {
  return (
    <div className="bg-bg border border-border rounded-xl px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-border rounded animate-pulse" />
        <div className="h-4 w-32 bg-border rounded animate-pulse" />
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="w-full h-[350px] sm:h-[450px] flex flex-col gap-3">
      <div className="h-4 w-48 bg-border rounded animate-pulse" />
      <div className="flex-1 bg-border/40 rounded-lg animate-pulse" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="h-3 w-24 bg-border rounded animate-pulse mb-2" />
      <div className="h-6 w-20 bg-border rounded animate-pulse mb-1" />
      <div className="h-3 w-16 bg-border rounded animate-pulse" />
    </div>
  );
}

function EventPanelSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 p-3 rounded-lg border border-border">
          <div className="h-4 w-3/4 bg-border rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-border rounded animate-pulse" />
          <div className="h-2 w-full bg-border rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function generateHistorical(basePrice: number, days: number) {
  const prices: { date: string; price: number }[] = [];
  let price = basePrice * (1 - 0.15);
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const change = (Math.sin(i * 0.5) * 0.005 + (Math.random() - 0.48) * 0.012) * price;
    price += change;
    price += (basePrice - price) * 0.015;
    prices.push({ date: d.toISOString().split("T")[0], price: Math.round(Math.max(price, basePrice * 0.75) * 100) / 100 });
  }
  return prices;
}
