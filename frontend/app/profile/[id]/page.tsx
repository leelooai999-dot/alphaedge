"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface UserProfile {
  id: string;
  display_name: string;
  email?: string;
  points: number;
  streak_days: number;
  tier: string;
  scenario_count: number;
  total_views: number;
  total_likes: number;
  total_forks: number;
  engagement_score: number;
  joined_at: string;
  followers: number;
  following: number;
}

interface UserScenario {
  id: string;
  ticker: string;
  title: string;
  views: number;
  forks: number;
  likes: number;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ProfilePage() {
  const params = useParams();
  const userId = params.id as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [scenarios, setScenarios] = useState<UserScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("alphaedge_user");
      if (stored) {
        const u = JSON.parse(stored);
        setCurrentUserId(u.id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Fetch profile stats from leaderboard/engagement data
        const [profileRes, scenariosRes] = await Promise.all([
          fetch(`${API_BASE}/api/users/${userId}/profile`),
          fetch(`${API_BASE}/api/users/${userId}/scenarios`),
        ]);

        if (profileRes.ok) {
          setProfile(await profileRes.json());
        }
        if (scenariosRes.ok) {
          const data = await scenariosRes.json();
          setScenarios(Array.isArray(data) ? data : []);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [userId]);

  const handleFollow = async () => {
    if (!currentUserId) return;
    try {
      if (isFollowing) {
        await fetch(`${API_BASE}/api/follow/${userId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ follower_id: currentUserId }),
        });
        setIsFollowing(false);
      } else {
        await fetch(`${API_BASE}/api/follow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ follower_id: currentUserId, following_id: userId }),
        });
        setIsFollowing(true);
      }
    } catch {}
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 pt-20 pb-12">
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-20 pb-12">
        {/* Profile header */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center text-bg text-xl font-bold flex-shrink-0">
              {(profile?.display_name || "A")[0].toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white truncate">
                  {profile?.display_name || "Unknown User"}
                </h1>
                {profile?.tier === "pro" && (
                  <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded-full">PRO</span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                Joined {profile?.joined_at ? timeAgo(profile.joined_at) : "recently"}
                {profile?.streak_days ? ` · 🔥 ${profile.streak_days}d streak` : ""}
              </p>

              {/* Stats row */}
              <div className="flex gap-4 mt-3 text-xs">
                <div>
                  <span className="text-white font-semibold">{profile?.scenario_count || 0}</span>
                  <span className="text-muted ml-1">scenarios</span>
                </div>
                <div>
                  <span className="text-white font-semibold">{profile?.followers || 0}</span>
                  <span className="text-muted ml-1">followers</span>
                </div>
                <div>
                  <span className="text-white font-semibold">{profile?.following || 0}</span>
                  <span className="text-muted ml-1">following</span>
                </div>
              </div>

              {/* Points + engagement */}
              <div className="flex gap-4 mt-2 text-xs">
                <span className="text-accent font-medium">
                  ⭐ {(profile?.points || 0).toLocaleString()} pts
                </span>
                <span className="text-muted">
                  🔥 {Math.round(profile?.engagement_score || 0)} engagement
                </span>
                <span className="text-muted">
                  👁 {(profile?.total_views || 0).toLocaleString()} total views
                </span>
              </div>
            </div>

            {/* Follow button */}
            {currentUserId && currentUserId !== userId && (
              <button
                onClick={handleFollow}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  isFollowing
                    ? "bg-border text-muted hover:text-red-400 hover:bg-red-400/10"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
        </div>

        {/* Scenarios */}
        <h2 className="text-sm font-semibold text-white mb-3">Scenarios</h2>
        {scenarios.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted">No scenarios yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {scenarios.map((s) => (
              <Link
                key={s.id}
                href={`/s/${s.id}`}
                className="block bg-card border border-border rounded-xl p-3 hover:border-accent/30 transition-colors no-underline"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-bold rounded">
                      ${s.ticker}
                    </span>
                    <span className="text-sm text-white truncate">{s.title}</span>
                  </div>
                  <span className="text-[10px] text-muted">{timeAgo(s.created_at)}</span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted">
                  <span>👁 {s.views}</span>
                  <span>🔄 {s.forks}</span>
                  <span>❤️ {s.likes}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
