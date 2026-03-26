# PRD: Layer 3 — Community & Engagement Engine

## Goal
Transform AlphaEdge from a tool into a sticky community product. Auth, social sharing with OG images, accuracy tracking, earn-up points, streaks, and leaderboard. This is the layer that makes users RETURN daily and SHARE naturally.

## Priority Order (ship incrementally)
1. **Auth + User Accounts** — foundation for everything else
2. **Social Sharing with OG Images** — highest ROI growth lever (every share = free ad)
3. **Accuracy Tracking** — the "was I right?" hook that brings users back in 30 days
4. **Earn-Up Points + Streaks** — daily engagement loop
5. **Leaderboard** — competitive motivation
6. **Comments** — can defer, lowest priority

## Context
- Backend: Python FastAPI at `engine/` (Railway), SQLite
- Frontend: Next.js 14 at `frontend/` (Vercel)
- No auth currently — scenarios are anonymous
- 8 scenarios already saved, stats endpoint working
- Railway budget constrained (~$4.88)

---

## Phase 3.1: Auth + User Accounts

### Backend: `engine/auth.py`

Use **session-based auth with email magic links** (zero cost, no OAuth setup needed).

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,            -- nanoid
    email TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,                 -- gravatar by default
    points INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    streak_last_date TEXT,          -- YYYY-MM-DD
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    token TEXT PRIMARY KEY,         -- secure random token
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE magic_links (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE
);
```

**API Endpoints:**
- `POST /api/auth/magic-link` — send magic link to email `{email}`
- `GET /api/auth/verify?token=xxx` — verify magic link, create session, return session token
- `GET /api/auth/me` — get current user (from session token in cookie/header)
- `POST /api/auth/logout` — invalidate session
- `PUT /api/auth/profile` — update display name, avatar

**Email:** Use Resend.com free tier (100 emails/day, $0). Or fallback: skip email entirely and use "display name + localStorage session" for MVP (upgrade to email later).

**MVP Shortcut:** For launch speed, skip email verification. Just `POST /api/auth/register {display_name}` → returns session token. No email needed. Users pick a name and start. Add email later for account recovery.

### Frontend: Auth UI
- Login/register modal (triggered by Save, Like, or Leaderboard actions)
- "Pick a display name" → instant account creation
- Session token stored in localStorage + sent as `Authorization: Bearer xxx` header
- Navbar shows user avatar + name when logged in
- Update `SaveScenarioModal` to attach `author_id` and `author_name` from session

### Migration
- Existing 8 anonymous scenarios remain as `author_name: "Anonymous"`
- New scenarios get real author attribution

---

## Phase 3.2: Social Sharing with OG Images

### Backend: `engine/og.py`

Generate Open Graph images server-side for link previews on Twitter/Reddit/Discord.

**Endpoint:** `GET /api/og/:scenario_id` → returns PNG image (1200x630)

**Image contents:**
- AlphaEdge logo + brand bar at top
- Stock ticker + current price
- Mini chart showing projection line (median)
- Event names listed
- Target price + % change (green/red)
- "Simulate this scenario at alphaedge.io" CTA

**Implementation:** Use `pillow` (Python) to render the image server-side. No headless browser needed.

### Frontend: Share Flow
- Share button on scenario page → copies URL with OG metadata
- `<meta property="og:image" content="https://alphaedge-api.../api/og/abc123" />`
- Share to Twitter: pre-filled tweet "I simulated [TICKER] with [EVENT] on AlphaEdge — [+X%/-X%] projected. What do you think?"
- Share to Reddit: link post
- Copy link button

### Scenario Page Meta Tags
- Update `frontend/app/s/[id]/page.tsx` to include dynamic OG tags
- Use Next.js `generateMetadata` for server-side meta tag injection

---

## Phase 3.3: Accuracy Tracking

### Backend: `engine/accuracy.py`

Track scenario predictions vs actual outcomes.

```sql
ALTER TABLE scenarios ADD COLUMN
    prediction_price REAL,          -- predicted median price at horizon end
    prediction_date TEXT,           -- when the prediction matures (created_at + horizon_days)
    actual_price REAL,              -- filled in when prediction_date arrives
    accuracy_score REAL;            -- 0-100, filled when actual_price is set
