# AlphaEdge v6 — The Social Simulation Network
## "Twitter for Stock Simulations"

**Date:** March 26, 2026  
**Status:** Strategic Proposal (CEO Review)  
**Previous:** v5 (Temporal Simulation Platform — temporal engine built, auth + feedback backend done)  
**This version:** Social engagement layer, ClawMart distribution, engagement-scored leaderboard

---

## SHOPCLAWMART ANALYSIS (CEO Competitive Intelligence)

### What ClawMart Is

**ShopClawMart.com** is a marketplace for AI agent skills and personas — "The App Store for AI Assistants." Key observations:

| Feature | Details | Relevance to AlphaEdge |
|---------|---------|----------------------|
| **Marketplace** | Sell skills ($5-$99), personas, bundles | We could sell AlphaEdge as a ClawMart skill/persona |
| **Categories** | Finance, Engineering, Marketing, etc. | Finance category exists — natural fit |
| **Creator Economy** | Featured creators, profiles, followers | AlphaEdge power users → ClawMart creators |
| **Clawsourcing** | Managed AI employees ($2K setup + $500/mo) | AlphaEdge could be a Clawsourced product for advisors |
| **Daily Newsletter** | "One AI agent tip every morning" (16 issues) | Distribution channel for AlphaEdge scenarios |
| **Audit** | AI opportunity assessment ($20) | Integrate AlphaEdge simulation into audit reports |
| **2,039 products** | Active marketplace with real transactions | Established distribution, real buyers |
| **Pricing model** | One-time purchases ($5-$99) | Low friction, impulse-buy territory |
| **"Subscribe Your Claw"** | Agents can subscribe to newsletters | Machine-readable distribution |

### Strategic Opportunities with ClawMart

| Opportunity | Description | Revenue Impact | Effort |
|------------|-------------|:-------------:|:------:|
| **A. Sell AlphaEdge as a ClawMart Skill** | Package the simulation engine as a $29-$99 skill that any OpenClaw agent can use | Distribution to 2,039+ marketplace users | Low |
| **B. AlphaEdge Persona** | "Financial Analyst" persona that uses AlphaEdge API — runs scenarios, posts analysis | $99 one-time → funnels to $49/mo Pro | Low |
| **C. Content Partnership** | Weekly "Scenario of the Week" in ClawMart Daily newsletter | Free distribution to subscriber base | Low |
| **D. Clawsourcing Product** | Offer managed AlphaEdge as a Clawsourced service for financial advisors | $2K setup + $500/mo recurring per client | Medium |
| **E. Cross-Promote Creators** | Top AlphaEdge scenario creators get featured on ClawMart | Bidirectional traffic + credibility | Low |
| **F. API Integration** | ClawMart agents can call AlphaEdge API for real-time scenarios | Per-call revenue ($0.01-0.10/sim) | Medium |

### Recommended ClawMart Strategy

**Phase 1 (Week 1): Publish a free AlphaEdge Skill on ClawMart**
- Package: scenario simulation CLI + API key
- Price: FREE (leads funnel to alphaedge.io for Pro features)
- Category: Finance Skills
- Every install = user acquisition at $0 CAC

**Phase 2 (Week 2): Launch "AlphaEdge Analyst" Persona ($99)**
- Full financial analyst persona that uses AlphaEdge
- Runs daily market scenarios, posts analysis
- Includes SOUL.md, TOOLS.md, event monitoring cron
- Buyers become long-term Pro subscribers

**Phase 3 (Month 2): Clawsourcing partnership**
- Offer managed AlphaEdge as a Clawsourced product
- Target: financial advisors who want "AI scenario analyst"
- $2K setup + $500/mo = high-value recurring

---

## THE SOCIAL SIMULATION NETWORK

### Vision: Twitter for Stock Simulations

The core insight: **simulations are opinions about the future**. Opinions are inherently social. People want to share them, debate them, and prove they're right.

Twitter made text opinions viral. TikTok made video opinions viral. **AlphaEdge makes financial scenario opinions viral** — backed by math instead of hot takes.

### What Makes a Simulation Social?

