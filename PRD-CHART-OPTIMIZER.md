# PRD: MonteCarloo Chart Optimizer

## Goal
Optimize the SimChart component and simulation pipeline for performance, visual quality, and UX.

## Tasks

- [x] Read and audit SimChart.tsx for performance issues (unnecessary re-renders, heavy computations in render path)
- [x] Optimize lightweight-charts v5 usage — use ISeriesApi.update() for incremental updates instead of full setData() on every slider change
- [x] Add proper debouncing (300ms) to probability/duration/impact sliders so simulations don't fire on every pixel of drag
- [x] Implement chart loading skeleton/spinner state while simulation is running
- [x] Optimize confidence band rendering — use Area series with proper gradient fills instead of multiple line series
- [x] Add smooth transitions when switching time horizons (1W/2W/1M/2M/3M) — crossfade or animate
- [x] Ensure mobile responsiveness — chart should fill viewport width, touch-friendly slider controls
- [x] Add proper error boundary around chart component with user-friendly error message
- [x] Cache simulation results on frontend (same inputs = skip API call, show cached chart)
- [x] Review color scheme — ensure green (bullish) and red (bearish) projections have sufficient contrast and accessibility
- [x] Write CHART-OPTIMIZATION-PLAN.md with findings and what was changed

## Working Directory
/root/.openclaw/workspace/alphaedge

## Key Files
- frontend/components/SimChart.tsx — main chart component
- frontend/app/sim/page.tsx or frontend/app/page.tsx — simulation page
- engine/simulation.py — backend Monte Carlo engine
- engine/api.py — API endpoints

## Rules
- Do NOT break existing functionality
- Test changes work by checking TypeScript compilation (cd frontend && npx tsc --noEmit)
- Commit each meaningful change with descriptive message
