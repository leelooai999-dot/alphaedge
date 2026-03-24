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
def get_events(category: Optional[str] = None):
    """List all available events, optionally filtered by category."""
    events = list_all_events()
    if category:
        events = [e for e in events if e.category == category]
    return [
        {
            "id": e.key,
            "name": e.name,
            "category": e.category,
            "description": e.description,
            "probability": e.probability,
            "polymarket_keywords": e.polymarket_keywords,
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


@app.post("/api/simulate")
def run_simulation(req: SimulateRequest):
    """Run Monte Carlo simulation with events."""
    ticker = req.ticker.upper()

    # Determine simulation count
    n_sim = req.n_simulations
    if req.fast:
        n_sim = 500

    # Run main simulation with events
    result = simulation.simulate(
        ticker=ticker,
        events=[{"id": e.id, "params": e.params, "probability": e.probability} for e in req.events],
        horizon_days=req.horizon_days,
        n_simulations=n_sim,
        seed=42,
    )

    # Run baseline (no events) for comparison
    try:
        baseline = simulation.simulate_no_events(ticker, req.horizon_days, 2000, seed=42)
        baseline_target = baseline.median_target
        event_impact_usd = round(result.median_target - baseline_target, 2)
    except Exception:
        baseline_target = None
        event_impact_usd = None

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
        paths_sample=result.paths_sample[:50],  # limit for response size
        baseline_target=baseline_target,
        event_impact_usd=event_impact_usd,
    )


@app.get("/api/categories")
def get_categories():
    """List event categories."""
    return {"categories": list_categories()}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
