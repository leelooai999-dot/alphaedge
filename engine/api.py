"""
MonteCarloo FastAPI Backend Server.

Wraps the Monte Carlo simulation engine with REST endpoints.
"""

from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
import simulation
import correlations
from events import EVENTS, list_all_events, list_categories
from db import increment_sim_counter, get_stats as get_global_stats, get_db
from timesfm_service import TimesfmService, TimesfmRequest, TimesfmUnavailableError, DEFAULT_QUANTILES
from forecast.providers import BaselineForecastRequest, forecast_with_provider
import scenarios
import time
import os
import marketplace
import social  # Ensure social tables (points_ledger, etc.) are created on startup
import json
import logging
import secrets

logger = logging.getLogger(__name__)

ADMIN_TOKENS = {
    token.strip() for token in os.environ.get("INTERNAL_API_TOKENS", "").split(",") if token.strip()
}
ALLOWED_FEEDBACK_TYPES = {"bug", "feature", "idea", "ux", "security", "other"}
ALLOWED_FEEDBACK_EVENT_TYPES = {
    "page_view", "page_exit", "search_no_results", "cta_click", "error", "rage_click"
}
_RATE_WINDOW_SECONDS = 300
_RATE_LIMITS = {
    "feedback_event": (120, _RATE_WINDOW_SECONDS),
    "feedback_survey": (10, _RATE_WINDOW_SECONDS),
    "feedback_widget": (8, _RATE_WINDOW_SECONDS),
    "feedback_form": (8, _RATE_WINDOW_SECONDS),
}
_rate_limit_store: Dict[str, List[float]] = {}

