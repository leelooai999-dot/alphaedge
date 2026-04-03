"use client";

import { useMemo } from "react";

export interface WhaleTrade {
  id: number;
  ticker: string;
  strike: number;
  expiry: string;
  option_type: string;
  direction: string;
  bullish_bearish: string;
  volume: number;
  open_interest: number;
  last_price: number;
  bid: number;
  ask: number;
  estimated_premium: number;
  iv: number;
  volume_oi_ratio: number;
  position_type: string;
  is_multileg: boolean;
  multileg_group_id: string | null;
  analysis_cache: string | null;
  scanned_at: string;
  scan_date: string;
}

interface WhaleCardProps {
  trade: WhaleTrade;
  compact?: boolean;
  onClick?: (trade: WhaleTrade) => void;
  onDragStart?: (e: React.DragEvent, trade: WhaleTrade) => void;
  showTicker?: boolean;
}

export default function WhaleCard({
  trade,
  compact = false,
  onClick,
  onDragStart,
  showTicker = true,
}: WhaleCardProps) {
  const premiumFormatted = useMemo(() => {
    if (trade.estimated_premium >= 1_000_000) {
      return `$${(trade.estimated_premium / 1_000_000).toFixed(1)}M`;
    }
    return `$${(trade.estimated_premium / 1_000).toFixed(0)}K`;
  }, [trade.estimated_premium]);

  const sentimentColor =
    trade.bullish_bearish === "bullish"
      ? "border-bullish/40 bg-bullish/5"
      : trade.bullish_bearish === "bearish"
      ? "border-bearish/40 bg-bearish/5"
      : "border-border bg-card";

  const sentimentGlow =
    trade.bullish_bearish === "bullish"
      ? "shadow-bullish/10"
      : trade.bullish_bearish === "bearish"
      ? "shadow-bearish/10"
      : "";

  const directionArrow =
    trade.bullish_bearish === "bullish" ? "↑" : trade.bullish_bearish === "bearish" ? "↓" : "↔";

  const directionTextColor =
    trade.bullish_bearish === "bullish"
      ? "text-bullish"
      : trade.bullish_bearish === "bearish"
      ? "text-bearish"
      : "text-muted";

  const optionPill =
    trade.option_type === "call"
      ? "bg-bullish/20 text-bullish"
      : "bg-bearish/20 text-bearish";

  const convictionDots = useMemo(() => {
    if (trade.position_type === "opening") return "●●●";
    if (trade.position_type === "mixed") return "●●○";
    return "●○○";
  }, [trade.position_type]);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/whale-trade", JSON.stringify(trade));
    e.dataTransfer.effectAllowed = "copy";
    if (onDragStart) onDragStart(e, trade);
  };

  if (compact) {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={() => onClick?.(trade)}
        className={`rounded-lg border p-2 cursor-grab active:cursor-grabbing hover:bg-cardHover transition-colors ${sentimentColor} ${sentimentGlow}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm font-bold ${directionTextColor}`}>{directionArrow}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${optionPill}`}>
              {trade.option_type.toUpperCase()}
            </span>
            <span className="font-mono text-xs text-white truncate">
              ${trade.strike}
            </span>
            <span className="text-[10px] text-muted">{trade.expiry}</span>
          </div>
          <span className="font-mono text-xs font-bold text-white whitespace-nowrap">
            {premiumFormatted}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onClick?.(trade)}
      className={`rounded-xl border p-3 cursor-grab active:cursor-grabbing hover:bg-cardHover transition-all hover:shadow-lg ${sentimentColor} ${sentimentGlow}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {showTicker && (
            <span className="font-mono font-bold text-white text-sm bg-card px-2 py-0.5 rounded-md border border-border">
              {trade.ticker}
            </span>
          )}
          <span className={`text-lg font-bold ${directionTextColor}`}>{directionArrow}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${optionPill}`}>
            {trade.option_type.toUpperCase()}
          </span>
          {trade.is_multileg && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
              MULTI-LEG
            </span>
          )}
        </div>
        <span className="font-mono text-base font-bold text-white">{premiumFormatted}</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="font-mono">${trade.strike} strike</span>
        <span>exp {trade.expiry}</span>
        <span title="Conviction">{convictionDots}</span>
      </div>

      <div className="flex items-center gap-3 mt-2 text-[10px] text-neutral">
        <span>Vol: {trade.volume.toLocaleString()}</span>
        <span>OI: {trade.open_interest.toLocaleString()}</span>
        <span>IV: {(trade.iv * 100).toFixed(0)}%</span>
        <span className={`ml-auto font-medium ${
          trade.position_type === "opening" ? "text-yellow-400" : "text-muted"
        }`}>
          {trade.position_type === "opening" ? "🆕 New Position" : trade.position_type === "closing" ? "Closing" : "Mixed"}
        </span>
      </div>
    </div>
  );
}
