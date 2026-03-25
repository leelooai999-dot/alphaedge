# PRD: Shareable Product Milestone

## Goal
Make AlphaEdge's simulator page so compelling that users share it within 3 minutes of first visit. This is the viral growth engine — every share = free marketing.

## Success Criteria
- [ ] Social share button generates a beautiful OG image with chart + events + prediction
- [ ] Share to Twitter/X pre-fills post with image + link
- [ ] Copy link button works with proper OG meta tags (image, title, description)
- [ ] Polymarket live odds shown on event cards (real data, not hardcoded)
- [ ] Railway backend deploys successfully with new code

---

## Task 1: Fix Railway Dockerfile PORT binding

The Dockerfile hardcodes port 8000 but Railway injects a `PORT` env var that may differ. The health check fails because uvicorn listens on 8000 but Railway probes a different port.

### Changes needed:
- **File:** `Dockerfile`
- Fix the CMD to read `$PORT` at runtime (shell form, not exec form)
- Actually the CMD already uses shell form: `CMD uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}`
- The real issue might be that Railway's Dockerfile builder doesn't expand env vars the same way
- Try: `CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]`

### Verify:
- [ ] `railway up` succeeds
- [ ] Health check passes
- [ ] `/api/simulate` returns 200

---

## Task 2: OG Image Generation API

Create a serverless endpoint that generates a share image for any simulation scenario.

### API Design:
```
GET /api/og?ticker=CVX&events=iran_escalation:60,fed_rate_cut:75&target=162&prob=67
```

Returns a 1200x630 PNG image suitable for Twitter/Facebook OG tags.

### Image Layout:
```
┌──────────────────────────────────────────────────┐
│  α AlphaEdge                          alphaedge.io│
│                                                    │
│  CVX  Chevron Corporation                          │
│  $148.23 → $162.00 (+9.3%)                        │
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │          [Mini chart with bands]          │     │
│  │    ~~~~~~~~~~~~~/////////////////         │     │
│  │  ~~~~~~~~~~~~~/////////////////////       │     │
│  └──────────────────────────────────────────┘     │
│                                                    │
│  🔴 Iran War (60%)  ·  💰 Fed Rate Cut (75%)      │
│                                                    │
│  67% probability of profit  ·  30-day simulation   │
│                                                    │
│  "Crash without losing money."                     │
└──────────────────────────────────────────────────┘
```

### Implementation:
- **Backend approach (Python + Pillow):** Add `/api/og` endpoint to the FastAPI backend
  - Use Pillow to draw the image server-side
  - Draw a mini chart from the simulation data
  - Render text with clean fonts
  - Return PNG response
- **File:** `engine/og_image.py` — image generation logic
- **File:** `engine/api.py` — add `/api/og` route

### Why backend, not frontend:
- OG crawlers (Twitter, Facebook, Slack) can't execute JavaScript
- Need a static image URL that returns a PNG
- Backend already has simulation data

### Verify:
- [ ] `/api/og?ticker=CVX&events=iran_escalation:60` returns a PNG
- [ ] Image is 1200x630, looks good
- [ ] Twitter card validator shows the image

---

## Task 3: Frontend Share Flow

### Changes to `frontend/app/sim/[ticker]/page.tsx`:

1. **Share button** generates a URL like:
   `https://alphaedge.io/sim/CVX?events=iran_escalation:60,fed_rate_cut:75`
   
2. **OG meta tags** in the page head (dynamic):
   ```html
   <meta property="og:image" content="https://api.alphaedge.io/api/og?ticker=CVX&events=..." />
   <meta property="og:title" content="CVX simulation: +9.3% if Iran war continues" />
   <meta property="og:description" content="Monte Carlo simulation by AlphaEdge" />
   <meta name="twitter:card" content="summary_large_image" />
   ```

3. **Share to Twitter** button opens:
   `https://twitter.com/intent/tweet?text=...&url=...`

