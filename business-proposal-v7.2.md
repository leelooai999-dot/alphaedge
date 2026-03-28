# MonteCarloo v7.2 — Pyeces Integration: Simulation → Stock Chart Pipeline
## "Let AI Agents Predict Your Chart"

**Date:** March 28, 2026
**Status:** Technical Proposal — Pyeces conversation results → MonteCarloo stock chart overlay
**Previous:** v7.1 (Character-driven geopolitical simulation)
**This version:** Bridge between Pyeces swarm simulation and MonteCarloo's Monte Carlo chart engine

---

## THE PROBLEM

MonteCarloo and Pyeces currently exist as two separate products:
- **MonteCarloo** (montecarloo.com) — Monte Carlo stock chart simulation + community
- **Pyeces** (MiroFish fork) — Swarm intelligence multi-agent simulation engine

Users run a simulation on Pyeces, get a report, chat with the agents... then what? They have to **manually** translate insights into stock positions. That's friction that kills conversion.

## THE INSIGHT: Simulation Output = Chart Input

When a user asks Pyeces agents "What happens to oil stocks if Iran war escalates for 10 more days?", the agents produce:
- **Consensus probability** (e.g., 73% chance of $5-8 oil price increase)
- **Predicted direction** (bullish/bearish per stock)
- **Predicted magnitude** (% price change)
- **Time horizon** (days to peak impact)
- **Confidence level** (how much agents agreed vs. disagreed)

These are **exactly** the inputs MonteCarloo's Monte Carlo engine needs to generate a probability cone on the chart.

## PROPOSED ARCHITECTURE