```
TRADITIONAL STOCK OPINION (Twitter):
"NVDA going to $200 because AI is the future 🚀"
  → No evidence, no timeframe, no accountability

ALPHAEDGE SIMULATION (Social):
"NVDA: If chip export controls hit (70% odds) + earnings beat (85% prob)
 by May 28, Monte Carlo shows $142 median with 38% drawdown risk.
 67% chance above current price."
  → Evidence-backed, time-bound, trackable, verifiable

When this simulation is shared:
  → Others can FORK it and adjust parameters
  → Others can COMMENT with their own analysis
  → Others can LIKE to signal agreement
  → 30 days later: accuracy score reveals who was right
  → The LEADERBOARD ranks the best predictors
```

### Social Features Spec

#### 1. Simulation Feed (The Timeline)

```
┌─────────────────────────────────────────────────┐
│ 🏠 Home    🔥 Trending    👥 Following    🎯 For You │
├─────────────────────────────────────────────────┤
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ @oilTrader · 2h                     🔥 847   │ │
│ │                                               │ │
│ │ CVX: Iran escalation + oil disruption         │ │
│ │ [📊 Mini chart preview]                       │ │
│ │ Median: $162 (+9.4%) · Prob profit: 73%       │ │
│ │ Events: 🛢️ Iran (67%) + ⛽ Oil cut 10%        │ │
│ │                                               │ │
│ │ 💬 23   🔄 12   ❤️ 89   📊 847              │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ @chipAnalyst · 5h                   🎯 94%    │ │
│ │                                               │ │
│ │ NVDA: Earnings beat scenario (May 28)         │ │
│ │ [📊 Mini chart preview with temporal kink]    │ │
│ │ Median: $148 (+12%) · Drawdown risk: $98      │ │
│ │ Events: 📊 Earnings (99% jump) + 🏛️ FOMC    │ │
│ │                                               │ │
│ │ "Added temporal engine — the kink at          │ │
│ │  earnings date changes everything"            │ │
│ │                                               │ │
│ │ 💬 45   🔄 31   ❤️ 156  📊 2.1K             │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ @macro_mike · 8h                    📊 1.2K   │ │
│ │                                               │ │
│ │ SPY: Fed cuts 50bps on June 17                │ │
│ │ → Forked from @fed_watcher's scenario         │ │
│ │ "I think 50bps is more likely than 25.        │ │
│ │  My version shows +2.3% more upside"          │ │
│ │                                               │ │
│ │ 💬 67   🔄 24   ❤️ 203  📊 3.4K             │ │
│ └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### 2. Simulation Cards (The Tweet Equivalent)

Each simulation becomes a shareable card containing:
- Author + avatar + accuracy badge
- Ticker + events + probability
- Mini chart preview (with temporal kinks visible)
- Key stats: median target, prob profit, drawdown
- Optional text commentary (280 chars, like Twitter)
- Engagement metrics: comments, forks, likes, views

#### 3. Comments / Discussion Thread

```
┌─────────────────────────────────────────────────┐
│ @oilTrader's CVX Scenario                       │
│ ────────────────────────────────────────────     │
│                                                  │
│ @energy_bull · 1h                                │
│ Great analysis but you're underweighting the     │
│ OPEC response. They'd cut production to          │
│ compensate. I forked with supply_cut at 15%.     │
│ [View my fork →]                                 │
│ ↑ 12  💬 3                                      │
│                                                  │
│ @contrarian_carl · 45m                           │
│ Everyone's bullish on CVX for Iran but the       │
│ market already priced this in weeks ago.         │
│ Look at the IV — it's elevated. The move is      │
│ already in the options chain.                    │
│ ↑ 8   💬 1                                      │
│                                                  │
│ @oilTrader · 30m (author)                        │
│ @contrarian_carl fair point on IV. Updated       │
│ severity from 7→5 to account for pricing.        │
│ Still shows +6.2% median though.                 │
│ ↑ 15  💬 0                                      │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ Add a comment...                              │ │
│ └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### 4. Fork & Remix

Like "Quote Tweet" but for simulations:
- One-click fork copies all events + parameters
- User modifies parameters and adds commentary: "I think severity is higher"
- Fork links back to original + shows diff
- Forks count toward original's engagement score

---

## ENGAGEMENT-SCORED LEADERBOARD

### The X/Twitter-Style Scoring System

