"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/"), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Reset failed — the link may have expired. Request a new one.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 text-center max-w-md mx-auto">
          <p className="text-4xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-white mb-2">Invalid Reset Link</h1>
          <p className="text-sm text-muted mb-4">
            This link is missing a reset token. Please go back and request a new password reset.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2.5 bg-accent text-bg font-semibold rounded-xl text-sm"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-sm mx-auto">
          {success ? (
            <div className="text-center">
              <p className="text-4xl mb-4">✅</p>
              <h1 className="text-xl font-bold text-white mb-2">Password Reset!</h1>
              <p className="text-sm text-muted mb-4">
                Your password has been updated. Redirecting to sign in...
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-block w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center text-bg font-bold text-lg mb-3 leading-[48px]">
                  M
                </div>
                <h1 className="text-xl font-bold text-white">Set New Password</h1>
                <p className="text-sm text-muted mt-1">Enter your new password below.</p>
              </div>

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs text-muted mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoFocus
                    className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div>
                  <label className="block text-xs text-muted mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Type it again"
                    onKeyDown={(e) => e.key === "Enter" && handleReset(e)}
                    className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-accent text-bg text-sm font-semibold rounded-xl hover:bg-accent/80 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-sm mx-auto animate-pulse">
          <div className="h-8 bg-card rounded w-1/2 mx-auto mb-4" />
          <div className="h-12 bg-card rounded mb-3" />
          <div className="h-12 bg-card rounded" />
        </div>
      </main>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
