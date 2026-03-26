"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type FeedType = "trending" | "new" | "following" | "for_you";

interface FeedScenario {
  id: string;
  ticker: string;
  title: string;
  description: string;
  events: string;
  result_summary: string;
  author_name: string;
  author_id: string;
  views: number;
  forks: number;
  likes: number;
  created_at: string;
  comment_count: number;
  share_count: number;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function parseEvents(eventsJson: string): { name: string; emoji: string }[] {
  try {
    const events = JSON.parse(eventsJson);
    return events.map((e: any) => ({
      name: e.name || e.id || "Event",
      emoji: e.emoji || "📊",
    }));
  } catch {
    return [];
  }
}

function parseResult(resultJson: string): { median: number; probProfit: number } | null {
  try {
    const r = JSON.parse(resultJson);
    return {
      median: r.median_target || r.median30d || 0,
      probProfit: Math.round((r.probability_above_current || r.probProfit || 0) * (r.probability_above_current > 1 ? 1 : 100)),
    };
  } catch {
    return null;
  }
}

function ScenarioCard({ scenario }: { scenario: FeedScenario }) {
  const events = parseEvents(scenario.events);
  const result = parseResult(scenario.result_summary || "{}");
  const engagement = (scenario.comment_count || 0) * 3 + scenario.forks * 2.5 + (scenario.share_count || 0) * 2 + scenario.likes + scenario.views * 0.01;

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-accent/30 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
            {(scenario.author_name || "A")[0].toUpperCase()}
          </div>
          <span className="text-sm text-white font-medium">{scenario.author_name || "Anonymous"}</span>
          <span className="text-xs text-muted">· {timeAgo(scenario.created_at)}</span>
        </div>
        <span className="text-xs text-muted flex items-center gap-1">
          🔥 {Math.round(engagement)}
        </span>
      </div>

      {/* Title + Ticker */}
      <Link href={`/s/${scenario.id}`} className="no-underline">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-bold rounded">
            ${scenario.ticker}
          </span>
          <h3 className="text-sm font-medium text-white truncate">
            {scenario.title || `${scenario.ticker} Scenario`}
          </h3>
        </div>
      </Link>

      {/* Description */}
      {scenario.description && (
        <p className="text-xs text-muted mb-3 line-clamp-2">{scenario.description}</p>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {events.slice(0, 3).map((e, i) => (
            <span key={i} className="text-xs px-2 py-0.5 bg-border/50 text-muted rounded-full">
              {e.emoji} {e.name}
            </span>
          ))}
          {events.length > 3 && (
            <span className="text-xs text-muted">+{events.length - 3} more</span>
          )}
        </div>
      )}

      {/* Result stats */}
      {result && (
        <div className="flex gap-4 mb-3">
          <div className="text-xs">
            <span className="text-muted">Median: </span>
            <span className="text-white font-medium">${result.median.toFixed(0)}</span>
          </div>
          <div className="text-xs">
            <span className="text-muted">Prob profit: </span>
            <span className={result.probProfit >= 50 ? "text-bullish font-medium" : "text-bearish font-medium"}>
              {result.probProfit}%
            </span>
          </div>
        </div>
      )}

      {/* Engagement bar */}
      <div className="flex items-center gap-4 pt-2 border-t border-border">
        <span className="text-xs text-muted flex items-center gap-1 hover:text-white cursor-pointer">
          💬 {scenario.comment_count || 0}
        </span>
        <span className="text-xs text-muted flex items-center gap-1 hover:text-white cursor-pointer">
          🔄 {scenario.forks}
        </span>
        <span className="text-xs text-muted flex items-center gap-1 hover:text-white cursor-pointer">
          ❤️ {scenario.likes}
        </span>
        <span className="text-xs text-muted flex items-center gap-1 ml-auto">
          👁 {scenario.views.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export default function FeedPage() {
  const [feedType, setFeedType] = useState<FeedType>("trending");
  const [scenarios, setScenarios] = useState<FeedScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickerFilter, setTickerFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ type: feedType, limit: "30" });
        if (tickerFilter) params.set("ticker", tickerFilter.toUpperCase());
        const res = await fetch(`${API_BASE}/api/feed?${params}`);
        if (res.ok) {
          const data = await res.json();
          setScenarios(Array.isArray(data) ? data : []);
        }
      } catch {
        setScenarios([]);
      }
      setLoading(false);
    };
    load();
  }, [feedType, tickerFilter]);

  const tabs: { label: string; value: FeedType; icon: string }[] = [
    { label: "For You", value: "for_you", icon: "🎯" },
    { label: "Trending", value: "trending", icon: "🔥" },
    { label: "New", value: "new", icon: "🆕" },
    { label: "Following", value: "following", icon: "👥" },
  ];

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-20 pb-12">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Feed</h1>
          <p className="text-sm text-muted">Discover and discuss stock simulations</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 bg-card rounded-xl p-1 border border-border">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFeedType(tab.value)}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                feedType === tab.value
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-white"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Ticker filter */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter by ticker (e.g. NVDA, CVX)..."
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs text-white placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Feed */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted mt-2">Loading scenarios...</p>
          </div>
        ) : scenarios.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-xl">
            <p className="text-muted text-sm mb-2">No scenarios yet</p>
            <Link href="/sim/AAPL" className="text-accent text-sm no-underline hover:underline">
              Create the first one →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {scenarios.map((s) => (
              <ScenarioCard key={s.id} scenario={s} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