Twitter's algorithm surfaces content based on engagement signals. AlphaEdge does the same, but with an additional dimension: **accuracy**.

### Engagement Score Formula

```
SIMULATION_SCORE = (
    comments × 3.0          # Discussion = highest signal (like replies on X)
  + forks × 2.5             # Someone invested effort to build on your idea
  + likes × 1.0             # Passive agreement
  + views × 0.01            # Impressions matter but less than engagement
  + shares × 2.0            # External distribution
  + accuracy_bonus          # 0-100 points based on prediction accuracy
) × recency_decay           # Newer content gets boosted
  × author_credibility      # Track record multiplier
```

### Why Comments Are King

On Twitter, the most viral tweets spark **discussion**. A tweet with 10K likes but 5 comments is a billboard. A tweet with 500 likes and 200 comments is a **conversation**.

AlphaEdge applies the same principle: **simulations that spark debate rank higher than those that just get likes.**

| Signal | Weight | Reasoning |
|--------|:------:|-----------|
| **Comments** | 3.0x | Discussion = real engagement. If people debate your scenario, it's interesting. |
| **Forks** | 2.5x | Someone built on your work. Highest-effort engagement. |
| **Shares** | 2.0x | External distribution = growth driver |
| **Likes** | 1.0x | Easy, passive. Signals agreement but low effort. |
| **Views** | 0.01x | Just impressions. Needed for normalization but not a quality signal. |
| **Accuracy Bonus** | 0-100 | Time-locked: unlocks 30 days after scenario creation. Rewards being right. |

### Recency Decay

```python
def recency_decay(hours_since_post: float) -> float:
    """Twitter-like half-life decay. Content is fresh for ~24h, then fades."""
    if hours_since_post < 1:
        return 1.5  # Boost brand new content
    elif hours_since_post < 6:
        return 1.2  # Still fresh
    elif hours_since_post < 24:
        return 1.0  # Normal
    elif hours_since_post < 72:
        return 0.7  # Fading
    else:
        return 0.5 ** (hours_since_post / 168)  # 1-week half-life
```

### Author Credibility Score

Like Twitter's "blue check" but earned through accuracy:

```python
def author_credibility(user) -> float:
    """Multiplier based on track record."""
    accuracy = user.avg_accuracy_score  # 0-100
    total_scenarios = user.total_scenarios
    
    if total_scenarios < 5:
        return 1.0  # Not enough data
    
    if accuracy >= 85:
        return 1.5  # "Oracle" tier — their simulations are consistently right
    elif accuracy >= 70:
        return 1.2  # "Sharp" tier
    elif accuracy >= 50:
        return 1.0  # Average
    else:
        return 0.8  # Below average — downweight their content
```

### Leaderboard Tiers

```
┌─────────────────────────────────────────────────┐
│ 🏆 LEADERBOARD                                  │
│                                                  │
│ This Week    This Month    All Time    By Ticker │
├─────────────────────────────────────────────────┤
│                                                  │
│ 🥇 @chipAnalyst          12,450 pts  🎯 92%     │
│    5 scenarios · 2.1K forks · 15.3K views        │
│    Best: NVDA earnings +12% call (94% accurate)  │
│                                                  │
│ 🥈 @oilTrader             9,820 pts  🎯 87%     │
│    8 scenarios · 1.4K forks · 11.2K views        │
│    Best: CVX Iran scenario (89% accurate)        │
│                                                  │
│ 🥉 @macro_mike            7,340 pts  🎯 78%     │
│    12 scenarios · 890 forks · 8.9K views         │
│    Best: SPY Fed cut scenario (81% accurate)     │
│                                                  │
│  4. @fed_watcher           6,110 pts  🎯 83%    │
│  5. @tech_futures          5,890 pts  🎯 76%    │
│  6. @contrarian_carl       4,560 pts  🎯 71%    │
│  ...                                            │
│                                                  │
│ ── YOUR RANK ──                                  │
│ #847 @you                  230 pts   🎯 --       │
│ 2 scenarios · 12 forks · 340 views               │
│ Next tier: 270 pts more for Top 500             │
└─────────────────────────────────────────────────┘
```

### Badges (Earned, Not Bought)

