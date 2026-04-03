"use client";

import { useState, useEffect, useCallback } from "react";
import WhaleCard, { WhaleTrade } from "./WhaleCard";
import WhaleDetailDrawer from "./WhaleDetailDrawer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface WhaleSidebarProps {
  ticker: string;
  onApplyTrades?: (tradeIds: number[]) => void;
  onApplyConsensus?: () => void;
  appliedTradeIds?: number[];
  onRemoveTrade?: (tradeId: number) => void;
}

interface WhaleConsensus {
  score: number;
  trade_count: number;
  net_premium_bullish: number;
  net_premium_bearish: number;
  total_premium: number;
  direction: string;
}

export default function WhaleSidebar({
  ticker,
  onApplyTrades,
  onApplyConsensus,
  appliedTradeIds = [],
  onRemoveTrade,
}: WhaleSidebarProps) {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [consensus, setConsensus] = useState<WhaleConsensus | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<WhaleTrade | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch whale trades for this ticker
  const fetchData = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const [flowRes, consRes] = await Promise.all([
        fetch(`${API_BASE}/api/flow?ticker=${ticker}&limit=30`),
        fetch(`${API_BASE}/api/flow/consensus/${ticker}`),
      ]);

      if (flowRes.ok) {
        const data = await flowRes.json();
        setTrades(data.trades || []);
      }
      if (consRes.ok) {
        const data = await consRes.json();
        setConsensus(data);
      }
    } catch (e) {
      console.warn("Failed to fetch whale data:", e);
    }
    setLoading(false);
  }, [ticker]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60s during market hours
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCardClick = (trade: WhaleTrade) => {
    setSelectedTrade(trade);
    setDrawerOpen(true);
  };

  const handleAddToSim = (trade: WhaleTrade) => {
    if (onApplyTrades && !appliedTradeIds.includes(trade.id)) {
      onApplyTrades([...appliedTradeIds, trade.id]);
    }
    setDrawerOpen(false);
  };

  const handleQuickSim = (trade: WhaleTrade) => {
    // Navigate to sim page with this trade pre-applied
    window.location.href = `/sim/${trade.ticker}?whale=${trade.id}`;
  };

  const scoreColor =
    consensus && consensus.score > 1
      ? "text-bullish"
      : consensus && consensus.score < -1
      ? "text-bearish"
      : "text-muted";

  const scoreBg =
    consensus && consensus.score > 1
      ? "bg-bullish/10 border-bullish/30"
      : consensus && consensus.score < -1
      ? "bg-bearish/10 border-bearish/30"
      : "bg-card border-border";

  if (trades.length === 0 && !loading) {
    return null; // Don't show sidebar if no whale activity for this ticker
  }

  return (
    <>
      <div className={`bg-card rounded-xl border border-border overflow-hidden transition-all ${collapsed ? "max-h-12" : ""}`}>
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-cardHover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🐋</span>
            <span className="text-xs font-semibold text-white">Whale Flow</span>
            {trades.length > 0 && (
              <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-medium">
                {trades.length}
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-muted transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 space-y-2">
            {/* Consensus badge */}
            {consensus && consensus.trade_count > 0 && (
              <div className={`rounded-lg border p-2.5 ${scoreBg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-muted uppercase">Whale Consensus</span>
                    <div className={`font-mono font-bold text-lg ${scoreColor}`}>
                      {consensus.score > 0 ? "+" : ""}{consensus.score.toFixed(1)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted">{consensus.trade_count} trades</div>
                    <div className="text-[10px] text-muted">
                      ${(consensus.total_premium / 1_000_000).toFixed(1)}M total
                    </div>
                  </div>
                </div>
                {onApplyConsensus && (
                  <button
                    onClick={onApplyConsensus}
                    className="w-full mt-2 px-3 py-1.5 bg-accent/20 text-accent text-xs font-medium rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    Apply Whale Consensus to Simulation
                  </button>
                )}
              </div>
            )}

            {/* Applied trades chips */}
            {appliedTradeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {appliedTradeIds.map((id) => {
                  const t = trades.find((tr) => tr.id === id);
                  if (!t) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full"
                    >
                      🐋 ${t.strike}{t.option_type === "call" ? "C" : "P"} ${(t.estimated_premium / 1e6).toFixed(1)}M
                      {onRemoveTrade && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveTrade(id); }}
                          className="hover:text-white ml-0.5"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Loading state */}
            {loading && trades.length === 0 && (
              <div className="flex items-center justify-center py-4 text-sm text-muted">
                <svg className="w-4 h-4 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading whale flow...
              </div>
            )}

            {/* Trade cards — scrollable */}
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1 scrollbar-thin">
              <div className="text-[10px] text-muted mb-1">Drag trades onto chart to apply</div>
              {trades.map((trade) => (
                <WhaleCard
                  key={trade.id}
                  trade={trade}
                  compact
                  showTicker={false}
                  onClick={handleCardClick}
                />
              ))}
            </div>

            {/* View all link */}
            {trades.length > 0 && (
              <a
                href={`/flow?ticker=${ticker}`}
                className="block text-center text-xs text-accent hover:text-accent/80 transition-colors py-1"
              >
                View all whale activity →
              </a>
            )}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <WhaleDetailDrawer
        trade={selectedTrade}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAddToSim={handleAddToSim}
        onQuickSim={handleQuickSim}
      />
    </>
  );
}
