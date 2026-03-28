# MonteCarloo Simulation Continuous Improvement Plan
## Event → Commodity → Beta → Stock Architecture

**Created:** March 28, 2026
**Status:** Active — Phase 1 in progress
**Owner:** AI Agent (autonomous, report to user)

---

## Current State (v1 — Flat Drift)

Events directly map to stock sectors with hardcoded drift/vol values.
No commodity intermediary. No beta correlation. No causal chains.

```
Event → Sector lookup → Hardcoded drift → GBM Monte Carlo
```

**Problems:**
- Chart barely moves when events change
- Same event has same effect regardless of stock's actual exposure
- Multiple events add linearly (should compound through commodities)
- No explanation of WHY a stock moves

---

## Target Architecture (v2 — Commodity Beta Model)

```
┌─────────────────┐
│  EVENT LAYER     │  Iran War, OPEC Cut, Chip Ban, Fed Rate...
│  (what happens)  │
└────────┬────────┘
         │ causal impact (calibrated from historical data)
         ▼
┌─────────────────┐
│  COMMODITY LAYER │  WTI Oil, Brent, NatGas, Gold, Copper,
│  (what moves)    │  Wheat, USD Index, 10Y Yield, VIX
└────────┬────────┘
         │ beta × exposure (calculated from market data)
         ▼
┌─────────────────┐
│  STOCK LAYER     │  Each stock has a commodity beta vector
│  (what you trade)│  Revenue exposure + cost exposure = net beta
└─────────────────┘
```

---

## Phase 1: Commodity Intermediary Layer (3 days) — IN PROGRESS

### 1.1 Commodity Models
Define commodities as first-class objects with:
- Current price (from Yahoo Finance)
- Historical volatility
- Event sensitivity map (which events move this commodity, by how much)

**Commodities to model:**
| Commodity | Ticker | Key Events |
|-----------|--------|------------|
| WTI Crude Oil | CL=F | Iran, OPEC, Russia, Recession |
| Brent Crude | BZ=F | Iran, OPEC, Russia |
| Natural Gas | NG=F | Russia, Weather, LNG |
| Gold | GC=F | All geopolitical, Fed, Recession |
| Copper | HG=F | China, Recession, Infrastructure |
| Wheat | ZW=F | Russia-Ukraine, Weather |
| USD Index | DX-Y.NYB | Fed, Trade wars |
| 10Y Treasury Yield | ^TNX | Fed, Recession, Inflation |
| VIX | ^VIX | All events (fear gauge) |

### 1.2 Event → Commodity Impact Matrix
Each event specifies its impact on commodities (not stocks):

```python
EVENT_COMMODITY_IMPACTS = {
    "iran_escalation": {
        "WTI": {"base_pct": 18, "range": [12, 30], "delay_days": 0},
        "NATGAS": {"base_pct": 8, "range": [4, 15], "delay_days": 1},
        "GOLD": {"base_pct": 5, "range": [2, 10], "delay_days": 0},
        "VIX": {"base_pct": 40, "range": [20, 80], "delay_days": 0},
        "USD": {"base_pct": 1.5, "range": [0.5, 3], "delay_days": 0},
        "10Y": {"base_pct": -0.15, "range": [-0.3, -0.05], "delay_days": 2},
    },
    "opec_cut": {
        "WTI": {"base_pct": 10, "range": [5, 20], "delay_days": 0},
        "NATGAS": {"base_pct": 3, "range": [1, 8], "delay_days": 1},
    },
    ...
}
```

### 1.3 Stock Commodity Betas
Each stock gets a beta vector — how much it moves per 1% commodity move:

```python
# Calculated from rolling 90-day correlation + fundamental exposure
STOCK_BETAS = {
    "CVX": {"WTI": 0.70, "NATGAS": 0.15, "GOLD": 0.05, "VIX": -0.10},
    "XOM": {"WTI": 0.75, "NATGAS": 0.10, "GOLD": 0.03, "VIX": -0.08},
    "DAL": {"WTI": -0.30, "VIX": -0.20, "USD": 0.10},
    "NVDA": {"WTI": -0.05, "VIX": -0.25, "USD": -0.10},
    "AAPL": {"WTI": -0.03, "VIX": -0.15, "USD": -0.12},
    "GLD": {"GOLD": 0.95},
    "USO": {"WTI": 0.95},
}
```

### 1.4 Simulation Flow
```
1. User adds events with probability/severity/duration
2. For each event:
   a. Calculate commodity impacts (% change per commodity)
   b. Scale by severity × probability × duration
3. Compound commodity impacts across events (multiplicative)
4. For target stock:
   a. Look up commodity beta vector
   b. Net stock impact = Σ(commodity_impact × beta)
   c. Feed into GBM as drift adjustment
5. Run Monte Carlo with adjusted drift/vol
```

