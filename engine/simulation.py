"""
AlphaEdge Monte Carlo Stock Price Simulation Engine.

Simulates stock price paths using Geometric Brownian Motion (GBM)
adjusted for event-driven drift and volatility changes.
"""

import numpy as np
import yfinance as yf
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from events import EVENTS, Event
from correlations import get_stock_info


@dataclass
class SimulationResult:
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
    paths_sample: Optional[List[List[float]]] = None  # 100 sample paths for chart

    def to_dict(self):
        d = asdict(self)
        d.pop('paths_sample', None)
        return d


def get_stock_volatility(ticker: str, period: str = "3mo") -> float:
    """Fetch annualized historical volatility from Yahoo Finance."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)
        if len(hist) < 10:
            return 0.30  # default 30% annual vol
        returns = hist['Close'].pct_change().dropna()
        return returns.std() * np.sqrt(252)
    except Exception:
        return 0.30


def get_stock_beta(ticker: str) -> float:
    """Fetch beta from Yahoo Finance."""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        beta = info.get('beta', 1.0)
        return beta if beta and beta > 0 else 1.0
    except Exception:
        return 1.0


def get_current_price(ticker: str) -> float:
    """Fetch current stock price."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")
        if len(hist) > 0:
            return float(hist['Close'].iloc[-1])
    except Exception:
        pass
    # Fallback: return 0 so caller knows to use cached price
    return 0.0


def calculate_event_impact(
    event_id: str,
    event_params: Dict[str, float],
    stock_ticker: str,
    stock_info: Dict,
    probability: float = 1.0
) -> Dict[str, float]:
    """
    Calculate how an event affects a specific stock.
    Returns drift_adjustment and vol_multiplier.
    """
    event_def = EVENTS.get(event_id)
    if not event_def:
        return {"drift_adjustment": 0.0, "vol_multiplier": 1.0, "target_impact_pct": 0.0}

    stock_sector = stock_info.get("sector", "technology")

    # Get base impact for this sector
    sector_impact = event_def.get_impact_for_sector(stock_sector)
    if sector_impact:
        base_drift = sector_impact.drift
        base_vol = sector_impact.vol_multiplier
    else:
        base_drift = 0.0
        base_vol = 1.0

    # Adjust by severity/duration parameter
    param_values = event_params.copy()
    severity = param_values.get("severity", 5.0) / 5.0  # normalize to 0-1
    duration = param_values.get("duration_days", 30.0) / 60.0  # normalize, 60 days = 1.0

    # Scale impact by probability (if only 50% likely, impact is halved)
    prob_factor = probability

    drift_adjustment = base_drift * severity * duration * prob_factor
    vol_multiplier = 1.0 + (base_vol - 1.0) * severity * prob_factor

    # Calculate expected target impact in percentage
    days_ahead = param_values.get("duration_days", 30)
    target_impact_pct = drift_adjustment * 252 * (days_ahead / 252) * prob_factor * 100

    return {
        "drift_adjustment": drift_adjustment,
        "vol_multiplier": vol_multiplier,
        "target_impact_pct": target_impact_pct
    }


def simulate(
    ticker: str,
    events: List[Dict[str, any]],
    horizon_days: int = 30,
    n_simulations: int = 10000,
    seed: Optional[int] = None
) -> SimulationResult:
    """
    Run Monte Carlo simulation for a stock with event-driven adjustments.

    Args:
        ticker: Stock ticker (e.g., "CVX")
        events: List of {"id": "iran_escalation", "params": {"severity": 5, "duration_days": 30}, "probability": 0.67}
        horizon_days: Number of trading days to simulate
        n_simulations: Number of Monte Carlo paths
        seed: Random seed for reproducibility

    Returns:
        SimulationResult with statistics and sample paths
    """
    if seed is not None:
        np.random.seed(seed)

    # Get stock data
    current_price = get_current_price(ticker)
    if current_price <= 0:
        # Fallback to cache
        from api import PRICE_CACHE, VOL_CACHE
        current_price = PRICE_CACHE.get(ticker.upper(), 0)
        if current_price <= 0:
            raise ValueError(f"Could not get price for {ticker}")

    volatility = get_stock_volatility(ticker)
    if volatility <= 0:
        from api import VOL_CACHE
        volatility = VOL_CACHE.get(ticker.upper(), 0.30)
    stock_info = get_stock_info(ticker)

    # Base parameters (annualized drift from historical average ~7%)
    base_drift = 0.07  # long-term market average annual return

    # Calculate combined event impacts
    total_drift_adjustment = 0.0
    total_vol_multiplier = 1.0
    event_impact_breakdown = {}

    for event in events:
        event_id = event.get("id", "")
        params = event.get("params", {})
        probability = event.get("probability", 1.0)

        impact = calculate_event_impact(event_id, params, ticker, stock_info, probability)
        total_drift_adjustment += impact["drift_adjustment"]
        total_vol_multiplier = max(total_vol_multiplier, impact["vol_multiplier"])
        event_impact_breakdown[event_id] = impact["target_impact_pct"]

    # Adjusted parameters
    adjusted_drift = base_drift + total_drift_adjustment
    adjusted_vol = volatility * total_vol_multiplier

    # Simulation parameters
    dt = 1 / 252  # one trading day
    drift_daily = adjusted_drift * dt
    vol_daily = adjusted_vol * np.sqrt(dt)

    # Run Monte Carlo (vectorized for performance)
    Z = np.random.standard_normal((n_simulations, horizon_days))

    # GBM: S(t+dt) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
    log_returns = (drift_daily - 0.5 * vol_daily**2) + vol_daily * Z
    log_returns = np.cumsum(log_returns, axis=1)

    # Add 1 to shift from returns to price ratio
    price_paths = current_price * np.exp(log_returns)

    # Add starting price
    price_paths = np.column_stack([
        np.full(n_simulations, current_price),
        price_paths
    ])

    # Calculate statistics
    final_prices = price_paths[:, -1]
    median_target = float(np.median(final_prices))
    percentile_5 = float(np.percentile(final_prices, 5))
    percentile_25 = float(np.percentile(final_prices, 25))
    percentile_75 = float(np.percentile(final_prices, 75))
    percentile_95 = float(np.percentile(final_prices, 95))

    prob_above_current = float(np.mean(final_prices > current_price))
    expected_return_pct = float((median_target - current_price) / current_price * 100)

    # Max drawdown on median path
    median_path = np.median(price_paths, axis=0)
    running_max = np.maximum.accumulate(median_path)
    drawdowns = (running_max - median_path) / running_max
    max_drawdown_median = float(np.max(drawdowns)) * 100

    # Sample paths for chart (100 paths, sampled evenly)
    if n_simulations > 100:
        indices = np.linspace(0, n_simulations - 1, 100, dtype=int)
        paths_sample = price_paths[indices].tolist()
    else:
        paths_sample = price_paths.tolist()

    # Also compute median path at each time step
    median_at_each_step = np.median(price_paths, axis=0).tolist()

    return SimulationResult(
        ticker=ticker,
        current_price=current_price,
        horizon_days=horizon_days,
        n_simulations=n_simulations,
        events=[e.get("id", "") for e in events],
        median_target=round(median_target, 2),
        percentile_5=round(percentile_5, 2),
        percentile_25=round(percentile_25, 2),
        percentile_75=round(percentile_75, 2),
        percentile_95=round(percentile_95, 2),
        probability_above_current=round(prob_above_current, 4),
        max_drawdown_median=round(max_drawdown_median, 2),
        expected_return_pct=round(expected_return_pct, 2),
        event_impact_breakdown=event_impact_breakdown,
        paths_sample=paths_sample
    )


