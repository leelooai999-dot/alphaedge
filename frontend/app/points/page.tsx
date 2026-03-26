"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface PointsHistory {
  action: string;
  points: number;
  reference_id: string | null;
  created_at: string;
}

interface Reward {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  available: boolean;
}

const REWARDS: Reward[] = [
  { id: "pro_1d", name: "1 Pro Day", description: "Full Pro features for 24 hours", cost: 100, icon: "⚡", available: true },
  { id: "pro_7d", name: "7 Pro Days", description: "Full Pro features for 1 week", cost: 500, icon: "🌟", available: true },
  { id: "extra_slots", name: "+5 Scenario Slots", description: "Permanently save 5 more scenarios", cost: 200, icon: "📦", available: true },
  { id: "name_color", name: "Custom Name Color", description: "Stand out in comments and leaderboard", cost: 300, icon: "🎨", available: true },
  { id: "early_access", name: "Early Access Badge", description: "Get new features before everyone else", cost: 1000, icon: "🚀", available: true },
  { id: "pro_30d", name: "1 Month Pro", description: "Full Pro features for 30 days", cost: 2000, icon: "👑", available: true },
  { id: "founding", name: "Founding Member", description: "Permanent badge — first 1000 users only", cost: 5000, icon: "🏛️", available: true },
];

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  sim_run: { label: "Ran simulation", icon: "📊" },
  scenario_save: { label: "Saved scenario", icon: "💾" },
  comment_received: { label: "Got a comment", icon: "💬" },
  fork_received: { label: "Got a fork", icon: "🔄" },
  like_received: { label: "Got a like", icon: "❤️" },
  comment_posted: { label: "Posted comment", icon: "💬" },
  fork_created: { label: "Forked a scenario", icon: "🔄" },
  share: { label: "Shared externally", icon: "📢" },
  referral: { label: "Referred a user", icon: "👥" },
  referral_upgrade: { label: "Referral upgraded to Pro", icon: "🎉" },
  streak: { label: "Daily streak bonus", icon: "🔥" },
  accuracy: { label: "Accuracy bonus", icon: "🎯" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function PointsPage() {
  const [points, setPoints] = useState(0);
  const [history, setHistory] = useState<PointsHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("alphaedge_user");
      if (stored) {
        const u = JSON.parse(stored);
        setUserId(u.id);
        setPoints(u.points || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/points/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setPoints(data.total || 0);
          setHistory(data.history || []);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [userId]);

  if (!userId) {
    return (
      <>
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 pt-20 pb-12 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">⭐ Points Store</h1>
          <p className="text-sm text-muted mb-6">Sign in to earn and spend points</p>
          <Link href="/" className="text-accent text-sm no-underline">← Back to home</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-20 pb-12">
        {/* Balance card */}
        <div className="bg-gradient-to-br from-accent/10 to-cyan-400/10 border border-accent/20 rounded-2xl p-5 mb-6">
          <p className="text-xs text-muted mb-1">Your Balance</p>
          <p className="text-3xl font-bold text-accent">{points.toLocaleString()} <span className="text-lg text-muted">pts</span></p>
          <p className="text-xs text-muted mt-2">
            Earn points by creating scenarios, getting engagement, and making accurate predictions
          </p>
        </div>

        {/* How to earn */}
        <h2 className="text-sm font-semibold text-white mb-3">How to Earn</h2>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {[
            { action: "Run simulation", pts: "1 pt", cap: "20/day" },
            { action: "Save scenario", pts: "5 pts", cap: "50/day" },
            { action: "Get a comment", pts: "3 pts", cap: "∞" },
            { action: "Get a fork", pts: "5 pts", cap: "∞" },
            { action: "Share externally", pts: "10 pts", cap: "30/day" },
            { action: "Refer a user", pts: "50 pts", cap: "∞" },
            { action: "95%+ accuracy", pts: "100 pts", cap: "∞" },
            { action: "Daily streak", pts: "2 pts", cap: "2/day" },
          ].map((item, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-2">
              <p className="text-xs text-white">{item.action}</p>
              <p className="text-[10px] text-accent font-medium">{item.pts} <span className="text-muted">({item.cap})</span></p>
            </div>
          ))}
        </div>

        {/* Rewards store */}
        <h2 className="text-sm font-semibold text-white mb-3">Redeem Rewards</h2>
        <div className="space-y-2 mb-6">
          {REWARDS.map((reward) => (
            <div
              key={reward.id}
              className={`flex items-center gap-3 p-3 bg-card border rounded-xl transition-colors ${
                points >= reward.cost
                  ? "border-accent/30 hover:border-accent/50 cursor-pointer"
                  : "border-border opacity-60"
              }`}
            >
              <span className="text-xl">{reward.icon}</span>
              <div className="flex-1">
                <p className="text-xs text-white font-medium">{reward.name}</p>
                <p className="text-[10px] text-muted">{reward.description}</p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-bold ${points >= reward.cost ? "text-accent" : "text-muted"}`}>
                  {reward.cost.toLocaleString()} pts
                </p>
                {points >= reward.cost && (
                  <button className="text-[10px] text-accent hover:underline mt-0.5">
                    Redeem
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Recent history */}
        <h2 className="text-sm font-semibold text-white mb-3">Recent Activity</h2>
        {loading ? (
          <div className="text-center py-6">
            <div className="inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted">No points activity yet — start creating scenarios!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {history.slice(0, 20).map((h, i) => {
              const meta = ACTION_LABELS[h.action] || { label: h.action, icon: "⭐" };
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
                  <span className="text-sm">{meta.icon}</span>
                  <span className="text-xs text-white flex-1">{meta.label}</span>
                  <span className={`text-xs font-medium ${h.points > 0 ? "text-green-400" : "text-red-400"}`}>
                    {h.points > 0 ? "+" : ""}{h.points}
                  </span>
                  <span className="text-[10px] text-muted">{timeAgo(h.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
