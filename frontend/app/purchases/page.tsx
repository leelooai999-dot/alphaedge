"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const TYPE_ICONS: Record<string, string> = {
  persona: "🤖",
  skill: "⚡",
  strategy: "📊",
  dataset: "📦",
  template: "📋",
};

interface Purchase {
  id: string;
  listing_id: string;
  title: string;
  type: string;
  avatar_url: string;
  price_cents: number;
  created_at: string;
}

export default function PurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("alphaedge_token");
    const stored = localStorage.getItem("alphaedge_user");

    if (!token) {
      // Redirect to home if not logged in
      window.dispatchEvent(new Event("show-auth-modal"));
      router.push("/");
      return;
    }

    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {}
    }

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/marketplace/purchases`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPurchases(Array.isArray(data) ? data : []);
        } else if (res.status === 401) {
          window.dispatchEvent(new Event("show-auth-modal"));
          router.push("/");
          return;
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [router]);

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 pt-20 pb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">My Purchases</h1>
            <p className="text-xs text-muted mt-1">
              Products you&apos;ve acquired from the marketplace
            </p>
          </div>
          <Link
            href="/marketplace"
            className="text-sm text-accent hover:underline no-underline"
          >
            Browse Marketplace →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-border" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-border rounded w-1/3" />
                    <div className="h-3 bg-border rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <p className="text-4xl mb-3">🛍️</p>
            <p className="text-white font-medium mb-1">No purchases yet</p>
            <p className="text-sm text-muted mb-4">
              Browse the marketplace to find AI personas, skills, and strategies
            </p>
            <Link
              href="/marketplace"
              className="inline-block px-5 py-2.5 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors no-underline"
            >
              Explore Marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {purchases.map((p) => (
              <Link
                key={p.id}
                href={`/marketplace/${p.listing_id}`}
                className="block bg-card border border-border rounded-xl p-4 hover:border-accent/30 transition-colors no-underline group"
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-lg flex-shrink-0">
                    {TYPE_ICONS[p.type] || "⚡"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate group-hover:text-accent transition-colors">
                        {p.title}
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-full flex-shrink-0">
                        {p.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      <span>
                        {p.price_cents === 0 ? "Free" : `$${(p.price_cents / 100).toFixed(2)}`}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(p.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Download arrow */}
                  <div className="text-muted group-hover:text-accent transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Account section */}
        {user && (
          <div className="mt-8 bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Account</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Email</span>
                <span className="text-white">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Name</span>
                <span className="text-white">{user.display_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tier</span>
                <span className="text-white capitalize">{user.tier || "free"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Points</span>
                <span className="text-accent">{user.points || 0} pts</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
