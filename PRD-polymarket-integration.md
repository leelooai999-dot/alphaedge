# PRD: Polymarket Live Odds Integration

## Goal
Replace hardcoded event probabilities with LIVE Polymarket prediction market odds. This is the core differentiator — "Live Polymarket odds × Monte Carlo simulation" is the tagline. Without live odds, we're just a static simulator.

## Context
- Backend: Python FastAPI at `engine/` (deployed on Railway)
- Frontend: Next.js at `frontend/` (deployed on Vercel)
- Events defined in `engine/events.py` — each event already has `polymarket_keywords` and `polymarket_slug` fields
- Frontend events in `frontend/lib/events.ts` — each has hardcoded `polymarketOdds`
- Polymarket public API: `https://gamma-api.polymarket.com/markets` (no auth required, uses `requests` library)
- The polymarket API returns `outcomePrices` as a JSON string like `["0.145", "0.855"]` where first is Yes probability

## Architecture

### Backend: New Polymarket Service (`engine/polymarket.py`)

Create a new module that:

1. **Maps AlphaEdge events to Polymarket markets** using keyword search
   - For each event in our EVENTS dict, search Polymarket by `polymarket_keywords`
   - Pick the BEST matching market (highest volume, most relevant question)
   - Cache the mapping for 1 hour (markets don't change structure often)

2. **Fetches live odds** with caching
   - TTL: 5 minutes (odds change, but not every second)
   - Use an in-memory dict with timestamps
   - On cache miss, batch-fetch all event odds in ONE API call where possible

3. **Returns enriched event data** via a new endpoint

### Backend: New/Updated API Endpoints

**`GET /api/events`** (UPDATE existing)
- Add `polymarket_odds` field to each event response
- Add `polymarket_market` field with: question, slug, volume24hr, last_updated
- If Polymarket fetch fails, fall back to the hardcoded `probability` field
- Response example:
```json
{
  "id": "iran_escalation",
  "name": "Iran-Israel Conflict Escalation",
  "category": "geopolitical",
  "polymarket_odds": 0.145,
  "polymarket_market": {
    "question": "US x Iran ceasefire by March 31?",
    "slug": "us-x-iran-ceasefire-by-march-31",
    "volume_24h": 4322744,
    "last_updated": "2026-03-25T20:00:00Z"
  },
  "parameters": {...},
  "sector_impacts": {...}
}
```

**`GET /api/polymarket/live`** (NEW)
- Returns ONLY the live odds for all events, lightweight endpoint for polling
- Frontend can poll this every 60 seconds to refresh odds without reloading everything
```json
{
  "iran_escalation": {"odds": 0.145, "question": "US x Iran ceasefire by March 31?", "volume_24h": 4322744},
  "fed_rate_cut": {"odds": 0.70, "question": "Will the Fed decrease rates by 25 bps?", "volume_24h": 374228},
  ...
}
```

### Frontend Updates

**`frontend/lib/events.ts`**
- Keep `polymarketOdds` as fallback defaults
- Add a new field `liveOdds?: number` that gets populated from the API

**`frontend/lib/api.ts`**
- Add `fetchLiveOdds()` function that calls `GET /api/polymarket/live`
- Add auto-refresh: poll every 60 seconds

**`frontend/app/sim/[ticker]/page.tsx`**
- On load, fetch events from API which now includes live odds
- Show a "LIVE" indicator badge next to probabilities that come from Polymarket
- When user adjusts the probability slider, show both: user's value and Polymarket's live value
- Add a "Reset to Live" button on each event's probability slider

**`frontend/components/EventPanel.tsx`** or **`frontend/components/EventCard.tsx`**
- Show the Polymarket source: "Via Polymarket: 'US x Iran ceasefire by March 31?' — 14.5%"
- Add a small "LIVE" green dot or badge next to the probability when it's from Polymarket
- Show 24h volume as a credibility indicator: "$4.3M traded"
- When odds change (polled refresh), animate the probability update

## Polymarket → AlphaEdge Event Mapping

The mapping needs to be SMART because Polymarket questions don't always match 1:1 with our events. Strategy:

1. **Search by keywords**: For "iran_escalation", search for ["iran", "israel", "middle east war"]
2. **Filter by relevance**: Discard markets about FIFA, elections, etc.
3. **Pick highest volume**: More volume = more reliable odds
4. **Handle inverse questions**: "US x Iran ceasefire" = inverse of "Iran escalation" — need to subtract from 1.0
5. **Fallback gracefully**: If no match found, use hardcoded probability

### Mapping Rules (implement in `engine/polymarket.py`)

| AlphaEdge Event | Polymarket Search | Invert? | Notes |
|----------------|-------------------|---------|-------|
| iran_escalation | "iran" | Maybe | "ceasefire" is inverse; "US forces enter Iran" is direct |
| china_taiwan | "taiwan" | No | Direct match expected |
| fed_rate_cut | "fed rate" OR "federal reserve" AND "decrease" | No | Multiple markets for different meetings |
| recession | "recession" | No | Direct |
| tariff_increase | "tariff" | No | May not find match |

For events without a Polymarket match, keep the hardcoded defaults and mark them as "estimated" instead of "live".

## Tasks
- [x] Create `engine/polymarket.py` — Polymarket API client with caching (5min TTL)
- [x] Add keyword-based market search + best-match selection logic
- [x] Add inverse detection (if question contains "ceasefire", "no", "won't", invert the odds)
- [x] Update `GET /api/events` in `engine/api.py` to include live odds
- [x] Add `GET /api/polymarket/live` endpoint for lightweight polling
- [x] Add `Pillow` is NOT needed for this PRD (that's for OG images)
- [x] Update `frontend/lib/api.ts` — add `fetchLiveOdds()` + 60s polling
- [x] Update `frontend/lib/events.ts` — add `liveOdds` field
- [x] Update `frontend/components/EventCard.tsx` or `EventPanel.tsx` — show LIVE badge, Polymarket source, volume
- [x] Update `frontend/app/sim/[ticker]/page.tsx` — use live odds as default probability, "Reset to Live" button
- [x] Add error handling: if Polymarket API is down, everything works with fallback odds
- [x] Test: verify CVX + iran_escalation shows live odds from Polymarket
- [x] Commit and push all changes

## Non-Goals
- No Polymarket authentication or trading
- No real-time WebSocket streaming (60s polling is fine for now)
- No custom event creation from arbitrary Polymarket markets (Phase 2)

## Technical Notes
- Polymarket API: `https://gamma-api.polymarket.com/markets?limit=50&order=volume24hr&ascending=false&active=true`
- Search: `https://gamma-api.polymarket.com/markets?limit=10&order=volume24hr&ascending=false&active=true&tag=<keyword>`
- Alternative search: use the `slug` field if we have a known slug, or search via the question text
- `outcomePrices` is a JSON STRING like `["0.145", "0.855"]` — parse it, first element is "Yes" probability
- Use `requests` library (already in requirements.txt)
- Cache in a simple dict with TTL — no Redis needed at this scale
- The backend already runs on Railway at https://alphaedge-api-production.up.railway.app
