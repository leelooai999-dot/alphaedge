"""
MonteCarloo FastAPI Backend Server.

Wraps the Monte Carlo simulation engine with REST endpoints.
"""

from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import simulation
import correlations
from events import EVENTS, list_all_events, list_categories
from db import increment_sim_counter, get_stats as get_global_stats, get_db
import scenarios
import time
import marketplace
import social  # Ensure social tables (points_ledger, etc.) are created on startup

app = FastAPI(title="MonteCarloo API", version="0.1.0")

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
# Social caches
feed_cache = TTLCache(default_ttl=60)  # Feed: 1 min
leaderboard_cache = TTLCache(default_ttl=120)  # Leaderboard: 2 min
og_cache = TTLCache(default_ttl=600)  # OG images: 10 min


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
    return {"service": "MonteCarloo API", "version": "0.1.0"}


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
def get_stock_history_endpoint(ticker: str, days: int = 90, ohlcv: bool = False, timeframe: str = "1d"):
    """Fetch historical prices for a ticker using yfinance, with TTL cache.
    Pass ?ohlcv=true to get full OHLCV data (needed for Pine Script indicators).
    Pass ?timeframe=1h|4h|1d|1wk|1mo for different intervals (default: 1d).
    Note: intraday timeframes (1h, 4h) limited to 60 days of history."""
    ticker = ticker.upper()
    valid_timeframes = {"1h": "1h", "4h": "4h", "1d": "1d", "1wk": "1wk", "1mo": "1mo",
                        "5m": "5m", "15m": "15m", "30m": "30m", "60m": "1h"}
    interval = valid_timeframes.get(timeframe, "1d")
    cache_key = f"{ticker}_{days}_{interval}_{'ohlcv' if ohlcv else 'close'}"

    cached = history_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        # Intraday intervals have limited history: 1h=730d, 5m/15m/30m=60d
        if interval in ("5m", "15m", "30m"):
            period = "60d"
        elif interval in ("1h", "4h"):
            period = f"{min(days, 730)}d" if days <= 730 else "730d"
        else:
            period_map = {7: "5d", 30: "1mo", 60: "3mo", 90: "3mo", 180: "6mo", 365: "1y"}
            period = period_map.get(days, f"{max(days, 1)}d")
        hist = stock.history(period=period, interval=interval)
        if hist.empty:
            raise HTTPException(404, f"No price history found for {ticker}")

        # Take only the last `days` data points (for daily; for intraday, take all)
        if interval == "1d":
            hist = hist.tail(days)
        date_fmt = "%Y-%m-%d" if interval in ("1d", "1wk", "1mo") else "%Y-%m-%dT%H:%M"
        dates = [d.strftime(date_fmt) for d in hist.index]
        prices = [round(p, 2) for p in hist["Close"].tolist()]

        if ohlcv:
            result = {
                "dates": dates,
                "prices": prices,
                "open": [round(p, 2) for p in hist["Open"].tolist()],
                "high": [round(p, 2) for p in hist["High"].tolist()],
                "low": [round(p, 2) for p in hist["Low"].tolist()],
                "close": prices,
                "volume": [int(v) for v in hist["Volume"].tolist()],
            }
        else:
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
def run_simulation(req: SimulateRequest, authorization: Optional[str] = Header(None)):
    """Run Monte Carlo simulation with events."""
    try:
        increment_sim_counter()
    except Exception:
        pass  # Don't fail simulation if counter breaks

    # Award points for running simulation (1 pt, 20/day cap)
    if authorization:
        try:
            import auth
            from social import award_points
            token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
            user = auth.get_user_by_token(token)
            if user:
                award_points(user["user_id"], "run_simulation", 1)
        except Exception:
            pass  # Never fail simulation for points
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
    commentary: str = ""  # User's explanation of what they changed
    user_id: str = ""


class ScenarioLike(BaseModel):
    session_id: str
    user_id: str = ""  # For logged-in user dedup


