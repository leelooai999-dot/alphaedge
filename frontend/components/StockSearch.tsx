"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupportedTickers, type SupportedTicker } from "@/lib/api";

interface Props {
  currentTicker?: string;
}

const QUICK_TICKERS = ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "MSFT", "META", "AMZN"];

export default function StockSearch({ currentTicker }: Props) {
  const [query, setQuery] = useState(currentTicker || "");
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<SupportedTicker[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const normalized = query.trim();
        const data = await getSupportedTickers(normalized || undefined);
        const sorted = [...data].sort((a, b) => {
          const q = normalized.toLowerCase();
          const aTickerStarts = q ? a.ticker.toLowerCase().startsWith(q) : false;
          const bTickerStarts = q ? b.ticker.toLowerCase().startsWith(q) : false;
          if (aTickerStarts !== bTickerStarts) return aTickerStarts ? -1 : 1;
          const aNameStarts = q ? a.name.toLowerCase().startsWith(q) : false;
          const bNameStarts = q ? b.name.toLowerCase().startsWith(q) : false;
          if (aNameStarts !== bNameStarts) return aNameStarts ? -1 : 1;
          return a.ticker.localeCompare(b.ticker);
        });
        if (!cancelled) setResults(sorted.slice(0, normalized ? 30 : 40));
      } catch {
        if (!cancelled) setResults([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const quickResults = useMemo(() => {
    const seen = new Set<string>();
    const merged: SupportedTicker[] = [];
    for (const symbol of QUICK_TICKERS) {
      const match = results.find((item) => item.ticker === symbol);
      if (match && !seen.has(match.ticker)) {
        seen.add(match.ticker);
        merged.push(match);
      }
    }
    for (const item of results) {
      if (!seen.has(item.ticker)) {
        seen.add(item.ticker);
        merged.push(item);
      }
    }
    return merged;
  }, [results]);

  const exactMatch = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) return null;
    return quickResults.find((item) => item.ticker === normalized) || null;
  }, [quickResults, query]);

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
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl max-h-96 overflow-y-auto z-[70]">
          <div className="px-3 py-2 border-b border-border bg-bg/50">
            <div className="flex flex-wrap gap-2">
              {QUICK_TICKERS.map((symbol) => (
                <button
                  key={symbol}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectTicker(symbol)}
                  className="px-2 py-1 text-[11px] font-mono rounded-full border border-border text-muted hover:text-white hover:border-white/20 transition-colors"
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>

          {exactMatch && (
            <div className="px-3 py-2 border-b border-border bg-accent/5">
              <button
                onClick={() => selectTicker(exactMatch.ticker)}
                className="w-full text-left"
              >
                <div className="text-[11px] uppercase tracking-wide text-accent mb-1">Direct jump</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-white text-sm">{exactMatch.ticker}</div>
                    <div className="text-xs text-muted truncate">{exactMatch.name}</div>
                  </div>
                  <span className="text-[10px] text-muted border border-border rounded-full px-2 py-0.5 shrink-0">{exactMatch.sector}</span>
                </div>
              </button>
            </div>
          )}

          {quickResults.map((t) => (
            <button
              key={t.ticker}
              onClick={() => selectTicker(t.ticker)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-cardHover transition-colors text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-white text-sm block">
                    {t.ticker}
                  </span>
                  {t.assetType && (
                    <span className="text-[10px] text-accent border border-accent/20 bg-accent/10 rounded-full px-2 py-0.5 shrink-0">
                      {t.assetType}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted truncate block">{t.name}</span>
              </div>
              <span className="text-[10px] text-muted border border-border rounded-full px-2 py-0.5 ml-3 shrink-0">{t.sector}</span>
            </button>
          ))}
          {quickResults.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted text-center">
              No results for &quot;{query}&quot;
            </div>
          )}
          <div className="border-t border-border px-3 py-2 bg-bg/40 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] text-muted">Showing {quickResults.length} options</span>
              {query.trim() && (
                <span className="text-[10px] text-muted/80">Try names like bitcoin, gold, oil, or ethereum too</span>
              )}
            </div>
            <Link href="/tickers" className="text-xs text-accent hover:text-accent/80 no-underline whitespace-nowrap">
              See all tickers in Hyper Dash →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
