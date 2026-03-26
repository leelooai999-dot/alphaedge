"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ActiveEvent, EVENT_TEMPLATES, CATEGORY_LABELS, createCustomEventFromPolymarket } from "@/lib/events";
import { getPolymarketLiveOdds, PolymarketOdds, searchPolymarket, PolymarketSearchResult } from "@/lib/api";
import EventCard from "./EventCard";

interface Props {
  events: ActiveEvent[];
  onEventsChange: (events: ActiveEvent[]) => void;
}

type Category = "all" | "geopolitical" | "macro" | "sector";
type PickerTab = "templates" | "search";

export default function EventPanel({ events, onEventsChange }: Props) {
  const [category, setCategory] = useState<Category>("all");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>("templates");
  const [liveOdds, setLiveOdds] = useState<Record<string, PolymarketOdds>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PolymarketSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch live odds on mount + poll every 60s
  useEffect(() => {
    const fetchOdds = async () => {
      const odds = await getPolymarketLiveOdds();
      setLiveOdds(odds);
    };
    fetchOdds();
    intervalRef.current = setInterval(fetchOdds, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Auto-focus search input when switching to search tab
  useEffect(() => {
    if (pickerTab === "search" && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [pickerTab]);

  // Debounced search
  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const result = await searchPolymarket(query, 20);
      setSearchResults(result.markets);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => doSearch(value), 400);
  }, [doSearch]);

  const available = EVENT_TEMPLATES.filter((t) => {
    if (!events.find((e) => e.id === t.id)) {
      if (category === "all") return true;
      return t.category === category;
    }
    return false;
  });

  const addEvent = useCallback(
    (templateId: string) => {
      const template = EVENT_TEMPLATES.find((t) => t.id === templateId);
      if (!template || events.find((e) => e.id === templateId)) return;

      const live = liveOdds[templateId];
      const probability = live ? Math.round(live.odds * 100) : template.polymarketOdds;

      const newEvent: ActiveEvent = {
        ...template,
        probability,
        duration: template.defaultDuration,
        impact: template.defaultImpact,
      };

      onEventsChange([...events, newEvent]);
      setShowPicker(false);
    },
    [events, onEventsChange, liveOdds]
  );

  const addPolymarketEvent = useCallback(
    (market: PolymarketSearchResult) => {
      // Check if already added (by slug match)
      const existingId = `pm_${market.slug.replace(/-/g, "_").slice(0, 60)}`;
      if (events.find((e) => e.id === existingId)) return;

      const newEvent = createCustomEventFromPolymarket(market);
      onEventsChange([...events, newEvent]);
      setShowPicker(false);
      setSearchQuery("");
      setSearchResults([]);
      setHasSearched(false);
    },
    [events, onEventsChange]
  );

  const updateEvent = useCallback(
    (updated: ActiveEvent) => {
      onEventsChange(events.map((e) => (e.id === updated.id ? updated : e)));
    },
    [events, onEventsChange]
  );

  const removeEvent = useCallback(
    (id: string) => {
      onEventsChange(events.filter((e) => e.id !== id));
    },
    [events, onEventsChange]
  );

  // Keyboard shortcut: Escape closes picker
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPicker(false);
        setSearchQuery("");
        setSearchResults([]);
        setHasSearched(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const formatVolume = (vol: number) => {
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Active Events */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">
          Events ({events.length})
        </h3>
        {events.length > 0 && (
          <button
            onClick={() => onEventsChange([])}
            className="text-xs text-neutral hover:text-bearish transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Event cards */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {events.length === 0 && (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">🎯</div>
            <p className="text-sm text-muted">
              No events added yet. Pick a template or search Polymarket below.
            </p>
          </div>
        )}
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onUpdate={updateEvent}
            onRemove={() => removeEvent(event.id)}
            liveOdds={liveOdds[event.id] || null}
          />
        ))}
      </div>

      {/* Add Event */}
      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          className="mt-3 w-full py-2.5 border border-dashed border-border rounded-xl text-sm text-muted hover:text-accent hover:border-accent/30 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Event
        </button>
      ) : (
        <div className="mt-3 bg-card rounded-xl border border-border p-3 space-y-3">
          {/* Header with close */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Add Event</span>
            <button
              onClick={() => {
                setShowPicker(false);
                setSearchQuery("");
                setSearchResults([]);
                setHasSearched(false);
              }}
              className="p-1 text-muted hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab switcher: Templates vs Search Polymarket */}
          <div className="flex gap-1 bg-bg rounded-lg p-0.5">
            <button
              onClick={() => setPickerTab("templates")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                pickerTab === "templates"
                  ? "bg-card text-white shadow-sm"
                  : "text-muted hover:text-white"
              }`}
            >
              📋 Templates
            </button>
            <button
              onClick={() => setPickerTab("search")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                pickerTab === "search"
                  ? "bg-card text-white shadow-sm"
                  : "text-muted hover:text-white"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                🔍 Search Polymarket
              </span>
            </button>
          </div>

          {/* Templates Tab */}
          {pickerTab === "templates" && (
            <>
              {/* Category filter */}
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "geopolitical", "macro", "sector"] as Category[]).map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        category === cat
                          ? "bg-accent/20 text-accent"
                          : "bg-bg text-muted hover:text-white"
                      }`}
                    >
                      {cat === "all" ? "All" : CATEGORY_LABELS[cat]?.split(" ")[1] || cat}
                    </button>
                  )
                )}
              </div>

              {/* Event list */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {available.length === 0 && (
                  <p className="text-xs text-muted text-center py-2">
                    All events in this category are already added
                  </p>
                )}
                {available.map((t) => {
                  const live = liveOdds[t.id];
                  return (
                    <button
                      key={t.id}
                      onClick={() => addEvent(t.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg transition-colors text-left"
                    >
                      <span>{t.emoji}</span>
                      <span className="text-sm text-white flex-1">{t.name}</span>
                      {live ? (
                        <span className="text-xs font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-dot" />
                          <span className="text-green-400">{Math.round(live.odds * 100)}%</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted font-mono">
                          {t.polymarketOdds}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Search Polymarket Tab */}
          {pickerTab === "search" && (
            <>
              {/* Search input */}
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Search events... (e.g. tariff, bitcoin, oil, recession)"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent/50 transition-colors"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  </div>
                )}
                {searchQuery && !isSearching && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setHasSearched(false);
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Search hints (when no query) */}
              {!searchQuery && !hasSearched && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">
                    Search 300+ live Polymarket events to use as simulation inputs:
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {["tariff", "bitcoin", "oil", "fed rate", "recession", "war", "nvidia"].map((hint) => (
                      <button
                        key={hint}
                        onClick={() => handleSearchInput(hint)}
                        className="px-2.5 py-1 rounded-lg text-xs bg-bg text-muted hover:text-accent hover:bg-accent/10 transition-colors border border-border/50"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search results */}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {hasSearched && searchResults.length === 0 && !isSearching && (
                  <p className="text-xs text-muted text-center py-4">
                    No markets found for &ldquo;{searchQuery}&rdquo;. Try different keywords.
                  </p>
                )}
                {searchResults.map((market) => {
                  const existingId = `pm_${market.slug.replace(/-/g, "_").slice(0, 60)}`;
                  const alreadyAdded = events.some((e) => e.id === existingId);
                  const oddsPct = Math.round(market.odds * 100);

                  return (
                    <button
                      key={market.slug}
                      onClick={() => !alreadyAdded && addPolymarketEvent(market)}
                      disabled={alreadyAdded}
                      className={`w-full flex items-start gap-2 px-3 py-2.5 rounded-lg transition-colors text-left ${
                        alreadyAdded
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-bg cursor-pointer"
                      }`}
                    >
                      <span className="text-green-400 mt-0.5 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block live-dot" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white leading-tight">
                          {market.question}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono text-green-400">
                            {oddsPct}% Yes
                          </span>
                          <span className="text-[10px] text-muted">
                            {formatVolume(market.volume_24h)} vol
                          </span>
                          {alreadyAdded && (
                            <span className="text-[10px] text-accent">✓ Added</span>
                          )}
                        </div>
                      </div>
                      {!alreadyAdded && (
                        <span className="text-accent mt-1 shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Polymarket attribution */}
              {(searchResults.length > 0 || hasSearched) && (
                <div className="text-center pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted">
                    Powered by{" "}
                    <a
                      href="https://polymarket.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400/70 hover:text-green-400"
                    >
                      Polymarket
                    </a>
                    {" "}live prediction markets
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
