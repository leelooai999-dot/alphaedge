"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface DashboardData {
  total_listings: number;
  total_revenue_cents: number;
  total_sales: number;
  avg_rating: number;
  total_payout_cents: number;
  listings: {
    id: string;
    title: string;
    type: string;
    price_cents: number;
    status: string;
    sales_count: number;
    avg_rating: number;
    review_count: number;
    created_at: string;
  }[];
}

interface ConnectStatus {
  connected: boolean;
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements?: {
    currently_due: string[];
    disabled_reason?: string;
  };
}

interface Purchase {
  id: string;
  listing_id: string;
  listing_title: string;
  title: string;
  price_paid_cents: number;
  price_cents: number;
  status: string;
  purchased_at: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-400",
  draft: "bg-yellow-500/10 text-yellow-400",
  paused: "bg-gray-500/10 text-gray-400",
  rejected: "bg-red-500/10 text-red-400",
};

function DashboardContent() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [tab, setTab] = useState<"selling" | "purchased">("selling");
  const [loading, setLoading] = useState(true);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectMsg, setConnectMsg] = useState("");
  const [error, setError] = useState("");
  const searchParams = useSearchParams();

  const getHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem("alphaedge_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadConnectStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/creator/connect/status`, {
        headers: getHeaders(),
      });
      if (res.ok) setConnectStatus(await res.json());
    } catch {}
  }, [getHeaders]);

  useEffect(() => {
    const connectParam = searchParams.get("connect");
    if (connectParam === "complete") {
      setConnectMsg("✓ Stripe setup complete! Your account is being verified.");
    } else if (connectParam === "refresh") {
      setConnectMsg("Your onboarding link expired. Please complete setup again.");
    }
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("alphaedge_token");
      if (!token) {
        setError("Login required to view dashboard");
        setLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [dashRes, purchRes] = await Promise.all([
          fetch(`${API_BASE}/api/marketplace/creator/dashboard`, { headers }),
          fetch(`${API_BASE}/api/marketplace/purchases`, { headers }),
        ]);
        if (dashRes.ok) setDashboard(await dashRes.json());
        if (purchRes.ok) setPurchases(await purchRes.json());

        // Also load connect status
        await loadConnectStatus();
      } catch {}
      setLoading(false);
    };
    load();
  }, [loadConnectStatus]);

  const handleConnectStripe = async () => {
    setConnectLoading(true);
    setConnectMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/creator/connect`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const err = await res.json();
        setConnectMsg(`Error: ${err.detail || "Failed to start Stripe setup"}`);
      }
    } catch {
      setConnectMsg("Error: Network error. Please try again.");
    }
    setConnectLoading(false);
  };

  const handleRefreshOnboarding = async () => {
    setConnectLoading(true);
    setConnectMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/creator/connect/refresh`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        setConnectMsg("Error refreshing onboarding link.");
      }
    } catch {
      setConnectMsg("Error: Network error.");
    }
    setConnectLoading(false);
  };

  const handleViewStripeDashboard = async () => {
    setConnectLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/creator/connect/dashboard`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, "_blank");
      } else {
        setConnectMsg("Error generating dashboard link.");
      }
    } catch {
      setConnectMsg("Error: Network error.");
    }
    setConnectLoading(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-5xl mx-auto animate-pulse space-y-4">
          <div className="h-8 bg-card rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-card rounded-2xl" />)}
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-muted">{error}</p>
          <button
            onClick={() => window.dispatchEvent(new Event("show-auth-modal"))}
            className="mt-3 text-sm text-accent hover:underline"
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  // Determine Connect UI state
  const isFullyConnected = connectStatus?.connected && connectStatus.charges_enabled && connectStatus.payouts_enabled;
  const isPartiallyConnected = connectStatus?.connected && !isFullyConnected;

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Creator Dashboard</h1>
            <Link
              href="/marketplace/create"
              className="px-4 py-2 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors text-sm no-underline"
            >
              + New Listing
            </Link>
          </div>

          {/* Stats */}
          {dashboard && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-white">
                  ${(dashboard.total_revenue_cents / 100).toFixed(0)}
                </p>
                <p className="text-xs text-muted">70% of sales</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted mb-1">Total Sales</p>
                <p className="text-2xl font-bold text-white">
                  {dashboard.total_sales}
                </p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted mb-1">Listings</p>
                <p className="text-2xl font-bold text-white">
                  {dashboard.total_listings}
                </p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted mb-1">Avg Rating</p>
                <p className="text-2xl font-bold text-white">
                  {dashboard.avg_rating > 0 ? dashboard.avg_rating.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-amber-400">
                  {dashboard.avg_rating > 0 ? "★".repeat(Math.round(dashboard.avg_rating)) : "No reviews yet"}
                </p>
              </div>
            </div>
          )}

          {/* Stripe Connect Section */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>💳</span> Stripe Payouts
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Connect Stripe to receive 70% of each sale directly to your bank account.
                </p>
              </div>

              {/* Status badge */}
              {isFullyConnected && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full">
                  <span>✓</span> Payouts Enabled
                </span>
              )}
              {isPartiallyConnected && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-full">
                  ⚠ Setup Incomplete
                </span>
              )}
              {!connectStatus?.connected && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted bg-card px-3 py-1.5 rounded-full border border-border">
                  Not Connected
                </span>
              )}
            </div>

            {connectMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg mb-3 ${connectMsg.startsWith("✓") ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                {connectMsg}
              </div>
            )}

            {/* Fully connected — show earnings + dashboard button */}
            {isFullyConnected && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-bg/50 rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Total Earned</p>
                  <p className="text-lg font-bold text-white">
                    ${((dashboard?.total_revenue_cents ?? 0) / 100).toFixed(2)}
                  </p>
                </div>
                <div className="bg-bg/50 rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Paid Out</p>
                  <p className="text-lg font-bold text-green-400">
                    ${((dashboard?.total_payout_cents ?? 0) / 100).toFixed(2)}
                  </p>
                </div>
                <div className="bg-bg/50 rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Platform Fee</p>
                  <p className="text-lg font-bold text-muted">30%</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {/* Not connected */}
              {!connectStatus?.connected && (
                <button
                  onClick={handleConnectStripe}
                  disabled={connectLoading}
                  className="px-4 py-2 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors text-sm disabled:opacity-50"
                >
                  {connectLoading ? "Loading…" : "Connect Stripe →"}
                </button>
              )}

              {/* Connected but not complete */}
              {isPartiallyConnected && (
                <>
                  <button
                    onClick={handleRefreshOnboarding}
                    disabled={connectLoading}
                    className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-xl hover:bg-yellow-400 transition-colors text-sm disabled:opacity-50"
                  >
                    {connectLoading ? "Loading…" : "Complete Setup →"}
                  </button>
                  <p className="text-xs text-muted self-center">
                    Your account needs additional information to enable payouts.
                  </p>
                </>
              )}

              {/* Fully connected */}
              {isFullyConnected && (
                <button
                  onClick={handleViewStripeDashboard}
                  disabled={connectLoading}
                  className="px-4 py-2 bg-card border border-border text-white font-medium rounded-xl hover:border-accent hover:text-accent transition-colors text-sm disabled:opacity-50"
                >
                  {connectLoading ? "Loading…" : "View Stripe Dashboard ↗"}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-border">
            <button
              onClick={() => setTab("selling")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "selling"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-white"
              }`}
            >
              My Listings ({dashboard?.total_listings || 0})
            </button>
            <button
              onClick={() => setTab("purchased")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "purchased"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-white"
              }`}
            >
              Purchased ({purchases.length})
            </button>
          </div>

          {/* Selling Tab */}
          {tab === "selling" && (
            <div>
              {!dashboard?.listings?.length ? (
                <div className="text-center py-12">
                  <p className="text-4xl mb-3">🏪</p>
                  <p className="text-muted mb-3">You haven&apos;t created any listings yet.</p>
                  <Link
                    href="/marketplace/create"
                    className="text-sm text-accent hover:underline no-underline"
                  >
                    Create your first listing →
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/marketplace/${listing.id}`}
                            className="text-sm font-semibold text-white hover:text-accent no-underline"
                          >
                            {listing.title}
                          </Link>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[listing.status] || STATUS_COLORS.active}`}>
                            {listing.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span>{listing.type}</span>
                          <span>·</span>
                          <span>${(listing.price_cents / 100).toFixed(0)}</span>
                          <span>·</span>
                          <span>{listing.sales_count} sales</span>
                          {listing.avg_rating > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-amber-400">
                                ★ {listing.avg_rating.toFixed(1)} ({listing.review_count})
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold text-white">
                          ${((listing.price_cents * listing.sales_count * 0.7) / 100).toFixed(0)}
                        </p>
                        <p className="text-xs text-muted">earned</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Purchased Tab */}
          {tab === "purchased" && (
            <div>
              {purchases.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-4xl mb-3">🛒</p>
                  <p className="text-muted mb-3">You haven&apos;t purchased anything yet.</p>
                  <Link
                    href="/marketplace"
                    className="text-sm text-accent hover:underline no-underline"
                  >
                    Browse marketplace →
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchases.map((p) => (
                    <div
                      key={p.id}
                      className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
                    >
                      <div>
                        <Link
                          href={`/marketplace/${p.listing_id}`}
                          className="text-sm font-semibold text-white hover:text-accent no-underline"
                        >
                          {p.title || p.listing_title}
                        </Link>
                        <p className="text-xs text-muted mt-0.5">
                          Purchased {new Date(p.created_at || p.purchased_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-white">
                          ${((p.price_cents || p.price_paid_cents || 0) / 100).toFixed(0)}
                        </p>
                        <span className={`text-xs ${p.status === "completed" ? "text-green-400" : "text-yellow-400"}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-5xl mx-auto animate-pulse space-y-4">
          <div className="h-8 bg-card rounded w-1/4" />
        </div>
      </main>
    }>
      <DashboardContent />
    </Suspense>
  );
}
