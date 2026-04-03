"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import WhaleCard, { WhaleTrade } from "@/components/WhaleCard";
import WhaleDetailDrawer from "@/components/WhaleDetailDrawer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface FlowStats {
  total_trades: number;
  total_premium: number;
  bullish_premium: number;
  bearish_premium: number;
  top_tickers: {
    ticker: string;
    trade_count: number;
    total_premium: number;
    bullish_premium: number;
    bearish_premium: number;
  }[];
}

function FlowContent() {
  const searchParams = useSearchParams();
  const initialTicker = searchParams.get("ticker") || "";

  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [stats, setStats] = useState<FlowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [tickerFilter, setTickerFilter] = useState(initialTicker);
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [minPremium, setMinPremium] = useState(500000);

  // Detail drawer
  const [selectedTrade, setSelectedTrade] = useState<WhaleTrade | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tickerFilter) params.set("ticker", tickerFilter.toUpperCase());
      if (directionFilter !== "all") params.set("direction", directionFilter);
      if (typeFilter !== "all") params.set("option_type", typeFilter);
      params.set("min_premium", minPremium.toString());
      params.set("page", page.toString());
      params.set("limit", "50");

      const res = await fetch(`${API_BASE}/api/flow?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.warn("Failed to fetch whale flow:", e);
    }
    setLoading(false);
  }, [tickerFilter, directionFilter, typeFilter, minPremium, page]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/flow/stats`);
      if (res.ok) {
        setStats(await res.json());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 120000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Auto-refresh trades every 60s
  useEffect(() => {
    const interval = setInterval(fetchTrades, 60000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  const handleCardClick = (trade: WhaleTrade) => {
    setSelectedTrade(trade);
    setDrawerOpen(true);
  };

  const handleQuickSim = (trade: WhaleTrade) => {
    window.location.href = `/sim/${trade.ticker}?whale=${trade.id}`;
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <main className="min-h-screen pt-14">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🐋 Whale Flow
              <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">
                LIVE
              </span>
            </h1>
            <p className="text-sm text-muted mt-1">
              Options contracts with &gt;$500K premium — see where big money is moving
            </p>
          </div>
          {stats && (
            <div className="flex gap-4">
              <MiniStat
                label="Total Flow"
                value={`$${(stats.total_premium / 1e9).toFixed(1)}B`}
              />
              <MiniStat
                label="Trades"
                value={stats.total_trades.toLocaleString()}
              />
              <MiniStat
                label="Bull/Bear"
                value={`${((stats.bullish_premium / (stats.total_premium || 1)) * 100).toFixed(0)}% / ${((stats.bearish_premium / (stats.total_premium || 1)) * 100).toFixed(0)}%`}
                color={stats.bullish_premium > stats.bearish_premium ? "text-bullish" : "text-bearish"}
              />
            </div>
          )}
        </div>

        {/* Top tickers heat strip */}
        {stats && stats.top_tickers.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin">
            {stats.top_tickers.map((t) => {
              const bullPct = t.total_premium > 0 ? (t.bullish_premium / t.total_premium) * 100 : 50;
              const isActive = tickerFilter.toUpperCase() === t.ticker;
              return (
                <button
                  key={t.ticker}
                  onClick={() => {
                    setTickerFilter(isActive ? "" : t.ticker);
                    setPage(1);
                  }}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg border transition-all ${
                    isActive
                      ? "border-accent bg-accent/20"
                      : "border-border bg-card hover:bg-cardHover"
                  }`}
                >
                  <div className="font-mono font-bold text-xs text-white">{t.ticker}</div>
                  <div className="text-[10px] text-muted">
                    ${(t.total_premium / 1e6).toFixed(0)}M · {t.trade_count}
                  </div>
                  <div className="w-16 h-1 rounded-full bg-bearish/30 mt-1 overflow-hidden">
                    <div
                      className="h-full bg-bullish rounded-full"
                      style={{ width: `${bullPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input
            type="text"
            value={tickerFilter}
            onChange={(e) => { setTickerFilter(e.target.value); setPage(1); }}
            placeholder="Filter by ticker..."
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-muted w-40 focus:outline-none focus:border-accent"
          />

          <div className="flex rounded-lg border border-border overflow-hidden">
            {["all", "bullish", "bearish"].map((d) => (
              <button
                key={d}
                onClick={() => { setDirectionFilter(d); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  directionFilter === d
                    ? d === "bullish"
                      ? "bg-bullish/20 text-bullish"
                      : d === "bearish"
                      ? "bg-bearish/20 text-bearish"
                      : "bg-accent/20 text-accent"
                    : "text-muted hover:text-white"
                }`}
              >
                {d === "all" ? "All" : d === "bullish" ? "↑ Bull" : "↓ Bear"}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-border overflow-hidden">
            {["all", "call", "put"].map((t) => (
              <button
                key={t}
                onClick={() => { setTypeFilter(t); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  typeFilter === t ? "bg-accent/20 text-accent" : "text-muted hover:text-white"
                }`}
              >
                {t === "all" ? "All" : t.toUpperCase()}
              </button>
            ))}
          </div>

          <select
            value={minPremium}
            onChange={(e) => { setMinPremium(Number(e.target.value)); setPage(1); }}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent"
          >
            <option value={500000}>$500K+</option>
            <option value={1000000}>$1M+</option>
            <option value={5000000}>$5M+</option>
            <option value={10000000}>$10M+</option>
          </select>

          <span className="text-xs text-muted ml-auto">
            {total.toLocaleString()} trades found
          </span>
        </div>

        {/* Trade grid */}
        {loading && trades.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                <div className="h-4 w-24 bg-border rounded mb-2" />
                <div className="h-3 w-32 bg-border rounded mb-2" />
                <div className="h-3 w-full bg-border rounded" />
              </div>
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🐋</div>
            <div className="text-lg text-muted">No whale trades found</div>
            <p className="text-sm text-neutral mt-1">
              {tickerFilter
                ? `No options flow over $${(minPremium / 1000).toFixed(0)}K for ${tickerFilter.toUpperCase()} today`
                : "Whale data is scanned during market hours (9:30 AM - 4:00 PM ET)"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trades.map((trade) => (
              <WhaleCard
                key={trade.id}
                trade={trade}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-white disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-white disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <WhaleDetailDrawer
        trade={selectedTrade}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onQuickSim={handleQuickSim}
      />
    </main>
  );
}

export default function FlowPage() {
  return (
    <Suspense fallback={<main className="min-h-screen"><Navbar /></main>}>
      <FlowContent />
    </Suspense>
  );
}

function MiniStat({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] text-muted uppercase">{label}</div>
      <div className={`font-mono font-bold text-sm ${color}`}>{value}</div>
    </div>
  );
}
