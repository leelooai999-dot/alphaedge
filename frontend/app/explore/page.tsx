"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import ScenarioCard from "@/components/ScenarioCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type SortMode = "trending" | "newest" | "views" | "forks";

const POPULAR_TICKERS = ["ALL", "CVX", "NVDA", "TSLA", "SPY", "AAPL", "XOM", "LMT", "GLD"];

export default function ExplorePage() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [sort, setSort] = useState<SortMode>("trending");
  const [ticker, setTicker] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ sort, limit: "30" });
        if (ticker !== "ALL") params.set("ticker", ticker);

        const [scenariosRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/api/scenarios?${params}`),
          fetch(`${API_BASE}/api/scenarios/stats`),
        ]);

        if (scenariosRes.ok) setScenarios(await scenariosRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
      } catch (e) {
        console.error("Failed to load scenarios:", e);
      }
      setLoading(false);
    };
    load();
  }, [sort, ticker]);

  return (
    <main className="min-h-screen pt-14">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            Explore Scenarios
          </h1>
          <p className="text-muted text-sm">
            Browse community-created event simulations. Fork any scenario to make it your own.
          </p>

          {/* Social proof */}
          {stats && (
            <div className="flex items-center gap-4 mt-4 text-xs text-neutral">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 live-dot" />
                {(stats.simulations_today || 0).toLocaleString()} simulations today
              </span>
              <span>
                {(stats.total_scenarios || 0).toLocaleString()} scenarios published
              </span>
              {stats.trending_tickers?.length > 0 && (
                <span>
                  Trending: {stats.trending_tickers.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Sort */}
          <div className="flex gap-1 bg-card rounded-lg p-1 border border-border">
            {(["trending", "newest", "views", "forks"] as SortMode[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                  sort === s
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:text-white"
                }`}
              >
                {s === "views" ? "Most Viewed" : s === "forks" ? "Most Forked" : s}
              </button>
            ))}
          </div>

          {/* Ticker filter */}
          <div className="flex gap-1 flex-wrap">
            {POPULAR_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => setTicker(t)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  ticker === t
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : "bg-card text-muted border border-border hover:text-white"
                }`}
              >
                {t === "ALL" ? "All Tickers" : t}
              </button>
            ))}
          </div>
        </div>

        {/* Scenario grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                <div className="h-4 w-1/3 bg-border rounded mb-2" />
                <div className="h-4 w-3/4 bg-border rounded mb-3" />
                <div className="flex gap-2 mb-3">
                  <div className="h-5 w-20 bg-border rounded" />
                  <div className="h-5 w-16 bg-border rounded" />
                </div>
                <div className="h-3 w-1/2 bg-border rounded" />
              </div>
            ))}
          </div>
        ) : scenarios.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-muted">No scenarios found. Be the first to create one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map((s) => (
              <ScenarioCard key={s.id} scenario={s} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
