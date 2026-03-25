"use client";

import Link from "next/link";
import { EVENT_TEMPLATES } from "@/lib/events";

interface ScenarioData {
  id: string;
  ticker: string;
  title: string;
  description?: string;
  events: { id: string; probability: number; duration: number; impact: number }[];
  result_summary?: { median30d: number; probProfit: number; eventImpact: number; currentPrice: number };
  author_name: string;
  views: number;
  forks: number;
  likes: number;
  tags?: string;
  created_at: string;
}

export default function ScenarioCard({ scenario }: { scenario: ScenarioData }) {
  const rs = scenario.result_summary;
  const isBullish = rs && rs.eventImpact >= 0;

  return (
    <Link href={`/s/${scenario.id}`}>
      <div className="bg-card border border-border rounded-xl p-4 hover:border-accent/30 transition-all cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-accent text-sm">{scenario.ticker}</span>
              <span className="text-xs text-muted">by {scenario.author_name}</span>
            </div>
            <h3 className="text-sm font-medium text-white group-hover:text-accent transition-colors truncate">
              {scenario.title}
            </h3>
          </div>
        </div>

        {/* Event badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {scenario.events.map((e) => {
            const tmpl = EVENT_TEMPLATES.find((t) => t.id === e.id);
            return (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg text-[10px] text-muted"
              >
                {tmpl?.emoji || "📊"} {tmpl?.name || e.id}
              </span>
            );
          })}
        </div>

        {/* Stats row */}
        {rs && (
          <div className="flex items-center gap-3 mb-3 text-xs">
            <span className={`font-mono font-medium ${isBullish ? "text-bullish" : "text-bearish"}`}>
              ${rs.median30d?.toFixed(0)}
            </span>
            <span className={`${rs.probProfit >= 50 ? "text-bullish" : "text-bearish"}`}>
              {rs.probProfit}% profit
            </span>
            <span className="text-muted">
              {isBullish ? "+" : ""}${rs.eventImpact?.toFixed(0)} impact
            </span>
          </div>
        )}

        {/* Engagement stats */}
        <div className="flex items-center gap-4 text-[11px] text-neutral">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {scenario.views.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            {scenario.forks}
          </span>
          <span className="flex items-center gap-1">
            ❤️ {scenario.likes}
          </span>
        </div>
      </div>
    </Link>
  );
}
