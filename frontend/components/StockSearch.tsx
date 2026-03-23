"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const POPULAR_TICKERS = [
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "SPY", name: "S&P 500 ETF" },
  { ticker: "CVX", name: "Chevron" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "META", name: "Meta Platforms" },
  { ticker: "XOM", name: "ExxonMobil" },
];

interface Props {
  currentTicker?: string;
}

export default function StockSearch({ currentTicker }: Props) {
  const [query, setQuery] = useState(currentTicker || "");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = query.length > 0
    ? POPULAR_TICKERS.filter(
        (t) =>
          t.ticker.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase())
      )
    : POPULAR_TICKERS;

  const selectTicker = (ticker: string) => {
    setQuery(ticker);
    setFocused(false);
    router.push(`/sim/${ticker}`);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2 focus-within:border-accent/50 transition-colors">
        <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query.toUpperCase()}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query) selectTicker(query.toUpperCase());
          }}
          placeholder="Search ticker..."
          className="bg-transparent text-white text-sm font-mono w-full outline-none placeholder:text-neutral/50"
        />
      </div>

      {focused && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl max-h-64 overflow-y-auto z-50">
          {filtered.map((t) => (
            <button
              key={t.ticker}
              onClick={() => selectTicker(t.ticker)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-cardHover transition-colors text-left"
            >
              <span className="font-mono font-semibold text-white text-sm">
                {t.ticker}
              </span>
              <span className="text-xs text-muted">{t.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted text-center">
              No results for &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
