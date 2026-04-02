"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface Props {
  onClose: () => void;
  onAuth: (user: AuthUser) => void;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  points: number;
  streak_days: number;
  tier: string;
  token: string;
}

export default function AuthModal({ onClose, onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleForgotPassword = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (!email) {
        setError("Enter your email address");
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.reset_token) {
        setResetToken(data.reset_token);
        setMode("reset");
        setSuccessMsg("Reset token generated. Enter your new password below.");
      } else {
        setSuccessMsg("If that email exists, check for a reset link.");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (!newPassword || newPassword.length < 8) {
        setError("Password must be at least 8 characters");
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg("Password reset! You can now sign in.");
        setMode("login");
        setPassword("");
        setNewPassword("");
        setResetToken("");
      } else {
        setError(data.detail || "Reset failed — token may be expired");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === "register") {
        if (!email || !password || !displayName) {
          setError("All fields are required");
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setLoading(false);
          return;
        }
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, display_name: displayName }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Registration failed");
          setLoading(false);
          return;
        }
        // Auto-login after register
        const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const loginData = await loginRes.json();
        if (loginRes.ok) {
          const user: AuthUser = {
            id: loginData.user_id,
            email,
            display_name: displayName,
            points: 0,
            streak_days: 0,
            tier: "free",
            token: loginData.token,
          };
          localStorage.setItem("alphaedge_token", loginData.token);
          localStorage.setItem("alphaedge_user", JSON.stringify(user));
          window.dispatchEvent(new Event("auth-complete"));
          onAuth(user);
        }
      } else {
        if (!email || !password) {
          setError("Email and password are required");
          setLoading(false);
          return;
        }
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Login failed");
          setLoading(false);
          return;
        }
        // Fetch user profile
        const meRes = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        const meData = await meRes.json();
        const user: AuthUser = {
          id: data.user_id,
          email: meData.email || email,
          display_name: meData.display_name || email.split("@")[0],
          points: meData.points || 0,
          streak_days: meData.streak_days || 0,
          tier: meData.tier || "free",
          token: data.token,
        };
        localStorage.setItem("alphaedge_token", data.token);
        localStorage.setItem("alphaedge_user", JSON.stringify(user));
        window.dispatchEvent(new Event("auth-complete"));
        onAuth(user);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    }
    setLoading(false);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">
            {mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : mode === "forgot" ? "Reset Password" : "Set New Password"}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-border/50 transition-colors text-lg">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Mode toggle */}
          {(mode === "login" || mode === "register") && (
            <div className="flex gap-1 bg-bg rounded-lg p-1">
              <button
                onClick={() => { setMode("login"); setError(null); setSuccessMsg(null); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === "login" ? "bg-accent/10 text-accent" : "text-muted"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setMode("register"); setError(null); setSuccessMsg(null); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === "register" ? "bg-accent/10 text-accent" : "text-muted"
                }`}
              >
                Register
              </button>
            </div>
          )}

          {/* Success message */}
          {successMsg && (
            <p className="text-xs text-green-400 bg-green-400/10 px-3 py-2 rounded-lg">{successMsg}</p>
          )}

          {/* Forgot password mode */}
          {mode === "forgot" && (
            <>
              <p className="text-xs text-muted">Enter your email to reset your password.</p>
              <div>
                <label className="block text-xs text-muted mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                />
              </div>
              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
              )}
              <button
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full py-2.5 bg-accent text-bg text-sm font-semibold rounded-xl hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {loading ? "..." : "Reset Password"}
              </button>
              <button
                onClick={() => { setMode("login"); setError(null); setSuccessMsg(null); }}
                className="w-full text-xs text-muted hover:text-accent transition-colors"
              >
                ← Back to Sign In
              </button>
            </>
          )}

          {/* Reset password mode (enter new password) */}
          {mode === "reset" && (
            <>
              <div>
                <label className="block text-xs text-muted mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                />
                <p className="text-[10px] text-muted mt-1">Minimum 8 characters</p>
              </div>
              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
              )}
              <button
                onClick={handleResetPassword}
                disabled={loading}
                className="w-full py-2.5 bg-accent text-bg text-sm font-semibold rounded-xl hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {loading ? "..." : "Set New Password"}
              </button>
            </>
          )}

          {/* Login / Register forms */}
          {(mode === "login" || mode === "register") && (
            <>
              {/* Display name (register only) */}
              {mode === "register" && (
                <div>
                  <label className="block text-xs text-muted mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="chipAnalyst"
                    className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs text-muted mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs text-muted mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-xl text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                />
              </div>

              {/* Forgot password link (login only) */}
              {mode === "login" && (
                <button
                  onClick={() => { setMode("forgot"); setError(null); setSuccessMsg(null); }}
                  className="text-xs text-accent hover:underline self-start bg-transparent border-0 cursor-pointer p-0"
                >
                  Forgot password?
                </button>
              )}

              {/* Error */}
              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-2.5 bg-accent text-bg text-sm font-semibold rounded-xl hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
              </button>

              {/* Benefits */}
              {mode === "register" && (
                <div className="text-xs text-muted space-y-1 pt-2 border-t border-border">
                  <p className="font-medium text-white text-[11px]">Why create an account?</p>
                  <p>🎯 Track your prediction accuracy over time</p>
                  <p>🏆 Earn points and compete on the leaderboard</p>
                  <p>💬 Comment on and fork other simulations</p>
                  <p>📊 Save unlimited scenarios</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
