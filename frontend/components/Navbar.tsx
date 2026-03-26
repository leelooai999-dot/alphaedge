"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import AuthModal, { AuthUser } from "./AuthModal";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    // Restore auth state from localStorage
    try {
      const stored = localStorage.getItem("alphaedge_user");
      if (stored) setUser(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const handleLogout = () => {
    const token = localStorage.getItem("alphaedge_token");
    if (token) {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
      fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("alphaedge_token");
    localStorage.removeItem("alphaedge_user");
    setUser(null);
    setShowUserMenu(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 no-underline">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center text-bg font-bold text-sm">
              α
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">
              AlphaEdge
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-5">
            <Link
              href="/sim/AAPL"
              className="text-sm text-muted hover:text-white transition-colors no-underline"
            >
              Simulator
            </Link>
            <Link
              href="/feed"
              className="text-sm text-muted hover:text-white transition-colors no-underline"
            >
              Feed
            </Link>
            <Link
              href="/leaderboard"
              className="text-sm text-muted hover:text-white transition-colors no-underline"
            >
              🏆 Leaderboard
            </Link>
            <Link
              href="/explore"
              className="text-sm text-muted hover:text-white transition-colors no-underline"
            >
              Explore
            </Link>
            <NotificationBell userId={user?.id || null} />
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 text-accent text-sm font-medium rounded-lg hover:bg-accent/20 transition-colors"
                >
                  <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold">
                    {user.display_name[0].toUpperCase()}
                  </span>
                  {user.display_name}
                  <span className="text-xs text-muted">{user.points} pts</span>
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 top-10 w-48 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs text-white font-medium">{user.display_name}</p>
                      <p className="text-[10px] text-muted">{user.email}</p>
                    </div>
                    <Link
                      href="/leaderboard"
                      className="block px-3 py-2 text-xs text-muted hover:text-white hover:bg-border/30 no-underline"
                      onClick={() => setShowUserMenu(false)}
                    >
                      🏆 {user.points} points · #{user.tier}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-400/10"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="px-4 py-1.5 bg-accent/10 text-accent text-sm font-medium rounded-lg hover:bg-accent/20 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 text-muted hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-card border-b border-border">
          <div className="px-4 py-3 space-y-2">
            <Link
              href="/sim/AAPL"
              className="block py-2 text-sm text-muted hover:text-white no-underline"
              onClick={() => setOpen(false)}
            >
              Simulator
            </Link>
            <Link
              href="/feed"
              className="block py-2 text-sm text-muted hover:text-white no-underline"
              onClick={() => setOpen(false)}
            >
              Feed
            </Link>
            <Link
              href="/leaderboard"
              className="block py-2 text-sm text-muted hover:text-white no-underline"
              onClick={() => setOpen(false)}
            >
              🏆 Leaderboard
            </Link>
            <Link
              href="/explore"
              className="block py-2 text-sm text-muted hover:text-white no-underline"
              onClick={() => setOpen(false)}
            >
              Explore
            </Link>
            {user ? (
              <button
                onClick={() => { handleLogout(); setOpen(false); }}
                className="block py-2 text-sm text-red-400 font-medium"
              >
                Sign Out ({user.display_name})
              </button>
            ) : (
              <button
                onClick={() => { setShowAuth(true); setOpen(false); }}
                className="block py-2 text-sm text-accent font-medium"
              >
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      )}

      {/* Auth modal */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuth={(u) => { setUser(u); setShowAuth(false); }}
        />
      )}
    </nav>
  );
}
