# PRD: Pyeces Results Translation + Chart Integration

## Goal
Complete the Pyeces → MonteCarloo bridge so that multi-agent simulation results from Pyeces translate into interactive Monte Carlo chart scenarios seamlessly.

## Tasks

- [x] Read the existing bridge PRD at /root/.openclaw/workspace/alphaedge/PRD-PYECES-BRIDGE.md for full context
- [x] Read the existing bridge endpoint code in engine/api.py (search for "bridge" or "pyeces")
- [x] Read frontend/components/PyecesBadge.tsx to understand current Pyeces UI integration
- [x] Implement/complete POST /api/bridge/pyeces endpoint that accepts Pyeces simulation results and creates a MonteCarloo scenario
- [x] Build the translation layer: map Pyeces consensus (direction, probability, magnitude_pct, peak_impact_days) → MonteCarloo event parameters (probability, duration_days, impact_pct, event_type)
- [x] Handle multi-agent vote aggregation: weighted consensus from agent_predictions array → single probability + confidence band width
- [x] Create deep link format: /sim/{ticker}?bridge={scenario_id} that auto-loads a Pyeces-sourced scenario
- [x] Add PyecesBadge display on chart when viewing a bridge-sourced scenario (show agent vote breakdown, confidence, source link)
- [x] Add GET /api/bridge/pyeces/{scenario_id} endpoint to retrieve bridge metadata
- [x] Test the full flow: mock Pyeces payload → bridge API → scenario creation → chart renders correctly
- [x] Update API docs / README with bridge endpoint documentation

## Working Directory
/root/.openclaw/workspace/alphaedge

## Key Files
- engine/api.py — main API (add bridge endpoints)
- engine/scenarios.py — scenario CRUD
- engine/simulation.py — Monte Carlo engine
- frontend/components/PyecesBadge.tsx — Pyeces UI badge
- frontend/components/SimChart.tsx — chart component
- PRD-PYECES-BRIDGE.md — original bridge spec

## Rules
- Do NOT break existing endpoints
- All new endpoints need proper error handling and input validation
- Commit each meaningful change with descriptive message
