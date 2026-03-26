"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type Period = "week" | "month" | "all_time";

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  author_name: string;
  scenario_count: number;
  total_views: number;
  total_likes: number;
  total_forks: number;
  engagement_score: number;
  points: number;
  streak_days: number;
  avatar_url: string | null;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-xs text-muted font-mono w-6 text-center">#{rank}</span>;
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("all_time");
  const [tickerFilter, setTickerFilter] = useState("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period, limit: "50" });
        if (tickerFilter) params.set("ticker", tickerFilter.toUpperCase());
        const res = await fetch(`${API_BASE}/api/leaderboard?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEntries(Array.isArray(data) ? data : []);
        }
      } catch {
        setEntries([]);
      }
      setLoading(false);
    };
    load();
  }, [period, tickerFilter]);

  const periods: { label: string; value: Period }[] = [
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "All Time", value: "all_time" },
  ];

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 pt-20 pb-12">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">🏆 Leaderboard</h1>
          <p className="text-sm text-muted">
            Top simulators ranked by engagement — comments, forks, shares, and accuracy
          </p>
        </div>

        {/* Period tabs */}
        <div className="flex items-center gap-1 mb-4 bg-card rounded-xl p-1 border border-border">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                period === p.value
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Ticker filter */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter by ticker..."
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs text-white placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Leaderboard table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-xl">
            <p className="text-muted text-sm mb-2">No leaderboard data yet</p>
            <p className="text-xs text-muted">Create and share scenarios to appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.user_id || entry.rank}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  entry.rank <= 3
                    ? "bg-accent/5 border-accent/20"
                    : "bg-card border-border hover:border-accent/20"
                }`}
              >
                {/* Rank */}
                <div className="w-8 flex justify-center">
                  <RankBadge rank={entry.rank} />
                </div>

                {/* Avatar + Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    entry.rank <= 3 ? "bg-accent/20 text-accent" : "bg-border text-muted"
                  }`}>
                    {(entry.author_name || "A")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{entry.author_name}</p>
                    <p className="text-xs text-muted">
                      {entry.scenario_count} scenario{entry.scenario_count !== 1 ? "s" : ""}
                      {entry.streak_days > 0 && ` · 🔥 ${entry.streak_days}d streak`}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-4 text-xs text-muted">
                  <span title="Forks">🔄 {entry.total_forks}</span>
                  <span title="Likes">❤️ {entry.total_likes}</span>
                  <span title="Views">👁 {(entry.total_views / 1000).toFixed(1)}K</span>
                </div>

                {/* Score + Points */}
                <div className="text-right">
                  <p className="text-sm font-bold text-accent">
                    {entry.engagement_score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted">{entry.points.toLocaleString()} pts</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