def simulate_no_events(
    ticker: str,
    horizon_days: int = 30,
    n_simulations: int = 10000,
    seed: Optional[int] = None
) -> SimulationResult:
    """Baseline simulation with no events."""
    return simulate(ticker, [], horizon_days, n_simulations, seed)


if __name__ == "__main__":
    # Test: CVX with Iran escalation
    print("=== AlphaEdge Simulation Engine Test ===\n")

    # Test 1: No events
    print("Test 1: CVX with no events (baseline)")
    result = simulate_no_events("CVX", horizon_days=30, n_simulations=5000, seed=42)
    print(f"  Current: ${result.current_price:.2f}")
    print(f"  Median target: ${result.median_target:.2f}")
    print(f"  Expected return: {result.expected_return_pct:+.2f}%")
    print(f"  5th-95th percentile: ${result.percentile_5:.2f} - ${result.percentile_95:.2f}")
    print()

    # Test 2: CVX with Iran escalation
    print("Test 2: CVX with Iran escalation (severity=5, duration=15)")
    result = simulate(
        "CVX",
        [{"id": "iran_escalation", "params": {"severity": 5, "duration_days": 15}, "probability": 0.67}],
        horizon_days=30,
        n_simulations=5000,
        seed=42
    )
    print(f"  Current: ${result.current_price:.2f}")
    print(f"  Median target: ${result.median_target:.2f}")
    print(f"  Expected return: {result.expected_return_pct:+.2f}%")
    print(f"  5th-95th percentile: ${result.percentile_5:.2f} - ${result.percentile_95:.2f}")
    print(f"  Probability above current: {result.probability_above_current*100:.1f}%")
    print(f"  Max drawdown (median): {result.max_drawdown_median:.2f}%")
    print(f"  Event impact breakdown: {result.event_impact_breakdown}")
    print()

    # Test 3: NVDA with chip export controls
    print("Test 3: NVDA with chip export controls (severity=7, duration=90)")
    result = simulate(
        "NVDA",
        [{"id": "chip_export_control", "params": {"severity": 7, "duration_days": 90}, "probability": 0.40}],
        horizon_days=60,
        n_simulations=5000,
        seed=42
    )
    print(f"  Current: ${result.current_price:.2f}")
    print(f"  Median target: ${result.median_target:.2f}")
    print(f"  Expected return: {result.expected_return_pct:+.2f}%")
    print(f"  5th-95th percentile: ${result.percentile_5:.2f} - ${result.percentile_95:.2f}")
    print(f"  Probability above current: {result.probability_above_current*100:.1f}%")
    print()

    # Test 4: CVX with two compound events
    print("Test 4: CVX with Iran escalation + Fed rate cut (compound)")
    result = simulate(
        "CVX",
        [
            {"id": "iran_escalation", "params": {"severity": 5, "duration_days": 15}, "probability": 0.67},
            {"id": "fed_rate_cut", "params": {"rate_change_bps": -25, "probability_hold": 0.40, "probability_cut_25": 0.45, "probability_cut_50": 0.15}, "probability": 0.45}
        ],
        horizon_days=30,
        n_simulations=5000,
        seed=42
    )
    print(f"  Current: ${result.current_price:.2f}")
    print(f"  Median target: ${result.median_target:.2f}")
    print(f"  Expected return: {result.expected_return_pct:+.2f}%")
    print(f"  Event impacts: {result.event_impact_breakdown}")
    print()

    print("=== All tests passed ===")
