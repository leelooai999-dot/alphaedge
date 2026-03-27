"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface TierInfo {
  name: string;
  price: number;
  limits: {
    max_events_per_scenario: number;
    max_pine_overlays: number;
    can_export_pine: boolean;
    api_access: boolean;
  };
}

const FEATURES = [
  { name: "Monte Carlo Simulations", free: "Unlimited", pro: "Unlimited", premium: "Unlimited" },
  { name: "Scenarios", free: "Unlimited", pro: "Unlimited", premium: "Unlimited" },
  { name: "Events per Scenario", free: "2", pro: "Unlimited", premium: "Unlimited", highlight: true },
  { name: "Pine Script Overlays", free: "1", pro: "Unlimited", premium: "Unlimited", highlight: true },
  { name: "Pine Script Export", free: "✓", pro: "✓", premium: "✓" },
  { name: "Save & Share Scenarios", free: "✓", pro: "✓", premium: "✓" },
  { name: "Social Features", free: "✓", pro: "✓", premium: "✓" },
  { name: "Leaderboard & Badges", free: "✓", pro: "✓", premium: "✓" },
  { name: "Temporal Event Engine", free: "✓", pro: "✓", premium: "✓" },
  { name: "Polymarket Live Odds", free: "✓", pro: "✓", premium: "✓" },
  { name: "For You Feed", free: "✓", pro: "✓", premium: "✓" },
  { name: "API Access", free: "—", pro: "—", premium: "✓" },
  { name: "Priority Support", free: "—", pro: "—", premium: "✓" },
];

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg pt-14"><Navbar /></div>}>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");
  const upgradedTier = searchParams.get("tier");

  const [userTier, setUserTier] = useState<string>("free");
  const [loading, setLoading] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [pendingUpgrade, setPendingUpgrade] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("alphaedge_token");
    setAuthToken(token);

    if (token) {
      fetch(`${API_BASE}/api/billing/tier`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => setUserTier(d.tier || "free"))
        .catch(() => {});
    }

    // Listen for auth completion to update token and auto-trigger pending upgrade
    const onAuthComplete = () => {
      const newToken = localStorage.getItem("alphaedge_token");
      if (newToken) {
        setAuthToken(newToken);
        // Auto-trigger pending upgrade checkout
        setPendingUpgrade((pending) => {
          if (pending) {
            // Small delay to let state settle
            setTimeout(() => {
              const btn = document.querySelector(`[data-upgrade-tier="${pending}"]`) as HTMLButtonElement;
              if (btn) btn.click();
            }, 500);
          }
          return null;
        });
      }
    };
    window.addEventListener("auth-complete", onAuthComplete);
    // Also listen for storage changes (in case auth modal updates localStorage)
    window.addEventListener("storage", onAuthComplete);
    return () => {
      window.removeEventListener("auth-complete", onAuthComplete);
      window.removeEventListener("storage", onAuthComplete);
    };
  }, []);

  const handleUpgrade = async (tier: string) => {
    // Always read fresh from localStorage — React state may be stale after auth modal
    const token = localStorage.getItem("alphaedge_token");
    
    if (!token) {
      // Remember which tier user wanted, then show auth modal
      setPendingUpgrade(tier);
      window.dispatchEvent(new CustomEvent("show-auth-modal"));
      return;
    }

    setLoading(tier);
    try {
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "Failed to create checkout session");
        return;
      }

      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (e) {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleManage = async () => {
    const token = localStorage.getItem("alphaedge_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/billing/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.portal_url) {
        window.location.href = data.portal_url;
      }
    } catch {
      alert("Failed to open billing portal.");
    }
  };

  return (
    <main className="min-h-screen pt-14 bg-bg">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Success/cancel banners */}
        {success && (
          <div className="mb-8 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
            <div className="text-green-400 text-lg font-bold mb-1">🎉 Welcome to MonteCarloo {upgradedTier?.charAt(0).toUpperCase()}{upgradedTier?.slice(1)}!</div>
            <div className="text-green-300/80 text-sm">Your account has been upgraded. Enjoy unlimited events and Pine overlays.</div>
          </div>
        )}
        {canceled && (
          <div className="mb-8 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <div className="text-yellow-400 text-sm">Checkout was canceled. You can upgrade anytime.</div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-muted text-base sm:text-lg max-w-2xl mx-auto">
            MonteCarloo is free forever. Upgrade for unlimited events per scenario and unlimited Pine Script overlays.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Free */}
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col">
            <div className="text-muted text-sm font-medium mb-1">Free</div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-muted text-sm">/forever</span>
            </div>
            <ul className="space-y-2.5 mb-6 flex-1">
              <Feature text="Unlimited simulations" />
              <Feature text="Unlimited scenarios" />
              <Feature text="2 events per scenario" />
              <Feature text="1 Pine Script overlay" />
              <Feature text="Save & share scenarios" />
              <Feature text="Social features & leaderboard" />
              <Feature text="Polymarket live odds" />
            </ul>
            {userTier === "free" ? (
              <button
                disabled
                className="w-full py-2.5 px-4 bg-card border border-border text-muted rounded-xl font-medium"
              >
                Current Plan
              </button>
            ) : (
              <button
                onClick={handleManage}
                className="w-full py-2.5 px-4 bg-card border border-border text-white rounded-xl font-medium hover:bg-border/50 transition-colors"
              >
                Manage Subscription
              </button>
            )}
          </div>

          {/* Pro — highlighted */}
          <div className="bg-card border-2 border-accent rounded-2xl p-6 flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-xs font-bold px-3 py-1 rounded-full">
              MOST POPULAR
            </div>
            <div className="text-accent text-sm font-medium mb-1">Pro</div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold text-white">$49</span>
              <span className="text-muted text-sm">/month</span>
            </div>
            <ul className="space-y-2.5 mb-6 flex-1">
              <Feature text="Everything in Free" />
              <Feature text="Unlimited events per scenario" highlight />
              <Feature text="Unlimited Pine Script overlays" highlight />
              <Feature text="Multi-timeframe analysis" />
              <Feature text="Advanced event templates" />
              <Feature text="Priority simulation queue" />
            </ul>
            {userTier === "pro" ? (
              <button
                onClick={handleManage}
                className="w-full py-2.5 px-4 bg-accent/20 text-accent border border-accent/30 rounded-xl font-medium hover:bg-accent/30 transition-colors"
              >
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={() => handleUpgrade("pro")}
                disabled={loading === "pro"}
                data-upgrade-tier="pro"
                className="w-full py-2.5 px-4 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {loading === "pro" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Redirecting...
                  </span>
                ) : userTier === "premium" ? "Downgrade to Pro" : "Upgrade to Pro"}
              </button>
            )}
          </div>

          {/* Premium */}
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col">
            <div className="text-purple-400 text-sm font-medium mb-1">Premium</div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold text-white">$149</span>
              <span className="text-muted text-sm">/month</span>
            </div>
            <ul className="space-y-2.5 mb-6 flex-1">
              <Feature text="Everything in Pro" />
              <Feature text="API access" highlight />
              <Feature text="Priority support" highlight />
              <Feature text="Custom event templates" />
              <Feature text="White-label exports" />
              <Feature text="Early access to features" />
            </ul>
            {userTier === "premium" ? (
              <button
                onClick={handleManage}
                className="w-full py-2.5 px-4 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl font-medium hover:bg-purple-500/30 transition-colors"
              >
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={() => handleUpgrade("premium")}
                disabled={loading === "premium"}
                data-upgrade-tier="premium"
                className="w-full py-2.5 px-4 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-500/90 transition-colors disabled:opacity-50"
              >
                {loading === "premium" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Redirecting...
                  </span>
                ) : "Upgrade to Premium"}
              </button>
            )}
          </div>
        </div>

        {/* Feature comparison table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-bold text-white">Feature Comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-sm text-muted font-medium px-4 py-3 w-[40%]">Feature</th>
                  <th className="text-center text-sm text-muted font-medium px-4 py-3">Free</th>
                  <th className="text-center text-sm text-accent font-medium px-4 py-3">Pro</th>
                  <th className="text-center text-sm text-purple-400 font-medium px-4 py-3">Premium</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f, i) => (
                  <tr key={i} className={`border-b border-border/50 ${f.highlight ? "bg-accent/5" : ""}`}>
                    <td className={`text-sm px-4 py-2.5 ${f.highlight ? "text-white font-medium" : "text-muted"}`}>
                      {f.name}
                    </td>
                    <td className="text-center text-sm text-muted px-4 py-2.5">{f.free}</td>
                    <td className={`text-center text-sm px-4 py-2.5 ${f.highlight ? "text-accent font-bold" : "text-white"}`}>
                      {f.pro}
                    </td>
                    <td className={`text-center text-sm px-4 py-2.5 ${f.highlight ? "text-purple-400 font-bold" : "text-white"}`}>
                      {f.premium}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-6">FAQ</h2>
          <div className="space-y-4">
            <FAQ
              q="Can I use MonteCarloo for free?"
              a="Yes! MonteCarloo is free forever with unlimited simulations and scenarios. Free users get 2 events per scenario and 1 Pine Script overlay."
            />
            <FAQ
              q="What do I get with Pro?"
              a="Pro unlocks unlimited events per scenario (add as many geopolitical, macro, and sector events as you want) and unlimited Pine Script overlays for multi-indicator analysis."
            />
            <FAQ
              q="Can I cancel anytime?"
              a="Yes, cancel anytime from the billing portal. You'll keep your Pro features until the end of your billing period."
            />
            <FAQ
              q="Do you offer refunds?"
              a="Yes — if you're not satisfied within the first 7 days, we'll refund your payment in full."
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function Feature({ text, highlight = false }: { text: string; highlight?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${highlight ? "text-accent" : "text-green-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      <span className={highlight ? "text-white font-medium" : "text-muted"}>{text}</span>
    </li>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center justify-between"
      >
        <span className="text-white font-medium text-sm">{q}</span>
        <svg
          className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-3 text-muted text-sm leading-relaxed">{a}</div>
      )}
    </div>
  );
}