4. **Copy Link** button copies the shareable URL

### Changes needed:
- **File:** `frontend/app/sim/[ticker]/page.tsx` — update share handlers
- **File:** `frontend/app/sim/[ticker]/layout.tsx` or use `generateMetadata` — dynamic OG tags
- NOTE: OG tags must be server-rendered (not client-side). Use Next.js `generateMetadata` in a server component, or create a `metadata.ts` file.

### Verify:
- [ ] Share button opens Twitter intent with pre-filled text
- [ ] Copy link copies a clean URL
- [ ] Pasting the URL in Slack/Twitter/Discord shows the OG image preview

---

## Task 4: Polymarket Live Odds

### Current state:
- Events have hardcoded `polymarketOdds` in `frontend/lib/events.ts`
- Backend has 18 events with static probabilities

### Changes needed:
- **File:** `engine/polymarket.py` — new module to fetch live odds from Polymarket API
  - Polymarket CLOB API: `https://clob.polymarket.com/markets`
  - Map our event IDs to Polymarket market slugs/condition IDs
  - Cache results for 5 minutes (don't hit their API on every request)
  - Fallback to hardcoded odds if API is down
  
- **File:** `engine/api.py` — add `/api/events/live` endpoint
  - Returns events with live Polymarket odds
  - Frontend calls this on page load

- **File:** `frontend/lib/api.ts` — add `getLiveEvents()` function
- **File:** `frontend/app/sim/[ticker]/page.tsx` — use live odds to populate event cards
- **File:** `frontend/components/EventPanel.tsx` — show "Live from Polymarket" badge when odds are live

### Polymarket event mapping (initial):
```python
EVENT_POLYMARKET_MAP = {
    "iran_escalation": "will-iran-and-israel-engage-in-direct-military-conflict",
    "fed_rate_cut": "fed-funds-rate-cut-before-july-2026",
    "china_taiwan": "china-invade-taiwan-before-2027",
    "tariff_increase": "will-trump-impose-new-tariffs-2026",
    # ... map the rest
}
```

### Verify:
- [ ] `/api/events/live` returns events with live odds
- [ ] Event cards show "🟢 Live" badge when Polymarket data is fresh
- [ ] Falls back gracefully if Polymarket is down

---

## Task 5: Dynamic OG Meta Tags (Server-Side)

Next.js `generateMetadata` needs to work for the simulator page so social previews show the right image.

### Changes:
- Convert `frontend/app/sim/[ticker]/page.tsx` to have a server component wrapper
- Or create `frontend/app/sim/[ticker]/opengraph-image.tsx` using Next.js OG image generation
- Actually, simplest approach: use `generateMetadata` in a layout or page server component

```typescript
// frontend/app/sim/[ticker]/layout.tsx
export async function generateMetadata({ params }) {
  const ticker = params.ticker.toUpperCase();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
  const ogUrl = `${API_BASE}/api/og?ticker=${ticker}`;
  
  return {
    title: `${ticker} Event Simulator | AlphaEdge`,
    description: `Simulate how real-world events affect ${ticker} stock price`,
    openGraph: {
      title: `${ticker} Event Simulator | AlphaEdge`,
      description: `Monte Carlo simulation for ${ticker}`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${ticker} Event Simulator | AlphaEdge`,
      images: [ogUrl],
    },
  };
}
```

### Verify:
- [ ] View page source shows OG meta tags
- [ ] Twitter card validator shows correct preview
- [ ] Facebook debugger shows correct preview

---

## Non-Goals (for this milestone)
- User accounts / auth
- Stripe payments
- Community features
- Scenario saving to database
- Mobile optimization beyond what exists

## Architecture Notes
- Backend: Python/FastAPI on Railway
- Frontend: Next.js on Vercel  
- API URL env: `NEXT_PUBLIC_API_URL` (baked at build time)
- OG images generated server-side by Python backend (Pillow)
- Polymarket data cached in-memory with 5-min TTL
