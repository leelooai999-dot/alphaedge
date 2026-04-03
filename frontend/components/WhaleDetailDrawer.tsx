"use client";

import { useState, useEffect } from "react";
import { WhaleTrade } from "./WhaleCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface WhaleDetailDrawerProps {
  trade: WhaleTrade | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToSim?: (trade: WhaleTrade) => void;
  onQuickSim?: (trade: WhaleTrade) => void;
}

export default function WhaleDetailDrawer({
  trade,
  isOpen,
  onClose,
  onAddToSim,
  onQuickSim,
}: WhaleDetailDrawerProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    if (!trade || !isOpen) {
      setAnalysis(null);
      return;
    }

    // Check if analysis is already cached on the trade object
    if (trade.analysis_cache) {
      setAnalysis(trade.analysis_cache);
      return;
    }

    // Fetch analysis from API
    setLoadingAnalysis(true);
    fetch(`${API_BASE}/api/flow/${trade.id}`)
      .then((r) => r.json())
      .then((data) => {
        setAnalysis(data.analysis || null);
      })
      .catch(() => setAnalysis(null))
      .finally(() => setLoadingAnalysis(false));
  }, [trade, isOpen]);

  if (!isOpen || !trade) return null;

  const premiumM = trade.estimated_premium / 1_000_000;
  const isBullish = trade.bullish_bearish === "bullish";
  const isBearish = trade.bullish_bearish === "bearish";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-bg border-l border-border h-full overflow-y-auto animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-white text-lg">{trade.ticker}</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                trade.option_type === "call" ? "bg-bullish/20 text-bullish" : "bg-bearish/20 text-bearish"
              }`}
            >
              {trade.option_type.toUpperCase()}
            </span>
            <span
              className={`text-sm font-bold ${
                isBullish ? "text-bullish" : isBearish ? "text-bearish" : "text-muted"
              }`}
            >
              {isBullish ? "↑ BULLISH" : isBearish ? "↓ BEARISH" : "↔ NEUTRAL"}
            </span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Premium headline */}
          <div className="text-center py-3">
            <div className="text-3xl font-mono font-bold text-white">
              ${premiumM >= 1 ? `${premiumM.toFixed(1)}M` : `${(trade.estimated_premium / 1000).toFixed(0)}K`}
            </div>
            <div className="text-sm text-muted mt-1">Estimated Premium</div>
          </div>

          {/* Trade anatomy */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Trade Anatomy</h3>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Strike" value={`$${trade.strike}`} />
              <DetailRow label="Expiry" value={trade.expiry} />
              <DetailRow label="Direction" value={trade.direction.toUpperCase()} />
              <DetailRow label="Sentiment" value={trade.bullish_bearish.toUpperCase()} />
              <DetailRow label="Volume" value={trade.volume.toLocaleString()} />
              <DetailRow label="Open Interest" value={trade.open_interest.toLocaleString()} />
              <DetailRow label="Last Price" value={`$${trade.last_price.toFixed(2)}`} />
              <DetailRow label="Bid / Ask" value={`$${trade.bid.toFixed(2)} / $${trade.ask.toFixed(2)}`} />
              <DetailRow label="IV" value={`${(trade.iv * 100).toFixed(1)}%`} />
              <DetailRow label="Vol/OI Ratio" value={trade.volume_oi_ratio.toFixed(2)} />
            </div>
          </div>

          {/* Position type */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Position Type</h3>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium px-3 py-1 rounded-full ${
                  trade.position_type === "opening"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : trade.position_type === "closing"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-gray-500/20 text-gray-400"
                }`}
              >
                {trade.position_type === "opening"
                  ? "🆕 New Position (Opening)"
                  : trade.position_type === "closing"
                  ? "📤 Closing Position"
                  : "🔄 Mixed"}
              </span>
            </div>
            <p className="text-xs text-muted mt-2">
              {trade.position_type === "opening"
                ? "Volume significantly exceeds open interest — new positions being established with high conviction."
                : trade.position_type === "closing"
                ? "Volume near open interest — likely closing or rolling existing positions."
                : "Volume/OI ratio suggests a mix of new and closing activity."}
            </p>
            {trade.is_multileg && (
              <div className="mt-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <span className="text-xs text-purple-400">
                  ⚡ Multi-leg detected — this may be part of a spread or straddle strategy
                </span>
              </div>
            )}
          </div>

          {/* AI Analysis */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              🤖 AI Market Analysis
            </h3>
            {loadingAnalysis ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing trade...
              </div>
            ) : analysis ? (
              <p className="text-sm text-gray-300 leading-relaxed">{analysis}</p>
            ) : (
              <p className="text-sm text-muted italic">Analysis unavailable</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            {onQuickSim && (
              <button
                onClick={() => onQuickSim(trade)}
                className="flex-1 px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/80 transition-colors"
              >
                🎯 Quick Sim
              </button>
            )}
            {onAddToSim && (
              <button
                onClick={() => onAddToSim(trade)}
                className="flex-1 px-4 py-2.5 border border-accent text-accent text-sm font-medium rounded-xl hover:bg-accent/10 transition-colors"
              >
                ➕ Add to Simulation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase">{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  );
}
