# PRD: Wire Commodity Beta Model into Frontend Chart

## Context
The backend API (`/api/simulate`) already returns `commodity_impacts`, `stock_betas`, and `stock_impact_breakdown` fields. The frontend does NOT display any of this data. The chart still shows flat event impact bars only.

## Goal
Make the commodity chain visible: Event → Commodity → Stock flow, so users SEE why Iran war moves CVX (because Iran → Oil +18% → CVX beta 0.7 = +12.6%).

## Technical Details

### Backend API Response (already working)
The `/api/simulate` POST response includes:
```json
{
  "commodity_impacts": {"WTI": 12.6, "BRENT": 14.0, "GOLD": 3.5},
  "stock_betas": {"WTI": 0.7, "BRENT": 0.65, "NATGAS": 0.15, "GOLD": 0.03},
  "stock_impact_breakdown": {"WTI": 8.82, "BRENT": 9.1}
}
```

### Frontend Files to Modify
- `frontend/lib/events.ts` — `SimulationResult` interface
- `frontend/lib/api.ts` — `runSimulation` response mapping
- `frontend/components/ImpactBreakdown.tsx` — replace or augment with commodity chain
- `frontend/components/SimChart.tsx` — optional: annotate chart with commodity info
- `frontend/app/sim/[ticker]/page.tsx` — pass new data to components

### Current SimulationResult Interface (in frontend/lib/events.ts)
```typescript
export interface SimulationResult {
  ticker: string;
  currentPrice: number;
  median30d: number;
  probProfit: number;
  maxDrawdown5p: number;
  eventImpact: number;
  paths: {
    dates: string[];
    median: number[];
    p25: number[];
    p75: number[];
    p5: number[];
    p95: number[];
  };
  breakdown: {
    eventName: string;
    impact: number;
    color: string;
  }[];
}
```

## Tasks

- [x] Add `commodityImpacts`, `stockBetas`, and `stockImpactBreakdown` fields to `SimulationResult` interface in `frontend/lib/events.ts`
- [x] Update `runSimulation` in `frontend/lib/api.ts` to map `commodity_impacts` → `commodityImpacts`, `stock_betas` → `stockBetas`, `stock_impact_breakdown` → `stockImpactBreakdown` from API response
- [x] Create new `CommodityChain` component (`frontend/components/CommodityChain.tsx`) that shows the flow: Event → Commodity (with % change) → Stock (with beta × commodity = impact). Use a visual flow diagram style with arrows. Color code: green for positive, red for negative. Only show commodities where abs(impact) > 0.5%. Show the beta value next to each commodity. Dark theme matching existing card style (`bg-card border border-border rounded-xl`).
- [x] Update `ImpactBreakdown.tsx` to show commodity-level breakdown when `stockImpactBreakdown` data is available (fall back to old event-level bars when not)
- [x] Add `CommodityChain` component to the simulator page (`frontend/app/sim/[ticker]/page.tsx`) below the existing ImpactBreakdown, only rendered when commodity data exists
- [x] Test by running `npm run build` (or `pnpm build`) in the frontend directory to ensure no TypeScript errors
- [x] Commit all changes with message "feat: wire commodity beta model into frontend chart"
- [x] Push to origin main

## Constraints
- DO NOT modify any backend/engine Python files
- Use existing Tailwind classes and dark theme (bg-card, border-border, text-muted, text-white, text-bullish=#00d4aa, text-bearish=#ff4757)
- Keep bundle size small — no new dependencies
- Must pass TypeScript strict mode build
