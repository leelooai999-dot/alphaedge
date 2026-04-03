"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
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

const STATUS_OPTIONS = [
  { value: "active", label: "Active", desc: "Visible in marketplace" },
  { value: "draft", label: "Draft", desc: "Hidden, only you can see" },
  { value: "paused", label: "Paused", desc: "Temporarily hidden" },
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  ".json", ".txt", ".md", ".csv", ".pine", ".py", ".js", ".ts",
  ".zip", ".tar.gz", ".yaml", ".yml", ".toml", ".xml",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".pdf",
];

interface ExistingFile {
  id: string;
  original_filename: string;
  file_size: number;
  risk_level: string;
  is_primary: number;
  download_count: number;
}

interface UploadingFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "accepted" | "rejected" | "error";
  progress: number;
  scanResult?: any;
  errorMsg?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [itemType, setItemType] = useState("skill");
  const [category, setCategory] = useState("finance");
  const [priceDollars, setPriceDollars] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("active");
  const [version, setVersion] = useState("v1");
  const [whatsNew, setWhatsNew] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"details" | "files">("details");

  // Files
  const [existingFiles, setExistingFiles] = useState<ExistingFile[]>([]);
  const [newFiles, setNewFiles] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const getToken = () => {
    const token = localStorage.getItem("alphaedge_token");
    if (!token) {
      window.dispatchEvent(new Event("show-auth-modal"));
      return null;
    }
    return token;
  };

  const getHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Load listing data
  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("alphaedge_token");
      if (!token) {
        setError("Login required");
        setLoading(false);
        return;
      }

      try {
        const [listingRes, filesRes] = await Promise.all([
          fetch(`${API_BASE}/api/marketplace/listings/${listingId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/api/marketplace/listings/${listingId}/files`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!listingRes.ok) {
          setError("Listing not found or you don't have access");
          setLoading(false);
          return;
        }

        const listing = await listingRes.json();

        setTitle(listing.title || "");
        setDescription(listing.tagline || listing.subtitle || "");
        setLongDescription(listing.description || "");
        setItemType(listing.type || "skill");
        setCategory(listing.category || "finance");
        setPriceDollars(listing.price_cents ? (listing.price_cents / 100).toString() : "0");
        setTags(Array.isArray(listing.tags) ? listing.tags.join(", ") : "");
        setStatus(listing.status || "active");
        setVersion(listing.version || "v1");
        setWhatsNew(listing.whats_new || "");

        if (filesRes.ok) {
          setExistingFiles(await filesRes.json());
        }
      } catch {
        setError("Failed to load listing");
      }
      setLoading(false);
    };
    load();
  }, [listingId]);

  // Save listing
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    const token = getToken();
    if (!token) return;

    if (!title.trim()) { setError("Title is required"); return; }
    if (!description.trim()) { setError("Short description is required"); return; }

    const priceCents = Math.round(parseFloat(priceDollars || "0") * 100);
    if (priceCents < 0) { setError("Price cannot be negative"); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/listings/${listingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          tagline: description.trim(),
          description: longDescription.trim(),
          type: itemType,
          category,
          price_cents: priceCents,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          status,
          version: version.trim(),
          whats_new: whatsNew.trim(),
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Failed to update listing");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  };

  // Upload new file
  const uploadFile = async (file: File, isPrimary: boolean) => {
    const token = getToken();
    if (!token) return;

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setNewFiles((prev) => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name, size: file.size, status: "error", progress: 0,
        errorMsg: `File type ${ext} not allowed`,
      }]);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setNewFiles((prev) => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name, size: file.size, status: "error", progress: 0,
        errorMsg: `File too large (max ${formatBytes(MAX_FILE_SIZE)})`,
      }]);
      return;
    }

    const tempId = Math.random().toString(36).slice(2);
    setNewFiles((prev) => [...prev, {
      id: tempId, name: file.name, size: file.size, status: "uploading", progress: 0,
    }]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/api/marketplace/listings/${listingId}/upload?is_primary=${isPrimary}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setNewFiles((prev) => prev.map((f) => f.id === tempId ? { ...f, progress: pct } : f));
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            xhr.status >= 200 && xhr.status < 300 ? resolve(data) : reject(new Error(data.detail || "Upload failed"));
          } catch { reject(new Error("Invalid response")); }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      if (result.status === "rejected") {
        setNewFiles((prev) => prev.map((f) => f.id === tempId
          ? { ...f, status: "rejected", progress: 100, scanResult: result.scan, errorMsg: result.reason || "Failed security scan" }
          : f));
      } else {
        setNewFiles((prev) => prev.map((f) => f.id === tempId
          ? { ...f, id: result.file_id || tempId, status: "accepted", progress: 100, scanResult: result.scan }
          : f));
        // Refresh existing files list
        const filesRes = await fetch(`${API_BASE}/api/marketplace/listings/${listingId}/files`, { headers: getHeaders() });
        if (filesRes.ok) setExistingFiles(await filesRes.json());
      }
    } catch (err: any) {
      setNewFiles((prev) => prev.map((f) => f.id === tempId
        ? { ...f, status: "error", progress: 0, errorMsg: err.message }
        : f));
    }
  };

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach((file, i) => {
      const isPrimary = existingFiles.length === 0 && newFiles.length === 0 && i === 0;
      uploadFile(file, isPrimary);
    });
  }, [existingFiles.length, newFiles.length, listingId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // Delete existing file
  const handleDeleteFile = async (fileId: string) => {
    const token = getToken();
    if (!token) return;

    setDeletingFile(fileId);
    try {
      const res = await fetch(`${API_BASE}/api/marketplace/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
      }
    } catch {}
    setDeletingFile(null);
  };

  if (loading) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-2xl mx-auto animate-pulse space-y-4">
          <div className="h-8 bg-card rounded w-1/3" />
          <div className="h-12 bg-card rounded" />
          <div className="h-12 bg-card rounded" />
          <div className="h-32 bg-card rounded" />
        </div>
      </main>
    );
  }

  if (error && !title) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-muted">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Edit Listing</h1>
              <p className="text-sm text-muted mt-0.5">{title}</p>
            </div>
            <button
              onClick={() => router.push(`/marketplace/${listingId}`)}
              className="text-sm text-muted hover:text-white transition-colors"
            >
              View Listing →
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-border">
            <button
              onClick={() => setTab("details")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "details" ? "border-accent text-accent" : "border-transparent text-muted hover:text-white"
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setTab("files")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "files" ? "border-accent text-accent" : "border-transparent text-muted hover:text-white"
              }`}
            >
              Files ({existingFiles.length})
            </button>
          </div>

          {/* Details Tab */}
          {tab === "details" && (
            <form onSubmit={handleSave} className="space-y-6">
              {/* Status */}
              <div>
                <label className="text-sm font-medium text-white block mb-2">Status</label>
                <div className="flex gap-3">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                        status === opt.value
                          ? opt.value === "active" ? "border-green-500 bg-green-500/5"
                            : opt.value === "paused" ? "border-yellow-500 bg-yellow-500/5"
                            : "border-accent bg-accent/5"
                          : "border-border bg-card hover:border-border/80"
                      }`}
                    >
                      <div className="text-sm font-medium text-white">{opt.label}</div>
                      <div className="text-xs text-muted mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

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
                        itemType === type.value ? "border-accent bg-accent/5" : "border-border bg-card hover:border-border/80"
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
                  maxLength={100}
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>

              {/* Short Description */}
              <div>
                <label className="text-sm font-medium text-white block mb-1.5">
                  Short Description <span className="text-muted font-normal">(tagline)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>

              {/* Long Description */}
              <div>
                <label className="text-sm font-medium text-white block mb-1.5">
                  Full Description <span className="text-muted font-normal">(supports markdown)</span>
                </label>
                <textarea
                  rows={8}
                  value={longDescription}
                  onChange={(e) => setLongDescription(e.target.value)}
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
                      min="0"
                      step="1"
                      className="w-full pl-7 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <p className="text-xs text-muted mt-1">You earn 70% of sales.</p>
                </div>
              </div>

              {/* Version & What's New */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-white block mb-1.5">Version</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="v1"
                    className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-white block mb-1.5">What&apos;s New</label>
                  <input
                    type="text"
                    value={whatsNew}
                    onChange={(e) => setWhatsNew(e.target.value)}
                    placeholder="Changelog for this version..."
                    className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-sm font-medium text-white block mb-1.5">
                  Tags <span className="text-muted font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="oil, geopolitics, Iran, options"
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>

              {/* Error / Success */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                  {error}
                </div>
              )}
              {saved && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400">
                  ✓ Listing updated successfully
                </div>
              )}

              {/* Submit */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/marketplace/dashboard")}
                  className="px-6 py-3 border border-border text-muted font-medium rounded-xl hover:text-white hover:border-white/20 transition-colors"
                >
                  Back to Dashboard
                </button>
              </div>
            </form>
          )}

          {/* Files Tab */}
          {tab === "files" && (
            <div>
              {/* Existing files */}
              {existingFiles.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-white mb-3">Current Files</h3>
                  <div className="space-y-2">
                    {existingFiles.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
                      >
                        <div className="text-lg flex-shrink-0">
                          {f.is_primary ? "📦" : "📄"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white truncate">{f.original_filename}</span>
                            <span className="text-xs text-muted">{formatBytes(f.file_size)}</span>
                            {f.is_primary ? (
                              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Primary</span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-green-400">Risk: {f.risk_level}</span>
                            <span className="text-xs text-muted">{f.download_count} downloads</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFile(f.id)}
                          disabled={deletingFile === f.id}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 px-2 py-1"
                        >
                          {deletingFile === f.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload new files */}
              <h3 className="text-sm font-medium text-white mb-3">Upload New Files</h3>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-accent bg-accent/5 scale-[1.01]"
                    : "border-border hover:border-border/80 hover:bg-card/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                  accept={ALLOWED_EXTENSIONS.join(",")}
                />
                <div className="text-3xl mb-2">📁</div>
                <p className="text-sm text-white font-medium">
                  {dragOver ? "Drop files here" : "Drag & drop or click to upload"}
                </p>
                <p className="text-xs text-muted mt-1">All files are security-scanned before acceptance</p>
              </div>

              {/* Newly uploaded files */}
              {newFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {newFiles.map((f) => (
                    <div
                      key={f.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${
                        f.status === "accepted" ? "border-green-500/30 bg-green-500/5"
                          : f.status === "rejected" || f.status === "error" ? "border-red-500/30 bg-red-500/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="text-lg flex-shrink-0">
                        {f.status === "uploading" && "⏳"}
                        {f.status === "accepted" && "✅"}
                        {f.status === "rejected" && "🚫"}
                        {f.status === "error" && "❌"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white truncate">{f.name}</span>
                          <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                        </div>
                        {f.status === "uploading" && (
                          <div className="mt-1.5 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${f.progress}%` }} />
                          </div>
                        )}
                        {f.status === "accepted" && f.scanResult && (
                          <p className="text-xs text-green-400 mt-1">✓ Passed — risk: {f.scanResult.risk_level || "low"}</p>
                        )}
                        {(f.status === "rejected" || f.status === "error") && (
                          <p className="text-xs text-red-400 mt-1">{f.errorMsg}</p>
                        )}
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
