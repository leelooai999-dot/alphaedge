"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

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
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/sim/AAPL"
              className="text-sm text-muted hover:text-white transition-colors no-underline"
            >
              Simulator
            </Link>
            <Link
              href="/explore"
              className="text-sm text-muted hover:text-white transition-colors no-underline"
            >
              Explore
            </Link>
            <Link
              href="/methodology"
              className="text-sm text-muted hover:text-white transition-colors no-underline"
            >
              Methodology
            </Link>
            <Link
              href="/sim/AAPL"
              className="px-4 py-1.5 bg-accent/10 text-accent text-sm font-medium rounded-lg hover:bg-accent/20 transition-colors no-underline"
            >
              Try Free →
            </Link>
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
              href="/explore"
              className="block py-2 text-sm text-muted hover:text-white no-underline"
              onClick={() => setOpen(false)}
            >
              Explore
            </Link>
            <Link
              href="/methodology"
              className="block py-2 text-sm text-muted hover:text-white no-underline"
              onClick={() => setOpen(false)}
            >
              Methodology
            </Link>
            <Link
              href="/sim/AAPL"
              className="block py-2 text-sm text-accent font-medium no-underline"
              onClick={() => setOpen(false)}
            >
              Try Free →
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