| Badge | Criteria | Effect |
|-------|----------|--------|
| 🎯 **Oracle** | 85%+ accuracy over 10+ scenarios | Gold ring around avatar, 1.5x credibility |
| 🔮 **Sharp Predictor** | 70%+ accuracy over 5+ scenarios | Silver ring, 1.2x credibility |
| 🔥 **Trending Creator** | 3+ scenarios hit Trending in 30 days | Fire badge, content boosted |
| 🌊 **Wave Maker** | Single scenario gets 100+ comments | Discussion badge |
| 🍴 **Most Forked** | Single scenario gets 50+ forks | Innovation badge |
| 📢 **Influencer** | Referred 10+ users who signed up | Growth badge, +500 points |
| 🗓️ **30-Day Streak** | Active 30 consecutive days | Streak badge, permanent |
| 🏆 **Top 10** | Ranked Top 10 any given week | Weekly champion badge |

---

## POINTS & REWARDS SYSTEM

### How Users Earn Points

| Action | Points | Daily Cap | Purpose |
|--------|:------:|:---------:|---------|
| Run a simulation | 1 | 20 | Basic engagement |
| Save a scenario | 5 | 50 | Content creation |
| Get a comment on your scenario | 3 | None | Reward discussion generators |
| Get a fork of your scenario | 5 | None | Reward innovation |
| Get a like on your scenario | 1 | None | Passive approval |
| Comment on someone's scenario | 2 | 20 | Reward participation |
| Fork and modify a scenario | 3 | 10 | Reward remix culture |
| Share to external (X, Reddit, etc.) | 10 | 30 | Growth driver |
| Refer a user (they sign up) | 50 | None | Viral growth |
| Referred user upgrades to Pro | 200 | None | Revenue-aligned |
| Daily login streak (per day) | 2 | 2 | Retention |
| Accuracy score >85% (per scenario) | 25 | None | Reward being right |
| Accuracy score >95% (per scenario) | 100 | None | Reward exceptional insight |

### What Points Unlock

| Reward | Points Cost | What It Does |
|--------|:-----------:|-------------|
| 1 Pro Day | 100 pts | Full Pro features for 24h |
| 7 Pro Days | 500 pts | Full Pro features for 1 week |
| Extra scenario slot (+5) | 200 pts | Permanent save slot increase |
| Custom display name color | 300 pts | Profile customization |
| "Early Access" badge | 1000 pts | Access new features early |
| 1 Month Pro | 2000 pts | Full Pro for 30 days |
| Permanent "Founding Member" badge | 5000 pts | One-time — first 1000 users only |

### Anti-Gaming Rules

- Self-comments don't count toward engagement score
- Alt account detection: same IP + session patterns = flagged
- Comment spam detection: >5 comments in 1 minute = throttled
- Like farming: bulk likes from new accounts are discounted
- View count: unique sessions only, no refresh farming

---

## EXTENDED CHART RANGE (IMPLEMENTED)

### What Changed (Already Built)

The chart range has been extended from max 3 months to **6 months and 1 year**:

| Range | Label | Days | Sim Paths | Response Time |
|-------|:-----:|:----:|:---------:|:------------:|
| 1W | 1W | 7 | 5,000 | <100ms |
| 2W | 2W | 15 | 5,000 | <100ms |
| 1M | 1M | 30 | 5,000 | <150ms |
| 2M | 2M | 60 | 5,000 | <200ms |
| 3M | 3M | 90 | 5,000 | <250ms |
| **6M** | **6M** | **180** | **2,000** | **<300ms** |
| **1Y** | **1Y** | **365** | **1,000** | **<400ms** |

**Performance strategy:** Adaptive simulation scaling — fewer paths for longer horizons. The statistical accuracy difference between 1000 and 5000 paths at 365 days is <2% for median/percentile calculations, but response time drops 5x.

### Why This Matters for v6

Longer horizons mean:
- Users can simulate elections (Nov 2026), Fed cycles (multi-meeting), regulatory timelines
- Accuracy tracking over 6-12 months creates deep engagement hooks
- Financial advisors need quarterly/annual outlook simulations
- More temporal events fit in one chart = richer scenarios

---

## FEED ALGORITHM: "FOR YOU" PAGE