### Option A: "Bridge API" (Recommended — 3 days to build)

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Pyeces      │      │  Bridge API   │      │ MonteCarloo   │
│   Simulation  │─────▶│  /api/bridge  │─────▶│  Chart Engine  │
│   + Chat      │      │  /scenarios   │      │  Monte Carlo   │
└──────────────┘      └──────────────┘      └──────────────┘
```

**Flow:**
1. User runs simulation on Pyeces (upload report about Iran war → agents simulate)
2. User chats with agents, refines understanding
3. User clicks **"→ View on Chart"** button in Pyeces
4. Pyeces sends a structured JSON payload to MonteCarloo:
   ```json
   {
     "source": "pyeces",
     "simulation_id": "sim_abc123",
     "ticker": "CVX",
     "event_name": "Iran War Escalation (10 more days)",
     "consensus": {
       "direction": "bullish",
       "probability": 0.73,
       "magnitude_pct": [5.0, 8.0],  // range
       "peak_impact_days": 14,
       "confidence": 0.68,
       "agent_votes": {
         "bullish": 8,
         "bearish": 3,
         "neutral": 1
       }
     },
     "agent_predictions": [
       {"name": "Oil Hawk", "tier": "analyst", "direction": "bullish", "target_pct": 12.0, "confidence": 0.9},
       {"name": "Fed Whisperer", "tier": "analyst", "direction": "bearish", "target_pct": -3.0, "confidence": 0.6},
       {"name": "Simulated Trump", "tier": "main", "action": "escalation", "impact_assessment": "positive for energy"}
     ],
     "report_summary": "Multi-agent consensus: 73% probability of 5-8% oil stock increase over 14 days...",
     "created_at": "2026-03-28T12:00:00Z"
   }
   ```
5. MonteCarloo receives this, creates a new scenario with the Pyeces parameters
6. Monte Carlo engine runs with the Pyeces consensus as input drift/volatility modifiers
7. User sees the chart with:
   - Standard Monte Carlo probability cone
   - **Pyeces Agent Overlay**: colored dots for each agent's prediction
   - **Consensus Band**: shaded area showing where agents agreed
   - **Character markers**: "🛢️ Oil Hawk: +12%" annotated on chart

### Option B: "Embedded Widget" (5-7 days — more seamless)

MonteCarloo chart component embedded directly inside Pyeces Step5 (Deep Interaction):
- After chatting with agents, a live chart appears showing predictions
- User can interact with chart AND agents simultaneously
- "What if I told you China is also cutting production?" → agents re-predict → chart updates live

This is the killer UX but requires more integration work.

### Option C: "Shared Scenario" (1 day — minimal viable)

Pyeces generates a MonteCarloo scenario URL with pre-filled parameters:
```
https://montecarloo.com/sim/CVX?event=Iran+War&prob=73&dir=bullish&mag=5-8&days=14&source=pyeces
```
User clicks link → MonteCarloo opens with simulation pre-configured. Simple URL bridge.

## RECOMMENDATION: Start with C, Build toward A, Goal is B

**Phase 1 (Day 1):** Option C — URL bridge. Add a "View on MonteCarloo Chart →" button to Pyeces Step4/Step5 that opens montecarloo.com with query params. MonteCarloo `/sim/[ticker]` page reads URL params and auto-fills the scenario.

**Phase 2 (Days 2-4):** Option A — Bridge API. Add `/api/bridge/scenarios` endpoint to MonteCarloo backend that accepts Pyeces JSON payloads. Pyeces sends structured data. MonteCarloo creates a scenario with agent predictions as chart overlays.

**Phase 3 (Days 5-10):** Option B — Embedded widget. Use an iframe or micro-frontend approach to embed the MonteCarloo chart directly in Pyeces Step5. Bi-directional updates: agents → chart, chart interaction → agents re-predict.

## CHART UX WHEN PYECES DATA IS OVERLAID

```
Price ($)
│
│     ╔═══════════╗  ← Monte Carlo 95% confidence band
│    ╔╝           ╚╗
│   ╔╝  🛢️+12%     ╚╗  ← Oil Hawk prediction
│  ╔╝   ●━━━━●      ╚╗  ← Consensus band (73% agents agree)
│ ╔╝    🧮-3%  ●      ╚╗  ← Quant Ghost (bearish outlier)
│╔╝              ●     ╚╗
│╝     🎖️+7%     ●      ╚╗  ← Defense Intel
├─────────────────────────▶ Days
│  Today    +7d    +14d
│
│  ┌─────────────────────────────────┐
│  │ 🐟 Pyeces Simulation Results    │
│  │ Consensus: +5-8% (73% agents)  │
│  │ 8 bullish / 3 bearish / 1 neutral │
│  │ Click any agent dot for details  │
│  └─────────────────────────────────┘
```

**Each agent prediction = clickable dot on the chart.**
- Hover: shows agent name, prediction, reasoning snippet
- Click: opens agent chat (links back to Pyeces for deep conversation)
- Color: green=bullish, red=bearish, yellow=neutral
- Size: proportional to confidence

## VALUE PROPOSITION

| Without Integration | With Integration |
|-|-|
| User runs Pyeces simulation → reads report → manually sets up MonteCarloo | User runs simulation → one click → chart with agent predictions |
| Two disconnected products | One seamless workflow |
| Pyeces users leave after report | Pyeces users flow into MonteCarloo |
| MonteCarloo users don't know about Pyeces | Chart shows "Powered by Pyeces" → discovery |
| Session time: ~5 min per product | Session time: 15-25 min combined |

## COMPETITIVE MOAT UPDATE

With this integration, we become the **only platform** that offers:
1. Multi-agent swarm intelligence simulation (Pyeces)
2. Monte Carlo mathematical modeling (MonteCarloo)  
3. **AI Agent predictions overlaid on financial charts** (NEW — nobody does this)
4. Deep conversation with prediction agents (Pyeces Step5)
5. Community accuracy tracking (MonteCarloo social layer)

This is a genuine **first-mover advantage** in a category that doesn't exist yet: "Agent-Augmented Financial Charting."

## BUG FIX: Comments on Published Scenarios

**Fixed:** Discussion panel on published scenarios (`/s/[id]`) now defaults to expanded instead of collapsed. Previously, users couldn't see or access comments because the panel was hidden behind a click.

**Commit:** `fix: expand comments by default on published scenarios` — pushed to master.

## PYECES STATUS (March 28, 2026)

### Completed Today:
- ✅ Rebranded MiroFish → Pyeces (all user-facing text)
- ✅ English/Chinese i18n toggle (🌐 button in navbar, localStorage persisted)
- ✅ Default language: English
- ✅ Share buttons on Report page (Step4) and Interaction page (Step5)
  - 🔗 Copy link to clipboard
  - 𝕏 Share on X/Twitter with pre-filled text
- ✅ Backend health returns "Pyeces Backend"
- ✅ Deep Interaction (Step5) preserved — chat with simulation entities intact
- ✅ Zep Cloud connected (knowledge graph memory working)
- ✅ LLM connected (GLM-4.5-Air via Z.AI)

### Running at:
- **Pyeces:** https://guarantee-goals-advantages-median.trycloudflare.com (temporary tunnel)
- **MonteCarloo:** https://montecarloo.com
- **MonteCarloo API:** https://alphaedge-api-production.up.railway.app

### Still Needed for Pyeces:
- [ ] Custom logo/favicon (still using MiroFish fish logo)
- [ ] Persistent deployment (Vercel + Railway vs. staying on this VM)
- [ ] Production .env with proper keys
- [ ] Full i18n coverage of inner step components (Step1-5 have partial i18n)
- [ ] Bridge API to MonteCarloo (per this proposal)

---

## FILES

- `business-proposal-v7.2.md` — **THIS FILE** (Pyeces integration + chart overlay)
- `business-proposal-v7.1.md` — v7.1 (character-driven simulation)
- `business-proposal-v7.md` — v7 (generic swarm intelligence)
- `business-proposal-v6.md` — v6 (social simulation network)

---

---

## SIMULATION ENGINE OVERHAUL: Event → Commodity → Beta → Stock

### The Problem with Current Simulation
Events directly map to stock sectors with hardcoded drift. This is wrong.
Real markets work: Event → Commodity → Beta × Exposure → Stock Price.

### The Fix (5-Phase Continuous Improvement)
See `SIMULATION-IMPROVEMENT-PLAN.md` for full architecture and phase details.

**Phase 1** (3 days): Commodity intermediary layer — events move commodities, commodities move stocks via beta
**Phase 2** (2 days): Auto-calibrating betas from 90-day rolling correlations via yfinance
**Phase 3** (3 days): Second-order causal chains with time delays
**Phase 4** (ongoing): Historical calibration from real market events
**Phase 5** (ongoing): ML feedback loop — predictions self-correct over time

### Key Example
```
Iran War → Oil +20% → CVX (β=0.70): +14%
                    → DAL (β=-0.30): -6%
                    → NVDA (β=-0.05): -1%

Add OPEC Cut → Oil compounds to +34.6%
             → CVX: +24.2% (massive), DAL: -10.4% (crushed)
```

This replaces the flat "apply drift to sector" model with actual market mechanics.

---

*"The user asks the AI agents about Iran. The agents debate. The consensus appears on the chart. The user trades with conviction."*
— MonteCarloo v7.2

*This is a strategic document. Not financial advice.*
