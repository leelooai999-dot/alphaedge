# PRD: Whale Flow Module — MonteCarloo

## Overview
Add a Whale Options Flow module to montecarloo.com that surfaces all options contracts with estimated premium > $500K, integrates directly with the Monte Carlo simulator via drag-and-drop, and provides AI-powered market analysis for each trade.

## Architecture

### Backend (Python/FastAPI — existing Hetzner stack)

#### 1. `engine/whale_flow.py` — Scanner
- Cron every 15 min during market hours (9:30 AM - 4:00 PM ET, Mon-Fri)
- Scans ~200 most liquid US tickers via yfinance
- For each ticker: pull all expiration dates within 60 days, fetch full option chains
- Filter: estimated_premium = volume × lastPrice × 100 > $500,000
- Detect trade direction via bid/ask proximity:
  - price >= (bid + ask) / 2 → BUY side (bullish for calls, bearish for puts)
  - price < (bid + ask) / 2 → SELL side
- Detect position type via volume/OI ratio:
  - volume > 2× OI → likely new position (high conviction)
  - volume ≈ OI → likely closing
- Multi-leg detection: if same ticker has matching call+put within 5% strike range and same expiry → flag as spread/straddle
- Store in SQLite table `whale_trades` with fields:
  - id, ticker, strike, expiry, option_type (call/put), direction (buy/sell),
  - volume, open_interest, last_price, bid, ask, estimated_premium,
  - iv, volume_oi_ratio, position_type (opening/closing),
  - is_multileg, multileg_group_id, bullish_bearish (bullish/bearish/neutral),
  - scanned_at (timestamp), analysis_cache (text, nullable)
- Dedup: unique on (ticker, strike, expiry, option_type, scan_date) — update volume/premium on re-scan

