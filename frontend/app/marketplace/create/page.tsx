"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const ITEM_TYPES = [
  { value: "persona", label: "🤖 AI Persona", desc: "A custom AI analyst personality" },
  { value: "skill", label: "⚡ Simulation Skill", desc: "A reusable event or strategy template" },
  { value: "strategy", label: "📊 Strategy Pack", desc: "Multi-event scenario + Pine Script" },
  { value: "dataset", label: "📦 Data Add-on", desc: "Custom data feed or historical dataset" },
];

const CATEGORIES = [
  "finance", "geopolitics", "macro", "sector", "crypto", "commodities", "options", "general",
];

export default function CreateListingPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [itemType, setItemType] = useState("skill");
  const [category, setCategory] = useState("finance");
  const [priceDollars, setPriceDollars] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const token = localStorage.getItem("alphaedge_token");
    if (!token) {
      window.dispatchEvent(new Event("show-auth-modal"));
      return;
    }

    if (!title.trim()) { setError("Title is required"); return; }
    if (!description.trim()) { setError("Description is required"); return; }

    const priceCents = Math.round(parseFloat(priceDollars || "0") * 100);
    if (priceCents < 0) { setError("Price cannot be negative"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          long_description: longDescription.trim() || undefined,
          item_type: itemType,
          category,
          price_cents: priceCents,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/marketplace/${data.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Failed to create listing");
      }
    } catch {
      setError("Network error");
    }
    setSubmitting(false);
  };

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-2">Create Listing</h1>
          <p className="text-sm text-muted mb-8">
            Share your AI personas, simulation skills, and strategies with the community. Earn 70% of every sale.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type Selection */}
            <div>
              <label className="text-sm font-medium text-white block mb-2">Type</label>
              <div className="grid grid-cols-2 gap-3">
                {ITEM_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setItemType(type.value)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      itemType === type.value
                        ? "border-accent bg-accent/5"
                        : "border-border bg-card hover:border-border/80"
                    }`}
                  >
                    <div className="text-sm font-medium text-white">{type.label}</div>
                    <div className="text-xs text-muted mt-0.5">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-sm font-medium text-white block mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Geopolitical Crisis Analysis Kit"
                maxLength={100}
                className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Short Description */}
            <div>
              <label className="text-sm font-medium text-white block mb-1.5">
                Short Description
                <span className="text-muted font-normal ml-1">(shown in listings)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One-liner that sells your product"
                maxLength={200}
                className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Long Description */}
            <div>
              <label className="text-sm font-medium text-white block mb-1.5">
                Full Description
                <span className="text-muted font-normal ml-1">(detail page)</span>
              </label>
              <textarea
                rows={6}
                value={longDescription}
                onChange={(e) => setLongDescription(e.target.value)}
                placeholder="Explain what's included, how to use it, who it's for..."
                className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
              />
            </div>

            {/* Category & Price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-white block mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-white focus:outline-none appearance-none cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-white block mb-1.5">Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                  <input
                    type="number"
                    value={priceDollars}
                    onChange={(e) => setPriceDollars(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="1"
                    className="w-full pl-7 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                  />
                </div>
                <p className="text-xs text-muted mt-1">Set to 0 for free. You earn 70% of sales.</p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="text-sm font-medium text-white block mb-1.5">
                Tags
                <span className="text-muted font-normal ml-1">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="oil, geopolitics, Iran, options"
                className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Publish Listing"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 border border-border text-muted font-medium rounded-xl hover:text-white hover:border-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
