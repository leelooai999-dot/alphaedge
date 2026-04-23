"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { getSupportedTickers, type SupportedTicker } from "@/lib/api";

const QUICK_TICKERS = ["AAPL", "NVDA", "TSLA", "SPY", "CVX", "MSFT", "XOM", "QQQ"];
const RECENTS_KEY = "hyperdash_recent_tickers";

type ViewMode = "cards" | "compact";
type SortMode = "ticker" | "name" | "sector";

export default function TickersPage() {
  const [tickers, setTickers] = useState<SupportedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [recentTickers, setRecentTickers] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("ticker");

  useEffect(() => {
    let cancelled = false;
    getSupportedTickers()
      .then((data) => {
        if (!cancelled) setTickers(data);
      })
      .catch(() => {
        if (!cancelled) setTickers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setRecentTickers(parsed);
      }
    } catch {}
  }, []);

  const sectors = useMemo(() => {
    const unique = Array.from(new Set(tickers.map((t) => t.sector).filter(Boolean))).sort();
    return ["all", ...unique];
  }, [tickers]);

  const tickerMap = useMemo(() => new Map(tickers.map((t) => [t.ticker, t])), [tickers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filteredItems = tickers.filter((ticker) => {
      const matchesQuery = !q || ticker.ticker.toLowerCase().includes(q) || ticker.name.toLowerCase().includes(q);
      const matchesSector = sector === "all" || ticker.sector === sector;
      return matchesQuery && matchesSector;
    });

    return [...filteredItems].sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "sector") {
        const sectorCompare = (a.sector || "").localeCompare(b.sector || "");
        return sectorCompare !== 0 ? sectorCompare : a.ticker.localeCompare(b.ticker);
      }
      return a.ticker.localeCompare(b.ticker);
    });
  }, [tickers, query, sector, sortMode]);

  const recentItems = useMemo(() => recentTickers.map((ticker) => tickerMap.get(ticker)).filter(Boolean) as SupportedTicker[], [recentTickers, tickerMap]);
  const quickItems = useMemo(() => QUICK_TICKERS.map((ticker) => tickerMap.get(ticker)).filter(Boolean) as SupportedTicker[], [tickerMap]);

  const rememberTicker = (ticker: string) => {
    try {
      const next = [ticker, ...recentTickers.filter((t) => t !== ticker)].slice(0, 8);
      setRecentTickers(next);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {}
  };

  const chartHref = (ticker: string) => `/sim/${ticker}?entry=hyperdash&focus=chart`;
  const simHref = (ticker: string) => `/sim/${ticker}?entry=hyperdash&focus=sim`;

  return (
    <main className="min-h-screen bg-bg text-white">
      <Navbar />
      <section className="pt-28 pb-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 mb-4">
              <span className="text-xs text-accent font-medium">Hyper Dash</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">All supported tickers, one fast jump board</h1>
            <p className="text-muted max-w-2xl">Browse every supported ticker, filter quickly, and jump straight into the simulator or chart view.</p>
          </div>

          {(recentItems.length > 0 || quickItems.length > 0) && (
            <div className="space-y-4 mb-6">
              {recentItems.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted mb-2">Recent</div>
                  <div className="flex flex-wrap gap-2">
                    {recentItems.map((item) => (
                      <Link key={`recent-${item.ticker}`} href={simHref(item.ticker)} onClick={() => rememberTicker(item.ticker)} className="px-3 py-2 rounded-full bg-card border border-border text-sm text-white no-underline hover:border-accent/40 hover:text-accent">
                        {item.ticker}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {quickItems.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted mb-2">Popular jump points</div>
                  <div className="flex flex-wrap gap-2">
                    {quickItems.map((item) => (
                      <button key={`quick-${item.ticker}`} onClick={() => setQuery(item.ticker)} className="px-3 py-2 rounded-full bg-accent/10 border border-accent/20 text-sm text-accent hover:bg-accent/15">
                        {item.ticker}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_160px_180px] gap-3 mb-6">
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker or company..."
                className="w-full bg-transparent outline-none text-sm placeholder:text-muted"
              />
            </div>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-card border border-border rounded-xl px-4 py-3 text-sm text-white outline-none"
            >
              {sectors.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All sectors" : option}
                </option>
              ))}
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="bg-card border border-border rounded-xl px-4 py-3 text-sm text-white outline-none"
            >
              <option value="ticker">Sort: Ticker</option>
              <option value="name">Sort: Name</option>
              <option value="sector">Sort: Sector</option>
            </select>
            <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
              {(["compact", "cards"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${viewMode === mode ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}
                >
                  {mode === "compact" ? "Compact" : "Cards"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 text-sm text-muted">
            <span>{loading ? "Loading tickers..." : `${filtered.length} tickers`}</span>
            <Link href="/sim/AAPL?entry=hyperdash&focus=sim" className="text-accent hover:text-accent/80 no-underline">Open default simulator</Link>
          </div>

          {viewMode === "compact" ? (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[120px_minmax(0,1fr)_130px_120px_120px] gap-3 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted border-b border-border">
                <div>Ticker</div>
                <div>Name</div>
                <div>Sector</div>
                <div>Sim</div>
                <div>Chart</div>
              </div>
              {filtered.map((ticker) => (
                <div key={ticker.ticker} className="grid grid-cols-[120px_minmax(0,1fr)_130px_120px_120px] gap-3 px-4 py-3 border-b border-border last:border-b-0 items-center">
                  <div className="font-mono text-sm font-bold text-white">{ticker.ticker}</div>
                  <div className="text-sm text-white/90 truncate">{ticker.name}</div>
                  <div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 text-muted border border-border">{ticker.sector || "Unknown"}</span>
                  </div>
                  <Link href={simHref(ticker.ticker)} onClick={() => rememberTicker(ticker.ticker)} className="px-3 py-2 rounded-lg bg-accent text-bg text-xs font-semibold no-underline text-center hover:bg-accent/90">
                    Simulate
                  </Link>
                  <Link href={chartHref(ticker.ticker)} onClick={() => rememberTicker(ticker.ticker)} className="px-3 py-2 rounded-lg border border-border text-xs text-muted hover:text-white no-underline text-center">
                    Chart
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered.map((ticker) => (
                <div key={ticker.ticker} className="bg-card border border-border rounded-2xl p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-lg font-bold text-white">{ticker.ticker}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-muted border border-border">{ticker.sector || "Unknown"}</span>
                    </div>
                    <p className="text-sm text-white/90 truncate">{ticker.name}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <Link href={simHref(ticker.ticker)} onClick={() => rememberTicker(ticker.ticker)} className="px-3 py-2 rounded-lg bg-accent text-bg text-xs font-semibold no-underline text-center hover:bg-accent/90">
                      Open Simulator
                    </Link>
                    <Link href={chartHref(ticker.ticker)} onClick={() => rememberTicker(ticker.ticker)} className="px-3 py-2 rounded-lg border border-border text-xs text-muted hover:text-white no-underline text-center">
                      View Chart
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="mt-8 bg-card border border-border rounded-2xl p-8 text-center text-muted">
              No tickers match your search.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