@app.post("/api/scenarios")
def create_scenario(req: ScenarioCreate, authorization: Optional[str] = Header(None)):
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
    
    # Record prediction for accuracy tracking
    try:
        import accuracy
        if req.result_summary:
            summary = json.loads(req.result_summary) if isinstance(req.result_summary, str) else req.result_summary
            median = summary.get("median_target") or summary.get("median30d")
            if median and result.get("id"):
                accuracy.record_prediction(
                    scenario_id=result["id"],
                    ticker=req.ticker,
                    predicted_median=float(median),
                    horizon_days=30,
                )
    except Exception as e:
        logger.warning(f"Accuracy tracking failed: {e}")
    
    # Award points for saving scenario (5 pts, 50/day cap)
    if authorization:
        try:
            import auth
            from social import award_points
            token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
            user = auth.get_user_by_token(token)
            if user and result.get("id"):
                award_points(user["user_id"], "save_scenario", 5, result["id"])
        except Exception:
            pass

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
def fork_scenario(scenario_id: str, req: ScenarioFork, authorization: Optional[str] = Header(None)):
    """Fork a scenario with optional commentary."""
    result = scenarios.fork_scenario(
        scenario_id, 
        author_name=req.author_name,
        commentary=req.commentary,
        user_id=req.user_id or None,
    )
    if not result:
        raise HTTPException(404, "Scenario not found")
    
    # Award points: 5 pts to forker, 5 pts to original author
    if authorization:
        try:
            import auth
            from social import award_points
            token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
            user = auth.get_user_by_token(token)
            if user:
                award_points(user["user_id"], "forked_scenario", 5, scenario_id)
                # Also award original author
                original = scenarios.get_scenario(scenario_id)
                if original and original.get("author_id") and original["author_id"] != user["user_id"]:
                    award_points(original["author_id"], "received_fork", 5, result.get("id", scenario_id))
        except Exception:
            pass

    return result


@app.post("/api/scenarios/{scenario_id}/like")
def like_scenario(scenario_id: str, req: ScenarioLike, authorization: Optional[str] = Header(None)):
    """Like a scenario. Deduplicates by session_id OR user_id."""
    dedup_key = req.user_id or req.session_id
    newly_liked = scenarios.like_scenario(scenario_id, dedup_key)
    
    # Award points to scenario author for receiving a like (1 pt)
    if newly_liked and authorization:
        try:
            import auth
            from social import award_points
            token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
            user = auth.get_user_by_token(token)
            if user:
                scenario = scenarios.get_scenario(scenario_id)
                if scenario and scenario.get("author_id") and scenario["author_id"] != user["user_id"]:
                    award_points(scenario["author_id"], "received_like", 1, scenario_id)
        except Exception:
            pass

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
    referral_code: Optional[str] = None  # referrer's code


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
            referral_code=req.referral_code,
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
def get_current_user(authorization: Optional[str] = Header(None)):
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
def update_profile(req: ProfileUpdate, authorization: Optional[str] = Header(None)):
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
def logout(authorization: Optional[str] = Header(None)):
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


# --- Social Endpoints (v6) ---

class CommentCreate(BaseModel):
    scenario_id: str
    content: str
    author_name: str = "Anonymous"
    parent_id: Optional[str] = None
    session_id: Optional[str] = None


class ShareRecord(BaseModel):
    scenario_id: str
    platform: str  # twitter, reddit, linkedin, copy
    session_id: Optional[str] = None


class FollowAction(BaseModel):
    following_id: str


@app.post("/api/comments")
def create_comment(req: CommentCreate, authorization: Optional[str] = Header(None)):
    """Add a comment to a scenario."""
    import social
    user_id = None
    author = req.author_name
    if authorization:
        import auth
        user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
        if user:
            user_id = user["user_id"]
            author = user["display_name"]
    try:
        return social.add_comment(
            scenario_id=req.scenario_id,
            content=req.content,
            user_id=user_id,
            author_name=author,
            parent_id=req.parent_id,
        )
    except ValueError as e:
        raise HTTPException(429, str(e))


