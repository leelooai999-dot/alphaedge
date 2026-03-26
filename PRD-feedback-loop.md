# PRD: User Feedback Loop System
## "The Improvement Engine"

**Goal:** A closed-loop system where user behavior and explicit feedback automatically surface product improvements, prioritize them, and (where safe) implement them without human intervention.

---

## Architecture: The Feedback Flywheel

```
┌─────────────────────────────────────────────────────────────┐
│                    THE FEEDBACK FLYWHEEL                     │
│                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│   │ COLLECT  │───→│ ANALYZE  │───→│ PROPOSE  │              │
│   │          │    │          │    │          │              │
│   │ implicit │    │ patterns │    │ ranked   │              │
│   │ explicit │    │ clusters │    │ proposals│              │
│   │ in-app   │    │ urgency  │    │ by ROI   │              │
│   └──────────┘    └──────────┘    └──────────┘              │
│        ↑                               │                     │
│        │                               ↓                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│   │ MEASURE  │←───│ DEPLOY   │←───│ BUILD    │              │
│   │          │    │          │    │          │              │
│   │ A/B test │    │ canary   │    │ auto for │              │
│   │ metrics  │    │ rollout  │    │ Tier 1   │              │
│   │ compare  │    │ rollback │    │ proposal │              │
│   └──────────┘    └──────────┘    │ for 2/3  │              │
│                                    └──────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: COLLECT — Three Feedback Channels

### 1A. Implicit Feedback (Behavioral Telemetry)

No user action required. The app observes behavior patterns:

```javascript
// Frontend: lightweight event tracking (privacy-respecting, no PII)
const trackEvent = (event, data) => {
  fetch('/api/feedback/event', {
    method: 'POST',
    body: JSON.stringify({
      event,
      data,
      session_id: getSessionId(),
      timestamp: Date.now(),
      path: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    }),
  }).catch(() => {}); // fire-and-forget
};

// What we track:
trackEvent('simulation_run', { ticker, events: eventIds, horizon });
trackEvent('slider_interaction', { eventId, param, oldVal, newVal, duration_ms });
trackEvent('page_exit', { page, time_on_page_ms, scroll_depth_pct });
trackEvent('feature_discovery', { feature, discovered_how }); // click, scroll, search
trackEvent('error_encountered', { type, message, page });
trackEvent('search_no_results', { query });
trackEvent('share_attempt', { method, success });
trackEvent('scenario_abandon', { step, events_count }); // started but didn't save
```

**Key behavioral signals:**
| Signal | What It Means | Example |
|--------|-------------|---------|
| High bounce rate on page | UX confusion or wrong expectation | Explore page: 60% bounce → redesign needed |
| Slider dragged then reset | User confused by parameter | "Severity" label unclear → add tooltip |
| Search with no results | Missing stock or event | "PLTR" searched 50x → add to stock list |
| Simulation started but not saved | Friction in save flow | Save button not visible → move above fold |
| Share button clicked but failed | Sharing UX broken | Clipboard API blocked → add fallback |
| Time on sim page > 5min | High engagement | This is working, don't change it |
| Repeated visits same ticker | Power user pattern | Suggest "save to dashboard" |

### 1B. Explicit Feedback (Micro-Surveys)

Small, contextual, non-intrusive. Maximum 1 per session.

```
┌─────────────────────────────────────────────┐
│ 🎯 Quick question (optional)                │
│                                              │
│ How useful was this simulation?              │
│                                              │
│  😞  😐  🙂  😀  🤩                          │
│                                              │
│ What would make it better? (optional)        │
│ ┌──────────────────────────────────────────┐ │
│ │ _______________________________________  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [Skip]                        [Submit 💬]    │
└─────────────────────────────────────────────┘
```

**Trigger rules (when to show):**
- After 3rd simulation in a session (engaged user)
- After first share (moment of delight)
- After scenario save (investment moment)
- Never on first visit
- Never twice in 24 hours
- Never if user previously clicked "Skip"

### 1C. In-App Feedback Widget

Persistent but minimal. Accessible from any page.

```
┌──┐
│💬│  ← Floating button, bottom-right
└──┘

Click expands to:
┌─────────────────────────────────┐
│ 💬 Feedback                     │
│                                  │
│ ○ Bug report                    │
│ ○ Feature request               │
│ ○ Event suggestion              │
│ ○ Just saying hi                │
│                                  │
│ ┌──────────────────────────────┐│
│ │                              ││
│ │ Type here...                 ││
│ │                              ││
│ └──────────────────────────────┘│
│                                  │
│ [Submit]                         │
└─────────────────────────────────┘
```

---

## Layer 2: ANALYZE — Pattern Recognition

### Backend: Feedback Aggregation Engine

```python
# Runs nightly (can hook into existing nightly build cron)

