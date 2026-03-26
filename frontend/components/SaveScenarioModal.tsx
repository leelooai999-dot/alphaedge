"use client";

import { useState, useEffect } from "react";
import { ActiveEvent } from "@/lib/events";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  events: ActiveEvent[];
  resultSummary: {
    median30d: number;
    probProfit: number;
    eventImpact: number;
    currentPrice: number;
  } | null;
}

export default function SaveScenarioModal({
  isOpen,
  onClose,
  ticker,
  events,
  resultSummary,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate title
  useEffect(() => {
    if (!title) {
      const eventNames = events.map((e) => e.name).slice(0, 2);
      setTitle(`${ticker} — ${eventNames.join(" + ")}`);
    }
  }, [ticker, events]);

  // Load saved author name
  useEffect(() => {
    const saved = localStorage.getItem("alphaedge_author");
    if (saved) setAuthorName(saved);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Save author name for next time
      if (authorName) localStorage.setItem("alphaedge_author", authorName);

      const tags = Array.from(new Set(events.map((e) => e.category))).join(",");

      const res = await fetch(`${API_BASE}/api/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          title: title || `${ticker} Scenario`,
          description,
          events: events.map((e) => ({
            id: e.id,
            name: e.name,
            probability: e.probability,
            duration: e.duration,
            impact: e.impact,
          })),
          result_summary: resultSummary,
          author_name: authorName || "Anonymous",
          is_public: isPublic,
          tags,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setSavedUrl(`${window.location.origin}/s/${data.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to save scenario");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = () => {
    if (savedUrl && navigator.clipboard) {
      navigator.clipboard.writeText(savedUrl);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        {savedUrl ? (
          // Success state
          <div className="text-center space-y-4">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-bold text-white">Scenario Published!</h2>
            <p className="text-sm text-muted">Your scenario is live and visible to the community.</p>

            <div className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2">
              <input
                type="text"
                readOnly
                value={savedUrl}
                className="flex-1 bg-transparent text-sm text-white font-mono outline-none"
              />
              <button
                onClick={handleCopyUrl}
                className="px-3 py-1 bg-accent text-white text-xs rounded-md hover:bg-accent/80"
              >
                Copy
              </button>
            </div>

            <div className="flex gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my ${ticker} scenario on AlphaEdge 📊`)}&url=${encodeURIComponent(savedUrl)}`}
                target="_blank"
                className="flex-1 py-2 bg-bg border border-border rounded-lg text-sm text-white hover:bg-border/50 transition-colors text-center"
              >
                Share on X
              </a>
              <a
                href={`https://reddit.com/submit?url=${encodeURIComponent(savedUrl)}&title=${encodeURIComponent(title)}`}
                target="_blank"
                className="flex-1 py-2 bg-bg border border-border rounded-lg text-sm text-white hover:bg-border/50 transition-colors text-center"
              >
                Share on Reddit
              </a>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 text-sm text-muted hover:text-white transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          // Form state
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Save Scenario</h2>
              <button onClick={onClose} className="p-1 text-muted hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1 block">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                  placeholder="My scenario..."
                  maxLength={200}
                />
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent/50 resize-none"
                  rows={2}
                  placeholder="What's your thesis?"
                  maxLength={500}
                />
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">Your name</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
                  placeholder="Anonymous"
                  maxLength={50}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-muted">Publish to community</span>
              </label>

              {error && (
                <p className="text-xs text-bearish">{error}</p>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & Publish"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
