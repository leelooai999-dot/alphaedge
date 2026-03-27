"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface DashboardData {
  total_listings: number;
  total_revenue_cents: number;
  total_sales: number;
  avg_rating: number;
  listings: {
    id: string;
    title: string;
    item_type: string;
    price_cents: number;
    status: string;
    purchase_count: number;
    avg_rating: number;
    review_count: number;
    created_at: string;
  }[];
}

interface Purchase {
  id: string;
  listing_id: string;
  listing_title: string;
  price_paid_cents: number;
  status: string;
  purchased_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-400",
  draft: "bg-yellow-500/10 text-yellow-400",
  paused: "bg-gray-500/10 text-gray-400",
  rejected: "bg-red-500/10 text-red-400",
};

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [tab, setTab] = useState<"selling" | "purchased">("selling");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

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
                          <span>{listing.item_type}</span>
                          <span>·</span>
                          <span>${(listing.price_cents / 100).toFixed(0)}</span>
                          <span>·</span>
                          <span>{listing.purchase_count} sales</span>
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
                          ${((listing.price_cents * listing.purchase_count * 0.7) / 100).toFixed(0)}
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
                          {p.listing_title}
                        </Link>
                        <p className="text-xs text-muted mt-0.5">
                          Purchased {new Date(p.purchased_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-white">
                          ${(p.price_paid_cents / 100).toFixed(0)}
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
