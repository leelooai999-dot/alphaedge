# MonteCarloo v7 — The Social Simulation Engine
## "Watch Wall Street Debate Your Trade in Real-Time"

**Date:** March 27, 2026
**Status:** CEO Strategic Proposal
**Previous:** v6 (Social Simulation Network — community features, marketplace, leaderboard)
**This version:** MiroFish-powered multi-agent swarm intelligence, human-readable market debates, interactive agent conversations

---

## CEO EXECUTIVE SUMMARY

**The One-Sentence Pitch:**
MonteCarloo v7 lets users watch thousands of AI agents — each playing a different market persona (hedge fund manager, retail trader, Fed analyst, oil exec, war correspondent) — debate the impact of real-world events on specific stocks, then applies their consensus *directly* to the price chart as a simulation.

**Why This Creates a Blue Ocean:**

| Existing Market | MonteCarloo v7 |
|----------------|----------------|
| Monte Carlo = math-only (random walks) | Monte Carlo + swarm intelligence (agents reason like humans) |
| TradingView = charts + indicators | Charts + AI agents having conversations you can watch |
| Polymarket = binary yes/no predictions | Multi-agent debates with nuanced probability distributions |
| ChatGPT/Grok = one AI opinion | 1,000+ agents with different biases arguing against each other |
| MiroFish = general prediction tool | Vertical financial simulation with chart integration |

**Nobody combines: multi-agent social simulation + stock chart visualization + user interaction with simulated agents.**

This is a category that doesn't exist yet. We are creating it.

---

## WHAT IS MIROFISH & WHY IT MATTERS

