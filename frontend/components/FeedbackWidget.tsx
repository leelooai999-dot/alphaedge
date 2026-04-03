"use client";

import { useState } from "react";
import { trackEvent } from "./PostHogProvider";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"bug" | "idea" | "other">("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    try {
      const token = localStorage.getItem("alphaedge_token");
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type,
          message: message.trim(),
          email: email.trim() || undefined,
          page: window.location.pathname,
          userAgent: navigator.userAgent,
          screenWidth: window.innerWidth,
        }),
      });

      if (res.ok) {
        trackEvent("feedback_submitted", { type, page: window.location.pathname });
        setSent(true);
        setTimeout(() => {
          setOpen(false);
          setSent(false);
          setMessage("");
          setEmail("");
        }, 2000);
      }
    } catch {}
    setSending(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 w-11 h-11 bg-accent text-bg rounded-full shadow-lg hover:bg-accentDim transition-all flex items-center justify-center text-lg"
        title="Send feedback"
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Feedback panel */}
      {open && (
        <div className="fixed bottom-16 right-4 z-50 w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {sent ? (
            <div className="p-6 text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-sm text-white font-medium">Thanks for the feedback!</p>
              <p className="text-xs text-muted mt-1">We read every message.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-white">Send Feedback</h3>
                <p className="text-xs text-muted mt-0.5">Bug report, feature idea, or anything else</p>
              </div>

              <div className="p-4 space-y-3">
                {/* Type selector */}
                <div className="flex gap-2">
                  {([
                    { value: "bug", label: "🐛 Bug", },
                    { value: "idea", label: "💡 Idea", },
                    { value: "other", label: "💬 Other", },
                  ] as const).map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        type === t.value
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-bg text-muted hover:text-white"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    type === "bug"
                      ? "What happened? What did you expect?"
                      : type === "idea"
                      ? "What would make MonteCarloo better?"
                      : "Tell us anything..."
                  }
                  rows={3}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-sm text-white placeholder:text-muted/60 focus:outline-none focus:border-accent/50 resize-none"
                  autoFocus
                />

                {/* Optional email */}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optional — for follow-up)"
                  className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-xs text-white placeholder:text-muted/60 focus:outline-none focus:border-accent/50"
                />

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!message.trim() || sending}
                  className="w-full py-2 bg-accent text-bg font-semibold rounded-xl text-sm hover:bg-accentDim transition-colors disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send Feedback"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