```

**Accuracy formula:** `100 - abs((actual - predicted) / predicted * 100)` capped at 0-100.

**Cron job (daily):** Check scenarios where `prediction_date <= today` and `actual_price IS NULL`. Fetch actual price from Yahoo Finance API. Calculate accuracy. Update record.

**API Endpoints:**
- `GET /api/accuracy/leaderboard` — top users by average accuracy
- `GET /api/accuracy/user/:id` — user's accuracy history
- `GET /api/scenarios/:id/accuracy` — single scenario accuracy (or "pending" if not matured)

### Frontend: Accuracy UI
- On scenario card: "Accuracy: 94%" badge (green) or "Pending — matures Mar 30" (gray)
- User profile page: accuracy chart over time
- "My Predictions" tab showing all saved scenarios with accuracy status

---

## Phase 3.4: Earn-Up Points + Streaks

### Backend: Points System

```sql
CREATE TABLE point_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,           -- 'simulate', 'save', 'share', 'refer', 'streak', 'accurate'
    points INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Point Values:**
| Action | Points | Daily Limit |
|--------|--------|-------------|
| Run simulation | 5 | 50 (10 sims) |
| Save scenario | 10 | 30 (3 saves) |
| Share scenario | 25 | 100 (4 shares) |
| Fork a scenario | 10 | 30 |
| Accuracy >80% | 50 | None |
| Daily login streak | 15×streak_days | None |
| Referral signup | 200 | None |

**Streak Logic:**
- Track `streak_last_date` on user record
- If user is active today and `streak_last_date == yesterday` → increment streak
- If `streak_last_date < yesterday` → reset streak to 1
- Streak bonus: `15 × min(streak_days, 30)` points per day (caps at 450/day)

**Redemptions:**
- 500 points = 1 Pro day (unlock all features for 24h)
- 2000 points = 1 Pro week
- Points displayed in navbar

### Frontend: Points UI
- Points counter in navbar (animated increment on earn)
- Toast notifications: "🎉 +25 points for sharing!"
- Streak flame icon: "🔥 5 day streak"
- Points history page
- "Redeem Pro Day" button in settings

---

## Phase 3.5: Leaderboard

### Backend
- `GET /api/leaderboard?period=week|month|all&metric=accuracy|points|scenarios`
- Returns top 50 users with rank, display_name, avatar, score
- Weekly leaderboard resets Monday 00:00 UTC

### Frontend: Leaderboard Page (`/leaderboard`)
- Tab selector: This Week / This Month / All Time
- Metric selector: Best Accuracy / Most Points / Most Scenarios
- Top 3 highlighted with gold/silver/bronze
- Current user's rank shown at bottom ("You are #847")
- Free users see rank but position is blurred until they earn enough points or upgrade

---

## Technical Notes

### Dependencies to Add
- Backend: `pillow` (OG image generation), `resend` (email, optional)
- Frontend: none (all UI with existing Tailwind)

### Database Migrations
- Run via Python script on startup (check if columns/tables exist before creating)

### Railway Budget
- SQLite = $0 storage cost
- OG image generation is CPU-bound but cached (generate once per scenario)
- Total additional cost: ~$0 (within existing Railway plan)

### Build Order
Each phase ships independently. Don't block Phase 3.2 on 3.1 — sharing can work without auth (anonymous shares are fine).

**Recommended parallel tracks:**
- Track A: Auth (3.1) → Points (3.4) → Leaderboard (3.5)
- Track B: OG Images (3.2) → Accuracy (3.3)

Both tracks can be built simultaneously.