#### 2. `engine/whale_analysis.py` — AI Reasoning
- On-demand (called when user clicks detail view, cached 4 hours)
- Uses existing LLM router (Claude → OpenAI fallback)
- Prompt template generates analysis covering:
  - Why this trade matters (size context relative to ticker's avg volume)
  - Upcoming catalysts (earnings, Fed dates, sector events)
  - Historical context (has smart money been right on this ticker?)
  - Risk factors
- Cache in `whale_trades.analysis_cache` column
- ~50-100 LLM calls/day at peak, cost: ~$0.10-0.50/day

#### 3. `engine/whale_signal.py` — Simulation Integration
- Whale Consensus Score per ticker: aggregate all >$500K trades from current session
  - Score = Σ(premium × direction_sign × conviction_weight) / market_cap × scaling_factor
  - direction_sign: +1 bullish, -1 bearish
  - conviction_weight: 1.0 for new positions, 0.5 for closing positions
  - Normalized to -10 to +10 scale
- Drift modifier for Monte Carlo:
  - drift_adjustment = consensus_score × 0.001 (calibrated so +10 score ≈ +1% drift)
  - Applied additively to base drift in simulation.py
- Function: `apply_whale_trades(sim_params, trade_ids)` → returns modified drift + vol params
- Function: `get_consensus(ticker)` → returns score, trade_count, net_premium, direction

#### 4. API Endpoints (add to `engine/api.py`)
- `GET /api/flow` — paginated whale feed
  - Query params: ticker, direction (bullish/bearish/all), min_premium, option_type (call/put/all), page, limit
  - Returns: list of whale trade objects, sorted by estimated_premium desc
  - Cache: 60s TTL
- `GET /api/flow/{trade_id}` — single trade detail + AI analysis
  - Triggers analysis generation if not cached
  - Returns: full trade object + analysis text
- `GET /api/flow/consensus/{ticker}` — whale consensus score
  - Returns: score (-10 to +10), trade_count, net_premium_bullish, net_premium_bearish
- `POST /api/sim/apply-whale` — apply whale trades to simulation
  - Body: { ticker, trade_ids: [...], sim_params: {...} }
  - Returns: modified simulation with whale-adjusted drift
- `GET /api/flow/stats` — aggregate stats (total premium today, top tickers, sector breakdown)

### Frontend (Next.js — existing Vercel stack)

#### 1. `/flow` page — Full Whale Flow Feed
- Dark theme, scrolling card feed
- Each card shows: ticker badge, strike/expiry, CALL/PUT pill, premium ($X.XM), direction arrow (↑↓), volume, conviction indicator
- Color: green border/glow for bullish, red for bearish, gray for neutral/spread
- Filters bar: ticker search, direction toggle, min premium slider, call/put toggle
- Auto-refresh every 60s during market hours
- Click card → expand to detail view (drawer/modal)
- Cards are draggable (HTML5 Drag API, data-transfer carries trade_id)

#### 2. Whale Sidebar on `/sim/[ticker]` page
- Collapsible right sidebar showing whale trades filtered to current ticker
- Same card format as /flow but compact
- Drag cards onto the chart area → adds whale trade to simulation
- Applied trades show as removable chips below chart: "🐋 $140C $2.3M ×"
- "Apply Whale Consensus" one-click button at top of sidebar
- Whale Consensus badge: "🐋 Score: +7.2 (12 trades)"

#### 3. Detail Drawer (shared component)
- Opens on click from either /flow or sidebar
- Shows full trade anatomy: all fields from backend
- AI analysis section with loading spinner
- "Quick Sim" button → navigates to /sim/[ticker] with this trade pre-applied
- "Add to Simulation" button (if viewing from /flow page)

#### 4. Chart Integration
- Drop zone overlay appears when dragging a whale card over chart
- On drop: calls POST /api/sim/apply-whale with current sim params + new trade
- Re-renders Monte Carlo paths with adjusted drift
- Shows whale impact: "Drift adjusted +0.3% from whale signals"

### Ticker Watchlist (scanner targets)
Top 200 by options volume: SPY, QQQ, AAPL, NVDA, TSLA, AMZN, META, MSFT, GOOG, AMD, etc.
Store as `engine/whale_tickers.json` — editable, auto-expand if user searches unlisted ticker.

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS whale_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    strike REAL NOT NULL,
    expiry TEXT NOT NULL,
    option_type TEXT NOT NULL,  -- 'call' or 'put'
    direction TEXT NOT NULL,    -- 'buy' or 'sell'
    bullish_bearish TEXT NOT NULL,  -- 'bullish', 'bearish', 'neutral'
    volume INTEGER NOT NULL,
    open_interest INTEGER NOT NULL,
    last_price REAL NOT NULL,
    bid REAL NOT NULL,
    ask REAL NOT NULL,
    estimated_premium REAL NOT NULL,
    iv REAL,
    volume_oi_ratio REAL,
    position_type TEXT,  -- 'opening' or 'closing'
    is_multileg BOOLEAN DEFAULT FALSE,
    multileg_group_id TEXT,
    analysis_cache TEXT,
    analysis_cached_at TEXT,
    scanned_at TEXT NOT NULL,
    scan_date TEXT NOT NULL,  -- YYYY-MM-DD for dedup
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, strike, expiry, option_type, scan_date)
);

CREATE INDEX idx_whale_ticker ON whale_trades(ticker);
CREATE INDEX idx_whale_premium ON whale_trades(estimated_premium DESC);
CREATE INDEX idx_whale_date ON whale_trades(scan_date);
CREATE INDEX idx_whale_direction ON whale_trades(bullish_bearish);
```

### Cron Setup
- `whale_scanner.py` — runs every 15 min, market hours only
- Triggered via system cron or OpenClaw cron
- Logs to `/tmp/whale-scanner.log`
- On first run each day: full scan of all 200 tickers (~200 yfinance calls, ~3 min)
- Subsequent runs: only scan top 50 most active + any ticker with prior whale activity today

## Build Order
1. Backend: whale_flow.py (scanner + DB) — test with 10 tickers first
2. Backend: API endpoints in api.py
3. Backend: whale_signal.py (consensus + drift modifier)
4. Frontend: /flow page with cards
5. Frontend: whale sidebar on /sim/[ticker]
6. Frontend: drag-and-drop + chart integration
7. Backend: whale_analysis.py (AI reasoning)
8. Testing + deploy

## Success Criteria
- Scanner finds 20-100+ whale trades per market day
- Page loads in <1s (cached feed)
- AI analysis generates in <5s
- Drag-to-simulate feels instant (drift recalc is <100ms)
- Zero additional API costs for data