@app.get("/api/comments/{scenario_id}")
def list_comments(scenario_id: str, limit: int = 50, offset: int = 0):
    """Get comments for a scenario."""
    import social
    comments = social.get_comments(scenario_id, limit, offset)
    total = social.get_comment_count(scenario_id)
    return {"comments": comments, "total": total}


@app.post("/api/shares")
def record_share(req: ShareRecord, authorization: Optional[str] = Header(None)):
    """Record a share event for points + analytics."""
    import social
    user_id = None
    if authorization:
        import auth
        user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
        if user:
            user_id = user["user_id"]
    social.record_share(req.scenario_id, req.platform, user_id, req.session_id)
    return {"status": "ok"}


@app.post("/api/follow")
def follow(req: FollowAction, authorization: Optional[str] = Header(None)):
    """Follow a user."""
    if not authorization:
        raise HTTPException(401, "Auth required")
    import auth, social
    user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
    if not user:
        raise HTTPException(401, "Invalid token")
    social.follow_user(user["user_id"], req.following_id)
    return {"status": "followed"}


@app.delete("/api/follow/{following_id}")
def unfollow(following_id: str, authorization: Optional[str] = Header(None)):
    """Unfollow a user."""
    if not authorization:
        raise HTTPException(401, "Auth required")
    import auth, social
    user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
    if not user:
        raise HTTPException(401, "Invalid token")
    social.unfollow_user(user["user_id"], following_id)
    return {"status": "unfollowed"}


@app.get("/api/feed")
def get_feed(
    type: str = "trending",
    ticker: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    authorization: Optional[str] = Header(None),
):
    """Get scenario feed (trending, new, following)."""
    import social
    user_id = None
    if authorization:
        import auth
        user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
        if user:
            user_id = user["user_id"]
    
    # Cache non-personalized feeds
    cache_key = f"feed:{type}:{ticker}:{limit}:{offset}" if type != "following" else None
    if cache_key:
        cached = feed_cache.get(cache_key)
        if cached:
            return cached
    
    result = social.get_feed(type, user_id, ticker, limit, offset)
    if cache_key:
        feed_cache.set(cache_key, result)
    return result


@app.get("/api/leaderboard")
def get_leaderboard(
    period: str = "all_time",
    ticker: Optional[str] = None,
    limit: int = 50,
):
    """Get engagement-scored leaderboard."""
    cache_key = f"lb:{period}:{ticker}:{limit}"
    cached = leaderboard_cache.get(cache_key)
    if cached:
        return cached
    
    import social
    result = social.get_leaderboard(period, ticker, limit)
    leaderboard_cache.set(cache_key, result)
    return result


@app.get("/api/notifications")
def get_notifications(user_id: Optional[str] = None, unread_only: bool = False, limit: int = 20, authorization: Optional[str] = Header(None)):
    """Get user notifications. Accepts user_id query param or Bearer token."""
    import social
    effective_user_id = user_id
    if not effective_user_id and authorization:
        import auth
        user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
        if user:
            effective_user_id = user["user_id"]
    if not effective_user_id:
        raise HTTPException(401, "Auth required (user_id param or Bearer token)")
    return social.get_notifications(effective_user_id, unread_only, limit)


@app.post("/api/notifications/read")
def mark_read(authorization: Optional[str] = Header(None)):
    """Mark all notifications as read."""
    if not authorization:
        raise HTTPException(401, "Auth required")
    import auth, social
    user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
    if not user:
        raise HTTPException(401, "Invalid token")
    social.mark_notifications_read(user["user_id"])
    return {"status": "ok"}


@app.post("/api/notifications/{notif_id}/read")
def mark_single_read(notif_id: int):
    """Mark a single notification as read."""
    import social
    social.mark_single_notification_read(notif_id)
    return {"status": "ok"}


