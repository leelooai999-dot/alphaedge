"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ActiveEvent, EVENT_TEMPLATES, CATEGORY_LABELS } from "@/lib/events";
import { getPolymarketLiveOdds, PolymarketOdds } from "@/lib/api";
import EventCard from "./EventCard";

interface Props {
  events: ActiveEvent[];
  onEventsChange: (events: ActiveEvent[]) => void;
}

type Category = "all" | "geopolitical" | "macro" | "sector";

export default function EventPanel({ events, onEventsChange }: Props) {
  const [category, setCategory] = useState<Category>("all");
  const [showPicker, setShowPicker] = useState(false);
  const [liveOdds, setLiveOdds] = useState<Record<string, PolymarketOdds>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      // Use live odds if available, otherwise fall back to hardcoded
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
      if (e.key === "Escape") setShowPicker(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
              No events added yet. Pick one below to get started.
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
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Add Event</span>
            <button
              onClick={() => setShowPicker(false)}
              className="p-1 text-muted hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

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
        </div>
      )}
    </div>
  );
}
