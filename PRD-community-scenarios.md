# PRD: Community Scenario Marketplace

## Goal
Enable users to save, publish, browse, and fork simulation scenarios. This creates social proof, content, and the foundation for the community flywheel. Target: trending scenarios visible on first visit → "other people are doing this too" → social proof → engagement.

## Context
- No user accounts yet — Phase 1 uses anonymous/session-based saving
- Backend: Python FastAPI at `engine/` (Railway)
- Frontend: Next.js at `frontend/` (Vercel)
- Database: SQLite (zero cost, good enough for <10K scenarios)

## Requirements

### 1. Backend: Scenario Storage (SQLite)

Create `engine/scenarios.py`:
- SQLite database at `/data/scenarios.db` (Railway persistent volume) with fallback to `/tmp/scenarios.db`
- Schema:
  ```sql
  CREATE TABLE scenarios (
    id TEXT PRIMARY KEY,        -- nanoid, 10 chars
    ticker TEXT NOT NULL,
    title TEXT,                 -- user-provided or auto-generated
    description TEXT,           -- optional
    events JSON NOT NULL,       -- [{id, probability, duration, impact}]
    result_summary JSON,        -- {median30d, probProfit, eventImpact, currentPrice}
    author_name TEXT DEFAULT 'Anonymous',
    author_id TEXT,             -- session ID or future user ID
    views INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    forked_from TEXT,           -- id of parent scenario (if forked)
    tags TEXT                   -- comma-separated: "iran,oil,geopolitical"
  );
  CREATE INDEX idx_scenarios_ticker ON scenarios(ticker);
  CREATE INDEX idx_scenarios_views ON scenarios(views DESC);
  CREATE INDEX idx_scenarios_created ON scenarios(created_at DESC);
  ```

### 2. Backend: API Endpoints

**`POST /api/scenarios`** — Save a new scenario
```json
Request: {
  "ticker": "CVX",
  "title": "Iran War + Oil Disruption",
  "description": "What happens if Iran conflict escalates...",
  "events": [{"id": "iran_escalation", "probability": 86, "duration": 30, "impact": -15}],
  "result_summary": {"median30d": 206, "probProfit": 62, "eventImpact": 12.5, "currentPrice": 148},
  "author_name": "OilTrader",
  "is_public": true,
  "tags": "iran,oil,geopolitical"
}
Response: {"id": "abc123xyz", "url": "/s/abc123xyz"}
```

**`GET /api/scenarios/:id`** — Get a scenario (increments views)

**`GET /api/scenarios`** — List scenarios
- Query params: `?sort=trending|newest|views|forks&ticker=CVX&tag=iran&limit=20&offset=0`
- `trending` = views in last 24h (weighted by recency)

**`POST /api/scenarios/:id/fork`** — Fork a scenario
- Creates a copy with `forked_from` set to the parent ID
- Increments parent's `forks` counter
- Returns the new scenario

**`POST /api/scenarios/:id/like`** — Like a scenario (idempotent per session)

**`GET /api/scenarios/stats`** — Global stats for social proof
```json
{"total_scenarios": 1247, "total_simulations_today": 3420, "trending_tickers": ["CVX", "NVDA", "TSLA"]}
```

### 3. Frontend: Save Scenario Flow

After running a simulation, the "Save Scenario" button opens a modal:
- Title (auto-suggested: "{ticker} + {event names}")
- Description (optional)
- Author name (saved in localStorage for next time)
- Tags (auto-suggested from event categories)
- Toggle: Public / Private
- "Save & Publish" button

After saving: show the shareable URL and copy button.

### 4. Frontend: Scenario Gallery Page (`/explore`)

New page accessible from the navbar:
- **Trending** tab (default): scenarios sorted by views in last 24h
- **Newest** tab: most recently published
- **By Ticker** filter: dropdown or tabs for popular tickers
- **Search** by title/description

Each scenario card shows:
- Ticker + title
- Author name
- Key stats: median target, prob profit, event count
- Views, forks, likes counts
- Event badges (emoji + name)
- "Fork" and "Like" buttons
- Click → opens the scenario in the simulator with pre-loaded events

### 5. Frontend: Scenario View (`/s/:id`)

Shareable URL that:
- Loads the scenario's ticker and events into the simulator
- Shows the author info and scenario metadata above the chart
- Has "Fork This Scenario" button (creates a copy you can edit)
- Has social sharing buttons (same as Pine Script: X, Reddit, Copy Link)

### 6. Homepage Upgrade (`/`)

Replace the current static homepage with:
- Hero section: "What would happen to [STOCK] if [EVENT]?" with a mini-demo
- **Trending Scenarios** section: top 6 scenarios by 24h views
- **Social proof counter**: "3,420 simulations run today · 1,247 scenarios published"
- **Popular tickers**: CVX, NVDA, TSLA, SPY, AAPL with one-click links
- CTA: "Try it now — no signup required"

### 7. Social Proof Counters

Add a simulation counter to the backend:
- Increment on every POST /api/simulate call
- Store in SQLite: `CREATE TABLE stats (key TEXT PRIMARY KEY, value INTEGER);`
- Show on homepage and scenario cards

## Tasks
- [ ] Create `engine/scenarios.py` — SQLite models + CRUD operations
- [ ] Create `engine/db.py` — Database initialization and connection helper
- [ ] Add scenario API endpoints to `engine/api.py`
- [ ] Add simulation counter to POST /api/simulate
- [ ] Add `GET /api/scenarios/stats` endpoint
- [ ] Create `frontend/app/explore/page.tsx` — Scenario gallery
- [ ] Create `frontend/app/s/[id]/page.tsx` — Shareable scenario view
- [ ] Create `frontend/components/ScenarioCard.tsx` — Scenario preview card
- [ ] Create `frontend/components/SaveScenarioModal.tsx` — Save flow
- [ ] Update `frontend/app/sim/[ticker]/page.tsx` — Add "Save Scenario" button that opens modal
- [ ] Update `frontend/app/page.tsx` — Homepage with trending + social proof
- [ ] Update `frontend/components/Navbar.tsx` — Add "Explore" link
- [ ] Add aiosqlite to engine/requirements.txt (or use sqlite3 sync)
- [ ] Seed 10-15 example scenarios on first deploy
- [ ] Commit and deploy

## Non-Goals (Phase 1)
- No user authentication (session-based only)
- No comments/discussion
- No accuracy tracking
- No earn-up points
- No leaderboard

## Technical Notes
- Use Python's built-in `sqlite3` module (no extra deps needed)
- For Railway: SQLite file goes in /data/ if persistent volume exists, else /tmp/
- Scenario IDs: use nanoid (8 chars, URL-safe)
- Auto-generate scenario titles if user doesn't provide one: "{ticker} {event1} + {event2}"
- Seed scenarios should cover popular tickers: CVX, NVDA, TSLA, SPY, AAPL, XOM, LMT
