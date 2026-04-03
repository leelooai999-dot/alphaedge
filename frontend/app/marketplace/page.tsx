"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface Listing {
  id: string;
  title: string;
  subtitle: string;
  tagline: string;
  description: string;
  category: string;
  type: string;
  price_cents: number;
  price: number;
  creator_id: string;
  status: string;
  tags: string[];
  avg_rating: number;
  review_count: number;
  sales_count: number;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  persona: "🤖",
  skill: "⚡",
  strategy: "📊",
  dataset: "📦",
  template: "📋",
};

const TYPE_COLORS: Record<string, string> = {
  persona: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  skill: "bg-accent/10 text-accent border-accent/20",
  strategy: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  dataset: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  template: "bg-green-500/10 text-green-400 border-green-500/20",
};

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-3.5 h-3.5 ${star <= Math.round(rating) ? "text-amber-400" : "text-gray-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-xs text-muted ml-1">({count})</span>
    </div>
  );
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [sortBy, setSortBy] = useState("popular");

  useEffect(() => {
    const load = async () => {
      try {
        const [listRes, catRes] = await Promise.all([
          fetch(`${API_BASE}/api/marketplace/listings`),
          fetch(`${API_BASE}/api/marketplace/categories`),
        ]);
        if (listRes.ok) {
          const data = await listRes.json();
          setListings(data.listings || data);
        }
        if (catRes.ok) {
          const cats = await catRes.json();
          setCategories(Array.isArray(cats) ? cats.map((c: any) => typeof c === 'string' ? c : c.category) : []);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const filtered = listings
    .filter((l) => {
      const s = search.toLowerCase();
      if (search && !l.title.toLowerCase().includes(s) &&
          !l.description?.toLowerCase().includes(s) &&
          !(l.tagline || "").toLowerCase().includes(s)) return false;
      if (selectedCategory && l.category !== selectedCategory) return false;
      if (selectedType && l.type !== selectedType) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "popular") return b.sales_count - a.sales_count;
      if (sortBy === "rating") return b.avg_rating - a.avg_rating;
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "price_low") return a.price_cents - b.price_cents;
      if (sortBy === "price_high") return b.price_cents - a.price_cents;
      return 0;
    });

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                🏪 Marketplace
              </h1>
              <p className="text-sm text-muted mt-1">
                AI personas, simulation skills, strategies & more — built by the community
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/marketplace/dashboard"
                className="px-4 py-2 border border-border text-white font-medium rounded-xl hover:border-accent hover:text-accent transition-colors text-sm no-underline whitespace-nowrap"
              >
                Creator Dashboard
              </Link>
              <Link
                href="/marketplace/create"
                className="px-4 py-2 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors text-sm no-underline whitespace-nowrap"
              >
                + Create Listing
              </Link>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search marketplace..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-white focus:outline-none appearance-none cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-white focus:outline-none appearance-none cursor-pointer"
            >
              <option value="">All Types</option>
              <option value="persona">🤖 Personas</option>
              <option value="skill">⚡ Skills</option>
              <option value="strategy">📊 Strategies</option>
              <option value="dataset">📦 Datasets</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-white focus:outline-none appearance-none cursor-pointer"
            >
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="newest">Newest</option>
              <option value="price_low">Price: Low → High</option>
              <option value="price_high">Price: High → Low</option>
            </select>
          </div>

          {/* Results count */}
          <p className="text-xs text-muted mb-4">
            {filtered.length} listing{filtered.length !== 1 ? "s" : ""}
          </p>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse h-56" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🏪</p>
              <p className="text-muted">No listings match your filters.</p>
              <button
                onClick={() => { setSearch(""); setSelectedCategory(""); setSelectedType(""); }}
                className="mt-3 text-sm text-accent hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/marketplace/${listing.id}`}
                  className="group bg-card border border-border rounded-2xl p-5 hover:border-accent/30 transition-all no-underline flex flex-col"
                >
                  {/* Type badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[listing.type] || TYPE_COLORS.skill}`}>
                      {TYPE_ICONS[listing.type] || "⚡"} {listing.type}
                    </span>
                    <span className="text-lg font-bold text-white">
                      ${(listing.price_cents / 100).toFixed(0)}
                    </span>
                  </div>

                  {/* Title & description */}
                  <h3 className="text-base font-semibold text-white mb-1 group-hover:text-accent transition-colors">
                    {listing.title}
                  </h3>
                  <p className="text-xs text-muted line-clamp-2 mb-3 flex-1">
                    {listing.tagline || listing.subtitle || listing.description?.substring(0, 120)}
                  </p>

                  {/* Rating & stats */}
                  <div className="flex items-center justify-between">
                    <StarRating rating={listing.avg_rating} count={listing.review_count} />
                    <span className="text-xs text-muted">
                      {listing.sales_count} sold
                    </span>
                  </div>

                  {/* Creator */}
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted">
                      by <span className="text-white">{listing.creator_id === "system-montecarloo" ? "MonteCarloo" : listing.creator_id}</span>
                    </span>
                    {listing.tags?.length > 0 && (
                      <div className="flex gap-1">
                        {listing.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-[10px] text-muted bg-bg px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