def analyze_feedback():
    """Aggregate and cluster feedback into actionable insights."""
    
    # 1. Behavioral clustering
    clusters = cluster_behavioral_signals(last_24h=True)
    # Example output: 
    # {"search_gaps": ["PLTR", "COIN", "ARM"], 
    #  "high_abandon_pages": ["/explore"], 
    #  "broken_features": ["share_twitter"]}
    
    # 2. Explicit feedback clustering (NLP)
    themes = cluster_text_feedback(last_7d=True)
    # Example: 
    # [{"theme": "more events", "count": 23, "sentiment": 0.4},
    #  {"theme": "mobile layout", "count": 15, "sentiment": -0.3},
    #  {"theme": "love the simulator", "count": 42, "sentiment": 0.9}]
    
    # 3. Score and rank
    proposals = []
    for cluster in clusters + themes:
        score = (
            cluster.frequency * 0.3 +       # How often it appears
            cluster.user_impact * 0.3 +      # How many users affected  
            cluster.revenue_impact * 0.2 +   # Does it affect conversion?
            cluster.ease_of_fix * 0.2        # Can we fix it easily?
        )
        proposals.append(Proposal(
            title=cluster.title,
            description=cluster.description,
            score=score,
            tier=classify_tier(cluster),  # Tier 1/2/3
            source_count=cluster.count,
            source_type=cluster.source,  # implicit/explicit/widget
        ))
    
    return sorted(proposals, key=lambda p: p.score, reverse=True)
```

### Automatic Tier Classification

| Signal Pattern | Auto-Classification | Action |
|---------------|:-------------------:|--------|
| Missing stock in search | **Tier 1** (auto-fix) | Add to POPULAR_STOCKS list |
| Missing event type (5+ requests) | **Tier 2** (build + report) | Draft event, add to events.py |
| "X is broken" (3+ reports) | **Tier 1** (auto-fix) | Debug, fix, deploy |
| "Add feature X" (10+ requests) | **Tier 2** (proposal) | Write mini-PRD, present to user |
| Pricing feedback | **Tier 3** (propose + wait) | Log, present in weekly review |
| UX confusion pattern | **Tier 1** (auto-fix) | Add tooltip, improve label |
| Performance complaint | **Tier 1** (auto-fix) | Profile, optimize, deploy |

---

## Layer 3: PROPOSE → BUILD → DEPLOY

### The Nightly Improvement Cycle

Hooks into existing nightly build cron (3 AM):

```python
async def nightly_feedback_review():
    """
    Run as part of nightly build cron.
    Analyzes accumulated feedback, generates proposals, 
    auto-implements Tier 1 fixes.
    """
    
    # 1. Analyze
    proposals = analyze_feedback()
    
    # 2. Auto-implement Tier 1
    for p in proposals:
        if p.tier == 1 and p.score > 0.7:
            try:
                implement_tier1(p)  # Add stock, fix label, add tooltip
                log_improvement(p, status="shipped")
            except Exception as e:
                log_improvement(p, status="failed", error=str(e))
    
    # 3. Draft Tier 2 proposals
    tier2 = [p for p in proposals if p.tier == 2 and p.score > 0.5]
    if tier2:
        save_proposals(tier2)  # Save to memory/feedback-proposals.md
        # Will be presented to user at next session
    
    # 4. Log Tier 3 for manual review
    tier3 = [p for p in proposals if p.tier == 3]
    if tier3:
        save_for_review(tier3)  # Save to memory/feedback-escalations.md
    
    # 5. Report summary
    return {
        "analyzed": len(proposals),
        "auto_fixed": len([p for p in proposals if p.tier == 1]),
        "proposed": len(tier2),
        "escalated": len(tier3),
    }
```

---

## Layer 4: MEASURE — Did It Work?

### Before/After Comparison

Every change gets a measurement window:

```python
@dataclass
class ImprovementMetric:
    change_id: str
    metric: str           # "bounce_rate", "sim_completions", "shares"
    baseline_value: float  # 7-day average before change
    current_value: float   # 7-day average after change
    delta_pct: float       # % change
    confidence: float      # statistical significance
    
    @property
    def is_improvement(self) -> bool:
        return self.delta_pct > 0 and self.confidence > 0.8
    
    @property
    def should_rollback(self) -> bool:
        return self.delta_pct < -10 and self.confidence > 0.9
```

### Auto-Rollback

If a Tier 1 auto-fix makes things worse (measured over 48h), auto-rollback:

```python
if metric.should_rollback:
    rollback_change(metric.change_id)
    alert_user(f"Rolled back {metric.change_id}: {metric.metric} dropped {metric.delta_pct:.1f}%")