### How Content Gets Ranked

Like Twitter's "For You" tab, we use a multi-signal ranking:

```python
def rank_for_feed(scenario, viewer) -> float:
    """Rank a scenario for a specific viewer's feed."""
    
    # Base engagement score
    base = scenario.engagement_score  # The weighted formula above
    
    # Personalization signals
    ticker_affinity = viewer.ticker_interests.get(scenario.ticker, 0)  # 0-1
    event_affinity = sum(
        viewer.event_interests.get(e, 0) for e in scenario.events
    ) / max(len(scenario.events), 1)
    
    # Social signals
    follows_author = 1.3 if scenario.author in viewer.following else 1.0
    mutual_engagement = 1.2 if viewer.has_interacted_with(scenario.author) else 1.0
    
    # Diversity penalty (don't show 5 CVX scenarios in a row)
    ticker_fatigue = 0.8 if viewer.recent_feed_tickers.count(scenario.ticker) > 2 else 1.0
    
    # Freshness
    hours_old = (now - scenario.created_at).total_seconds() / 3600
    fresh = recency_decay(hours_old)
    
    return (
        base 
        * (1 + 0.3 * ticker_affinity + 0.2 * event_affinity)
        * follows_author
        * mutual_engagement
        * ticker_fatigue
        * fresh
    )
```

### Feed Types

| Feed | What It Shows | Algorithm |
|------|-------------|-----------|
| **Home** | Everything from people you follow | Chronological + boost high engagement |
| **Trending** | Fastest-rising scenarios right now | Engagement velocity (engagement / hours_since_post) |
| **Following** | Only from accounts you follow | Pure chronological |
| **For You** | Personalized mix | Full ranking algorithm above |
| **By Ticker** | Filter: show only $CVX, $NVDA, etc. | Engagement score within ticker |

---

## SHARING & VIRALITY ENGINE

### One-Click Share to External Platforms

When user clicks "Share":
1. Generate OG image: mini chart + stats + AlphaEdge branding
2. Copy share text:
   ```
   My $CVX simulation: Iran escalation + oil disruption
   📊 Median target: $162 (+9.4%)
   🎯 Prob profit: 73%
   
   See it live → alphaedge.io/s/abc123
   
   Made with @AlphaEdge
   ```
3. Platform buttons: X/Twitter, Reddit, LinkedIn, Copy Link
4. Auto-watermark on image: "alphaedge.io" + scenario ID

### Viral Growth Mechanics

| Mechanic | How It Works | K-Factor Boost |
|----------|-------------|:--------------:|
| **Fork chain** | User A creates → B forks → C forks B's → shows chain | +0.15 |
| **Accuracy reveal** | "My prediction from 30 days ago was 92% accurate!" → auto-share prompt | +0.10 |
| **Debate threads** | Comment threads with 10+ replies → "Join the debate" push notification | +0.08 |
| **Weekly recap** | "Your scenarios got 1,234 views this week" → share prompt | +0.05 |
| **Leaderboard climb** | "You moved up 50 spots! Share your best scenario" | +0.05 |
| **Milestone badges** | "You earned 🎯 Oracle badge!" → auto-share prompt | +0.03 |

**Target K-factor: 0.8+ (near-viral)**

Every user who creates a scenario and shares → generates 0.8 new users on average. At K=0.8, organic growth is exponential but requires some paid acquisition to sustain. At K=1.0+, fully self-sustaining viral growth.

---

## IMPLEMENTATION ROADMAP

### Phase 1: Social Foundation (Days 1-7)

| Task | Priority | Days |
|------|:--------:|:----:|
| Comments table + API (create, list, reply) | P0 | 1 |
| Comment UI component (thread view, reply) | P0 | 1 |
| Fork with commentary (fork + text) | P0 | 1 |
| Like with dedup (session-based + user-based) | P0 | 0.5 |
| Engagement score calculation (backend) | P0 | 0.5 |
| Simulation feed page (/feed) | P0 | 2 |
| Feed ranking algorithm | P1 | 1 |

### Phase 2: Leaderboard & Points (Days 8-12)

