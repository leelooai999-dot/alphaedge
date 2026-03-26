"""
AlphaEdge FastAPI Backend Server.

Wraps the Monte Carlo simulation engine with REST endpoints.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import simulation
import correlations
from events import EVENTS, list_all_events, list_categories
from db import increment_sim_counter, get_stats as get_global_stats
import scenarios
import time

app = FastAPI(title="AlphaEdge API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- TTL Cache ---

class TTLCache:
    """Simple in-memory cache with per-key TTL."""
    def __init__(self, default_ttl: float = 300):
        self._cache: Dict[str, tuple] = {}  # key -> (value, expiry)
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if time.time() > expiry:
            del self._cache[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: Optional[float] = None):
        self._cache[key] = (value, time.time() + (ttl or self._default_ttl))

    def invalidate(self, key: str):
        self._cache.pop(key, None)


# Price cache: 5 min TTL
price_cache = TTLCache(default_ttl=300)
# Volatility cache: 30 min TTL
vol_cache = TTLCache(default_ttl=1800)
# History cache: 5 min TTL (replaces unbounded dict)
history_cache = TTLCache(default_ttl=300)


# --- Request/Response Models ---

class EventInput(BaseModel):
    id: str
    params: Dict[str, float] = {}
    probability: float = 1.0
    event_date: Optional[str] = None  # v5: ISO date string for temporal shaping


class SimulateRequest(BaseModel):
    ticker: str
    events: List[EventInput] = []
    horizon_days: int = 30
    n_simulations: int = 2000
    fast: bool = False


class SimulateResponse(BaseModel):
    ticker: str
    current_price: float
    horizon_days: int
    n_simulations: int
    events: List[str]
    median_target: float
    percentile_5: float
    percentile_25: float
    percentile_75: float
    percentile_95: float
    probability_above_current: float
    max_drawdown_median: float
    expected_return_pct: float
    event_impact_breakdown: Dict[str, float]
    paths_sample: Optional[List[List[float]]] = None
    baseline_target: Optional[float] = None
    event_impact_usd: Optional[float] = None


# --- Price Cache (fallback for yfinance rate limits) ---

PRICE_CACHE: Dict[str, float] = {
    "AAPL": 195.00, "MSFT": 420.00, "GOOGL": 170.00, "AMZN": 185.00,
    "NVDA": 108.00, "META": 585.00, "TSLA": 248.00, "JPM": 205.00,
    "XOM": 108.00, "CVX": 148.00, "SPY": 520.00, "QQQ": 445.00,
    "GLD": 280.00, "LMT": 460.00, "AMD": 115.00, "BA": 180.00,
    "INTC": 24.00, "DIS": 112.00, "NFLX": 880.00, "PFE": 27.00,
    "WMT": 165.00, "BAC": 38.00, "GS": 490.00, "C": 58.00,
    "V": 280.00, "MA": 460.00, "LLY": 820.00, "UNH": 320.00,
    "RTX": 95.00, "NOC": 455.00, "GD": 280.00, "AVGO": 145.00,
    "CRM": 255.00, "COP": 110.00, "SLB": 42.00, "OXY": 58.00,
}

VOL_CACHE: Dict[str, float] = {
    "AAPL": 0.25, "MSFT": 0.22, "GOOGL": 0.28, "AMZN": 0.30,
    "NVDA": 0.45, "META": 0.35, "TSLA": 0.55, "JPM": 0.25,
    "XOM": 0.30, "CVX": 0.28, "SPY": 0.18, "QQQ": 0.22,
    "GLD": 0.20, "LMT": 0.22, "AMD": 0.42, "BA": 0.35,
    "INTC": 0.40, "DIS": 0.28, "NFLX": 0.38, "PFE": 0.22,
    "WMT": 0.20, "BAC": 0.28, "GS": 0.25, "C": 0.30,
    "V": 0.25, "MA": 0.28, "LLY": 0.30, "UNH": 0.22,
    "RTX": 0.28, "NOC": 0.22, "GD": 0.24, "AVGO": 0.35,
    "CRM": 0.30, "COP": 0.30, "SLB": 0.35, "OXY": 0.35,
}


def get_price_with_fallback(ticker: str) -> float:
    """Try yfinance first, fall back to cache."""
    ticker = ticker.upper()
    # Check TTL cache first
    cached = price_cache.get(ticker)
    if cached:
        return cached

    try:
        price = simulation.get_current_price(ticker)
        if price > 0:
            price_cache.set(ticker, price)
            return price
    except Exception:
        pass
    fallback = PRICE_CACHE.get(ticker)
    if fallback:
        price_cache.set(ticker, fallback, ttl=60)
        return fallback
    price_cache.set(ticker, 100.0, ttl=30)
    return 100.0


def get_vol_with_fallback(ticker: str) -> float:
    """Try yfinance first, fall back to cache."""
    ticker = ticker.upper()
    # Check TTL cache first
    cached = vol_cache.get(ticker)
    if cached:
        return cached

    try:
        vol = simulation.get_stock_volatility(ticker)
        if vol > 0:
            vol_cache.set(ticker, vol)
            return vol
    except Exception:
        pass
    fallback = VOL_CACHE.get(ticker)
    if fallback:
        vol_cache.set(ticker, fallback, ttl=120)
        return fallback
    vol_cache.set(ticker, 0.30, ttl=60)
    return 0.30


# --- Endpoints ---

@app.get("/")
def root():
    return {"service": "AlphaEdge API", "version": "0.1.0"}


@app.get("/api/events")
def get_events(category: Optional[str] = None, live: bool = False):
    """List all available events, optionally filtered by category.
    Pass ?live=true to include Polymarket live odds."""
    events = list_all_events()
    if category:
        events = [e for e in events if e.category == category]

    # Optionally enrich with Polymarket live odds
    live_odds = {}
    if live:
        try:
            from polymarket import get_all_live_odds
            live_odds = get_all_live_odds()
        except Exception:
            pass

    return [
        {
            "id": e.key,
            "name": e.name,
            "category": e.category,
            "description": e.description,
            "probability": e.probability,
            "polymarket_keywords": e.polymarket_keywords,
            "polymarket_odds": live_odds.get(e.key),
            "parameters": [
                {"key": k, "min": p.min, "max": p.max, "default": p.default, "step": p.step, "label": p.label}
                for k, p in e.parameters.items()
            ],
            "sector_impacts": {
                sec: {"drift": si.drift, "vol_multiplier": si.vol_multiplier}
                for sec, si in e.sector_impacts.items()
            }
        }
        for e in events
    ]


@app.get("/api/events/{event_id}")
def get_event(event_id: str):
    """Get details for a specific event."""
    e = EVENTS.get(event_id)
    if not e:
        raise HTTPException(404, f"Event '{event_id}' not found")
    return {
        "id": e.key,
        "name": e.name,
        "category": e.category,
        "description": e.description,
        "probability": e.probability,
        "polymarket_keywords": e.polymarket_keywords,
        "parameters": {
            k: {"min": p.min, "max": p.max, "default": p.default, "step": p.step, "label": p.label}
            for k, p in e.parameters.items()
        },
        "sector_impacts": {
            sec: {"drift": si.drift, "vol_multiplier": si.vol_multiplier}
            for sec, si in e.sector_impacts.items()
        }
    }


@app.get("/api/stocks")
def search_stocks(q: Optional[str] = None):
    """Search stocks with optional query."""
    stocks = correlations.POPULAR_STOCKS
    if q:
        q = q.upper()
        stocks = [s for s in stocks if q in s[0] or q in s[1].upper()]
    return [{"ticker": t, "name": n, "sector": sec} for t, n, sec in stocks]


@app.get("/api/stocks/{ticker}")
def get_stock_detail(ticker: str):
    """Get stock info including related events."""
    ticker = ticker.upper()
    info = correlations.get_stock_info(ticker)
    related = correlations.get_related_events(ticker)
    price = get_price_with_fallback(ticker)
    vol = get_vol_with_fallback(ticker)

    related_events = []
    for eid in related:
        e = EVENTS.get(eid)
        if e:
            related_events.append({
                "id": e.key,
                "name": e.name,
                "category": e.category,
                "probability": e.probability,
            })

    return {
        "ticker": ticker,
        "sector": info["sector"],
        "current_price": price,
        "volatility": round(vol, 4),
        "related_events": related_events,
    }


@app.get("/api/stocks/{ticker}/history")
def get_stock_history_endpoint(ticker: str, days: int = 90):
    """Fetch historical daily prices for a ticker using yfinance, with TTL cache."""
    ticker = ticker.upper()
    cache_key = f"{ticker}_{days}"

    cached = history_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        period_map = {7: "5d", 30: "1mo", 60: "3mo", 90: "3mo", 180: "6mo", 365: "1y"}
        period = period_map.get(days, f"{max(days, 1)}d")
        hist = stock.history(period=period)
        if hist.empty:
            raise HTTPException(404, f"No price history found for {ticker}")

        # Take only the last `days` data points
        hist = hist.tail(days)
        dates = [d.strftime("%Y-%m-%d") for d in hist.index]
        prices = [round(p, 2) for p in hist["Close"].tolist()]
        result = {"dates": dates, "prices": prices}
        history_cache.set(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        # Generate synthetic history from cache price as fallback
        cached_price = PRICE_CACHE.get(ticker)
        if cached_price:
            import numpy as np
            from datetime import datetime, timedelta
            vol = VOL_CACHE.get(ticker, 0.30) / np.sqrt(252)
            dates = []
            prices = []
            price = cached_price * 0.90
            for i in range(days):
                d = datetime.now() - timedelta(days=days - i)
                dates.append(d.strftime("%Y-%m-%d"))
                change = price * vol * np.random.randn()
                price = max(price + change + (cached_price - price) * 0.01, cached_price * 0.70)
                prices.append(round(price, 2))
            result = {"dates": dates, "prices": prices}
            history_cache.set(cache_key, result)
            return result
        raise HTTPException(500, f"Failed to fetch history for {ticker}: {str(e)}")


# Baseline cache: keyed by (ticker, horizon_days) — baseline doesn't change with events
baseline_cache = TTLCache(default_ttl=300)


@app.post("/api/simulate")
def run_simulation(req: SimulateRequest):
    """Run Monte Carlo simulation with events."""
    try:
        increment_sim_counter()
    except Exception:
        pass  # Don't fail simulation if counter breaks
    ticker = req.ticker.upper()

    # Determine simulation count — fast mode for slider interactions
    n_sim = req.n_simulations
    if req.fast:
        n_sim = 500

    # Get price + vol from cache (avoid redundant yfinance calls)
    price = get_price_with_fallback(ticker)
    vol = get_vol_with_fallback(ticker)

    # Run main simulation with events (pass cached price/vol to skip yfinance)
    result = simulation.simulate(
        ticker=ticker,
        events=[{"id": e.id, "params": e.params, "probability": e.probability,
                 "event_date": e.event_date} for e in req.events],
        horizon_days=req.horizon_days,
        n_simulations=n_sim,
        seed=42,
        cached_price=price,
        cached_vol=vol,
    )

    # Run baseline (no events) for comparison — use cache
    baseline_key = f"{ticker}_{req.horizon_days}"
    baseline_target = baseline_cache.get(baseline_key)
    if baseline_target is None:
        try:
            baseline = simulation.simulate(
                ticker, [], req.horizon_days, min(n_sim, 2000), seed=42,
                cached_price=price, cached_vol=vol,
            )
            baseline_target = baseline.median_target
            baseline_cache.set(baseline_key, baseline_target)
        except Exception:
            baseline_target = None

    event_impact_usd = round(result.median_target - baseline_target, 2) if baseline_target else None

    # Limit paths for fast mode and long horizons (reduce response size)
    if req.fast:
        max_paths = 15
    elif req.horizon_days > 180:
        max_paths = 30
    else:
        max_paths = 50

    return SimulateResponse(
        ticker=result.ticker,
        current_price=result.current_price,
        horizon_days=result.horizon_days,
        n_simulations=result.n_simulations,
        events=result.events,
        median_target=result.median_target,
        percentile_5=result.percentile_5,
        percentile_25=result.percentile_25,
        percentile_75=result.percentile_75,
        percentile_95=result.percentile_95,
        probability_above_current=result.probability_above_current,
        max_drawdown_median=result.max_drawdown_median,
        expected_return_pct=result.expected_return_pct,
        event_impact_breakdown=result.event_impact_breakdown,
        paths_sample=result.paths_sample[:max_paths],
        baseline_target=baseline_target,
        event_impact_usd=event_impact_usd,
    )


@app.get("/api/categories")
def get_categories():
    """List event categories."""
    return {"categories": list_categories()}


# --- Scenario Endpoints ---

class ScenarioCreate(BaseModel):
    ticker: str
    title: Optional[str] = None
    description: Optional[str] = None
    events: List[Dict[str, Any]]
    result_summary: Optional[Dict[str, Any]] = None
    author_name: str = "Anonymous"
    is_public: bool = True
    tags: Optional[str] = None


class ScenarioFork(BaseModel):
    author_name: str = "Anonymous"


class ScenarioLike(BaseModel):
    session_id: str


@app.post("/api/scenarios")
def create_scenario(req: ScenarioCreate):
    """Save a new scenario."""
    result = scenarios.create_scenario(
        ticker=req.ticker,
        events=req.events,
        result_summary=req.result_summary,
        title=req.title,
        description=req.description,
        author_name=req.author_name,
        is_public=req.is_public,
        tags=req.tags,
    )
    return result


@app.get("/api/scenarios")
def list_scenarios_endpoint(
    sort: str = "trending",
    ticker: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
):
    """List public scenarios."""
    return scenarios.list_scenarios(
        sort=sort, ticker=ticker, tag=tag,
        limit=min(limit, 50), offset=offset,
    )


@app.get("/api/scenarios/stats")
def get_scenario_stats():
    """Get global stats for social proof."""
    return get_global_stats()


@app.get("/api/scenarios/{scenario_id}")
def get_scenario(scenario_id: str):
    """Get a scenario by ID (increments views)."""
    result = scenarios.get_scenario(scenario_id, increment_views=True)
    if not result:
        raise HTTPException(404, "Scenario not found")
    return result


@app.post("/api/scenarios/{scenario_id}/fork")
def fork_scenario(scenario_id: str, req: ScenarioFork):
    """Fork a scenario."""
    result = scenarios.fork_scenario(scenario_id, author_name=req.author_name)
    if not result:
        raise HTTPException(404, "Scenario not found")
    return result


@app.post("/api/scenarios/{scenario_id}/like")
def like_scenario(scenario_id: str, req: ScenarioLike):
    """Like a scenario."""
    newly_liked = scenarios.like_scenario(scenario_id, req.session_id)
    return {"liked": newly_liked}


# --- Polymarket Endpoints ---

@app.get("/api/polymarket/search")
def search_polymarket_markets(q: str, limit: int = 20):
    """Search Polymarket for active markets matching a query.
    
    Example: /api/polymarket/search?q=tariff&limit=10
    Returns markets sorted by 24h volume with odds, question, slug, etc.
    """
    if not q or len(q.strip()) < 2:
        raise HTTPException(400, "Query must be at least 2 characters")
    from polymarket import search_polymarket
    results = search_polymarket(q.strip(), limit=min(limit, 50))
    return {"query": q, "count": len(results), "markets": results}


@app.get("/api/polymarket/live")
def get_polymarket_live():
    """Get live Polymarket odds for all configured events."""
    from polymarket import get_all_live_odds
    return get_all_live_odds()


@app.get("/api/polymarket/{event_key}")
def get_polymarket_event(event_key: str):
    """Get live Polymarket odds for a specific event."""
    from polymarket import get_live_odds
    data = get_live_odds(event_key)
    if not data:
        raise HTTPException(404, f"No Polymarket market found for event '{event_key}'")
    return data


# --- Auth Endpoints (v5 — optional registration) ---

class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str
    session_id: Optional[str] = None  # migrate anonymous data


class LoginRequest(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


@app.post("/api/auth/register")
def register(req: RegisterRequest):
    """Register a new user. All features still work without registration."""
    import auth
    try:
        result = auth.create_user(
            email=req.email,
            password=req.password,
            display_name=req.display_name,
            session_id=req.session_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        raise HTTPException(500, f"Registration failed: {str(e)}")


@app.post("/api/auth/login")
def login(req: LoginRequest):
    """Login with email + password. Returns auth token."""
    import auth
    result = auth.login_user(req.email, req.password)
    if not result:
        raise HTTPException(401, "Invalid email or password")
    return result


@app.get("/api/auth/me")
def get_current_user(authorization: Optional[str] = None):
    """Get current user from auth token. Returns user profile or 401."""
    if not authorization:
        raise HTTPException(401, "No auth token provided")
    token = authorization.replace("Bearer ", "")
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid or expired token")
    # Add user stats
    stats = auth.get_user_stats(user["user_id"])
    return {**user, **stats}


@app.patch("/api/auth/profile")
def update_profile(req: ProfileUpdate, authorization: Optional[str] = None):
    """Update user profile. Requires auth token."""
    if not authorization:
        raise HTTPException(401, "No auth token")
    token = authorization.replace("Bearer ", "")
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    auth.update_user_profile(
        user["user_id"],
        display_name=req.display_name,
        bio=req.bio,
        avatar_url=req.avatar_url,
    )
    return {"status": "updated"}


@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = None):
    """Logout (invalidate token)."""
    if authorization:
        token = authorization.replace("Bearer ", "")
        import auth
        auth.logout_user(token)
    return {"status": "ok"}


# --- Calendar Endpoints (v5) ---

@app.get("/api/calendar/fomc")
def get_fomc_calendar(year: Optional[int] = None, limit: int = 3):
    """Get FOMC meeting dates."""
    from event_calendar import get_fomc_dates, get_upcoming_fomc_dates, get_next_fomc_date
    if year:
        return {"dates": get_fomc_dates(year)}
    return {
        "next": get_next_fomc_date(),
        "upcoming": get_upcoming_fomc_dates(limit),
    }


@app.get("/api/calendar/earnings/{ticker}")
def get_earnings_calendar(ticker: str):
    """Get next earnings date for a ticker."""
    from event_calendar import get_next_earnings_date
    earnings_date = get_next_earnings_date(ticker.upper())
    return {
        "ticker": ticker.upper(),
        "next_earnings_date": earnings_date,
    }


# --- Feedback Endpoints (v5) ---

class FeedbackEvent(BaseModel):
    session_id: Optional[str] = None
    event_type: str
    event_data: Optional[Dict[str, Any]] = None
    page: Optional[str] = None
    viewport: Optional[str] = None


class SurveyResponse(BaseModel):
    session_id: Optional[str] = None
    rating: int  # 1-5
    comment: Optional[str] = None
    trigger_context: Optional[str] = None


class WidgetFeedback(BaseModel):
    session_id: Optional[str] = None
    category: str  # bug, feature, event, general
    message: str
    page: Optional[str] = None


@app.post("/api/feedback/event")
def submit_feedback_event(req: FeedbackEvent):
    """Record an implicit behavioral event (fire-and-forget)."""
    import feedback
    feedback.record_event(
        event_type=req.event_type,
        event_data=req.event_data,
        session_id=req.session_id,
        page=req.page,
        viewport=req.viewport,
    )
    return {"status": "ok"}


@app.post("/api/feedback/survey")
def submit_survey(req: SurveyResponse):
    """Record a micro-survey response."""
    import feedback
    feedback.record_survey(
        rating=req.rating,
        comment=req.comment,
        trigger_context=req.trigger_context,
        session_id=req.session_id,
    )
    return {"status": "ok"}


@app.post("/api/feedback/widget")
def submit_widget_feedback(req: WidgetFeedback):
    """Record a feedback widget submission."""
    import feedback
    feedback.record_widget_feedback(
        category=req.category,
        message=req.message,
        session_id=req.session_id,
        page=req.page,
    )
    return {"status": "ok"}


@app.get("/api/feedback/stats")
def get_feedback_stats(days: int = 7):
    """Get feedback summary (admin endpoint)."""
    import feedback
    return feedback.get_feedback_stats(days=days)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