```

---

## Implementation: Backend Endpoints

### New API Endpoints

```
POST /api/feedback/event          # Implicit behavioral event
POST /api/feedback/survey         # Explicit micro-survey response  
POST /api/feedback/widget         # In-app feedback widget submission
GET  /api/feedback/stats          # Admin: feedback summary
GET  /api/feedback/proposals      # Admin: ranked improvement proposals
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS feedback_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id TEXT,
    event_type TEXT NOT NULL,
    event_data TEXT,  -- JSON
    page TEXT,
    viewport TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id TEXT,
    rating INTEGER,  -- 1-5
    comment TEXT,
    trigger_context TEXT,  -- what triggered the survey
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_widget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id TEXT,
    category TEXT,  -- bug, feature, event, general
    message TEXT NOT NULL,
    page TEXT,
    status TEXT DEFAULT 'new',  -- new, reviewed, implemented, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_proposals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    tier INTEGER,  -- 1, 2, 3
    score REAL,
    source_count INTEGER,
    source_type TEXT,
    status TEXT DEFAULT 'proposed',  -- proposed, approved, building, shipped, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fb_events_type ON feedback_events(event_type);
CREATE INDEX IF NOT EXISTS idx_fb_events_time ON feedback_events(created_at);
CREATE INDEX IF NOT EXISTS idx_fb_surveys_time ON feedback_surveys(created_at);
```

---

## Frontend Implementation

### 1. Event Tracker (add to layout.tsx)

```typescript
// lib/feedback.ts
const FEEDBACK_API = process.env.NEXT_PUBLIC_API_URL || '';

export function trackEvent(event: string, data?: Record<string, any>) {
  const sessionId = getOrCreateSessionId();
  fetch(`${FEEDBACK_API}/api/feedback/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      event_type: event,
      event_data: data || {},
      page: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    }),
  }).catch(() => {}); // Never block UX
}
```

### 2. Micro-Survey Component

```typescript
// components/MicroSurvey.tsx
// Shows after 3rd simulation, after first share, or after save
// Maximum once per 24h
// Stores "last_survey_shown" in localStorage
```

### 3. Feedback Widget Component

```typescript
// components/FeedbackWidget.tsx  
// Floating button bottom-right
// Expands to category selector + text input
// Collapses on submit with "Thanks!" animation
```

---

## Integration with Standing Orders

This feedback loop plugs into the existing autonomy framework:

| Feedback Result | Standing Orders Tier | Action |
|----------------|:-------------------:|--------|
| Missing stock (10+ searches) | Tier 1 — Act + Report | Auto-add to stock list, report in daily notes |
| Broken feature (3+ reports) | Tier 1 — Act + Report | Fix bug, deploy, report |
| UX confusion (pattern detected) | Tier 1 — Act + Report | Add tooltip/label fix, deploy |
| Feature request (10+ requests) | Tier 2 — Act + Report | Write mini-PRD, build if approved in STANDING-ORDERS |
| New event type (5+ requests) | Tier 2 — Act + Report | Draft event definition, add to engine |
| Pricing/billing feedback | Tier 3 — Propose + Wait | Present to user in weekly review |
| Security/auth concern | Tier 3 — Propose + Wait | Investigate, present findings |

---

## Privacy & Data Handling

- **No PII in behavioral events** — only session_id (random, not tied to identity)
- **Feedback text is stored server-side** — never sent to third parties
- **Users can opt out** — "Don't show feedback prompts" in settings
- **Data retention**: behavioral events purged after 90 days, aggregated stats kept
- **GDPR compliance**: users can request deletion of their feedback data

---

## Metrics That Matter

| Metric | Target | Measurement |
|--------|--------|-------------|
| Feedback collection rate | 5% of sessions leave explicit feedback | survey_responses / total_sessions |
| Auto-fix success rate | 80% of Tier 1 fixes improve target metric | improvements with positive delta / total Tier 1 |
| Proposal-to-ship time | <7 days for Tier 2 proposals | shipped_at - created_at |
| User satisfaction trend | NPS > 50 after 3 months | rolling 30-day survey average |
| Feature discovery rate | 60% of users try new features within 7 days | feature_discovery events / active users |

---

## Rollout Plan

| Phase | What | When |
|-------|------|------|
| 1 | Backend: feedback tables + event/survey/widget endpoints | Day 1 |
| 2 | Frontend: event tracker in layout.tsx (implicit telemetry) | Day 2 |
| 3 | Frontend: feedback widget component | Day 3 |
| 4 | Frontend: micro-survey component with trigger rules | Day 4 |
| 5 | Backend: nightly analysis + proposal generation | Day 5 |
| 6 | Integration: hook into nightly build cron | Day 5 |
| 7 | Measure: baseline metrics for 7 days | Days 6-12 |
| 8 | Iterate: tune trigger rules, improve clustering | Ongoing |

---

*The best product teams don't build what they think is right. They build what users show them is needed — then iterate faster than anyone expects.*
