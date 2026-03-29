# PRD: Pyeces → MonteCarloo Bridge API + Frontend Integration

## Context
Pyeces (MiroFish fork) is a multi-agent swarm simulation platform. MonteCarloo is a Monte Carlo stock chart simulator. Currently they are completely separate — users who run a Pyeces simulation about "Iran war impact on oil stocks" get a text report but can't see the results on a stock chart. We need a bridge.

## Goal
Build a Bridge API endpoint on the MonteCarloo backend that accepts structured simulation results from Pyeces and translates them into MonteCarloo scenario parameters. Add a "View on Chart" deep link from Pyeces into MonteCarloo.

## Architecture

```
Pyeces Simulation → Bridge API → MonteCarloo Scenario → Chart View
```

## Technical Details

### Backend (engine/api.py)

#### New Endpoint: POST /api/bridge/pyeces
Accepts a Pyeces simulation result and creates a MonteCarloo scenario from it.

Request body:
```json
{
  "source": "pyeces",
  "simulation_id": "sim_abc123",
  "ticker": "CVX",
  "event_name": "Iran War Escalation",
  "consensus": {
    "direction": "bullish",
    "probability": 0.73,
    "magnitude_pct": 8.0,
    "peak_impact_days": 14,
    "confidence": 0.68,
    "agent_votes": {
      "bullish": 8,
      "bearish": 3,
      "neutral": 1
    }
  },
  "agent_predictions": [
    {
      "name": "Oil Hawk",
      "direction": "bullish",
      "target_pct": 12.0,
      "confidence": 0.9
    }
  ],
  "report_summary": "Multi-agent consensus: 73% chance of 5-8% oil stock increase..."
}
```

Response:
```json
{
  "scenario_id": "abc123",
  "chart_url": "https://montecarloo.com/sim/CVX?bridge=abc123",
  "events_created": [
    {
      "id": "pyeces_iran_war",
      "name": "Iran War Escalation (Pyeces AI)",
      "probability": 0.73,
      "impact_pct": 8.0,
      "duration_days": 14
    }
  ]
}
```

The bridge endpoint should:
1. Map Pyeces consensus to MonteCarloo event parameters (probability, impact_pct, duration_days)
2. Save as a scenario in the DB with `source: "pyeces"` tag
3. Return a deep link URL that loads the scenario on the chart
4. Include CORS headers for cross-origin requests from Pyeces

#### New Endpoint: GET /api/bridge/pyeces/{scenario_id}
Load a bridge scenario's Pyeces metadata (agent predictions, votes, summary) for overlay display.

### Frontend

#### SimChart overlay for Pyeces data
When a scenario has `source: "pyeces"`, show agent prediction markers on the chart:
- Small colored dots at each agent's predicted price level
- Tooltip showing agent name + prediction + confidence
- A "Pyeces AI Consensus" label in the chart legend

#### New Component: PyecesBadge.tsx
A small badge/pill shown on scenarios that came from Pyeces:
- "🤖 Pyeces AI" badge with agent count
- Click to expand agent predictions panel
- Shows consensus meter (bullish/bearish vote breakdown)

#### Deep Link Support
The simulator page should detect `?bridge=<id>` query param and:
1. Load the bridge scenario data
2. Auto-populate events from the Pyeces consensus
3. Show the PyecesBadge component

### Database
Add to scenarios table (SQLite):
- `source` TEXT (null for user-created, "pyeces" for bridge)
- `pyeces_data` TEXT (JSON blob with full Pyeces simulation data)

## Tasks

- [x] Add `source` and `pyeces_data` columns to scenarios table in `engine/api.py` (ALTER TABLE if exists, or add to CREATE TABLE)
- [x] Create `POST /api/bridge/pyeces` endpoint in `engine/api.py` that accepts Pyeces simulation results, maps consensus to MonteCarloo events, saves as scenario, returns chart URL
- [x] Create `GET /api/bridge/pyeces/{scenario_id}` endpoint that returns the stored Pyeces metadata for a bridge scenario
- [x] Add CORS support for the bridge endpoints (allow cross-origin from any origin since Pyeces may be on a different domain)
- [x] Create `frontend/components/PyecesBadge.tsx` — shows "🤖 Pyeces AI" pill with agent count, expandable panel showing agent predictions and consensus vote breakdown. Dark theme, matching existing card style.
- [x] Update `frontend/lib/events.ts` to add `pyecesData` optional field to `SimulationResult` and create `PyecesAgentPrediction` interface
- [x] Update `frontend/lib/api.ts` to add `loadBridgeScenario(bridgeId: string)` function that fetches bridge scenario data
- [x] Update `frontend/app/sim/[ticker]/page.tsx` to detect `?bridge=` query param, load bridge scenario, auto-populate events, and show PyecesBadge
- [x] Test bridge API with curl: POST a sample Pyeces result, verify scenario creation and chart URL
- [x] Test frontend by visiting the returned chart URL and verifying events load
- [x] Commit all changes with message "feat: Pyeces → MonteCarloo bridge API + deep link integration"
- [x] Push to origin main

## Constraints
- Bridge API must work even if Pyeces is not running (it's just a data receiver)
- Keep it simple — no WebSocket, no real-time sync. Pyeces pushes once, MonteCarloo displays.
- CORS must allow any origin (Pyeces deployment URL may change)
- Must not break existing scenario creation/loading flows
- Use existing SQLite database (same file as scenarios)
- No new Python dependencies beyond what's already in requirements.txt