@app.get("/api/scenarios/{scenario_id}/engagement")
def get_engagement(scenario_id: str):
    """Get engagement score for a scenario."""
    import social
    score = social.calculate_engagement_score(scenario_id)
    comment_count = social.get_comment_count(scenario_id)
    return {"scenario_id": scenario_id, "engagement_score": score, "comment_count": comment_count}


# --- Weekly Recap ---

@app.post("/api/admin/weekly-recap")
def trigger_weekly_recap():
    """Trigger weekly recap notifications for all users. Called by cron."""
    import social
    count = social.generate_weekly_recaps()
    return {"recaps_sent": count}


# --- Badge Endpoints ---

@app.get("/api/badges/{user_id}")
def get_badges(user_id: str):
    """Get all badges for a user."""
    import badges
    return {"badges": badges.get_user_badges(user_id)}


@app.post("/api/badges/{user_id}/check")
def check_badges(user_id: str):
    """Check and award any newly earned badges."""
    import badges
    newly_awarded = badges.check_and_award_badges(user_id)
    return {"newly_awarded": newly_awarded, "all_badges": badges.get_user_badges(user_id)}


# --- Referral Endpoints ---

@app.get("/api/referral/{user_id}")
def get_referral_info(user_id: str):
    """Get a user's referral code and stats."""
    conn = get_db()
    try:
        user = conn.execute(
            "SELECT referral_code FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        
        # Count referrals
        referral_count = conn.execute(
            "SELECT COUNT(*) FROM points_ledger WHERE user_id = ? AND action = 'referral'",
            (user_id,)
        ).fetchone()[0]
        
        referral_code = user["referral_code"] or ""
        return {
            "referral_code": referral_code,
            "referral_link": f"https://frontend-leeloo-ai.vercel.app/?ref={referral_code}",
            "referral_count": referral_count,
            "points_earned": referral_count * 50,
        }
    finally:
        conn.close()


# --- OG Image Endpoint ---

@app.get("/api/og/{scenario_id}")
def get_og_image(scenario_id: str):
    """Generate Open Graph image for a scenario."""
    from fastapi.responses import Response
    import og_image
    
    scenario = scenarios.get_scenario(scenario_id)
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    
    # Parse result summary for stats
    median_target = 0
    prob_profit = 50
    event_count = 0
    try:
        if scenario.get("result_summary"):
            summary = json.loads(scenario["result_summary"]) if isinstance(scenario["result_summary"], str) else scenario["result_summary"]
            median_target = summary.get("median_target") or summary.get("median30d") or 0
            prob_profit = summary.get("probability_above_current") or summary.get("probProfit") or 50
            if prob_profit < 1:
                prob_profit *= 100
        if scenario.get("events"):
            events = json.loads(scenario["events"]) if isinstance(scenario["events"], str) else scenario["events"]
            event_count = len(events) if isinstance(events, list) else 0
    except Exception:
        pass
    
    is_bullish = prob_profit >= 50
    
    svg = og_image.generate_og_svg(
        ticker=scenario["ticker"],
        title=scenario.get("title") or f"{scenario['ticker']} Scenario",
        median_target=float(median_target),
        prob_profit=float(prob_profit),
        event_count=event_count,
        author_name=scenario.get("author_name") or "Anonymous",
        is_bullish=is_bullish,
    )
    
    # Try PNG conversion, fall back to SVG
    png = og_image.svg_to_png_bytes(svg)
    if png:
        return Response(content=png, media_type="image/png")
    return Response(content=svg.encode("utf-8"), media_type="image/svg+xml")


# --- Points Endpoints ---

@app.get("/api/points/{user_id}")
def get_user_points(user_id: str):
    """Get a user's points balance and recent history."""
    conn = get_db()
    try:
        # Total points
        total_row = conn.execute(
            "SELECT COALESCE(SUM(points), 0) FROM points_ledger WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        total = total_row[0] if total_row else 0
        
        # Recent history
        rows = conn.execute("""
            SELECT action, points, reference_id, created_at
            FROM points_ledger WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 50
        """, (user_id,)).fetchall()
        
        return {
            "total": total,
            "history": [dict(r) for r in rows],
        }
    except Exception as e:
        logger.warning(f"Points fetch error: {e}")
        return {"total": 0, "history": []}
    finally:
        conn.close()


# --- Accuracy Tracking Endpoints ---

@app.get("/api/accuracy/{scenario_id}")
def get_accuracy(scenario_id: str):
    """Get accuracy tracking for a scenario."""
    import accuracy
    result = accuracy.get_scenario_accuracy(scenario_id)
    if not result:
        return {"status": "not_tracked"}
    return result


@app.get("/api/accuracy/user/{user_id}")
def get_user_accuracy(user_id: str):
    """Get accuracy stats for a user."""
    import accuracy
    return accuracy.get_user_accuracy(user_id)


@app.post("/api/accuracy/score")
def trigger_accuracy_scoring():
    """Manually trigger accuracy scoring (also runs in nightly build)."""
    import accuracy
    scored = accuracy.score_pending_predictions()
    return {"scored_count": len(scored), "results": scored}


# --- User Profile Endpoints ---

@app.get("/api/users/{user_id}/profile")
def get_user_profile(user_id: str):
    """Get a user's public profile."""
    import social
    conn = get_db()
    try:
        # Try users table first
        user = conn.execute(
            "SELECT id, display_name, points, streak_days, tier, created_at FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        
        # Get scenario stats
        stats = conn.execute("""
            SELECT 
                COUNT(*) as scenario_count,
                COALESCE(SUM(views), 0) as total_views,
                COALESCE(SUM(likes), 0) as total_likes,
                COALESCE(SUM(forks), 0) as total_forks
            FROM scenarios WHERE author_id = ?
        """, (user_id,)).fetchone()
        
        # Get follower/following counts
        followers = conn.execute(
            "SELECT COUNT(*) FROM follows WHERE following_id = ?", (user_id,)
        ).fetchone()[0]
        following = conn.execute(
            "SELECT COUNT(*) FROM follows WHERE follower_id = ?", (user_id,)
        ).fetchone()[0]
        
        engagement = social.calculate_user_engagement(user_id) if hasattr(social, 'calculate_user_engagement') else 0
        
        return {
            "id": user_id,
            "display_name": user["display_name"] if user else user_id,
            "points": user["points"] if user else 0,
            "streak_days": user["streak_days"] if user else 0,
            "tier": user["tier"] if user else "free",
            "joined_at": user["created_at"] if user else None,
            "scenario_count": stats["scenario_count"] if stats else 0,
            "total_views": stats["total_views"] if stats else 0,
            "total_likes": stats["total_likes"] if stats else 0,
            "total_forks": stats["total_forks"] if stats else 0,
            "engagement_score": engagement,
            "followers": followers,
            "following": following,
        }
    except Exception as e:
        logger.warning(f"Profile fetch error: {e}")
        return {"id": user_id, "display_name": user_id, "points": 0, "streak_days": 0,
                "tier": "free", "scenario_count": 0, "total_views": 0, "total_likes": 0,
                "total_forks": 0, "engagement_score": 0, "followers": 0, "following": 0}
    finally:
        conn.close()


@app.get("/api/users/{user_id}/scenarios")
def get_user_scenarios(user_id: str, limit: int = 50):
    """Get scenarios by a specific user."""
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT id, ticker, title, views, forks, likes, created_at
            FROM scenarios 
            WHERE author_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (user_id, limit)).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.warning(f"User scenarios fetch error: {e}")
        return []
    finally:
        conn.close()


# --- Billing / Stripe Endpoints ---

class CheckoutRequest(BaseModel):
    tier: str  # "pro" or "premium"


@app.get("/api/billing/config")
def get_billing_config():
    """Get Stripe publishable key and tier info for frontend."""
    import billing
    return {
        "publishable_key": billing.STRIPE_PUBLISHABLE_KEY,
        "tiers": {
            "free": {
                "name": "Free",
                "price": 0,
                "limits": billing.TIER_LIMITS["free"],
            },
            "pro": {
                "name": "Pro",
                "price": 49,
                "limits": billing.TIER_LIMITS["pro"],
            },
            "premium": {
                "name": "Premium",
                "price": 149,
                "limits": billing.TIER_LIMITS["premium"],
            },
        },
    }


@app.get("/api/billing/tier")
def get_user_billing_tier(authorization: Optional[str] = Header(None)):
    """Get the current user's tier and limits."""
    import billing
    user_id = None
    if authorization:
        import auth
        user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
        if user:
            user_id = user["user_id"]
    tier = billing.get_user_tier(user_id)
    return {
        "tier": tier,
        "limits": billing.get_tier_limits(tier),
    }


@app.post("/api/billing/checkout")
def create_checkout(req: CheckoutRequest, authorization: Optional[str] = Header(None)):
    """Create a Stripe checkout session. Requires auth."""
    if not authorization:
        raise HTTPException(401, "Login required to upgrade")
    import auth, billing
    user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
    if not user:
        raise HTTPException(401, "Invalid token")
    try:
        result = billing.create_checkout_session(
            user_id=user["user_id"],
            email=user["email"],
            tier=req.tier,
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Checkout failed: {str(e)}")


@app.post("/api/billing/portal")
def create_billing_portal(authorization: Optional[str] = Header(None)):
    """Create a Stripe Customer Portal session for subscription management."""
    if not authorization:
        raise HTTPException(401, "Auth required")
    import auth, billing
    user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
    if not user:
        raise HTTPException(401, "Invalid token")
    try:
        return billing.create_portal_session(user["user_id"])
    except Exception as e:
        raise HTTPException(500, f"Portal failed: {str(e)}")


@app.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook endpoint."""
    import billing
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    
    if not billing.verify_webhook_signature(body, sig):
        raise HTTPException(400, "Invalid webhook signature")
    
    try:
        event = json.loads(body)
        result = billing.process_webhook_event(event)
        return result
    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        raise HTTPException(500, f"Webhook error: {str(e)}")


@app.get("/api/billing/check-event-limit")
def check_event_limit(event_count: int = 0, authorization: Optional[str] = Header(None)):
    """Check if user can add more events to a scenario."""
    import billing
    user_id = None
    if authorization:
        import auth
        user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
        if user:
            user_id = user["user_id"]
    return billing.check_event_limit(user_id, event_count)


@app.get("/api/billing/check-pine-limit")
def check_pine_limit(overlay_count: int = 0, authorization: Optional[str] = Header(None)):
    """Check if user can add more Pine Script overlays."""
    import billing
    user_id = None
    if authorization:
        import auth
        user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
        if user:
            user_id = user["user_id"]
    return billing.check_pine_overlay_limit(user_id, overlay_count)


@app.get("/health")
def health():
    return {"status": "ok"}


# ========================
# MARKETPLACE ENDPOINTS
# ========================

# Init marketplace DB on startup
marketplace.init_marketplace_db()
marketplace.seed_marketplace()


@app.get("/api/marketplace/listings")
def marketplace_browse(
    q: str = "",
    type: str = "",
    category: str = "",
    sort: str = "popular",
    limit: int = 20,
    offset: int = 0,
):
    """Browse marketplace listings."""
    return marketplace.search_listings(
        query=q, listing_type=type, category=category,
        sort=sort, limit=limit, offset=offset,
    )


@app.get("/api/marketplace/categories")
def marketplace_categories():
    """Get listing categories."""
    return marketplace.get_categories()


@app.get("/api/marketplace/listings/{listing_id}")
def marketplace_listing_detail(listing_id: str, authorization: Optional[str] = Header(None)):
    """Get a single listing with reviews."""
    listing = marketplace.get_listing(listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    
    reviews = marketplace.get_reviews(listing_id, limit=10)
    
    # Check if current user has purchased
    purchased = False
    if authorization:
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        from auth import verify_token
        user = verify_token(token)
        if user:
            purchased = marketplace.has_purchased(listing_id, user["id"])
    
    return {
        **listing,
        "reviews": reviews["reviews"],
        "review_distribution": reviews["distribution"],
        "total_reviews": reviews["total"],
        "purchased": purchased,
    }


@app.post("/api/marketplace/listings")
def marketplace_create_listing(
    request_body: dict,
    authorization: Optional[str] = Header(None),
):
    """Create a new listing (authenticated)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    # Ensure creator profile exists
    marketplace.get_or_create_creator(user["id"], user.get("display_name", ""))
    
    if "title" not in request_body:
        raise HTTPException(400, "Title is required")
    if "price_cents" not in request_body:
        raise HTTPException(400, "Price is required")
    
    listing = marketplace.create_listing(user["id"], request_body)
    return listing


@app.put("/api/marketplace/listings/{listing_id}")
def marketplace_update_listing(
    listing_id: str,
    request_body: dict,
    authorization: Optional[str] = Header(None),
):
    """Update a listing (creator only)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    listing = marketplace.update_listing(listing_id, user["id"], request_body)
    if not listing:
        raise HTTPException(403, "Not authorized to edit this listing")
    return listing


@app.delete("/api/marketplace/listings/{listing_id}")
def marketplace_delete_listing(
    listing_id: str,
    authorization: Optional[str] = Header(None),
):
    """Delete a listing (creator only)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    deleted = marketplace.delete_listing(listing_id, user["id"])
    if not deleted:
        raise HTTPException(403, "Not authorized or listing not found")
    return {"deleted": True}


@app.get("/api/marketplace/listings/{listing_id}/reviews")
def marketplace_reviews(listing_id: str, limit: int = 20, offset: int = 0):
    """Get reviews for a listing."""
    return marketplace.get_reviews(listing_id, limit=limit, offset=offset)


@app.post("/api/marketplace/listings/{listing_id}/reviews")
def marketplace_create_review(
    listing_id: str,
    request_body: dict,
    authorization: Optional[str] = Header(None),
):
    """Write a review (authenticated, ideally verified purchase)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    if "rating" not in request_body or not (1 <= request_body["rating"] <= 5):
        raise HTTPException(400, "Rating 1-5 is required")
    
    try:
        review = marketplace.create_review(listing_id, user["id"], request_body)
        return review
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/marketplace/purchase/{listing_id}")
def marketplace_purchase(
    listing_id: str,
    authorization: Optional[str] = Header(None),
):
    """Purchase a listing (creates Stripe checkout session)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    try:
        result = marketplace.create_purchase(listing_id, user["id"])
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/marketplace/purchases")
def marketplace_my_purchases(authorization: Optional[str] = Header(None)):
    """Get my purchased items."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    return marketplace.get_my_purchases(user["id"])


@app.get("/api/marketplace/creator/dashboard")
def marketplace_creator_dashboard(authorization: Optional[str] = Header(None)):
    """Get creator dashboard (authenticated)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    dashboard = marketplace.get_creator_dashboard(user["id"])
    if "error" in dashboard:
        raise HTTPException(404, dashboard["error"])
    return dashboard


@app.post("/api/marketplace/creator/profile")
def marketplace_update_creator(
    request_body: dict,
    authorization: Optional[str] = Header(None),
):
    """Create or update creator profile."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    from auth import verify_token
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    marketplace.get_or_create_creator(user["id"], user.get("display_name", ""))
    profile = marketplace.update_creator_profile(user["id"], request_body)
    return profile


@app.get("/api/marketplace/creator/{creator_id}")
def marketplace_creator_public(creator_id: str):
    """Get public creator profile."""
    profile = marketplace.get_creator_public_profile(creator_id)
    if not profile:
        raise HTTPException(404, "Creator not found")
    return profile


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
