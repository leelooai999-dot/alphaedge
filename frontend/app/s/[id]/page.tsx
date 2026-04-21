"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import CommentThread from "@/components/CommentThread";
import { EVENT_TEMPLATES } from "@/lib/events";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const SHARE_DISCLAIMER = "For educational purpose only. Non-financial advice. Past experience does not guarantee future gain.";

export default function ScenarioPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [scenario, setScenario] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/scenarios/${id}`);
        if (!res.ok) throw new Error("Scenario not found");
        setScenario(await res.json());
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleOpenInSimulator = () => {
    if (!scenario) return;
    // Build URL with event params
    const eventParams = scenario.events
      .map((e: any) => `${e.id}:${e.probability}:${e.duration}:${e.impact}`)
      .join(",");
    router.push(`/sim/${scenario.ticker}?events=${eventParams}`);
  };

  const handleFork = async () => {
    const authorName = localStorage.getItem("alphaedge_author") || "Anonymous";
    try {
      const forkToken = localStorage.getItem("alphaedge_token");
      const forkHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (forkToken) forkHeaders["Authorization"] = `Bearer ${forkToken}`;
      const res = await fetch(`${API_BASE}/api/scenarios/${id}/fork`, {
        method: "POST",
        headers: forkHeaders,
        body: JSON.stringify({ author_name: authorName }),
      });
      if (res.ok) {
        const forked = await res.json();
        router.push(`/s/${forked.id}`);
      }
    } catch (e) {
      console.error("Fork failed:", e);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shareText = `${url}\n\n${SHARE_DISCLAIMER}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${scenario?.title || "MonteCarloo scenario"}`,
          text: SHARE_DISCLAIMER,
          url,
        });
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
      }
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen pt-14">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-1/3 bg-border rounded" />
            <div className="h-4 w-2/3 bg-border rounded" />
            <div className="h-64 bg-border rounded-xl" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !scenario) {
    return (
      <main className="min-h-screen pt-14">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="text-4xl mb-3">😕</div>
          <h1 className="text-xl font-bold text-white mb-2">Scenario Not Found</h1>
          <p className="text-muted text-sm mb-6">{error || "This scenario doesn't exist or has been removed."}</p>
          <button
            onClick={() => router.push("/explore")}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 text-sm"
          >
            Explore Scenarios
          </button>
        </div>
      </main>
    );
  }

  const rs = scenario.result_summary;
  const isBullish = rs && rs.eventImpact >= 0;

  return (
    <main className="min-h-screen pt-14">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono font-bold text-accent text-xl">{scenario.ticker}</span>
            <span className="text-xs text-muted px-2 py-0.5 bg-card rounded-md border border-border">
              by {scenario.author_name}
            </span>
            {scenario.forked_from && (
              <span className="text-xs text-neutral">
                🔀 Forked
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{scenario.title}</h1>
          {scenario.description && (
            <p className="text-sm text-muted leading-relaxed">{scenario.description}</p>
          )}
        </div>

        {/* Stats */}
        {rs && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="text-xs text-muted mb-1">Target Price</div>
              <div className={`font-mono font-bold text-lg ${isBullish ? "text-bullish" : "text-bearish"}`}>
                ${rs.median30d?.toFixed(0)}
              </div>
              <div className="text-xs text-neutral">from ${rs.currentPrice?.toFixed(0)}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="text-xs text-muted mb-1">Prob. Profit</div>
              <div className={`font-mono font-bold text-lg ${rs.probProfit >= 50 ? "text-bullish" : "text-bearish"}`}>
                {rs.probProfit}%
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="text-xs text-muted mb-1">Event Impact</div>
              <div className={`font-mono font-bold text-lg ${isBullish ? "text-bullish" : "text-bearish"}`}>
                {rs.eventImpact >= 0 ? "+" : ""}${rs.eventImpact?.toFixed(0)}
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="text-xs text-muted mb-1">Events</div>
              <div className="font-mono font-bold text-lg text-white">
                {scenario.events.length}
              </div>
            </div>
          </div>
        )}

        {/* Events */}
        <div className="bg-card rounded-xl border border-border p-4 mb-6">
          <h2 className="text-sm font-semibold text-white mb-3">Events Applied</h2>
          <div className="space-y-3">
            {scenario.events.map((e: any) => {
              const tmpl = EVENT_TEMPLATES.find((t) => t.id === e.id);
              const impact = e.impact || 0;
              return (
                <div key={e.id} className="flex items-center justify-between bg-bg/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span>{tmpl?.emoji || "📊"}</span>
                    <span className="text-sm text-white">{tmpl?.name || e.id}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-accent font-mono">{e.probability}%</span>
                    <span className="text-muted">{e.duration}d</span>
                    <span className={`font-mono font-medium ${impact >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {impact >= 0 ? "+" : ""}{impact}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleOpenInSimulator}
            className="px-4 py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent/80 transition-colors text-sm"
          >
            🎮 Open in Simulator
          </button>
          <button
            onClick={handleFork}
            className="px-4 py-2.5 bg-accent/10 text-accent font-medium rounded-lg hover:bg-accent/20 transition-colors text-sm"
          >
            🔀 Fork This Scenario
          </button>
          <button
            onClick={handleShare}
            className="px-4 py-2.5 border border-border text-muted rounded-lg hover:text-white hover:border-white/20 transition-colors text-sm"
          >
            📋 Copy Link
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${scenario.title} — ${rs?.probProfit || 50}% profit probability 📊\n\n${SHARE_DISCLAIMER}`)}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
            target="_blank"
            className="px-4 py-2.5 border border-border text-muted rounded-lg hover:text-white hover:border-white/20 transition-colors text-sm"
          >
            Share on X
          </a>
        </div>

        {/* Engagement */}
        <div className="flex items-center gap-6 mt-6 text-sm text-neutral">
          <span>{scenario.views.toLocaleString()} views</span>
          <span>{scenario.forks} forks</span>
          <span>❤️ {scenario.likes} likes</span>
          <span className="text-xs">Published {new Date(scenario.created_at).toLocaleDateString()}</span>
        </div>

        {/* Comments */}
        <div className="mt-6">
          <CommentThread scenarioId={id} />
        </div>
      </div>
    </main>
  );
}
