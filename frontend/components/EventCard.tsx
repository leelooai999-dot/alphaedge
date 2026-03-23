"use client";

import { ActiveEvent } from "@/lib/events";

interface Props {
  event: ActiveEvent;
  onUpdate: (updated: ActiveEvent) => void;
  onRemove: () => void;
}

export default function EventCard({ event, onUpdate, onRemove }: Props) {
  const isBullish = event.impact > 0;

  return (
    <div className="bg-bg/50 border border-border rounded-xl p-4 space-y-3 hover:border-border/80 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">{event.emoji}</span>
            <span className="text-sm font-medium text-white truncate">
              {event.name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 text-accent text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-accent live-dot" />
              {event.probability}% likely
            </span>
            <span
              className={`text-xs font-medium ${
                isBullish ? "text-bullish" : "text-bearish"
              }`}
            >
              {isBullish ? "▲" : "▼"} {Math.abs(event.impact)}%
            </span>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-1 text-neutral hover:text-bearish transition-colors shrink-0"
          title="Remove event"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Probability slider */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">Probability</span>
          <span className="text-white font-mono">{event.probability}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={event.probability}
          onChange={(e) =>
            onUpdate({ ...event, probability: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>

      {/* Duration slider */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">Duration</span>
          <span className="text-white font-mono">{event.duration} days</span>
        </div>
        <input
          type="range"
          min="1"
          max="180"
          value={event.duration}
          onChange={(e) =>
            onUpdate({ ...event, duration: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>

      {/* Impact slider */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">Impact</span>
          <span className={`font-mono ${isBullish ? "text-bullish" : "text-bearish"}`}>
            {event.impact > 0 ? "+" : ""}{event.impact}%
          </span>
        </div>
        <input
          type="range"
          min="-30"
          max="30"
          value={event.impact}
          onChange={(e) =>
            onUpdate({ ...event, impact: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>
    </div>
  );
}