app = FastAPI(
    title="MonteCarloo API",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

if os.environ.get("ENABLE_API_DOCS", "").strip().lower() in {"1", "true", "yes", "on"}:
    app.docs_url = "/docs"
    app.redoc_url = "/redoc"
    app.openapi_url = "/openapi.json"

allowed_origins_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
if not allowed_origins:
    allowed_origins = [
        "https://frontend-leeloo-ai.vercel.app",
        "https://montecarloo.com",
        "https://www.montecarloo.com",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'; base-uri 'self'"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response


def _client_identifier(request: Request, fallback_session: Optional[str] = None) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return fallback_session or client_ip or "unknown"


def _enforce_rate_limit(bucket: str, key: str):
    limit, window = _RATE_LIMITS[bucket]
    now = time.time()
    store_key = f"{bucket}:{key}"
    hits = [ts for ts in _rate_limit_store.get(store_key, []) if now - ts < window]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    hits.append(now)
    _rate_limit_store[store_key] = hits


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    return authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization


def _require_internal_admin(authorization: Optional[str]) -> str:
    token = _extract_bearer_token(authorization)
    if not token or token not in ADMIN_TOKENS:
        raise HTTPException(status_code=403, detail="Admin token required")
    return token


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
    # v6: Commodity chain data
    commodity_impacts: Optional[Dict[str, float]] = None  # commodity → % change
    stock_betas: Optional[Dict[str, float]] = None        # commodity → beta
    stock_impact_breakdown: Optional[Dict[str, float]] = None  # commodity → stock impact


class TimesfmForecastRequest(BaseModel):
    series: List[float] = Field(..., min_length=1)
    horizon: int = Field(..., gt=0)
    quantiles: Optional[List[float]] = None
    frequency: Optional[str] = None

    @field_validator("quantiles")
    @classmethod
    def validate_quantiles(cls, value: Optional[List[float]]):
        if value is None:
            return value
        if not value:
            raise ValueError("quantiles must contain at least one value")
        for entry in value:
            if entry <= 0 or entry >= 1:
                raise ValueError("quantiles must be between 0 and 1")
        return value


class TimesfmForecastResponse(BaseModel):
    available: bool
    horizon: int
    point: Optional[List[float]] = None
    quantiles: Optional[Dict[float, List[float]]] = None
    mode: Optional[str] = None
    message: Optional[str] = None
    provider: Optional[str] = None


class TimesfmLiveForecastRequest(BaseModel):
    ticker: str
    horizon: int = Field(30, gt=0)
    lookback: int = Field(90, gt=0)
    timeframe: str = "1d"
    quantiles: Optional[List[float]] = None

    @field_validator("quantiles")
    @classmethod
    def validate_quantiles(cls, value: Optional[List[float]]):
        if value is None:
            return value
        if not value:
            raise ValueError("quantiles must contain at least one value")
        for entry in value:
            if entry <= 0 or entry >= 1:
                raise ValueError("quantiles must be between 0 and 1")
        return value


class TimesfmLiveForecastResponse(BaseModel):
    available: bool
    ticker: str
    horizon: int
    lookback: int
    history: Dict[str, List]
    point: Optional[List[float]] = None
    quantiles: Optional[Dict[float, List[float]]] = None
    mode: Optional[str] = None
    message: Optional[str] = None
    provider: Optional[str] = None


class BaselineForecastRequestModel(BaseModel):
    series: List[float] = Field(..., min_length=1)
    horizon: int = Field(..., gt=0)
    quantiles: Optional[List[float]] = None
    frequency: Optional[str] = None
    provider: Optional[str] = None

    @field_validator("quantiles")
    @classmethod
    def validate_quantiles(cls, value: Optional[List[float]]):
        if value is None:
            return value
        if not value:
            raise ValueError("quantiles must contain at least one value")
        for entry in value:
            if entry <= 0 or entry >= 1:
                raise ValueError("quantiles must be between 0 and 1")
        return value


class BaselineLiveForecastRequestModel(BaseModel):
    ticker: str
    horizon: int = Field(30, gt=0)
    lookback: int = Field(90, gt=0)
    timeframe: str = "1d"
    quantiles: Optional[List[float]] = None
    provider: Optional[str] = None

    @field_validator("quantiles")
    @classmethod
    def validate_quantiles(cls, value: Optional[List[float]]):
        if value is None:
            return value
        if not value:
            raise ValueError("quantiles must contain at least one value")
        for entry in value:
            if entry <= 0 or entry >= 1:
                raise ValueError("quantiles must be between 0 and 1")
        return value


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


def _fetch_live_history(ticker: str, lookback: int, timeframe: str) -> Dict[str, List]:
    ticker = ticker.upper()
    valid_timeframes = {"1h": "1h", "4h": "4h", "1d": "1d", "1wk": "1wk", "1mo": "1mo",
                        "5m": "5m", "15m": "15m", "30m": "30m", "60m": "1h"}
    interval = valid_timeframes.get(timeframe, "1d")

    import yfinance as yf

    if interval in ("5m", "15m", "30m"):
        period = "60d"
    elif interval in ("1h", "4h"):
        period = f"{min(lookback, 730)}d" if lookback <= 730 else "730d"
    else:
        period_map = {7: "5d", 30: "1mo", 60: "3mo", 90: "3mo", 180: "6mo", 365: "1y"}
        period = period_map.get(lookback, f"{max(lookback, 1)}d")

    hist = yf.Ticker(ticker).history(period=period, interval=interval)
    if hist.empty:
        raise HTTPException(404, f"No price history found for {ticker}")

    if interval == "1d":
        hist = hist.tail(lookback)

    date_fmt = "%Y-%m-%d" if interval in ("1d", "1wk", "1mo") else "%Y-%m-%dT%H:%M"
    dates = [d.strftime(date_fmt) for d in hist.index]
    prices = [round(p, 2) for p in hist["Close"].tolist()]
    return {"dates": dates, "prices": prices}


# Baseline cache: keyed by (ticker, horizon_days) — baseline doesn't change with events
baseline_cache = TTLCache(default_ttl=300)


@app.post("/api/simulate")
def run_simulation(req: SimulateRequest, authorization: Optional[str] = Header(None)):
    """Run Monte Carlo simulation with events."""
    # Check Redis cache first
    try:
        from cache import get_cached_simulation, cache_simulation as store_in_cache
        events_for_cache = [{"id": e.id, "params": e.params, "probability": e.probability} for e in req.events]
        cached = get_cached_simulation(req.ticker.upper(), events_for_cache, req.horizon_days, req.n_simulations)
        if cached:
            cached["cached"] = True
            return cached
    except Exception:
        cached = None

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
        n_sim = 2000  # was 500 — smoother chart, still sub-second

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
        max_paths = 30  # was 15 — smoother confidence bands
    elif req.horizon_days > 180:
        max_paths = 30
    else:
        max_paths = 50

    # v6: Compute commodity chain data for UI
    commodity_impacts_data = None
    stock_betas_data = None
    stock_impact_breakdown_data = None
    try:
        from commodities import calculate_commodity_impacts
        from betas import get_stock_betas, get_stock_impact_breakdown
        
        flat_events = [{"id": e.id, "params": e.params, "probability": e.probability}
                       for e in req.events]
        commodity_impacts_data = calculate_commodity_impacts(flat_events, req.horizon_days)
        stock_info = simulation.get_stock_info(ticker)
        stock_betas_data = get_stock_betas(ticker, stock_info.get("sector", ""))
        if commodity_impacts_data:
            stock_impact_breakdown_data = get_stock_impact_breakdown(
                commodity_impacts_data, stock_betas_data
            )
        # Round for cleaner JSON
        if commodity_impacts_data:
            commodity_impacts_data = {k: round(v, 2) for k, v in commodity_impacts_data.items() if abs(v) > 0.01}
        if stock_betas_data:
            stock_betas_data = {k: round(v, 3) for k, v in stock_betas_data.items() if abs(v) > 0.001}
        if stock_impact_breakdown_data:
            stock_impact_breakdown_data = {k: round(v, 2) for k, v in stock_impact_breakdown_data.items() if abs(v) > 0.01}
    except Exception:
        pass  # Graceful degradation

    response = SimulateResponse(
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
        commodity_impacts=commodity_impacts_data,
        stock_betas=stock_betas_data,
        stock_impact_breakdown=stock_impact_breakdown_data,
    )

    # Store in Redis cache (5 min TTL)
    try:
        events_for_cache = [{"id": e.id, "params": e.params, "probability": e.probability} for e in req.events]
        store_in_cache(req.ticker.upper(), events_for_cache, req.horizon_days, n_sim, response.dict(), ttl=300)
    except Exception:
        pass  # Never fail response for cache

    return response


@app.post("/api/forecast/baseline", response_model=TimesfmForecastResponse)
def forecast_baseline(req: BaselineForecastRequestModel):
    """Provider-agnostic baseline forecast endpoint."""
    quantiles = req.quantiles if req.quantiles is not None else list(DEFAULT_QUANTILES)
    forecast = forecast_with_provider(
        BaselineForecastRequest(
            series=req.series,
            horizon=req.horizon,
            quantiles=quantiles,
            frequency=req.frequency,
        ),
        provider=req.provider,
    )
    return TimesfmForecastResponse(
        available=forecast.available,
        horizon=forecast.horizon,
        point=forecast.point or None,
        quantiles=forecast.quantiles or None,
        mode=forecast.mode,
        message=forecast.message,
        provider=forecast.provider,
    )


@app.post("/api/forecast/timesfm", response_model=TimesfmForecastResponse)
def forecast_timesfm(req: TimesfmForecastRequest):
    """Compatibility wrapper for TimesFM baseline forecast."""
    quantiles = req.quantiles if req.quantiles is not None else list(DEFAULT_QUANTILES)
    forecast = forecast_with_provider(
        BaselineForecastRequest(
            series=req.series,
            horizon=req.horizon,
            quantiles=quantiles,
            frequency=req.frequency,
        ),
        provider="timesfm",
    )
    return TimesfmForecastResponse(
        available=forecast.available,
        horizon=forecast.horizon,
        point=forecast.point or None,
        quantiles=forecast.quantiles or None,
        mode=forecast.mode,
        message=forecast.message,
        provider=forecast.provider,
    )


@app.post("/api/forecast/baseline/live", response_model=TimesfmLiveForecastResponse)
def forecast_baseline_live(req: BaselineLiveForecastRequestModel):
    """Provider-agnostic baseline forecast using live ticker history as input."""
    ticker = req.ticker.upper()
    history = _fetch_live_history(ticker, req.lookback, req.timeframe)
    if not history.get("prices"):
        raise HTTPException(404, f"No price history found for {ticker}")

    quantiles = req.quantiles if req.quantiles is not None else list(DEFAULT_QUANTILES)
    forecast = forecast_with_provider(
        BaselineForecastRequest(
            series=history["prices"],
            horizon=req.horizon,
            quantiles=quantiles,
            frequency=req.timeframe,
            timestamps=history.get("dates"),
        ),
        provider=req.provider,
    )
    return TimesfmLiveForecastResponse(
        available=forecast.available,
        ticker=ticker,
        horizon=forecast.horizon,
        lookback=req.lookback,
        history=history,
        point=forecast.point or None,
        quantiles=forecast.quantiles or None,
        mode=forecast.mode,
        message=forecast.message,
        provider=forecast.provider,
    )


@app.post("/api/forecast/timesfm/live", response_model=TimesfmLiveForecastResponse)
def forecast_timesfm_live(req: TimesfmLiveForecastRequest):
    """Compatibility wrapper for TimesFM live forecast."""
    ticker = req.ticker.upper()
    history = _fetch_live_history(ticker, req.lookback, req.timeframe)
    if not history.get("prices"):
        raise HTTPException(404, f"No price history found for {ticker}")

    quantiles = req.quantiles if req.quantiles is not None else list(DEFAULT_QUANTILES)
    forecast = forecast_with_provider(
        BaselineForecastRequest(
            series=history["prices"],
            horizon=req.horizon,
            quantiles=quantiles,
            frequency=req.timeframe,
            timestamps=history.get("dates"),
        ),
        provider="timesfm",
    )
    return TimesfmLiveForecastResponse(
        available=forecast.available,
        ticker=ticker,
        horizon=forecast.horizon,
        lookback=req.lookback,
        history=history,
        point=forecast.point or None,
        quantiles=forecast.quantiles or None,
        mode=forecast.mode,
        message=forecast.message,
        provider=forecast.provider,
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


@app.post("/api/scenarios/refresh-prices")
def refresh_scenario_prices():
    """Refresh all seed scenario prices with live market data. Called by cron."""
    from simulation import get_current_price, simulate
    conn = get_db()
    try:
        rows = conn.execute("SELECT id, ticker, events, result_summary FROM scenarios").fetchall()
        updated = 0
        for row in rows:
            ticker = row["ticker"]
            try:
                live_price = get_current_price(ticker)
                if live_price <= 0:
                    continue
                result_summary = json.loads(row["result_summary"]) if row["result_summary"] else {}
                events_raw = json.loads(row["events"]) if row["events"] else []

                # Update currentPrice
                result_summary["currentPrice"] = round(live_price, 2)

                # Re-run quick simulation for median30d
                if events_raw:
                    sim_events = []
                    for e in events_raw:
                        sim_events.append({
                            "id": e.get("id", ""),
                            "probability": e.get("probability", 50) / 100.0,
                            "params": {
                                "severity": abs(e.get("impact", 5)),
                                "duration_days": e.get("duration", 30),
                            },
                        })
                    try:
                        sim = simulate(ticker, sim_events, horizon_days=30, n_simulations=200, seed=42,
                                       cached_price=live_price)
                        result_summary["median30d"] = round(sim.median_target, 2)
                        result_summary["probProfit"] = round(sim.probability_above_current * 100, 0)
                        result_summary["eventImpact"] = round(sim.expected_return_pct, 1)
                    except Exception:
                        pass

                conn.execute(
                    "UPDATE scenarios SET result_summary = ? WHERE id = ?",
                    (json.dumps(result_summary), row["id"]),
                )
                updated += 1
            except Exception:
                continue
        conn.commit()
        return {"updated": updated, "total": len(rows)}
    finally:
        conn.close()


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


@app.post("/api/auth/change-password")
def change_password(request_body: dict, authorization: Optional[str] = Header(None)):
    """Change password for logged-in user. Requires old_password + new_password."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    old_pw = request_body.get("old_password", "")
    new_pw = request_body.get("new_password", "")
    if not old_pw or not new_pw:
        raise HTTPException(400, "old_password and new_password are required")
    if len(new_pw) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    if not auth.change_password(user["user_id"], old_pw, new_pw):
        raise HTTPException(400, "Current password is incorrect")
    return {"status": "ok", "message": "Password changed successfully"}


@app.post("/api/auth/forgot-password")
def forgot_password(request_body: dict):
    """Request a password reset. Sends reset link via email."""
    email = request_body.get("email", "")
    if not email:
        raise HTTPException(400, "Email is required")
    import auth
    import emailer
    token = auth.create_reset_token(email)
    if token:
        sent = emailer.send_password_reset(email, token)
        if not sent:
            logger.warning(f"Failed to send reset email to {email}")
    # Always return same response — don't reveal whether email exists
    return {"status": "ok", "message": "If that email is registered, you'll receive a reset link shortly."}


@app.post("/api/auth/reset-password")
def reset_password(request_body: dict):
    """Reset password using a reset token. Requires token + new_password."""
    token = request_body.get("token", "")
    new_pw = request_body.get("new_password", "")
    if not token or not new_pw:
        raise HTTPException(400, "token and new_password are required")
    if len(new_pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    import auth
    if not auth.use_reset_token(token, new_pw):
        raise HTTPException(400, "Invalid or expired reset token")
    return {"status": "ok", "message": "Password reset successfully. Please log in with your new password."}


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
    session_id: Optional[str] = Field(default=None, max_length=128)
    event_type: str = Field(max_length=64)
    event_data: Optional[Dict[str, Any]] = None
    page: Optional[str] = Field(default=None, max_length=300)
    viewport: Optional[str] = Field(default=None, max_length=64)

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in ALLOWED_FEEDBACK_EVENT_TYPES:
            raise ValueError("Unsupported event type")
        return value


class SurveyResponse(BaseModel):
    session_id: Optional[str] = Field(default=None, max_length=128)
    rating: int  # 1-5
    comment: Optional[str] = Field(default=None, max_length=2000)
    trigger_context: Optional[str] = Field(default=None, max_length=200)

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, value: int) -> int:
        if value < 1 or value > 5:
            raise ValueError("rating must be between 1 and 5")
        return value


class WidgetFeedback(BaseModel):
    session_id: Optional[str] = Field(default=None, max_length=128)
    category: str = Field(max_length=32)  # bug, feature, event, general
    message: str = Field(max_length=2000)
    page: Optional[str] = Field(default=None, max_length=300)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"bug", "feature", "event", "general", "ux", "security"}:
            raise ValueError("Unsupported category")
        return value


@app.post("/api/feedback/event")
def submit_feedback_event(req: FeedbackEvent, request: Request):
    """Record an implicit behavioral event (fire-and-forget)."""
    import feedback
    _enforce_rate_limit("feedback_event", _client_identifier(request, req.session_id))
    feedback.record_event(
        event_type=req.event_type,
        event_data=req.event_data,
        session_id=req.session_id,
        page=feedback.sanitize_page(req.page),
        viewport=(req.viewport or "")[:64],
    )
    return {"status": "ok"}


@app.post("/api/feedback/survey")
def submit_survey(req: SurveyResponse, request: Request):
    """Record a micro-survey response."""
    import feedback
    _enforce_rate_limit("feedback_survey", _client_identifier(request, req.session_id))
    feedback.record_survey(
        rating=req.rating,
        comment=req.comment,
        trigger_context=req.trigger_context,
        session_id=req.session_id,
    )
    return {"status": "ok"}


@app.post("/api/feedback/widget")
def submit_widget_feedback(req: WidgetFeedback, request: Request):
    """Record a feedback widget submission."""
    import feedback
    _enforce_rate_limit("feedback_widget", _client_identifier(request, req.session_id))
    ok = feedback.record_widget_feedback(
        category=req.category,
        message=req.message,
        session_id=req.session_id,
        page=req.page,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid feedback payload")
    return {"status": "ok"}


@app.get("/api/feedback/stats")
def get_feedback_stats(days: int = 7, authorization: Optional[str] = Header(None)):
    """Get feedback summary (admin endpoint)."""
    import feedback
    _require_internal_admin(authorization)
    days = max(1, min(int(days), 30))
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
    try:
        social.record_share(req.scenario_id, req.platform, user_id, req.session_id)
    except ValueError as e:
        raise HTTPException(429, str(e))
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
    try:
        social.follow_user(user["user_id"], req.following_id)
    except ValueError as e:
        raise HTTPException(429, str(e))
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
    try:
        social.unfollow_user(user["user_id"], following_id)
    except ValueError as e:
        raise HTTPException(429, str(e))
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
def mark_single_read(notif_id: int, authorization: Optional[str] = Header(None)):
    """Mark a single notification as read for the authenticated user only."""
    if not authorization:
        raise HTTPException(401, "Auth required")
    import auth, social
    user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
    if not user:
        raise HTTPException(401, "Invalid token")
    notifications = social.get_notifications(user["user_id"], unread_only=False, limit=200)
    owned_ids = {n.get("id") for n in notifications if isinstance(n, dict)}
    if notif_id not in owned_ids:
        raise HTTPException(404, "Notification not found")
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

@app.get("/api/og/home")
def get_og_home():
    """Generate Open Graph image for the homepage."""
    from fastapi.responses import Response
    svg = f"""<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#0a0f1a"/>
      <text x="600" y="220" text-anchor="middle" fill="#00d4aa" font-size="72" font-weight="800" font-family="Inter,system-ui,sans-serif">MonteCarloo</text>
      <text x="600" y="310" text-anchor="middle" fill="#ffffff" font-size="36" font-weight="600" font-family="Inter,system-ui,sans-serif">What if the world changes?</text>
      <text x="600" y="370" text-anchor="middle" fill="#8b95a5" font-size="24" font-family="Inter,system-ui,sans-serif">Simulate how events impact your stocks</text>
      <text x="600" y="440" text-anchor="middle" fill="#00d4aa" font-size="20" font-family="Inter,system-ui,sans-serif">Polymarket × Monte Carlo × AI Debates</text>
      <text x="600" y="560" text-anchor="middle" fill="#4a5568" font-size="16" font-family="Inter,system-ui,sans-serif">montecarloo.com</text>
    </svg>"""
    return Response(content=svg, media_type="image/svg+xml")


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
    tier: str  # "pro" | "premium" | "enterprise"


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
            "enterprise": {
                "name": "Enterprise",
                "price": 499,
                "limits": billing.TIER_LIMITS["enterprise"],
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
    entitlements = billing.compute_entitlements(tier, "active" if tier != "free" else "inactive")
    return {
        "tier": tier,
        "limits": billing.get_tier_limits(tier),
        "entitlements": entitlements,
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


@app.post("/api/billing/reconcile")
def reconcile_billing_access(authorization: Optional[str] = Header(None)):
    """Force a reconciliation of the logged-in user's subscription -> access state."""
    if not authorization:
        raise HTTPException(401, "Auth required")
    import auth, billing
    user = auth.get_user_by_token(authorization.replace("Bearer ", ""))
    if not user:
        raise HTTPException(401, "Invalid token")
    return billing.reconcile_user_subscription(user["user_id"])


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


@app.get("/api/cache/stats")
def cache_stats(authorization: Optional[str] = Header(None)):
    """Return Redis cache statistics (internal/admin only)."""
    _require_internal_admin(authorization)
    try:
        from cache import get_cache_stats
        return get_cache_stats()
    except Exception:
        return {"available": False, "error": "Cache module not loaded"}


@app.get("/api/llm/stats")
def llm_stats(authorization: Optional[str] = Header(None)):
    """Return LLM routing statistics (internal/admin only)."""
    _require_internal_admin(authorization)
    try:
        from llm_router import get_router_stats
        return get_router_stats()
    except Exception:
        return {"error": "LLM router not available"}


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
        import auth
        user = auth.get_user_by_token(token)
        if user:
            purchased = marketplace.has_purchased(listing_id, user["user_id"])
    
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
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    # Ensure creator profile exists
    marketplace.get_or_create_creator(user["user_id"], user.get("display_name", ""))
    
    if "title" not in request_body:
        raise HTTPException(400, "Title is required")
    if "price_cents" not in request_body:
        raise HTTPException(400, "Price is required")
    
    listing = marketplace.create_listing(user["user_id"], request_body)
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
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    listing = marketplace.update_listing(listing_id, user["user_id"], request_body)
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
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    deleted = marketplace.delete_listing(listing_id, user["user_id"])
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
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    if "rating" not in request_body or not (1 <= request_body["rating"] <= 5):
        raise HTTPException(400, "Rating 1-5 is required")
    
    try:
        review = marketplace.create_review(listing_id, user["user_id"], request_body)
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
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    try:
        result = marketplace.create_purchase(listing_id, user["user_id"])
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/marketplace/purchase/{listing_id}/verify")
def marketplace_verify_purchase(
    listing_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Verify and complete a pending marketplace purchase by checking Stripe directly.
    Called by frontend as fallback when returning from Stripe checkout.
    """
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")

    from db import get_db
    conn = get_db()
    try:
        # Find pending purchase for this user+listing
        purchase = conn.execute(
            "SELECT id, stripe_checkout_session_id, status FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ? ORDER BY created_at DESC LIMIT 1",
            (listing_id, user["user_id"])
        ).fetchone()

        if not purchase:
            raise HTTPException(404, "No purchase found")

        if purchase["status"] == "completed":
            return {"status": "already_completed", "purchased": True}

        session_id = purchase["stripe_checkout_session_id"]
        if not session_id:
            raise HTTPException(400, "No checkout session found")

        # Check with Stripe if payment was completed
        stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
        if not stripe_key:
            raise HTTPException(500, "Stripe not configured")

        import stripe
        stripe.api_key = stripe_key
        session = stripe.checkout.Session.retrieve(session_id)

        if session.payment_status == "paid":
            # Complete the purchase
            result = marketplace.complete_purchase(session_id)
            if result:
                return {"status": "completed", "purchased": True}
            else:
                return {"status": "error", "detail": "Could not complete purchase"}
        else:
            return {"status": "pending", "payment_status": session.payment_status, "purchased": False}
    finally:
        conn.close()


@app.get("/api/marketplace/purchases")
def marketplace_my_purchases(authorization: Optional[str] = Header(None)):
    """Get my purchased items."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    return marketplace.get_my_purchases(user["user_id"])


@app.get("/api/marketplace/creator/dashboard")
def marketplace_creator_dashboard(authorization: Optional[str] = Header(None)):
    """Get creator dashboard (authenticated)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    # Auto-create creator profile if needed
    marketplace.get_or_create_creator(user["user_id"], user.get("display_name", ""))
    dashboard = marketplace.get_creator_dashboard(user["user_id"])
    if "error" in dashboard:
        raise HTTPException(404, dashboard["error"])
    # Add computed fields expected by frontend
    listings = dashboard.get("listings", [])
    dashboard["total_listings"] = len(listings)
    ratings = [l.get("avg_rating", 0) for l in listings if l.get("avg_rating", 0) > 0]
    dashboard["avg_rating"] = round(sum(ratings) / len(ratings), 1) if ratings else 0
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
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    marketplace.get_or_create_creator(user["user_id"], user.get("display_name", ""))
    profile = marketplace.update_creator_profile(user["user_id"], request_body)
    return profile


@app.get("/api/marketplace/creator/{creator_id}")
def marketplace_creator_public(creator_id: str):
    """Get public creator profile."""
    profile = marketplace.get_creator_public_profile(creator_id)
    if not profile:
        raise HTTPException(404, "Creator not found")
    return profile


# ---------------------------------------------------------------------------
# Stripe Connect Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/marketplace/creator/connect")
def marketplace_connect_stripe(authorization: Optional[str] = Header(None)):
    """Start Stripe Connect onboarding for a creator."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")

    # Ensure creator profile exists
    marketplace.get_or_create_creator(user["user_id"], user.get("display_name", ""))

    try:
        marketplace.create_connect_account(user["user_id"], user["email"])
        result = marketplace.create_connect_onboarding_link(user["user_id"])
        return {"url": result["url"]}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Stripe Connect error: {str(e)}")


@app.get("/api/marketplace/creator/connect/status")
def marketplace_connect_status(authorization: Optional[str] = Header(None)):
    """Get Stripe Connect account status for the current creator."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")

    try:
        return marketplace.get_connect_account_status(user["user_id"])
    except Exception as e:
        raise HTTPException(500, f"Error fetching connect status: {str(e)}")


@app.post("/api/marketplace/creator/connect/dashboard")
def marketplace_connect_dashboard(authorization: Optional[str] = Header(None)):
    """Get Stripe Express dashboard link for creator."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")

    try:
        result = marketplace.create_connect_login_link(user["user_id"])
        return {"url": result["url"]}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error creating dashboard link: {str(e)}")


@app.post("/api/marketplace/creator/connect/refresh")
def marketplace_connect_refresh(authorization: Optional[str] = Header(None)):
    """Refresh onboarding link if it expired."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")

    try:
        result = marketplace.create_connect_onboarding_link(user["user_id"])
        return {"url": result["url"]}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error refreshing onboarding link: {str(e)}")


# ---------------------------------------------------------------------------
# Marketplace File Upload / Download Endpoints
# ---------------------------------------------------------------------------

from fastapi import UploadFile, File
from fastapi.responses import FileResponse
import file_scanner


@app.post("/api/marketplace/listings/{listing_id}/upload")
async def marketplace_upload_file(
    listing_id: str,
    file: UploadFile = File(...),
    is_primary: bool = True,
    authorization: Optional[str] = Header(None),
):
    """
    Upload a product file with security scanning.
    
    Files are scanned for malicious code before being accepted.
    Rejected files return scan details explaining why.
    """
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    # Read file content
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "Empty file")
    
    filename = file.filename or "unnamed"
    
    try:
        result = marketplace.upload_product_file(
            listing_id=listing_id,
            uploader_id=user["user_id"],
            filename=filename,
            content=content,
            is_primary=is_primary,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    if result.get("rejected"):
        return {
            "status": "rejected",
            "reason": result["reason"],
            "scan": result["scan"],
            "disclaimer": result["disclaimer"],
        }
    
    return {
        "status": "accepted",
        "file_id": result["file_id"],
        "filename": result["filename"],
        "file_size": result["file_size"],
        "file_hash": result["file_hash"],
        "scan": result["scan"],
        "disclaimer": result["disclaimer"],
    }


@app.get("/api/marketplace/listings/{listing_id}/files")
def marketplace_listing_files(listing_id: str):
    """Get all files for a listing."""
    files = marketplace.get_listing_files(listing_id)
    return {"files": files}


@app.get("/api/marketplace/files/{file_id}/download")
def marketplace_download_file(
    file_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Download a product file.
    
    Requires purchase for paid listings. Includes liability disclaimer.
    """
    user_id = None
    if authorization:
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        import auth
        user = auth.get_user_by_token(token)
        if user:
            user_id = user["user_id"]
    
    result = marketplace.get_file_for_download(file_id, user_id)
    if not result:
        raise HTTPException(404, "File not found")
    
    if "error" in result:
        raise HTTPException(403, result["error"])
    
    if not os.path.exists(result["file_path"]):
        raise HTTPException(404, "File not found on disk")
    
    return FileResponse(
        path=result["file_path"],
        filename=result["original_filename"],
        headers={
            "X-MonteCarloo-Disclaimer": "User-generated content. Use at your own risk. See /api/marketplace/disclaimer for full terms.",
            "X-Risk-Level": result["risk_level"],
            "X-Scan-Status": result["scan_status"],
        },
    )


@app.delete("/api/marketplace/files/{file_id}")
def marketplace_delete_file(
    file_id: str,
    authorization: Optional[str] = Header(None),
):
    """Delete a product file (creator only)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    deleted = marketplace.delete_product_file(file_id, user["user_id"])
    if not deleted:
        raise HTTPException(403, "Not authorized or file not found")
    return {"deleted": True}


@app.post("/api/marketplace/files/{file_id}/rescan")
def marketplace_rescan_file(
    file_id: str,
    authorization: Optional[str] = Header(None),
):
    """Re-scan a file for malicious content (creator or admin)."""
    if not authorization:
        raise HTTPException(401, "Login required")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    import auth
    user = auth.get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    
    result = marketplace.rescan_file(file_id)
    if not result:
        raise HTTPException(404, "File not found")
    if "error" in result:
        raise HTTPException(404, result["error"])
    return {"scan": result}


@app.get("/api/marketplace/disclaimer")
def marketplace_disclaimer():
    """Get the full product disclaimer and creator upload terms."""
    return {
        "product_disclaimer": file_scanner.PRODUCT_DISCLAIMER,
        "creator_upload_terms": file_scanner.CREATOR_UPLOAD_TERMS,
    }


# ---------------------------------------------------------------------------
# Pyeces Bridge Endpoints (v7.2)
# ---------------------------------------------------------------------------

class PyecesBridgeRequest(BaseModel):
    source: str = "pyeces"
    simulation_id: Optional[str] = None
    ticker: str
    event_name: str
    consensus: Dict[str, Any]  # direction, probability, magnitude_pct, peak_impact_days, confidence, agent_votes
    agent_predictions: Optional[List[Dict[str, Any]]] = None
    report_summary: Optional[str] = None
    structured_beliefs: Optional[List[Dict[str, Any]]] = None
    conversation: Optional[Dict[str, Any]] = None


@app.post("/api/bridge/pyeces")
def create_bridge_scenario(req: PyecesBridgeRequest):
    """Accept Pyeces simulation results and create a MonteCarloo scenario."""
    import json, string, random
    from datetime import datetime

    consensus = req.consensus

    def normalize_probability(value: Any) -> float:
        try:
            prob = float(value)
        except (TypeError, ValueError):
            return 0.5
        if prob > 1:
            prob = prob / 100
        if prob < 0:
            prob = 0
        if prob > 1:
            prob = 1
        return prob

    def normalize_magnitude(value: Any) -> float:
        if isinstance(value, (list, tuple)) and value:
            numbers = [v for v in value if isinstance(v, (int, float))]
            if len(numbers) >= 2:
                return (numbers[0] + numbers[1]) / 2
            if len(numbers) == 1:
                return float(numbers[0])
        try:
            return float(value)
        except (TypeError, ValueError):
            return 5.0

    def normalize_duration(value: Any) -> int:
        try:
            duration_value = int(value)
        except (TypeError, ValueError):
            duration_value = 14
        if duration_value <= 0:
            duration_value = 14
        return duration_value

    def normalize_direction(value: Any) -> str:
        direction_value = value if isinstance(value, str) else "bullish"
        if direction_value not in ("bullish", "bearish"):
            direction_value = "bullish"
        return direction_value

    def normalize_event_name(name: Any, fallback: str) -> str:
        resolved = name if isinstance(name, str) and name.strip() else fallback
        if "pyeces" in resolved.lower():
            return resolved
        return f"{resolved} (Pyeces AI)"

    def build_event(payload: Dict[str, Any], event_id: str, fallback_name: str) -> Dict[str, Any]:
        probability = normalize_probability(payload.get("probability", 0.5))
        magnitude = normalize_magnitude(payload.get("magnitude_pct", 5.0))
        duration = normalize_duration(payload.get("peak_impact_days", 14))
        direction = normalize_direction(payload.get("direction", "bullish"))
        name = payload.get("event_name") or payload.get("name") or fallback_name
        resolved_name = normalize_event_name(name, fallback_name)
        impact = magnitude if direction == "bullish" else -magnitude
        return {
            "id": event_id,
            "name": resolved_name,
            "probability": probability * 100,  # MonteCarloo uses 0-100
            "impact": impact,
            "duration": duration,
            "params": {
                "probability": probability,
                "duration_days": duration,
                "impact_pct": impact,
            },
        }

    # Map Pyeces consensus to MonteCarloo event format
    event = build_event(
        consensus,
        f"pyeces_{req.simulation_id or 'custom'}",
        req.event_name,
    )

    events = [event]

    for idx, belief in enumerate(req.structured_beliefs or [], start=1):
        if not isinstance(belief, dict):
            continue
        belief_id = belief.get("id") if isinstance(belief.get("id"), str) else None
        event_id = belief_id or f"pyeces_belief_{req.simulation_id or 'custom'}_{idx}"
        belief_name = belief.get("event_name") or belief.get("name") or f"Pyeces Belief {idx}"
        events.append(build_event(belief, event_id, belief_name))

    # Generate scenario ID
    alphabet = string.ascii_lowercase + string.digits
    scenario_id = "".join(random.choices(alphabet, k=10))

    # Build result summary
    result_summary = {
        "direction": normalize_direction(consensus.get("direction", "bullish")),
        "probability": normalize_probability(consensus.get("probability", 0.5)),
        "magnitude_pct": normalize_magnitude(consensus.get("magnitude_pct", 5.0)),
        "confidence": consensus.get("confidence", 0),
        "agent_votes": consensus.get("agent_votes", {}),
        "belief_count": len(req.structured_beliefs or []),
    }

    # Store full Pyeces data
    pyeces_data = {
        "source": req.source,
        "simulation_id": req.simulation_id,
        "consensus": consensus,
        "structured_beliefs": req.structured_beliefs or [],
        "agent_predictions": req.agent_predictions or [],
        "report_summary": req.report_summary,
        "conversation": req.conversation or {},
        "created_at": datetime.utcnow().isoformat(),
    }

    title = f"{req.ticker} — {req.event_name} (Pyeces AI)"

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO scenarios
            (id, ticker, title, description, events, result_summary,
             author_name, is_public, source, pyeces_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                scenario_id,
                req.ticker.upper(),
                title[:200],
                (req.report_summary or "")[:500],
                json.dumps(events),
                json.dumps(result_summary),
                "Pyeces AI",
                1,
                "pyeces",
                json.dumps(pyeces_data),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    chart_url = f"https://montecarloo.com/sim/{req.ticker.upper()}?bridge={scenario_id}"

    return {
        "scenario_id": scenario_id,
        "chart_url": chart_url,
        "events_created": events,
    }


@app.get("/api/bridge/pyeces/{scenario_id}")
def get_bridge_scenario(scenario_id: str):
    """Load Pyeces metadata for a bridge scenario."""
    import json

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, ticker, title, events, result_summary, source, pyeces_data, created_at FROM scenarios WHERE id = ?",
            (scenario_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Bridge scenario not found")

    return {
        "scenario_id": row["id"],
        "ticker": row["ticker"],
        "title": row["title"],
        "events": json.loads(row["events"]) if row["events"] else [],
        "result_summary": json.loads(row["result_summary"]) if row["result_summary"] else {},
        "source": row["source"],
        "pyeces_data": json.loads(row["pyeces_data"]) if row["pyeces_data"] else None,
        "created_at": row["created_at"],
    }


# ---------------------------------------------------------------------------
# Character Simulation Endpoints (v7.1)
# ---------------------------------------------------------------------------

class CharacterSimRequest(BaseModel):
    ticker: str
    event_id: str
    event_name: str
    event_description: str = ""
    probability: float = 0.5
    duration_days: int = 30
    num_rounds: int = 10
    max_main_characters: int = 3
    max_analysts: int = 5

class CharacterChatRequest(BaseModel):
    character_id: str
    message: str
    ticker: str
    current_price: float = 0
    event_context: str = ""
    history: List[Dict] = []

@app.get("/api/characters")
def list_characters():
    """List all available simulation characters."""
    import characters
    return characters.list_characters()

@app.post("/api/characters/simulate")
def run_character_sim(req: CharacterSimRequest, authorization: Optional[str] = Header(None)):
    """Run a character-driven simulation. Returns debate rounds + consensus."""
    import characters
    
    # Get current price for the ticker
    try:
        import yfinance as yf
        stock = yf.Ticker(req.ticker)
        hist = stock.history(period="1d")
        current_price = float(hist["Close"].iloc[-1]) if len(hist) > 0 else 100.0
    except Exception:
        current_price = 100.0
    
    # Tier limits
    max_rounds = req.num_rounds
    max_main = req.max_main_characters
    max_analysts = req.max_analysts
    
    if authorization:
        import auth
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        user = auth.get_user_by_token(token)
        if user:
            import billing
            tier = billing.get_user_tier(user["user_id"])
            if tier == "pro":
                max_rounds = min(max_rounds, 40)
                max_main = min(max_main, 5)
                max_analysts = min(max_analysts, 10)
            elif tier == "premium":
                max_rounds = min(max_rounds, 100)
                max_main = min(max_main, 8)
                max_analysts = min(max_analysts, 15)
            else:  # free
                max_rounds = min(max_rounds, 10)
                max_main = min(max_main, 3)
                max_analysts = min(max_analysts, 5)
    else:
        max_rounds = min(max_rounds, 10)
        max_main = min(max_main, 3)
        max_analysts = min(max_analysts, 5)
    
    try:
        result = characters.run_simulation_sync(
            ticker=req.ticker,
            current_price=current_price,
            event_id=req.event_id,
            event_name=req.event_name,
            event_description=req.event_description or req.event_name,
            probability=req.probability,
            duration_days=req.duration_days,
            num_rounds=max_rounds,
            max_main_characters=max_main,
            max_analysts=max_analysts,
        )
        
        # Award points if authenticated
        if authorization:
            try:
                import auth
                token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
                user = auth.get_user_by_token(token)
                if user:
                    social.award_points(user["user_id"], "run_simulation", 2)  # 2pts for character sim (more expensive)
            except Exception:
                pass
        
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Character simulation error: {e}")
        raise HTTPException(500, f"Simulation error: {str(e)}")

@app.post("/api/characters/chat")
def chat_with_character(req: CharacterChatRequest, authorization: Optional[str] = Header(None)):
    """Chat with a specific character about a stock/event."""
    import characters
    
    # Get current price if not provided
    current_price = req.current_price
    if current_price <= 0:
        try:
            import yfinance as yf
            stock = yf.Ticker(req.ticker)
            hist = stock.history(period="1d")
            current_price = float(hist["Close"].iloc[-1]) if len(hist) > 0 else 100.0
        except Exception:
            current_price = 100.0
    
    try:
        result = characters.chat_with_character(
            character_id=req.character_id,
            message=req.message,
            ticker=req.ticker,
            current_price=current_price,
            event_context=req.event_context,
            history=req.history,
        )
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error(f"Character chat error: {e}")
        raise HTTPException(500, f"Chat error: {str(e)}")


# ---------------------------------------------------------------------------
# Debate Game API
# ---------------------------------------------------------------------------

class BetRequest(BaseModel):
    debate_id: str
    character_id: str
    character_name: str
    side: str = "bullish"
    points_wagered: int = 10
    ticker: str
    target_price: float = 0
    odds: float = 1.0

class DraftRequest(BaseModel):
    character_id: str
    character_name: str
    emoji: str = "🧑"

class ReactionRequest(BaseModel):
    debate_id: str
    reaction_index: int
    reaction_type: str = "fire"


@app.on_event("startup")
def init_debate_tables():
    try:
        import debate_game
        debate_game.init_debate_game_db()
    except Exception as e:
        logger.warning(f"Debate game table init on startup: {e}")


@app.post("/api/debate/bet")
def place_debate_bet(req: BetRequest, authorization: Optional[str] = Header(None)):
    """Place a bet on a character's position."""
    import debate_game
    user_id = _get_user_id(authorization)
    if not user_id:
        raise HTTPException(401, "Login required to place bets")
    
    result = debate_game.place_bet(
        user_id=user_id,
        debate_id=req.debate_id,
        character_id=req.character_id,
        character_name=req.character_name,
        side=req.side,
        points_wagered=req.points_wagered,
        ticker=req.ticker,
        target_price=req.target_price,
        odds=req.odds,
    )
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.get("/api/debate/{debate_id}/bets")
def get_debate_bets(debate_id: str):
    """Get all bets and live odds for a debate."""
    import debate_game
    return debate_game.get_debate_bets(debate_id)


@app.get("/api/debate/my-bets")
def get_my_bets(authorization: Optional[str] = Header(None), resolved: Optional[bool] = None):
    """Get user's betting history."""
    import debate_game
    user_id = _get_user_id(authorization)
    if not user_id:
        raise HTTPException(401, "Login required")
    return debate_game.get_user_bets(user_id, resolved)


@app.post("/api/debate/reaction")
def add_debate_reaction(req: ReactionRequest, authorization: Optional[str] = Header(None)):
    """React to a debate message (🔥🧠🧢💰💀🚀🤡💯)."""
    import debate_game
    user_id = _get_user_id(authorization) or f"anon_{secrets.token_hex(4)}"
    return debate_game.add_reaction(req.debate_id, req.reaction_index, user_id, req.reaction_type)


@app.get("/api/debate/{debate_id}/reactions")
def get_debate_reactions(debate_id: str):
    """Get reaction counts for a debate."""
    import debate_game
    return debate_game.get_reactions(debate_id)


@app.post("/api/team/draft")
def draft_to_team(req: DraftRequest, authorization: Optional[str] = Header(None)):
    """Add a character to your advisory board."""
    import debate_game
    user_id = _get_user_id(authorization)
    if not user_id:
        raise HTTPException(401, "Login required")
    result = debate_game.draft_character(user_id, req.character_id, req.character_name, req.emoji)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.delete("/api/team/{character_id}")
def drop_from_team(character_id: str, authorization: Optional[str] = Header(None)):
    """Remove a character from your team."""
    import debate_game
    user_id = _get_user_id(authorization)
    if not user_id:
        raise HTTPException(401, "Login required")
    return debate_game.drop_character(user_id, character_id)


@app.get("/api/team")
def get_my_team(authorization: Optional[str] = Header(None)):
    """Get your advisory board."""
    import debate_game
    user_id = _get_user_id(authorization)
    if not user_id:
        raise HTTPException(401, "Login required")
    return debate_game.get_team(user_id)


@app.get("/api/debate/xp")
def get_my_xp(authorization: Optional[str] = Header(None)):
    """Get XP and level stats."""
    import debate_game
    user_id = _get_user_id(authorization)
    if not user_id:
        raise HTTPException(401, "Login required")
    return debate_game.get_xp_stats(user_id)


@app.get("/api/debate/leaderboard")
def game_leaderboard(limit: int = 20):
    """Get debate game leaderboard."""
    import debate_game
    return debate_game.get_game_leaderboard(limit)


@app.get("/api/characters/rankings")
def character_rankings():
    """Get character ELO rankings."""
    import debate_game
    return debate_game.get_character_rankings()


@app.get("/api/debate/reaction-types")
def get_reaction_types():
    """Get available reaction types."""
    import debate_game
    return debate_game.REACTION_TYPES


def _get_user_id(authorization: Optional[str]) -> Optional[str]:
    """Extract user_id from auth token."""
    if not authorization:
        return None
    try:
        import auth
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        user = auth.get_user_by_token(token)
        return user["user_id"] if user else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

@app.post("/api/feedback")
def submit_feedback(
    request_body: dict,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Save user feedback (bug reports, ideas, etc.)."""
    from db import get_db
    import secrets
    import feedback as feedback_utils

    token = _extract_bearer_token(authorization)

    # Optional auth — anonymous feedback is fine
    user_id = None
    if token:
        import auth
        user = auth.get_user_by_token(token)
        if user:
            user_id = user["user_id"]

    session_id = request_body.get("sessionId") or request_body.get("session_id")
    _enforce_rate_limit("feedback_form", _client_identifier(request, session_id))

    feedback_type = str(request_body.get("type", "other")).strip().lower()
    if feedback_type not in ALLOWED_FEEDBACK_TYPES:
        feedback_type = "other"

    message = feedback_utils.sanitize_feedback_message(request_body.get("message", ""))
    email = feedback_utils.sanitize_email(request_body.get("email", ""))
    page = feedback_utils.sanitize_page(request_body.get("page", ""))
    user_agent = (request.headers.get("user-agent") or "")[:255]
    screen_width_raw = request_body.get("screenWidth", 0)
    try:
        screen_width = max(0, min(int(screen_width_raw), 10000))
    except Exception:
        screen_width = 0

    if not message:
        raise HTTPException(400, "Message is required")

    suspicious = feedback_utils.looks_suspicious_feedback(message)
    status = "spam" if suspicious else "new"

    conn = get_db()
    try:
        # Create table if not exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                type TEXT NOT NULL DEFAULT 'other',
                message TEXT NOT NULL,
                email TEXT DEFAULT '',
                page TEXT DEFAULT '',
                user_agent TEXT DEFAULT '',
                screen_width INTEGER DEFAULT 0,
                status TEXT DEFAULT 'new',
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)
        """)

        feedback_id = secrets.token_urlsafe(12)
        conn.execute("""
            INSERT INTO feedback (id, user_id, type, message, email, page, user_agent, screen_width, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (feedback_id, user_id, feedback_type, message, email, page, user_agent, screen_width, status))
        conn.commit()
    finally:
        conn.close()

    logger.info(f"Feedback received: type={feedback_type} page={page} user={user_id or 'anon'} status={status}")
    return {"id": feedback_id, "status": "received"}


@app.get("/api/feedback")
def list_feedback(
    status: str = "new",
    limit: int = 50,
    authorization: Optional[str] = Header(None),
):
    """List feedback entries (for internal review)."""
    from db import get_db

    _require_internal_admin(authorization)
    status = status if status in {"new", "reviewed", "triaged", "closed", "resolved", "spam"} else "new"
    limit = max(1, min(int(limit), 100))

    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT f.id, f.user_id, f.type, f.message, f.page, f.screen_width, f.status, f.notes, f.created_at,
                   u.display_name as user_name
            FROM feedback f
            LEFT JOIN users u ON f.user_id = u.id
            WHERE f.status = ?
            ORDER BY f.created_at DESC
            LIMIT ?
        """, (status, limit)).fetchall()

        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()


@app.patch("/api/feedback/{feedback_id}")
def update_feedback(
    feedback_id: str,
    request_body: dict,
    authorization: Optional[str] = Header(None),
):
    """Update feedback status / notes for internal review workflows."""
    from db import get_db

    _require_internal_admin(authorization)

    new_status = str(request_body.get("status", "")).strip().lower()
    notes = str(request_body.get("notes", "")).strip()[:2000]
    allowed_statuses = {"new", "reviewed", "triaged", "closed", "resolved", "spam"}
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid feedback status")

    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM feedback WHERE id = ?", (feedback_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Feedback not found")

        result = conn.execute(
            "UPDATE feedback SET status = ?, notes = ? WHERE id = ?",
            (new_status, notes, feedback_id),
        )
        conn.commit()

        updated = conn.execute(
            "SELECT id, status, notes FROM feedback WHERE id = ?",
            (feedback_id,),
        ).fetchone()

        return {
            "ok": bool(getattr(result, "rowcount", 0) or updated),
            "feedback": dict(updated) if updated else None,
        }
    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