**[MiroFish](https://github.com/666ghj/MiroFish)** (44K+ GitHub stars) is an open-source swarm intelligence engine by Shanda Group that:

1. **Creates digital humans** — Each agent has a unique personality, memory, behavioral logic, and biases
2. **Simulates social dynamics** — Agents interact on simulated Twitter/Reddit, post opinions, argue, form consensus
3. **Predicts outcomes** — Emergent group behavior predicts real-world outcomes better than individual models
4. **Uses knowledge graphs** — GraphRAG for entity relationships, Zep for long-term memory
5. **Generates reports** — ReportAgent synthesizes simulation results into detailed analysis

### MiroFish Architecture (What We're Using)

```
Seed Material (event/news)
    ↓
Knowledge Graph Builder (GraphRAG + entity extraction)
    ↓
Agent Profile Generator (unique personalities, biases, expertise)
    ↓
Parallel Social Simulation (Twitter + Reddit)
    ↓
Dynamic Memory Updates (round-by-round belief evolution)
    ↓
Report Agent (synthesis + predictions)
    ↓
User Interaction (chat with any agent, probe their reasoning)
```

### License: AGPL-3.0
We fork it, keep our additions AGPL-compatible (our frontend is separate, proprietary). The simulation engine itself can stay open source — our moat is the **financial integration + UX + community + accuracy tracking**, not the raw simulation code.

---

## V7 FEATURE DESIGN

### Feature 1: Agent Market Debate Visualization

**The Core Experience:**
User enters `CVX` and selects "Iran War Escalation." Instead of just seeing a Monte Carlo cone, they watch:

```
┌─────────────────────────────────────────────────────────────┐
│  CVX $155.20  ▲ Monte Carlo Simulation  [30D] [90D] [180D] │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  📈 Chart with simulation overlay                     │  │
│  │  Green/Red paths from Monte Carlo                     │  │
│  │  + Agent Consensus Bands (swarm intelligence overlay) │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  🧠 Agent Debate: "Iran War Escalation"                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🛢️ OilTrader_Mike (Commodity Analyst, 15yr exp)       │  │
│  │  "CVX is sitting on a goldmine. Iran escalation =     │  │
│  │   Strait of Hormuz risk. Oil to $120 minimum.         │  │
│  │   CVX has the lowest breakeven in the majors."        │  │
│  │   📊 Prediction: CVX → $185 in 30 days (+19%)        │  │
│  │                                                        │  │
│  │  🏦 FedWatcher_Sarah (Macro Strategist, ex-Goldman)    │  │
│  │  "@OilTrader_Mike You're ignoring demand destruction.  │  │
│  │   $120 oil = recession signal. Fed pivots hawkish.     │  │
│  │   This is bearish for everything including oil stocks." │  │
│  │   📊 Prediction: CVX → $140 in 30 days (-10%)        │  │
│  │                                                        │  │
│  │  🎖️ GeoPol_Analyst (Defense Intelligence, 20yr exp)    │  │
│  │  "Both of you are overstating duration. Iran conflicts │  │
│  │   historically last 2-8 weeks. Oil spikes then reverts.│  │
│  │   CVX pops short-term, mean-reverts by 60 days."      │  │
│  │   📊 Prediction: CVX → $170 (30D), $158 (60D)        │  │
│  │                                                        │  │
│  │  🛒 RetailTrader_Dave (3yr experience, options focus)  │  │
│  │  "Loading up on CVX April $160 calls. The vol spike    │  │
│  │   alone makes these print even if oil only hits $100." │  │
│  │   📊 Prediction: CVX calls +300% in 2 weeks           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Swarm Consensus: CVX → $168.40 (+8.5%) | Confidence: 72%   │
│  Bull: 62% | Bear: 23% | Neutral: 15%                       │
│  [💬 Ask an agent] [🔄 Re-simulate] [📊 Full Report]        │
└─────────────────────────────────────────────────────────────┘
```

**What Makes This Addictive:**
- **Entertainment value** — Watching AI agents argue about your stock is inherently compelling
- **Learning** — Each agent explains their reasoning; users learn market dynamics by reading debates
- **Variable reward** — Different agents emerge as "right" over time; who's winning the debate? 
- **Social proof** — "62% of agents are bullish" is more intuitive than "median target: $168"

### Feature 2: Chat With Any Agent

After the simulation runs, users can click on any agent to have a 1-on-1 conversation:

```
┌─────────────────────────────────────────┐
│  💬 Chat with OilTrader_Mike            │
│                                          │
│  You: "What if Iran war ends in 5 days? │
│        Does CVX still go up?"            │
│                                          │
│  🛢️ Mike: "Great question. If resolution│
│  is that fast, the oil premium deflates  │
│  immediately. CVX probably gives back    │
│  the spike — maybe lands at $158-160.    │
│  The real play in a fast resolution is   │
│  airlines and shipping, not oil."        │
│                                          │
│  You: "What's your track record?"        │
│                                          │
│  🛢️ Mike: "I was 78% accurate on oil    │
│  event predictions over the last 50      │
│  simulations. My biggest miss was the    │
│  2026 OPEC cut — I underestimated       │
│  Russia compliance."                     │
│                                          │
│  [Type a message...]                     │
└─────────────────────────────────────────┘
```

**Why This Is Sticky:**
- Users form "relationships" with agents they trust (Endowment Effect)
- They come back to check if "their" agent was right (Zeigarnik Effect)
- Agents remember previous conversations (long-term memory via Zep)
- Users share screenshots of agent conversations → viral distribution

### Feature 3: Agent Consensus → Chart Overlay

The swarm consensus is plotted directly on the stock chart:

```
Chart Layers (toggleable):
1. Historical price (always on)
2. Monte Carlo paths (existing — random walk)
3. Agent Consensus Band (NEW — swarm intelligence)
4. Individual Agent Predictions (dots on chart)
5. Bull/Bear Ratio Timeline (bottom indicator)
```

The **Agent Consensus Band** is different from Monte Carlo:
- Monte Carlo: mathematical random walk with drift
- Agent Consensus: weighted average of agent predictions, where weights = each agent's historical accuracy
- Users can see where math and human-like reasoning **agree** (high confidence) or **disagree** (uncertainty)

### Feature 4: Create Your Own Agent

**Free Tier:** Watch simulations, chat with agents
**Pro Tier ($49/mo):** Create custom agents with specific expertise and biases

```
┌─────────────────────────────────────────┐
│  🛠️ Create Agent                        │
│                                          │
│  Name: [MyHedgeFundGuy               ]  │
│  Role: [Hedge Fund Portfolio Manager  ]  │
│  Expertise: [Tech sector, M&A        ]  │
│  Bias: [Slightly bearish, contrarian ]  │
│  Experience: [20 years               ]  │
│  Style: [Data-driven, uses charts    ]  │
│                                          │
│  Seed Knowledge:                         │
│  [Upload: earnings reports, 13F, etc.]   │
│                                          │
│  [Create Agent — joins next simulation]  │
└─────────────────────────────────────────┘
```

Custom agents:
- Participate in ALL simulations run by that user
- Build accuracy track records over time
- Can be **published to the Marketplace** (v6 feature integration)
- Other users can "hire" your agent into their simulations for points/$$

### Feature 5: Time-Lapse Replay

Watch a 40-round simulation compressed into a 60-second visual replay:

```
Round 1/40: Day 1 — War declared
├── 70% agents bullish on CVX (+oil thesis)
├── 25% bearish (demand destruction)
└── 5% neutral

Round 10/40: Day 3 — Strait of Hormuz threatened
├── 85% agents bullish on CVX (oil premium expanding)
├── 10% bearish (global recession fear)
└── 5% neutral
├── FedWatcher_Sarah switches from bear → neutral
└── "I was wrong about immediate recession. Short-term oil trade is valid."

Round 25/40: Day 14 — Ceasefire rumors
├── 45% agents bullish (trimming positions)
├── 30% bearish (reversal trade)
├── 25% neutral
└── OilTrader_Mike: "Taking profits here. Risk/reward flipped."

Round 40/40: Day 30 — Simulation complete
├── Final consensus: CVX $168 (+8.5%)
├── Most accurate agent: GeoPol_Analyst (called the revert)
└── Least accurate: RetailTrader_Dave (over-leveraged calls)
```

**Engagement hooks:**
- "Which agent will you follow next time?"
- Share replay as a GIF/video on social media
- Watch agents **change their minds** in real-time (fascinating)
- Speed control: 0.5x, 1x, 2x, 4x playback

---

## INTERACTION DESIGN FOR MAXIMUM USE TIME

### Hook 1: Agent Loyalty System
Users "follow" agents. When they follow an agent, they see that agent's predictions highlighted in future simulations. Over time, users develop favorites — just like following analysts on X/Twitter.

**Engagement math:**
- Follow 3 agents → come back to see if they were right → 3 retention triggers per simulation
- Agent accuracy updates weekly → weekly return visit guaranteed
- "Your agent OilTrader_Mike just made a new prediction on NVDA" → push notification

### Hook 2: Debate Participation
Pro users can **inject their own opinion** into the simulation:

```
🗣️ You (as a participant): "I think you're all wrong. 
CVX is going DOWN because the Biden admin will release 
strategic reserves."

→ Agents respond to your opinion in real-time
→ FedWatcher_Sarah: "Good point. SPR release would cap 
   oil at $105. Let me adjust my model..."
→ OilTrader_Mike: "That's a political play. SPR is 
   already at historic lows. They can't afford to release."
```

This turns passive watching into active participation. Users spend 10-20 minutes per session instead of 2-3.

### Hook 3: Prediction Tournaments
Monthly tournaments where users and agents compete:
- Users make predictions at the start of the month
- Agents make predictions through simulations
- At month-end, score everyone on accuracy
- **Leaderboard: Humans vs. AI** (compelling narrative)
- Top human predictors earn "Oracle" badge + marketplace promotion

### Hook 4: Agent Memory Across Simulations
Agents remember past simulations:
- "Last time I predicted CVX during an oil crisis, I was 12% too bullish. Adjusting down."
- Users see agents **learning** — creates a sense of investment in the agent's growth
- Long-term users have agents with deep memory (6+ months of simulation history)

### Hook 5: Scenario Remix
"What if this agent was wrong?" button:
- Click on any agent's prediction → flip it → re-run simulation
- See how removing the bullish oil analyst changes the consensus
- Infinite what-if exploration → 15+ minutes per session

---

## TECHNICAL ARCHITECTURE

### Integration Plan

```
                    MonteCarloo (existing)
                           │
                    ┌──────┴──────┐
                    │   Frontend   │ (Next.js on Vercel)
                    │  /sim/[tkr]  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────┴───┐  ┌────┴────┐  ┌───┴─────────┐
     │ Monte Carlo │  │ MiroFish │  │  Marketplace │
     │  Engine     │  │  Engine  │  │  Backend     │
     │ (existing)  │  │  (NEW)   │  │  (existing)  │
     │  Railway    │  │ Railway  │  │  Railway     │
     └────────────┘  └─────────┘  └─────────────┘
                          │
                     ┌────┴────┐
                     │  Zep    │  (Memory/Graph)
                     │  Cloud  │  (Free tier)
                     └────────┘
```

### MiroFish Integration Service (New Railway Service)

```python
# New microservice: mirofish-engine/
├── Dockerfile
├── requirements.txt
├── api.py              # FastAPI endpoints
├── agent_factory.py    # Create financial agents with market personas
├── simulation.py       # Run MiroFish simulation with stock context
├── consensus.py        # Extract swarm consensus → price prediction
├── memory.py           # Agent memory management (Zep)
└── chat.py             # 1-on-1 agent chat endpoint
```

### API Design

```
# Start a simulation for a stock event
POST /api/swarm/simulate
{
  "ticker": "CVX",
  "event": "Iran War Escalation",
  "probability": 0.65,
  "agents": 20,        # Free: 20, Pro: 100, Premium: 1000
  "rounds": 10,        # Free: 10, Pro: 40, Premium: 100
}

# Stream debate in real-time (SSE)
GET /api/swarm/{sim_id}/stream
→ Server-Sent Events with agent messages as they happen

# Get simulation results
GET /api/swarm/{sim_id}/results
→ { consensus_price, confidence, agent_predictions[], debate_log[] }

# Chat with agent
POST /api/swarm/{sim_id}/agents/{agent_id}/chat
{ "message": "What if Iran war ends tomorrow?" }
→ { "response": "In that scenario, I'd expect CVX to..." }

# Get agent profiles and track records
GET /api/swarm/agents/{agent_id}/profile
→ { name, role, accuracy, prediction_history[], personality }
```

### Cost Analysis

| Component | Cost | Notes |
|-----------|------|-------|
| LLM (Qwen-Plus via Aliyun) | ~$0.002/agent-round | 20 agents × 10 rounds = $0.40/simulation |
| Zep Cloud (memory) | Free tier: 1000 sessions/mo | Enough for MVP |
| Railway (mirofish service) | ~$5/mo (shared) | Same project, new service |
| **Total per simulation** | **~$0.40** | Free: 2/day, Pro: 20/day, Premium: unlimited |

### Tier Limits (v7)

| Feature | Free | Pro ($49/mo) | Premium ($149/mo) |
|---------|------|------|---------|
| Monte Carlo sims | Unlimited | Unlimited | Unlimited |
| Events per scenario | 2 | Unlimited | Unlimited |
| Pine Script overlays | 1 | Unlimited | Unlimited |
| **Swarm simulations** | **2/day** | **20/day** | **Unlimited** |
| **Agents per sim** | **20** | **100** | **1,000** |
| **Rounds per sim** | **10** | **40** | **100** |
| **Chat with agents** | **5 msg/day** | **Unlimited** | **Unlimited** |
| **Create custom agents** | ❌ | **5 agents** | **Unlimited** |
| **Publish agents to marketplace** | ❌ | ❌ | ✅ |

---

## COMPETITIVE MOAT ANALYSIS

### Direct Competitors: None
Nobody combines multi-agent social simulation with stock chart visualization. This category does not exist.

### Indirect Competitors

| Competitor | What They Do | Why We Win |
|-----------|--------------|-----------|
| **MiroFish (open source)** | General prediction engine | We're the financial vertical with chart integration + community |
| **TradingView** | Charts + indicators | No AI simulation, no agent debates, no swarm intelligence |
| **Polymarket** | Binary prediction markets | Human-only, no agent simulation, no stock-specific analysis |
| **ChatGPT/Grok** | Single AI opinion | One brain ≠ swarm intelligence. No debate, no chart overlay |
| **Bloomberg Terminal** | Professional data + analytics | $24K/yr, no simulation, no community, no democratized access |
| **Seeking Alpha** | Human analyst opinions | Manual, slow, no simulation, no accuracy tracking |

### Our Three Moats

1. **Data Moat**: Every simulation generates training data. Agent accuracy improves over time. Competitors would need months of simulations to catch up.

2. **Network Moat**: Community discussions, accuracy leaderboards, marketplace listings, agent followers — all create switching costs. Users invested in "their" agents won't leave.

3. **Integration Moat**: Monte Carlo + swarm intelligence + chart overlay + agent chat + marketplace + Pine Script — this stack is hard to replicate. Each layer reinforces the others.

---

## FINANCIAL MODEL

### Revenue Impact of v7

| Source | Current (v6) | With v7 | Growth |
|--------|-------------|---------|--------|
| Pro subscriptions | $49/mo × users | $49/mo × 3x users | 3x (swarm is the hook) |
| Premium subscriptions | $149/mo × users | $149/mo × 5x users | 5x (custom agents drive premium) |
| Marketplace (agents) | $0 | 30% of custom agent sales | New revenue stream |
| API access | $0 | Pay-per-simulation ($0.50/sim) | New revenue stream |

### User Engagement Impact

| Metric | Current | Projected with v7 |
|--------|---------|-------------------|
| Avg session time | 3 min | 12-15 min (agent debates + chat) |
| Daily active users | — | 5x (entertainment + learning value) |
| Conversion free→paid | ~2% | ~5% (custom agents are the hook) |
| Referral K-factor | — | 0.7+ (shareable debates, replays) |
| 30-day retention | — | 40%+ (agent memory = continuity) |

---

## BUILD PLAN

### Phase 1: Core Engine (5 days)
1. Fork MiroFish to leelooai999-dot/MiroFish
2. Build `agent_factory.py` — financial market personas (10 archetypes)
3. Build `consensus.py` — extract price predictions from agent debate
4. Wire MiroFish to MonteCarloo API as new endpoint
5. Deploy as Railway service

### Phase 2: Debate Visualization (5 days)
6. Frontend: Agent debate panel below chart
7. Real-time streaming (SSE) of agent messages
8. Agent Consensus Band on chart (swarm overlay)
9. Individual agent prediction dots on chart
10. Bull/Bear ratio indicator

### Phase 3: Agent Chat + Interaction (5 days)
11. 1-on-1 chat with any agent post-simulation
12. Agent memory across simulations (Zep integration)
13. Time-lapse replay viewer
14. "Inject your opinion" for Pro users
15. Agent follow system + notifications

### Phase 4: Custom Agents + Marketplace (5 days)
16. Custom agent creation UI
17. Agent accuracy tracking system
18. Publish agents to marketplace
19. Agent subscription billing
20. Prediction tournaments (monthly)

**Total: 20 days** (4 sprints of 5 days)

---

## CEO DECISION FRAMEWORK

### Why Now

1. **MiroFish is hot** — 44K stars, trending on GitHub. Building on it now = riding the wave.
2. **Nobody has verticalized it for finance** — We're first movers in the most valuable vertical.
3. **Our infrastructure is ready** — Stripe, auth, marketplace, community, charts — all built.
4. **Cost is minimal** — Qwen-Plus via Aliyun is cheap ($0.40/sim). Zep has a free tier.
5. **GPL-compatible** — AGPL license allows forking. Our proprietary layer (frontend + community + marketplace) is separate.

### Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| LLM costs spiral | Medium | High | Implement cost caps per user, use cheaper models for large sims |
| Simulation quality is low | Low | High | Start with 20 agents/10 rounds, iterate on agent prompts |
| MiroFish upstream breaks | Low | Medium | Pin our fork to a stable commit, don't auto-merge |
| Users don't engage with debates | Low | Medium | A/B test debate panel on vs off, iterate on UX |
| Legal (financial advice) | Medium | High | Clear "simulation only, not advice" disclaimers everywhere |

### 3 Priorities (CEO Rule #1)

1. **Fork MiroFish, build financial agent factory, wire to chart** (this IS the product)
2. **Agent chat with memory** (this is the retention mechanism)
3. **Custom agents on marketplace** (this is the business model)

Everything else is derivative of these three.

---

## BLUE OCEAN STRATEGY MAP

```
                    HIGH
                     │
   Chart Quality     │         ● MonteCarloo v7
                     │        (Only player here)
                     │
   AI Agent Debate   │                    ● MiroFish
                     │                    (No chart, no finance)
                     │
   Agent Chat        │
                     │
   Swarm Intelligence│         
                     │
   Community         │    ● TradingView
                     │    (No AI, strong community)
                     │
   Monte Carlo Sim   │    
                     │
   Price Prediction  │              ● Bloomberg
                     │              (No simulation, pro-only)
                    LOW
                     └──────────────────────────────────
                    LOW              →              HIGH
                              ACCESSIBILITY
```

**MonteCarloo v7 occupies the top-right quadrant that nobody else can reach** — maximum AI capability with maximum accessibility. Bloomberg has capability but no accessibility ($24K/yr). TradingView has accessibility but no AI simulation. MiroFish has AI but no financial integration.

We are the only product that combines all four: **swarm intelligence + stock charts + community + accessibility.**

---

## FILES

- `business-proposal-v7.md` — **THIS FILE**
- `marketplace-proposal.md` — Marketplace spec (v6 feature, reused in v7)
- `business-proposal-v6.md` — Previous version (social simulation network)
- `business-proposal-v5.md` — Temporal simulation platform
- `business-proposal-v4.1.md` — Original Monte Carlo + community

---

*"One AI opinion is a guess. A thousand AI opinions is intelligence."*
— MonteCarloo v7

*This is a strategic document. Not investment advice. Consult a securities lawyer before accepting payment for financial content.*