| Task | Priority | Days |
|------|:--------:|:----:|
| Points system backend (earn + spend) | P0 | 1 |
| Leaderboard page (/leaderboard) | P0 | 1.5 |
| Badge system (criteria + display) | P1 | 1 |
| Weekly/monthly/all-time tabs | P1 | 0.5 |
| Ticker-filtered leaderboard | P1 | 0.5 |
| Points store UI (redeem for Pro days) | P2 | 0.5 |

### Phase 3: Sharing & Growth (Days 13-17)

| Task | Priority | Days |
|------|:--------:|:----:|
| OG image generation (chart + stats + branding) | P0 | 1.5 |
| Share modal (X, Reddit, LinkedIn, Copy) | P0 | 1 |
| Referral tracking (link + points) | P1 | 1 |
| Follow system (follow users, feed filter) | P1 | 1 |
| Notification system (comments, forks, likes) | P2 | 1 |

### Phase 4: ClawMart Integration (Days 18-20)

| Task | Priority | Days |
|------|:--------:|:----:|
| Package AlphaEdge as ClawMart Skill | P1 | 1 |
| Build "AlphaEdge Analyst" Persona | P2 | 1 |
| Content partnership outreach | P2 | 1 |

### Phase 5: Polish & Launch (Days 21-25)

| Task | Priority | Days |
|------|:--------:|:----:|
| Accuracy tracking (auto-compare after 30 days) | P0 | 2 |
| Mobile-responsive feed + leaderboard | P1 | 1 |
| Anti-gaming rules implementation | P1 | 1 |
| Performance optimization | P1 | 1 |

---

## DATABASE SCHEMA ADDITIONS

```sql
-- Comments
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    user_id TEXT,
    author_name TEXT DEFAULT 'Anonymous',
    content TEXT NOT NULL,
    parent_id TEXT,  -- for reply threads
    upvotes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
);

-- Points ledger
CREATE TABLE IF NOT EXISTS points_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    points INTEGER NOT NULL,
    reference_id TEXT,  -- scenario_id, comment_id, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shares tracking
CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id TEXT NOT NULL,
    user_id TEXT,
    platform TEXT,  -- twitter, reddit, linkedin, copy
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Accuracy tracking
CREATE TABLE IF NOT EXISTS accuracy_tracking (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    ticker TEXT NOT NULL,
    predicted_price REAL NOT NULL,
    predicted_date TEXT NOT NULL,
    actual_price REAL,
    accuracy_score REAL,
    status TEXT DEFAULT 'pending',  -- pending, scored, expired
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scored_at TIMESTAMP
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,  -- comment, fork, like, badge, accuracy
    message TEXT NOT NULL,
    reference_id TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Badges
CREATE TABLE IF NOT EXISTS user_badges (
    user_id TEXT NOT NULL,
    badge_key TEXT NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_comments_scenario ON comments(scenario_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_points_user ON points_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_accuracy_status ON accuracy_tracking(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
```

---

## REVISED PRICING (v6)

| Tier | Price | New in v6 |
|------|-------|-----------|
| **Free** | $0 | 3 sims/day, save 5 scenarios, feed access, comment, like, 1Y chart range |
| **Pro** | $49/mo | Unlimited sims + saves, temporal engine, follow/feed, 1Y horizon, Pine imports, points earning 2x |
| **Premium** | $149/mo | Everything + formula bar, API preview, custom badges, priority in feed algorithm |
| **API** | $499/mo | Full programmatic access, bulk simulation, webhooks, white-label embed |
| **Enterprise** | Custom | Managed service (via ClawMart Clawsourcing), custom events, SLA |

---

## REVENUE PROJECTIONS (v6 Social)

Social features accelerate growth through higher engagement and K-factor:

| Month | Users | DAU/MAU | Pro ($49) | Premium ($149) | API ($499) | MRR |
|-------|------:|:-------:|----------:|---------------:|----------:|------:|
| 1 | 500 | 15% | 5 | 0 | 0 | $245 |
| 3 | 12,000 | 25% | 180 | 20 | 1 | $12,299 |
| 6 | 60,000 | 30% | 900 | 100 | 5 | $61,545 |
| 9 | 180,000 | 32% | 2,700 | 350 | 12 | $190,130 |
| 12 | 400,000 | 35% | 6,000 | 800 | 25 | $425,725 |
| 15 | 700,000 | 35% | 10,500 | 1,500 | 40 | $758,350 |
| 18 | 1,000,000 | 35% | 15,000 | 2,500 | 60 | $1,137,450 |

