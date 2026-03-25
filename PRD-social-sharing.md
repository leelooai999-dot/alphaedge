# PRD: Social Sharing with OG Image Generation

## Goal
Enable one-click social sharing of simulation scenarios with auto-generated OG images. This is THE growth engine — every shared image is free marketing. Target: user shares within 3 minutes of first visit.

## Context
- AlphaEdge is a Next.js frontend (Vercel) + Python FastAPI backend (Railway)
- Frontend: `/root/.openclaw/workspace/alphaedge/frontend/`
- Backend: `/root/.openclaw/workspace/alphaedge/engine/`
- Chart component: `frontend/components/SimChart.tsx` (lightweight-charts v5)
- Current "Share" button just copies URL to clipboard — no image generation

## Requirements

### 1. OG Image API Endpoint (Backend)
Create `GET /api/og?ticker=CVX&events=iran_escalation:0.6:30:7&median=206&prob=62&price=148`

- Generates a 1200x630 PNG image (Twitter/Facebook OG standard)
- Uses **Pillow** (Python) — no browser/puppeteer needed, keeps it lightweight
- Design:
  - Dark background (#0a0a0f) matching the app theme
  - AlphaEdge logo/brand top-left
  - Stock ticker + current price prominently displayed
  - Mini sparkline chart showing the simulation projection (draw with Pillow)
  - Event tags (e.g., "🔴 Iran War +30d | ⚡ Fed Rate Cut")
  - Key stats: "62% profit probability | Median: $206 | Max drawdown: -$12"
  - Watermark: "alphaedge.io" bottom-right
  - Clean, professional, dark-mode aesthetic
- Add Pillow to `engine/requirements.txt`
- Cache generated images for 5 minutes (LRU cache keyed on query params)

### 2. Shareable Scenario URLs
- Format: `/sim/CVX?events=iran_escalation:0.6:30:7,fed_rate_cut:0.5:60:5`
- The sim page should parse URL params and restore the exact scenario (events, probabilities, durations, impacts)
- Update `frontend/app/sim/[ticker]/page.tsx` to read events from URL search params on load

### 3. Share Button Upgrade (Frontend)
Replace the current "copy URL" share button with a share dropdown:
- **Copy Link** — copies the shareable URL with event params
- **Share to X/Twitter** — opens Twitter intent with pre-filled text + URL (Twitter auto-fetches OG image)
- **Share to Reddit** — opens Reddit submit with URL
- **Download Image** — downloads the OG image directly

Update the share button in `frontend/app/sim/[ticker]/page.tsx`.

### 4. OG Meta Tags (Frontend)
Add dynamic `<meta>` tags to the sim page so social platforms auto-fetch the preview:
- `og:image` → points to the backend OG image endpoint with current scenario params
- `og:title` → "CVX + Iran War Simulation | AlphaEdge"
- `og:description` → "62% profit probability | Median target: $206 | Simulated with AlphaEdge"
- `twitter:card` → "summary_large_image"

Since this is a client-rendered page, we need to either:
- Use Next.js `generateMetadata` in a server component wrapper, OR
- Add a lightweight API route at `frontend/app/api/og/route.ts` that redirects to the backend image

Best approach: Add `generateMetadata` to the sim page by converting the metadata portion to a server component pattern using Next.js 14+ metadata API.

### 5. Share Preview Card Look
The shared image should make people WANT to click:
```
┌─────────────────────────────────────┐
│  α AlphaEdge                        │
│                                     │
│  CVX  $148.23                       │
│  ┌─────────────────────────┐        │
│  │  ╱──╲    ╱╲             │  62%   │
│  │╱     ╲╱╱   ╲──── $206  │ profit │
│  │               (median)  │        │
│  └─────────────────────────┘        │
│                                     │
│  🔴 Iran War +30d  ⚡ Fed Cut       │
│  Median: $206 | Drawdown: -$12     │
│                                     │
│              alphaedge.io           │
└─────────────────────────────────────┘
```

## Tasks
- [x] Add Pillow to engine/requirements.txt
- [x] Create `engine/og_image.py` — OG image generator with Pillow
- [x] Add `GET /api/og` endpoint to `engine/api.py`
- [x] Update share button in `frontend/app/sim/[ticker]/page.tsx` with dropdown (Copy Link, X, Reddit, Download)
- [x] Add URL param parsing for shareable scenario URLs (read events from `?events=` query param)
- [x] Add `generateMetadata` for dynamic OG tags in the sim page
- [x] Test: share URL on Twitter → preview card shows correctly
- [x] Commit and push

## Non-Goals (for now)
- No screenshot/canvas capture of the actual chart (too complex, Pillow sparkline is enough)
- No user accounts or saved scenarios database
- No embed codes or iframe support

## Technical Notes
- Backend is Python FastAPI at `engine/api.py`
- Frontend is Next.js 14 at `frontend/`
- The API base URL is set via `NEXT_PUBLIC_API_URL` env var in Vercel
- Railway backend URL: https://alphaedge-api-production.up.railway.app
- Don't use any headless browser or puppeteer — keep it lightweight (Pillow only)
- For the sparkline in the OG image, draw a simple line chart with Pillow's ImageDraw
- Use a clean monospace/sans font — Pillow ships with a default font, or bundle Inter/Roboto
