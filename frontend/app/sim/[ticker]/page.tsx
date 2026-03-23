"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import StockSearch from "@/components/StockSearch";
import EventPanel from "@/components/EventPanel";
import ImpactBreakdown from "@/components/ImpactBreakdown";
import { ActiveEvent, EVENT_TEMPLATES, StockData, SimulationResult } from "@/lib/events";
import { MOCK_STOCKS, mockSimulate } from "@/lib/mock";
import { getStock, runSimulation } from "@/lib/api";

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

  // Load stock data
  useEffect(() => {
    const loadStock = async () => {
      if (apiAvailable) {
        try {
          const data = await getStock(ticker);
          setStock({
            ticker: data.ticker,
            name: data.ticker, // API doesn't return name yet
            currentPrice: data.current_price,
            historicalPrices: [], // Will generate client-side
            sector: data.sector,
          });
          // Populate related events from API
          if (data.related_events && data.related_events.length > 0 && events.length === 0) {
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
          console.log("API unavailable, falling back to mock:", e);
          setApiAvailable(false);
        }
      }
      // Mock fallback
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
    };
    loadStock();
  }, [ticker, apiAvailable]);

  // Auto-load default event for known scenarios (mock only)
  useEffect(() => {
    if (apiAvailable) return; // API handles this
    const defaults: Record<string, string[]> = {
      CVX: ["iran-escalation"],
      NVDA: ["chip-controls"],
      SPY: ["fed-rate-decision"],
      AAPL: ["china-taiwan"],
      TSLA: ["ev-subsidy"],
    };
    if (defaults[ticker] && events.length === 0) {
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
  }, [ticker, apiAvailable]);

  // Run simulation
  const runSim = useCallback(async () => {
    if (!stock) return;
    setLoading(true);

    if (apiAvailable) {
      try {
        const apiEvents = events.map((e) => ({
          id: e.id,
          params: {
            severity: e.impact / 2,
            duration_days: e.duration,
            rate_change_bps: e.impact * 10,
          },
          probability: e.probability / 100,
        }));
        const res = await runSimulation(ticker, apiEvents);

        // Map backend response to frontend format
        const days = res.horizon_days || 30;
        const dates: string[] = [];
        const now = new Date();
        for (let i = 0; i <= days; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() + i);
          dates.push(d.toISOString().split("T")[0]);
        }

        // Extract paths data
        const paths = res.paths_sample || [];
        const median = paths[0] || Array(days + 1).fill(res.current_price);
        const p25 = paths[12] || median.map((v: number) => v * 0.97);
        const p75 = paths[37] || median.map((v: number) => v * 1.03);
        const p5 = paths[2] || median.map((v: number) => v * 0.93);
        const p95 = paths[47] || median.map((v: number) => v * 1.07);

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
      } catch (e) {
        console.log("API simulation failed, using mock:", e);
        setApiAvailable(false);
        setResult(mockSimulate(ticker, events));
      }
    } else {
      setResult(mockSimulate(ticker, events));
    }
    setLoading(false);
  }, [ticker, events, stock, apiAvailable]);

  useEffect(() => {
    const timer = setTimeout(runSim, 150);
    return () => clearTimeout(timer);
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
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted">Loading...</div>
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
              <SimChart stock={stock} result={result} />
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
