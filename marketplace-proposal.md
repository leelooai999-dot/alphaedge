# MonteCarloo Marketplace — AI Personality & Skills Store

## Vision
**"Etsy for Financial AI"** — A native marketplace on montecarloo.com where users can buy, sell, and deploy financial AI personalities and simulation skills. Modeled after [ShopClawMart.com](https://www.shopclawmart.com/) but vertical-focused on finance.

## Why This Matters
1. **New Revenue Stream**: 30% marketplace commission on every sale (like Apple App Store)
2. **Creator Flywheel**: Creators attract users → users create content → content attracts more creators
3. **Platform Lock-in**: Users invest in personalities they can't get elsewhere
4. **Zero Marginal Cost**: Creators do the product development, we take commission
5. **Network Effects**: More sellers → more buyers → more sellers

## What We're Selling

### Product Types

#### 1. AI Analyst Personas ($49-$199)
Pre-configured AI personalities trained on specific financial disciplines.

**Our First Listing — MonteCarloo Analyst**
- Temporal simulation expert
- Monte Carlo methodology + event impact analysis
- Pre-loaded with 18+ event models, temporal profiles
- Can generate Pine Script indicators from simulation results
- Knows how to use MonteCarloo's API

**Example Third-Party Personas:**
- **Options Flow Analyst** — Reads unusual options activity, generates thesis
- **Macro Strategist** — Global macro analysis, rate decisions, currency impact
- **Earnings Whisper** — Pre/post earnings analysis with historical accuracy
- **Crypto Quant** — DeFi yield optimization, on-chain analytics
- **ESG Analyst** — Environmental/Social/Governance scoring with trade recs

#### 2. Simulation Skills ($9-$49)
Reusable simulation templates and event models.

**Examples:**
- **Earnings Surprise Pack** — 50 pre-built earnings event models with temporal profiles
- **Geopolitical Crisis Kit** — War, sanctions, trade war event templates
- **Sector Rotation Scanner** — Detect cross-sector money flows
- **VIX Regime Detector** — Classify market regime for sim calibration
- **Custom Pine Strategy Pack** — 20 battle-tested Pine Script strategies

#### 3. Data Add-ons ($29-$99/mo)
Premium data feeds that enhance simulations.

**Examples:**
- **Real-time Polymarket Feed** — Sub-second odds updates
- **Dark Pool Flow** — Institutional order flow data
- **Insider Trading Tracker** — SEC Form 4 filings parsed
- **Social Sentiment Score** — X/Reddit/StockTwits aggregated sentiment

### Pricing Structure
| Product Type | Price Range | Commission | Creator Gets |
|---|---|---|---|
| Persona | $49 - $199 | 30% | 70% |
| Skill | $9 - $49 | 30% | 70% |
| Data Add-on | $29 - $99/mo | 30% | 70% |
| Enterprise/Custom | $500+ | 20% | 80% |

## Page Design (Modeled After ClawMart)

### Listing Page Structure
```
┌──────────────────────────────────────────────┐
│ ← Back to marketplace                        │
│                                               │
│ [Avatar]  Title                                │
│           Subtitle / Role                     │
│                                               │
│ Description tagline                           │
│                                               │
│ [Category] [Sales count] [Rating ★] [Version] │
│                                               │
│ ┌─── About ──────────┐  ┌─── Purchase ──────┐│
│ │ Long description   │  │ One-time: $99     ││
│ │ What's included    │  │ [Buy Now]         ││
│ │ What's new         │  │                    ││
│ │                    │  │ Creator            ││
│ │ Core Capabilities  │  │ [Avatar] Name     ││
│ │ ✓ Capability 1    │  │ Bio               ││
│ │ ✓ Capability 2    │  │ [View profile →]  ││
│ │ ✓ ...             │  │                    ││
│ │                    │  │ Details            ││
│ │ Reviews            │  │ Type: Persona     ││
│ │ ★★★★☆ 4.0 (11)    │  │ Category: Finance ││
│ │ [Review cards]     │  │ Created: Mar 2026 ││
│ │                    │  │                    ││
│ │ Version History    │  │ [Report listing]  ││
│ └────────────────────┘  └────────────────────┘│
│                                               │
│ Recommended Skills                            │
│ [Card] [Card] [Card]                          │
└──────────────────────────────────────────────┘
```

### Browse/Search Page
```
┌──────────────────────────────────────────────┐
│ MonteCarloo Marketplace                       │
│                                               │
│ [Search bar]                                  │
│                                               │
│ Filters: [All] [Personas] [Skills] [Data]     │
│          [Most Popular] [Newest] [Price ↑↓]   │
│                                               │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│ │[Avatar] │ │[Avatar] │ │[Avatar] │         │
│ │ Title   │ │ Title   │ │ Title   │         │
│ │ Desc    │ │ Desc    │ │ Desc    │         │
│ │ ★4.5 $99│ │ ★4.8 $49│ │ ★4.2 $29│         │
│ │ 963 sold│ │ 412 sold│ │ 201 sold│         │
│ └─────────┘ └─────────┘ └─────────┘         │
└──────────────────────────────────────────────┘
```

### Creator Dashboard
```
┌──────────────────────────────────────────────┐
│ Creator Dashboard                             │
│                                               │
│ Revenue: $4,230 (this month)                  │
│ Total Sales: 847 | Active Listings: 5         │
│ Avg Rating: 4.6 ★                             │
│                                               │
│ [+ New Listing]                               │
│                                               │
│ My Listings                                   │
│ ┌──────────────────────────────────────────┐  │
│ │ Macro Strategist  |  $99  | 312 sold    │  │
│ │ Options Scanner   |  $29  | 201 sold    │  │
│ │ VIX Regime Kit    |  $19  |  87 sold    │  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ Recent Reviews | Earnings History | Analytics  │
└──────────────────────────────────────────────┘
```

## Technical Architecture

### Backend (Python/FastAPI)
```
engine/
  marketplace.py     — Listing CRUD, search, reviews, purchases
  creator.py         — Creator profiles, dashboard, earnings
  marketplace_stripe.py — Connected accounts, payouts, refunds
```

### Database (SQLite → PostgreSQL for scale)
```sql
-- Listings
CREATE TABLE marketplace_listings (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'persona', 'skill', 'data_addon'
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  capabilities TEXT,   -- JSON array
  price_cents INTEGER NOT NULL,
  pricing_model TEXT DEFAULT 'one_time',  -- 'one_time', 'subscription'
  category TEXT,
  tags TEXT,            -- JSON array
  avatar_url TEXT,
  version TEXT DEFAULT 'v1',
  version_history TEXT, -- JSON array
  sales_count INTEGER DEFAULT 0,
  avg_rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',  -- 'draft', 'active', 'suspended'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- Reviews
CREATE TABLE marketplace_reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL,  -- 1-5
  title TEXT,
  body TEXT,
  verified_purchase BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Purchases
CREATE TABLE marketplace_purchases (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  stripe_payment_id TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id)
);

-- Creator profiles (extends users table)
CREATE TABLE creator_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  company TEXT,
  website TEXT,
  stripe_connected_account_id TEXT,
  total_sales INTEGER DEFAULT 0,
  total_revenue_cents INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### API Endpoints
```
# Browse & Search
GET  /api/marketplace/listings              — Browse all listings
GET  /api/marketplace/listings/:id          — Get listing detail
GET  /api/marketplace/search?q=             — Full-text search
GET  /api/marketplace/categories            — List categories

# Listing Management (authenticated)
POST /api/marketplace/listings              — Create listing
PUT  /api/marketplace/listings/:id          — Update listing
DELETE /api/marketplace/listings/:id        — Remove listing

# Reviews
GET  /api/marketplace/listings/:id/reviews  — Get reviews
POST /api/marketplace/listings/:id/reviews  — Write review (verified purchases only)

# Purchases
POST /api/marketplace/purchase/:id          — Buy listing (Stripe checkout)
GET  /api/marketplace/purchases             — My purchases
GET  /api/marketplace/purchases/:id/download — Download purchased content

# Creator Dashboard
GET  /api/marketplace/creator/dashboard     — Revenue, sales, analytics
GET  /api/marketplace/creator/earnings      — Earnings history
POST /api/marketplace/creator/profile       — Create/update creator profile
GET  /api/marketplace/creator/:id           — Public creator profile
```

### Frontend Pages
```
/marketplace                 — Browse page (search, filter, sort)
/marketplace/[id]            — Listing detail page
/marketplace/create          — Create new listing
/marketplace/dashboard       — Creator dashboard
/marketplace/purchases       — My purchases
/profile/[id]                — Public creator profile (extends existing)
```

## Stripe Connect Architecture
- **Platform**: MonteCarloo (our Stripe account)
- **Creators**: Stripe Connected Accounts (Express or Standard)
- **Flow**: Buyer pays → Stripe splits payment → 70% to creator, 30% to platform
- **Payouts**: Automatic daily or weekly (creator choice)
- **Refund Policy**: 7-day money-back guarantee, platform handles disputes

## Launch Plan

### Phase 1 — Seed the Store (Week 1)
1. Build backend (marketplace.py, creator.py)
2. Build frontend (/marketplace, /marketplace/[id], /marketplace/create)
3. Create our first listing: **MonteCarloo Analyst** persona ($99)
4. Seed with 3-5 skill listings from our existing capabilities

### Phase 2 — Open to Creators (Week 2)
1. Stripe Connect integration for creator payouts
2. Creator application/review process
3. Content moderation tools
4. Creator Dashboard with analytics

### Phase 3 — Growth (Week 3-4)
1. Featured listings on homepage
2. "Recommended for you" based on usage
3. Weekly "New on MonteCarloo" email
4. Creator referral program (earn 5% on referred creators' sales)
5. Affiliate links for creators

## Revenue Projections

### Conservative (Year 1)
| Month | Active Listings | Monthly Sales | Avg Price | Revenue (30%) |
|-------|----------------|---------------|-----------|---------------|
| 1     | 5              | 20            | $49       | $294          |
| 3     | 20             | 100           | $59       | $1,770        |
| 6     | 50             | 500           | $69       | $10,350       |
| 12    | 150            | 2,000         | $79       | $47,400       |

### Aggressive (Year 1, with marketing)
| Month | Active Listings | Monthly Sales | Avg Price | Revenue (30%) |
|-------|----------------|---------------|-----------|---------------|
| 1     | 10             | 50            | $49       | $735          |
| 3     | 50             | 300           | $69       | $6,210        |
| 6     | 200            | 2,000         | $79       | $47,400       |
| 12    | 500            | 10,000        | $89       | $267,000      |

## Competitive Moat
1. **Financial vertical focus** — ClawMart is general; we're finance-only
2. **Integrated with simulator** — Personalities and skills plug directly into MonteCarloo simulations
3. **Accuracy tracking** — AI analysts get scored on prediction accuracy (unique differentiator)
4. **Community reputation** — Buyers can verify creator accuracy before purchasing
5. **Data advantage** — Creators can bundle proprietary data, not just prompts

## Success Metrics
- **GMV** (Gross Merchandise Value): Total sales volume
- **Take rate**: Commission earned / GMV (target: 30%)
- **Creator NPS**: Net Promoter Score for sellers
- **Repeat purchase rate**: % of buyers who buy 2+ listings
- **Time to first sale**: How fast new listings get their first buyer (target: <7 days)