---

## Phase 2: Auto-Calibrating Betas (2 days)

### 2.1 Rolling Beta Calculator
- Use yfinance to pull 90-day daily returns for stock + commodities
- Calculate Pearson correlation × (σ_stock / σ_commodity) = beta
- Cache results, refresh daily via cron job

### 2.2 Fundamental Exposure Override
- For well-known stocks, use fundamental data:
  - CVX: 85% revenue from oil → oil beta floor = 0.60
  - DAL: 30% COGS is fuel → oil beta ceiling = -0.35
- Blend: final_beta = 0.5 × market_beta + 0.5 × fundamental_beta

### 2.3 Sector Default Betas
- For stocks without individual data, use sector averages:
  - Energy sector: Oil beta = 0.65, NatGas beta = 0.12
  - Airlines: Oil beta = -0.28
  - Tech: Oil beta = -0.05, VIX beta = -0.20

---

## Phase 3: Second-Order Causal Chains (3 days)

### 3.1 Chain Definitions
```
Oil↑ → Inflation↑ (delay: 2-4 weeks) → Fed hawkish (delay: 1-3 months)
    → Growth stocks↓, Bond yields↑

Oil↑ → Transportation costs↑ (delay: 1 week) → Consumer spending↓ (delay: 2-4 weeks)
    → Retail stocks↓, Consumer discretionary↓

Chip ban → Supply shortage (immediate) → NVDA short-term↓
    → Pricing power↑ (delay: 1-3 months) → NVDA long-term↑

Fed rate cut → Bond yields↓ (immediate) → Growth stocks↑
    → Housing↑ (delay: 1-2 months) → REITs↑, Banks mixed
```

### 3.2 Implementation
- Each chain is a delayed cascade
- First-order effects appear immediately on chart
- Second-order effects fade in over the delay period
- Users can see annotations: "Oil +20% → Inflation risk (appears in 2-4 weeks)"

---

## Phase 4: Historical Calibration (ongoing)

### 4.1 Historical Event Database
For every event type, record actual market response:

| Event | Date | Oil Δ | Gold Δ | CVX Δ | DAL Δ | SPY Δ |
|-------|------|-------|--------|-------|-------|-------|
| Russia invades Ukraine | 2022-02-24 | +8% | +3% | +7% | -5% | -3% |
| OPEC+ surprise cut | 2023-04-02 | +6% | +1% | +4% | -3% | -1% |
| Iran strikes Israel | 2024-04-13 | +4% | +2% | +3% | -2% | -1% |
| China tariffs 25% | 2018-06-15 | -2% | +1% | -1% | 0% | -3% |

### 4.2 Calibration Process
- Compare model prediction vs historical actual
- Adjust event → commodity impact ranges
- Adjust stock betas
- Build confidence intervals from multiple historical analogs

---

## Phase 5: ML Feedback Loop (ongoing)

### 5.1 Prediction Tracking
- Every simulation produces a 30-day forecast
- After 30 days, compare predicted vs actual
- Calculate accuracy score per event type

### 5.2 Beta Self-Correction
- If model predicted CVX +15% but actual was +8%:
  - Oil beta was too high, or
  - Event impact on oil was overestimated
- Adjust with exponential moving average of error

### 5.3 Community Signal
- Users who consistently beat the model → their scenario parameters get higher weight
- Scenarios with high accuracy → feed parameters back into defaults
- This already exists in the accuracy tracking system

---

## Metrics to Track

| Metric | Current | Phase 1 Target | Phase 5 Target |
|--------|---------|---------------|----------------|
| Median prediction error | Unknown (not tracked) | ±15% | ±8% |
| Event impact visibility | 2-5% chart movement | 10-20% chart movement | Calibrated to reality |
| User session time on sim | ~3 min | ~5 min (chart responds) | ~10 min (exploring chains) |
| Cross-event compounding | Linear addition | Multiplicative | With delays |
| Stocks with custom betas | 0 | Top 50 (SP500 top) | All SP500 |

---

## Files

- `engine/commodities.py` — Commodity models and event impact matrix (NEW)
- `engine/betas.py` — Stock-commodity beta vectors and calculator (NEW)
- `engine/simulation.py` — Updated to use commodity layer
- `engine/events.py` — Events now specify commodity impacts, not stock drifts
- `SIMULATION-IMPROVEMENT-PLAN.md` — THIS FILE

---

*"The market is a machine for transferring commodity price shocks into stock prices, filtered by each company's exposure. Our simulation should model the machine, not just guess the output."*
