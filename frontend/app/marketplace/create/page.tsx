"use client";

import { useState, useRef, useCallback } from "react";
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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = [
  ".json", ".txt", ".md", ".csv", ".pine", ".py", ".js", ".ts",
  ".zip", ".tar.gz", ".yaml", ".yml", ".toml", ".xml",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
  ".pdf",
];

interface UploadedFile {
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

export default function CreateListingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [itemType, setItemType] = useState("skill");
  const [category, setCategory] = useState("finance");
  const [priceDollars, setPriceDollars] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // File upload state
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [listingId, setListingId] = useState<string | null>(null);
  const [step, setStep] = useState<"details" | "upload">("details");

  const getToken = () => {
    const token = localStorage.getItem("alphaedge_token");
    if (!token) {
      window.dispatchEvent(new Event("show-auth-modal"));
      return null;
    }
    return token;
  };

  // Step 1: Create listing
  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const token = getToken();
    if (!token) return;

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
        setListingId(data.id);
        setStep("upload");
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Failed to create listing");
      }
    } catch {
      setError("Network error");
    }
    setSubmitting(false);
  };

  // Step 2: Upload files
  const uploadFile = async (file: File, isPrimary: boolean) => {
    const token = getToken();
    if (!token || !listingId) return;

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const newFile: UploadedFile = {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
        status: "error",
        progress: 0,
        errorMsg: `File type ${ext} not allowed`,
      };
      setFiles((prev) => [...prev, newFile]);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      const newFile: UploadedFile = {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
        status: "error",
        progress: 0,
        errorMsg: `File too large (max ${formatBytes(MAX_FILE_SIZE)})`,
      };
      setFiles((prev) => [...prev, newFile]);
      return;
    }

    const tempId = Math.random().toString(36).slice(2);
    const newFile: UploadedFile = {
      id: tempId,
      name: file.name,
      size: file.size,
      status: "uploading",
      progress: 0,
    };
    setFiles((prev) => [...prev, newFile]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/api/marketplace/listings/${listingId}/upload?is_primary=${isPrimary}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setFiles((prev) =>
              prev.map((f) => (f.id === tempId ? { ...f, progress: pct } : f))
            );
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.detail || data.reason || "Upload failed"));
            }
          } catch {
            reject(new Error("Invalid response"));
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      if (result.status === "rejected") {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  status: "rejected",
                  progress: 100,
                  scanResult: result.scan,
                  errorMsg: result.reason || "Failed security scan",
                }
              : f
          )
        );
      } else {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  id: result.file_id || tempId,
                  status: "accepted",
                  progress: 100,
                  scanResult: result.scan,
                }
              : f
          )
        );
      }
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === tempId
            ? { ...f, status: "error", progress: 0, errorMsg: err.message }
            : f
        )
      );
    }
  };

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const arr = Array.from(fileList);
      arr.forEach((file, i) => {
        const isPrimary = files.length === 0 && i === 0;
        uploadFile(file, isPrimary);
      });
    },
    [files.length, listingId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handlePublish = () => {
    if (listingId) {
      router.push(`/marketplace/${listingId}`);
    }
  };

  const handleSkipUpload = () => {
    if (listingId) {
      router.push(`/marketplace/${listingId}`);
    }
  };

  const acceptedCount = files.filter((f) => f.status === "accepted").length;
  const uploadingCount = files.filter((f) => f.status === "uploading").length;

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            <div className={`flex items-center gap-2 ${step === "details" ? "text-accent" : "text-muted"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === "details" ? "bg-accent text-bg" : "bg-accent/20 text-accent"
              }`}>1</div>
              <span className="text-sm font-medium">Details</span>
            </div>
            <div className="w-8 h-px bg-border" />
            <div className={`flex items-center gap-2 ${step === "upload" ? "text-accent" : "text-muted"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === "upload" ? "bg-accent text-bg" : "bg-border text-muted"
              }`}>2</div>
              <span className="text-sm font-medium">Upload Files</span>
            </div>
          </div>

          {step === "details" ? (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Create Listing</h1>
              <p className="text-sm text-muted mb-8">
                Share your AI personas, simulation skills, and strategies with the community. Earn 70% of every sale.
              </p>

              <form onSubmit={handleCreateListing} className="space-y-6">
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
                    <span className="text-muted font-normal ml-1">(detail page, supports markdown)</span>
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
                    {submitting ? "Creating..." : "Next: Upload Files →"}
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
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Upload Product Files</h1>
              <p className="text-sm text-muted mb-2">
                Upload the files for <span className="text-white font-medium">{title}</span>. 
                All files are scanned for malicious code before being accepted.
              </p>
              <p className="text-xs text-muted/60 mb-6">
                Accepted: .json, .txt, .md, .csv, .pine, .py, .js, .ts, .zip, .yaml, .yml, .toml, .xml, images, .pdf — max 50MB each
              </p>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
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
                <div className="text-4xl mb-3">📁</div>
                <p className="text-sm text-white font-medium">
                  {dragOver ? "Drop files here" : "Drag & drop files or click to browse"}
                </p>
                <p className="text-xs text-muted mt-1">
                  First file uploaded becomes the primary download
                </p>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-medium text-white">
                    Files ({acceptedCount} uploaded{uploadingCount > 0 ? `, ${uploadingCount} uploading` : ""})
                  </h3>
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${
                        f.status === "accepted"
                          ? "border-green-500/30 bg-green-500/5"
                          : f.status === "rejected"
                          ? "border-red-500/30 bg-red-500/5"
                          : f.status === "error"
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-border bg-card"
                      }`}
                    >
                      {/* Icon */}
                      <div className="text-lg flex-shrink-0">
                        {f.status === "uploading" && "⏳"}
                        {f.status === "accepted" && "✅"}
                        {f.status === "rejected" && "🚫"}
                        {f.status === "error" && "❌"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white truncate">{f.name}</span>
                          <span className="text-xs text-muted flex-shrink-0">{formatBytes(f.size)}</span>
                        </div>

                        {/* Progress bar */}
                        {f.status === "uploading" && (
                          <div className="mt-1.5 h-1.5 bg-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-300"
                              style={{ width: `${f.progress}%` }}
                            />
                          </div>
                        )}

                        {/* Scan result */}
                        {f.status === "accepted" && f.scanResult && (
                          <p className="text-xs text-green-400 mt-1">
                            ✓ Passed security scan — risk: {f.scanResult.risk_level || "low"}
                          </p>
                        )}

                        {/* Error / rejection */}
                        {(f.status === "rejected" || f.status === "error") && (
                          <p className="text-xs text-red-400 mt-1">{f.errorMsg || "Upload failed"}</p>
                        )}
                        {f.status === "rejected" && f.scanResult?.findings?.length > 0 && (
                          <ul className="text-xs text-red-400/80 mt-1 list-disc list-inside">
                            {f.scanResult.findings.slice(0, 3).map((finding: string, i: number) => (
                              <li key={i}>{finding}</li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Remove button */}
                      {f.status !== "uploading" && (
                        <button
                          onClick={() => removeFile(f.id)}
                          className="text-muted hover:text-red-400 transition-colors flex-shrink-0"
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Security disclaimer */}
              <div className="mt-6 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                <p className="text-xs text-yellow-500/80">
                  ⚠️ <strong>Security notice:</strong> All uploaded files are automatically scanned for malicious code, 
                  obfuscated scripts, and known exploit patterns. Files that fail the scan will be rejected. 
                  By uploading, you confirm you have the right to distribute these files.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 mt-8">
                <button
                  onClick={handlePublish}
                  disabled={uploadingCount > 0}
                  className="px-6 py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors disabled:opacity-50"
                >
                  {acceptedCount > 0 ? `Publish with ${acceptedCount} file${acceptedCount > 1 ? "s" : ""}` : "Publish Listing"}
                </button>
                <button
                  onClick={handleSkipUpload}
                  className="px-6 py-3 border border-border text-muted font-medium rounded-xl hover:text-white hover:border-white/20 transition-colors"
                >
                  {acceptedCount > 0 ? "View Listing" : "Skip — upload later"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
