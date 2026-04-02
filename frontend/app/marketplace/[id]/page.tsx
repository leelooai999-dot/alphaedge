"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  capabilities: string[];
  download_url: string;
  file_size_bytes: number;
  purchased?: boolean;
  created_at: string;
}

interface Review {
  id: string;
  user_id: string;
  author_name: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  persona: "🤖",
  skill: "⚡",
  strategy: "📊",
  dataset: "📦",
  template: "📋",
};

function StarRating({ rating, size = "sm" }: { rating: number; size?: string }) {
  const sz = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`${sz} ${star <= Math.round(rating) ? "text-amber-400" : "text-gray-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [listing, setListing] = useState<Listing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchased, setPurchased] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const token = localStorage.getItem("alphaedge_token");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const [listRes, revRes, filesRes] = await Promise.all([
          fetch(`${API_BASE}/api/marketplace/listings/${id}`, { headers }),
          fetch(`${API_BASE}/api/marketplace/listings/${id}/reviews`),
          fetch(`${API_BASE}/api/marketplace/listings/${id}/files`),
        ]);
        if (listRes.ok) {
          const data = await listRes.json();
          setListing(data);
          if (data.purchased) setPurchased(true);
          if (data.reviews) setReviews(data.reviews);
        }
        if (revRes.ok) {
          const revData = await revRes.json();
          setReviews(revData.reviews || revData);
        }
        if (filesRes.ok) {
          const filesData = await filesRes.json();
          setFiles(Array.isArray(filesData) ? filesData : (filesData.files || []));
        }

        // Also check if already purchased via purchases endpoint
        if (token) {
          try {
            const purchasesRes = await fetch(`${API_BASE}/api/marketplace/purchases`, { headers });
            if (purchasesRes.ok) {
              const purchases = await purchasesRes.json();
              if (Array.isArray(purchases) && purchases.some((p: any) => p.listing_id === id)) {
                setPurchased(true);
              }
            }
          } catch {}
        }

        // Check URL params for ?purchased=true (redirect from Stripe)
        // Also verify with backend to complete the purchase
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          if (params.get("purchased") === "true" && token) {
            // Call verify endpoint to complete the purchase via Stripe check
            fetch(`${API_BASE}/api/marketplace/purchase/${id}/verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            })
              .then((r) => r.json())
              .then((data) => {
                if (data.purchased || data.status === "completed" || data.status === "already_completed") {
                  setPurchased(true);
                }
              })
              .catch(() => {
                // Fallback: trust the URL param
                setPurchased(true);
              });
          }
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  const handlePurchase = async () => {
    const token = localStorage.getItem("alphaedge_token");
    if (!token) {
      window.dispatchEvent(new Event("show-auth-modal"));
      return;
    }
    setPurchasing(true);
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/purchase/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
        } else {
          // Free item — purchased immediately
          setPurchased(true);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Purchase failed");
      }
    } catch {
      alert("Network error");
    }
    setPurchasing(false);
  };

  const handleDownload = async (fileId: string, filename: string) => {
    const token = localStorage.getItem("alphaedge_token");
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/marketplace/files/${fileId}/download`, { headers });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || err.error || "Download failed");
      }
    } catch {
      alert("Download failed — network error");
    }
  };

  const handleSubmitReview = async () => {
    const token = localStorage.getItem("alphaedge_token");
    if (!token) {
      window.dispatchEvent(new Event("show-auth-modal"));
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/listings/${id}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: reviewRating,
          title: reviewTitle,
          body: reviewBody,
        }),
      });
      if (res.ok) {
        const newReview = await res.json();
        setReviews((prev) => [newReview, ...prev]);
        setShowReviewForm(false);
        setReviewTitle("");
        setReviewBody("");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Review failed");
      }
    } catch {
      alert("Network error");
    }
    setSubmittingReview(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-card rounded w-1/3" />
            <div className="h-4 bg-card rounded w-2/3" />
            <div className="h-64 bg-card rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 text-center">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-muted">Listing not found.</p>
          <Link href="/marketplace" className="text-accent text-sm mt-3 inline-block">
            ← Back to Marketplace
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-muted mb-6">
            <Link href="/marketplace" className="hover:text-white no-underline text-muted">
              Marketplace
            </Link>
            <span>/</span>
            <span className="text-white">{listing.title}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">
                    {TYPE_ICONS[listing.type] || "⚡"}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                        {listing.type}
                      </span>
                      <span className="text-xs text-muted">{listing.category}</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
                      {listing.title}
                    </h1>
                    <p className="text-sm text-muted">{listing.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <StarRating rating={listing.avg_rating} size="lg" />
                    <span className="text-muted ml-1">
                      {(listing.avg_rating || 0).toFixed(1)} ({listing.review_count || 0} reviews)
                    </span>
                  </div>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{listing.sales_count} sold</span>
                </div>

                {listing.tags?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {listing.tags.map((tag) => (
                      <span key={tag} className="text-xs text-muted bg-bg px-2 py-1 rounded-lg border border-border">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-3">About</h2>
                <div className="text-sm text-muted leading-relaxed whitespace-pre-wrap">
                  {listing.description}
                </div>
              </div>

              {/* Reviews */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">
                    Reviews ({reviews.length})
                  </h2>
                  <button
                    onClick={() => setShowReviewForm(!showReviewForm)}
                    className="text-sm text-accent hover:underline"
                  >
                    {showReviewForm ? "Cancel" : "Write a review"}
                  </button>
                </div>

                {showReviewForm && (
                  <div className="mb-6 p-4 bg-bg rounded-xl border border-border space-y-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">Rating</label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setReviewRating(star)}
                            className="focus:outline-none"
                          >
                            <svg
                              className={`w-6 h-6 ${star <= reviewRating ? "text-amber-400" : "text-gray-600"} hover:text-amber-300`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Review title"
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                    />
                    <textarea
                      placeholder="Write your review..."
                      rows={3}
                      value={reviewBody}
                      onChange={(e) => setReviewBody(e.target.value)}
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
                    />
                    <button
                      onClick={handleSubmitReview}
                      disabled={submittingReview || !reviewTitle}
                      className="px-4 py-2 bg-accent text-bg font-semibold rounded-lg text-sm hover:bg-accentDim disabled:opacity-50"
                    >
                      {submittingReview ? "Submitting..." : "Submit Review"}
                    </button>
                  </div>
                )}

                {reviews.length === 0 ? (
                  <p className="text-sm text-muted text-center py-6">
                    No reviews yet. Be the first!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="pb-4 border-b border-border last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <StarRating rating={review.rating} />
                            <span className="text-sm font-medium text-white">{review.title}</span>
                          </div>
                          <span className="text-xs text-muted">
                            {new Date(review.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1">{review.body}</p>
                        <p className="text-xs text-muted mt-1">
                          — {review.author_name || "Anonymous"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar — purchase card */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 bg-card border border-border rounded-2xl p-6 space-y-4">
                <div className="text-3xl font-bold text-white">
                  {listing.price_cents === 0 ? "Free" : `$${(listing.price_cents / 100).toFixed(0)}`}
                  {listing.price_cents > 0 && <span className="text-sm font-normal text-muted"> one-time</span>}
                </div>

                {purchased ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <span className="text-green-400 text-sm">✓</span>
                      <span className="text-green-400 text-sm font-medium">Purchased</span>
                    </div>
                    {files.length > 0 ? (
                      files.map((file: any) => (
                        <button
                          key={file.id}
                          onClick={() => handleDownload(file.id, file.original_filename)}
                          className="w-full py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download {file.original_filename}
                          {file.file_size > 0 && (
                            <span className="text-xs opacity-70">({(file.file_size / 1024).toFixed(0)}KB)</span>
                          )}
                        </button>
                      ))
                    ) : listing.download_url ? (
                      <a
                        href={`${API_BASE}${listing.download_url}`}
                        className="w-full py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors flex items-center justify-center gap-2 no-underline"
                        download
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </a>
                    ) : (
                      <p className="text-xs text-muted text-center py-2">No files uploaded yet</p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="w-full py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors disabled:opacity-50"
                  >
                    {purchasing ? "Processing..." : listing.price_cents === 0 ? "Get for Free" : "Buy Now"}
                  </button>
                )}

                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Type</span>
                    <span className="text-white">{TYPE_ICONS[listing.type]} {listing.type}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Category</span>
                    <span className="text-white">{listing.category}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Creator</span>
                    <span className="text-white">{listing.creator_id === "system-montecarloo" ? "MonteCarloo" : listing.creator_id}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Listed</span>
                    <span className="text-white">
                      {new Date(listing.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted">
                    🔒 Secure checkout via Stripe. 30-day money-back guarantee.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
