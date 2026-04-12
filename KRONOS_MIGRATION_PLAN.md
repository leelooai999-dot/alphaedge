# Kronos Migration Plan

Date: 2026-04-12
Owner: MonteCarloo
Status: in-progress

## Goal
Replace the TimesFM-specific baseline forecast path with a provider-agnostic baseline forecast layer, enabling Kronos as the long-term financial baseline provider while preserving MonteCarloo's event-driven Monte Carlo simulation engine.

## Decision
- **Decommission new TimesFM development immediately**
- **Keep TimesFM only as a compatibility provider during migration**
- **Adopt Kronos as the target baseline forecast provider**
- **Do not replace Monte Carlo event simulation**; instead, fuse Kronos baseline + Monte Carlo event perturbation

## Current TimesFM Coupling Points
### Backend
- `engine/timesfm_service.py`
- `engine/timesfm_preflight.py`
- `engine/api.py`
  - `POST /api/forecast/timesfm`
  - `POST /api/forecast/timesfm/live`

### Frontend
- `frontend/lib/api.ts`
  - `getTimesfmForecast`
  - `TimesfmForecastResponse`
- `frontend/app/sim/[ticker]/page.tsx`
  - TimesFM baseline fetching and state
- `frontend/components/SimChart.tsx`
  - TimesFM-specific compare mode labels and UX

## Target Architecture
### New baseline layer
- `engine/forecast/providers/base.py`
- `engine/forecast/providers/registry.py`
- `engine/forecast/providers/timesfm_provider.py`
- `engine/forecast/providers/kronos_provider.py`

### New API endpoints
- `POST /api/forecast/baseline`
- `POST /api/forecast/baseline/live`

### Compatibility strategy
- Keep `/api/forecast/timesfm` and `/api/forecast/timesfm/live`
- Implement them as thin wrappers around the new baseline layer using provider=`timesfm`

## Provider Interface
### Request
- close series
- horizon
- quantiles
- optional frequency
- optional OHLCV frame
- optional timestamps
- optional provider selector

### Response
- available
- horizon
- point
- quantiles
- mode
- provider
- message

## Kronos Adapter Strategy
Use Kronos as the market-baseline provider.

### Inputs
- OHLCV + timestamps when available
- if only close exists, expand close to synthetic OHLCV with zero-filled volume/amount as a compatibility fallback

### Defaults
- `KRONOS_MODEL_ID=NeoQuasar/Kronos-small`
- `KRONOS_TOKENIZER_ID=NeoQuasar/Kronos-Tokenizer-base`
- `KRONOS_MAX_CONTEXT=512`

### Rollout constraints
- lazy-load model/tokenizer
- keep a graceful unavailable mode instead of crashing endpoints
- add placeholder/fallback bands if Kronos returns point-only output in early scaffold

## Frontend Migration
### Rename concepts
- `timesfmBaseline` -> `baselineForecast`
- `Compare vs TimesFM baseline` -> `Compare vs market baseline`
- surface provider metadata subtly instead of hardcoding model branding into the core UI

### Keep UX stable
The chart should still support:
- historical line
- baseline forecast comparison
- scenario projection line/bands
- provider-agnostic labels

## Rollout Phases
### Phase 1 — Provider abstraction
- scaffold baseline provider layer
- wrap TimesFM service as provider
- add generic baseline endpoints
- keep compatibility routes

### Phase 2 — Frontend decoupling
- move frontend from TimesFM-specific types/names to baseline forecast abstraction
- keep current behavior while removing model-specific wording

### Phase 3 — Kronos scaffold
- add Kronos provider class
- wire env/config
- implement unavailable/graceful mode first
- prepare for real model loading

### Phase 4 — Real Kronos integration
- connect provider to local/HF model assets
- add OHLCV/timestamp conversion
- benchmark latency and output quality

### Phase 5 — TimesFM decommission
- remove TimesFM-specific UI copy
- freeze compatibility routes
- delete TimesFM code after Kronos is production-stable

## Success Criteria
- baseline forecast works through provider abstraction
- frontend no longer depends on TimesFM-specific naming
- TimesFM remains available through compatibility wrappers only
- Kronos scaffold exists and can be enabled by config
- future work can focus on Kronos without further TimesFM lock-in

## Notes
This migration does not attempt to replace MonteCarloo's event explainability, scenario controls, or Monte Carlo engine. Kronos should provide the market prior; Monte Carlo should continue to provide the event-conditioned scenario layer.
