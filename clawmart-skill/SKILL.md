# MonteCarloo — Monte Carlo Stock Event Simulator

## What It Does
Simulates how real-world events affect stock prices using Monte Carlo methods with temporal event shaping. Think "What happens to NVDA if China invades Taiwan?" — and get a probability distribution, not a guess.

## When to Activate
- User asks about stock impact of events (geopolitical, earnings, FOMC, etc.)
- User wants to run a "what-if" scenario on a stock
- User mentions Monte Carlo, event simulation, or stock scenario analysis
- User wants to export a scenario as TradingView Pine Script

## API Endpoints

### Base URL
`https://alphaedge-api-production.up.railway.app`

### Run Simulation
```
POST /api/simulate
Content-Type: application/json

{
  "ticker": "NVDA",
  "events": [
    {
      "id": "china_taiwan",
      "name": "China-Taiwan Conflict",
      "probability": 0.25,
      "impact": -15.0,
      "duration_days": 90,
      "event_date": "2026-06-15",
      "category": "geopolitical"
    }
  ],
  "num_paths": 2000,
  "horizon_days": 90,
  "time_range": "3M"
}
```

**Response:** Percentile fan chart data, median target, probability above current price, confidence bands.

### Get Stock Price
```
GET /api/price/{ticker}
```

### Get OHLCV History
```
GET /api/ohlcv/{ticker}?days=90
```

### Event Calendar
```
GET /api/calendar/fomc
GET /api/calendar/earnings/{ticker}
```

### Save Scenario
```
POST /api/scenarios
```

### Browse Community Scenarios
```
GET /api/feed?type=trending&limit=20
GET /api/leaderboard?period=all_time
```

## Usage Pattern

1. **User asks about event impact:** Parse the event details (name, probability, impact %)
2. **Get current price:** `GET /api/price/{ticker}`
3. **Run simulation:** `POST /api/simulate` with events
4. **Format results:** Present median target, probability of profit, confidence bands
5. **Offer next steps:** "Want me to save this scenario?" / "Export as Pine Script?"

## Example Interaction

**User:** "What happens to CVX if Iran war lasts 3 more months?"

**Agent response:**
> Running Monte Carlo simulation on CVX with Iran conflict scenario...
>
> **CVX 90-Day Simulation Results:**
> - Current: $147.82
> - Median target: $162.40 (+9.9%)
> - 90% confidence: $141.20 — $185.60
> - Probability of profit: 73.2%
>
> The temporal model shows an initial shock phase (weeks 1-2, +3.2% oil premium),
> followed by sustained elevation as supply disruption compounds.
>
> 🔗 [View interactive simulation](https://frontend-leeloo-ai.vercel.app/sim/CVX)
> 📊 [Export as Pine Script for TradingView]

## Pine Script Export
When the user wants a TradingView indicator:
1. Run the simulation
2. Call `POST /api/export/pine` with the scenario
3. Return the Pine Script code for the user to paste into TradingView

## Event Templates
Pre-built events available via `GET /api/events/templates`:
- Geopolitical: Iran War, China-Taiwan, Russia-Ukraine, NATO Expansion
- Macro: FOMC Rate decisions, Recession scenarios, Inflation shocks
- Sector: AI chip ban, Oil embargo, Pharma FDA approval

## Important Notes
- This is a **simulation tool**, not financial advice
- Always frame results as probabilities, never predictions
- Include disclaimer: "For educational purposes only. Not investment advice."
- Simulation speed: <200ms for 2000 paths (fast enough for real-time)

## Links
- Web App: https://frontend-leeloo-ai.vercel.app
- API: https://alphaedge-api-production.up.railway.app
- Methodology: https://frontend-leeloo-ai.vercel.app/methodology