**Key driver:** DAU/MAU ratio. Social features push this from 15% (tool) to 35% (network). Twitter is ~45%, Instagram ~50%. At 35% DAU/MAU with 400K MAU = 140K daily active users generating content, commenting, and driving engagement.

**$1M ARR = $83K/mo = achieved around Month 13-14.**

Social features accelerate this by ~2-3 months vs v5 alone because:
1. Higher DAU → more simulations → more content → more sharing
2. Comments/forks create return visits (notifications)
3. Leaderboard competition drives daily engagement
4. Accuracy tracking creates 30-day retention hooks
5. Referral points incentivize viral distribution

---

## COMPETITIVE MOAT (EXPANDED)

| Moat Layer | v4 | v5 | **v6** |
|-----------|:---:|:---:|:------:|
| **Model accuracy** | ★★☆ | ★★★★ | ★★★★ |
| **Network effects** | ★☆☆ | ★★☆ | ★★★★★ |
| **Content flywheel** | ★☆☆ | ★★☆ | ★★★★ |
| **Data moat** | ★☆☆ | ★★☆ | ★★★★★ |
| **Switching cost** | ★☆☆ | ★★★ | ★★★★★ |

v6's moat is **the social graph + accuracy history**. Once a user has:
- 50 scenarios with tracked accuracy
- 200 followers
- A 🎯 Oracle badge
- A position on the leaderboard

...they will NEVER switch to a competitor. The data, reputation, and social capital are non-portable. This is the Instagram playbook: the content, followers, and identity lock users in permanently.

---

## RISK ANALYSIS

| Risk | Probability | Severity | Mitigation |
|------|:---------:|:-------:|-----------|
| Low initial engagement (cold start) | High | High | Seed with 50+ high-quality scenarios ourselves. Create "Staff Picks" section. |
| Comment spam / low quality | Medium | Medium | Rate limiting, minimum account age for comments, upvote/downvote system |
| Gaming the leaderboard | Medium | Medium | Anti-gaming rules + manual review of top 50. Accuracy score can't be faked. |
| Users leave after checking accuracy | Low | Medium | New scenarios + follow feeds create ongoing reasons to return |
| Feature bloat slows core experience | Medium | High | Social features are additive — the simulator page stays clean. Feed is a separate page. |
| Regulatory concerns with "leaderboard" | Low | Medium | Clear disclaimer: "Not financial advice. For educational simulation only." No real money involved. |

---

## THE BIG PICTURE

**v4:** Event Simulator (the product)
**v5:** Temporal Simulation Platform (the upgrade — BUILT)
**v6:** Social Simulation Network (the community)
**v7 (future):** The Financial Prediction Market (the platform)

Each version builds on the last:
- v4 creates the tool
- v5 makes it professional
- v6 makes it social
- v7 (eventually) makes it a market — where accuracy = reputation = monetizable insight

---

## IMMEDIATE NEXT STEPS

1. ✅ Chart range extended to 6M/1Y (built)
2. ✅ Temporal engine (built)
3. ✅ User auth (built)
4. ✅ Feedback system (built)
5. 🔲 Comments + discussion threads
6. 🔲 Fork with commentary
7. 🔲 Engagement-scored leaderboard
8. 🔲 Points system
9. 🔲 Simulation feed (/feed page)
10. 🔲 OG image share generation
11. 🔲 ClawMart Skill packaging
12. 🔲 Accuracy tracking (auto-compare after 30 days)

---

## FILES

- `business-proposal.md` — v1 (rejected)
- `business-proposal-v3.md` — v3 (rejected)
- `business-proposal-v4.md` — v4 (event simulator)
- `business-proposal-v4.1.md` — v4.1 (CEO/Munger/COO refinement)
- `business-proposal-v5.md` — v5 (temporal simulation platform)
- `business-proposal-v6.md` — **THIS FILE** (social simulation network)

---

*"The best predictions are the ones that survive public debate." — AlphaEdge*

*This is a strategic document. Not investment advice. Consult a securities lawyer before accepting payment for financial content.*