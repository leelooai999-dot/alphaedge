# PRD: Hyper Dash Ticker Visibility

## Goal
Make supported ticker discovery instant, searchable, and directly actionable.

## User outcomes
1. See all supported tickers in one place.
2. Search or filter them quickly.
3. Jump from ticker list straight into simulation/chart view.

## Phase 1 ship scope
- Add a dedicated `/tickers` page as the Hyper Dash entry.
- Load supported tickers from the existing backend endpoint `GET /api/stocks`.
- Support:
  - text search by ticker or company name
  - optional sector filter
  - result count
  - fast click-through to `/sim/[ticker]`
- Add clear CTAs on each ticker card:
  - `Open Simulator`
  - `View Chart`
- Add nav entry to expose Hyper Dash.
- Upgrade existing ticker search component to use the real API instead of the hardcoded 10-symbol list.

## Phase 2 ship scope
- Add compact table mode for faster scanning.
- Add recent tickers persisted in localStorage.
- Add popular quick-jump chips.
- Make chart-first entry explicit via dedicated chart-focused Hyper Dash links.

## UX
### Hyper Dash page
- Header: `Hyper Dash`
- Subcopy: `Browse all supported tickers, filter fast, jump straight into simulation.`
- Controls:
  - search input
  - sector dropdown or pill filters
  - result count
- Grid/list rows show:
  - ticker
  - company name
  - sector
  - simulator CTA
  - chart CTA
- Empty state: `No tickers match your search.`

### Existing simulator search box
- Replace fixed local list with backend-backed suggestions.
- Keep type-to-filter behavior.
- Add link to `See all tickers`.

## Backend/data
No new backend endpoint required for Phase 1.
Use existing `GET /api/stocks?q=` endpoint.

## Implementation order
1. Add shared frontend API helper for ticker list fetch.
2. Build `/tickers` page.
3. Add Hyper Dash nav link.
4. Refactor `StockSearch` to use backend suggestions.
5. Build and smoke test.

## Fastest ship rationale
This uses already-existing backend support, so the fastest win is frontend discovery + routing, not new data plumbing.

## Later enhancements
- virtualized long list
- favorites/recent tickers
- trending tickers
- sortable columns
- saved watchlists
- precomputed popular simulations from Hyper Dash
