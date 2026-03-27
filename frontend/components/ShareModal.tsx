"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const SITE_URL = "https://frontend-leeloo-ai.vercel.app";

interface Props {
  scenarioId: string;
  ticker: string;
  title: string;
  medianTarget: number;
  probProfit: number;
  eventCount: number;
  onClose: () => void;
}

export default function ShareModal({
  scenarioId,
  ticker,
  title,
  medianTarget,
  probProfit,
  eventCount,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState<string | null>(null);

  const scenarioUrl = `${SITE_URL}/s/${scenarioId}`;

  const shareText = `My $${ticker} simulation: ${title || "Scenario"}
📊 Median target: $${medianTarget.toFixed(0)}
🎯 Prob profit: ${probProfit}%
📈 ${eventCount} event${eventCount !== 1 ? "s" : ""} modeled

See it live → ${scenarioUrl}

Made with @MonteCarloo_io`;

  const recordShare = async (platform: string) => {
    try {
      await fetch(`${API_BASE}/api/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          platform,
          session_id: typeof window !== "undefined"
            ? localStorage.getItem("alphaedge_session") || ""
            : "",
        }),
      });
    } catch {
      // fire and forget
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setShared("copy");
      recordShare("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      recordShare("copy");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "width=600,height=400");
    setShared("twitter");
    recordShare("twitter");
  };

  const handleReddit = () => {
    const url = `https://reddit.com/submit?url=${encodeURIComponent(scenarioUrl)}&title=${encodeURIComponent(`$${ticker}: ${title || "Event Simulation"} — MonteCarloo`)}`;
    window.open(url, "_blank");
    setShared("reddit");
    recordShare("reddit");
  };

  const handleLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(scenarioUrl)}`;
    window.open(url, "_blank");
    setShared("linkedin");
    recordShare("linkedin");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Share Scenario</h3>
          <button onClick={onClose} className="text-muted hover:text-white p-1">✕</button>
        </div>

        {/* Preview card */}
        <div className="px-5 py-4">
          <div className="bg-bg border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-bold rounded">${ticker}</span>
              <span className="text-xs text-white font-medium truncate">{title || "Event Simulation"}</span>
            </div>
            <div className="flex gap-4 text-xs">
              <div>
                <span className="text-muted">Target: </span>
                <span className="text-white font-medium">${medianTarget.toFixed(0)}</span>
              </div>
              <div>
                <span className="text-muted">Prob profit: </span>
                <span className={probProfit >= 50 ? "text-bullish font-medium" : "text-bearish font-medium"}>
                  {probProfit}%
                </span>
              </div>
              <div>
                <span className="text-muted">Events: </span>
                <span className="text-white">{eventCount}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted mt-2">montecarloo.io</p>
          </div>
        </div>

        {/* Share buttons */}
        <div className="px-5 pb-4 grid grid-cols-2 gap-2">
          <button
            onClick={handleTwitter}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              shared === "twitter"
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "bg-border/50 text-white hover:bg-border"
            }`}
          >
            𝕏 Twitter
          </button>
          <button
            onClick={handleReddit}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              shared === "reddit"
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                : "bg-border/50 text-white hover:bg-border"
            }`}
          >
            🔴 Reddit
          </button>
          <button
            onClick={handleLinkedIn}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              shared === "linkedin"
                ? "bg-blue-600/20 text-blue-300 border border-blue-600/30"
                : "bg-border/50 text-white hover:bg-border"
            }`}
          >
            in LinkedIn
          </button>
          <button
            onClick={handleCopy}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              copied
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-border/50 text-white hover:bg-border"
            }`}
          >
            {copied ? "✓ Copied!" : "📋 Copy Link"}
          </button>
        </div>

        {/* Points hint */}
        <div className="px-5 pb-4">
          <p className="text-[10px] text-muted text-center">
            🎯 Earn 10 points per share · Points unlock Pro features
          </p>
        </div>
      </div>
    </div>
  );
}
