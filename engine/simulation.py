"""
MonteCarloo Monte Carlo Stock Price Simulation Engine (v5).

Simulates stock price paths using Geometric Brownian Motion (GBM)
with temporal event shaping: anticipation → shock (jump-diffusion) → decay.

When event_date is provided, the temporal profile governs per-day
drift/vol adjustments and discrete jumps. When event_date is None,
falls back to v4 flat-drift behavior for backward compatibility.
"""

import numpy as np
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from events import EVENTS, Event, TemporalProfile
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
    paths_sample: Optional[List[List[float]]] = None
    event_dates: Optional[Dict[str, str]] = None  # v5: event_id -> ISO date

    def to_dict(self):
        d = asdict(self)
        d.pop('paths_sample', None)
        return d


# ---------------------------------------------------------------------------
# Stock data helpers (unchanged from v4)
# ---------------------------------------------------------------------------

def get_stock_volatility(ticker: str, period: str = "3mo") -> float:
    """Fetch annualized historical volatility from Yahoo Finance."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)
        if len(hist) < 10:
            return 0.30
        returns = hist['Close'].pct_change().dropna()
        return returns.std() * np.sqrt(252)
    except Exception:
        return 0.30


def get_stock_beta(ticker: str) -> float:
    """Fetch beta from Yahoo Finance."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        info = stock.info
        beta = info.get('beta', 1.0)
        return beta if beta and beta > 0 else 1.0
    except Exception:
        return 1.0


def get_current_price(ticker: str) -> float:
    """Fetch current stock price."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")
        if len(hist) > 0:
            return float(hist['Close'].iloc[-1])
    except Exception:
        pass
    return 0.0


# ---------------------------------------------------------------------------
# v4 flat impact calculator (backward compat)
# ---------------------------------------------------------------------------

def calculate_event_impact(
    event_id: str,
    event_params: Dict[str, float],
    stock_ticker: str,
    stock_info: Dict,
    probability: float = 1.0
) -> Dict[str, float]:
    """
    Calculate flat event impact (v4 behavior).
    Returns drift_adjustment and vol_multiplier.
    """
    event_def = EVENTS.get(event_id)
    if not event_def:
        return {"drift_adjustment": 0.0, "vol_multiplier": 1.0, "target_impact_pct": 0.0}

    stock_sector = stock_info.get("sector", "technology")
    sector_impact = event_def.get_impact_for_sector(stock_sector)
    if sector_impact:
        base_drift = sector_impact.drift
        base_vol = sector_impact.vol_multiplier
    else:
        base_drift = 0.0
        base_vol = 1.0

    param_values = event_params.copy()
    # Scale severity more aggressively so slider changes are visible on chart
    raw_severity = param_values.get("severity", 5.0)
    severity = (raw_severity / 5.0) ** 0.7  # less dampening than linear
    duration = max(param_values.get("duration_days", 30.0) / 30.0, 0.3)  # 30d = 1.0, not 0.5

    prob_factor = probability
    # Amplify drift so chart visually responds to event changes
    drift_adjustment = base_drift * severity * duration * prob_factor * 2.0
    vol_multiplier = 1.0 + (base_vol - 1.0) * severity * prob_factor * 1.5

    days_ahead = param_values.get("duration_days", 30)
    target_impact_pct = drift_adjustment * 252 * (days_ahead / 252) * prob_factor * 100

    return {
        "drift_adjustment": drift_adjustment,
        "vol_multiplier": vol_multiplier,
        "target_impact_pct": target_impact_pct,
    }


# ---------------------------------------------------------------------------
# v5 temporal shaping helpers
# ---------------------------------------------------------------------------

def _anticipation_weight(days_to_event: int, profile: TemporalProfile) -> float:
    """Calculate anticipation weight [0, 1] based on days_to_event and curve type."""
    if profile.anticipation_days <= 0 or days_to_event <= 0:
        return 0.0
    if days_to_event > profile.anticipation_days:
        return 0.0
    # progress goes from 0 (far away) to 1 (event day)
    progress = 1.0 - (days_to_event / profile.anticipation_days)
    if profile.anticipation_curve == "exponential":
        return progress ** 2
    elif profile.anticipation_curve == "step":
        return 1.0 if progress > 0.0 else 0.0
    else:  # linear
        return progress


def _compute_temporal_adjustments(
    day_index: int,
    start_date: date,
    events_with_dates: List[dict],
    stock_info: Dict,
) -> Tuple[float, float, np.ndarray]:
    """
    For a single simulation day, compute aggregated temporal adjustments
    from all events that have dates.

    Returns:
        (drift_adjustment, vol_multiplier, jump_array_or_None)
        jump_array is None if no jumps occur on this day.
    """
    current_date = start_date + timedelta(days=day_index)
    total_drift_adj = 0.0
    total_vol_mult = 1.0
    jump_events = []  # events that trigger jumps today

    for ev in events_with_dates:
        event_def = ev["event_def"]
        profile = ev["profile"]
        event_date = ev["event_date"]
        probability = ev["probability"]
        severity_scale = ev["severity_scale"]
        base_drift = ev["base_drift"]
        base_vol = ev["base_vol"]

        days_to_event = (event_date - current_date).days

        if days_to_event > profile.anticipation_days:
            # Too far from event — no effect yet
            continue
        elif days_to_event > 0:
            # PRE-EVENT: anticipation phase
            weight = _anticipation_weight(days_to_event, profile)
            total_drift_adj += base_drift * severity_scale * weight * probability
            vol_ramp = 1.0 + (profile.anticipation_vol_ramp - 1.0) * weight
            total_vol_mult = max(total_vol_mult, vol_ramp)
        elif days_to_event == 0:
            # EVENT DAY: full impact + potential jump
            total_drift_adj += base_drift * severity_scale * probability
            total_vol_mult = max(total_vol_mult, base_vol)
            if profile.jump_probability > 0 and profile.jump_std > 0:
                jump_events.append({
                    "jump_prob": profile.jump_probability * probability,
                    "jump_mean": profile.jump_mean * severity_scale,
                    "jump_std": profile.jump_std * severity_scale,
                })
        else:
            # POST-EVENT: decay phase
            days_after = abs(days_to_event)
            decay_factor = 0.5 ** (days_after / max(profile.decay_halflife_days, 1))
            remaining = profile.regime_shift + (1.0 - profile.regime_shift) * decay_factor
            total_drift_adj += base_drift * severity_scale * remaining * probability
            # Vol decay
            post_vol = 1.0 + (base_vol - 1.0) * profile.post_vol_decay * decay_factor
            total_vol_mult = max(total_vol_mult, post_vol)

    return total_drift_adj, total_vol_mult, jump_events


# ---------------------------------------------------------------------------
# Main simulation function
# ---------------------------------------------------------------------------

def simulate(
    ticker: str,
    events: List[Dict],
    horizon_days: int = 30,
    n_simulations: int = 10000,
    seed: Optional[int] = None,
    cached_price: Optional[float] = None,
    cached_vol: Optional[float] = None,
) -> SimulationResult:
    """
    Run Monte Carlo simulation with temporal event shaping (v5).

    Events can include an optional 'event_date' (ISO string). When provided,
    the temporal profile drives anticipation/shock/decay dynamics. When absent,
    falls back to v4 flat-drift behavior.

    Args:
        ticker: Stock ticker (e.g., "CVX")
        events: List of {
            "id": "iran_escalation",
            "params": {"severity": 5, "duration_days": 30},
            "probability": 0.67,
            "event_date": "2026-04-15"  # optional, v5
        }
        horizon_days: Number of trading days to simulate
        n_simulations: Number of Monte Carlo paths
        seed: Random seed for reproducibility
        cached_price: Pre-fetched price
        cached_vol: Pre-fetched volatility

    Returns:
        SimulationResult with statistics and sample paths
    """
    if seed is not None:
        rng = np.random.RandomState(seed)
    else:
        rng = np.random.RandomState()

    # --- Get price ---
    if cached_price and cached_price > 0:
        current_price = cached_price
    else:
        current_price = get_current_price(ticker)
        if current_price <= 0:
            try:
                from api import PRICE_CACHE
                current_price = PRICE_CACHE.get(ticker.upper(), 0)
            except ImportError:
                pass
            if current_price <= 0:
                raise ValueError(f"Could not get price for {ticker}")

    # --- Get volatility ---
    if cached_vol and cached_vol > 0:
        volatility = cached_vol
    else:
        volatility = get_stock_volatility(ticker)
        if volatility <= 0:
            try:
                from api import VOL_CACHE
                volatility = VOL_CACHE.get(ticker.upper(), 0.30)
            except ImportError:
                volatility = 0.30

    stock_info = get_stock_info(ticker)

    # --- Separate events into temporal (have date) and flat (no date) ---
    flat_events = []
    temporal_events = []
    event_dates_map = {}
    today = date.today()

    for event in events:
        event_id = event.get("id", "")
        params = event.get("params", {})
        probability = event.get("probability", 1.0)
        event_date_str = event.get("event_date", None)

        event_def = EVENTS.get(event_id)
        if not event_def:
            continue

        stock_sector = stock_info.get("sector", "technology")
        sector_impact = event_def.get_impact_for_sector(stock_sector)
        base_drift = sector_impact.drift if sector_impact else 0.0
        base_vol = sector_impact.vol_multiplier if sector_impact else 1.0

        # Match amplified scaling from flat impact calc
        raw_sev = params.get("severity", 5.0)
        severity_scale = ((raw_sev / 5.0) ** 0.7) * max(params.get("duration_days", 30.0) / 30.0, 0.3) * 2.0

        if event_date_str and event_def.temporal_profile:
            # v5 temporal event
            try:
                event_date = date.fromisoformat(event_date_str)
            except (ValueError, TypeError):
                event_date = None

            if event_date:
                temporal_events.append({
                    "event_def": event_def,
                    "profile": event_def.temporal_profile,
                    "event_date": event_date,
                    "probability": probability,
                    "severity_scale": severity_scale,
                    "base_drift": base_drift,
                    "base_vol": base_vol,
                    "id": event_id,
                })
                event_dates_map[event_id] = event_date_str
                continue

        # v4 flat event (no date or no temporal profile)
        flat_events.append(event)

    # --- Calculate flat event impacts (v4 behavior) ---
    base_drift_annual = 0.07
    flat_drift_adjustment = 0.0
    flat_vol_multiplier = 1.0
    event_impact_breakdown = {}

    for event in flat_events:
        event_id = event.get("id", "")
        params = event.get("params", {})
        probability = event.get("probability", 1.0)

        impact = calculate_event_impact(event_id, params, ticker, stock_info, probability)
        flat_drift_adjustment += impact["drift_adjustment"]
        flat_vol_multiplier = max(flat_vol_multiplier, impact["vol_multiplier"])
        event_impact_breakdown[event_id] = impact["target_impact_pct"]

    # --- Estimate temporal event impact for breakdown display ---
    for tev in temporal_events:
        eid = tev["id"]
        profile = tev["profile"]
        bd = tev["base_drift"]
        sv = tev["severity_scale"]
        prob = tev["probability"]
        # Approximate total impact: anticipation + shock + decay
        # This is an estimate for the breakdown display
        impact_est = bd * sv * prob * 252 * (horizon_days / 252) * 100
        # Adjust for regime shift (permanent fraction)
        impact_est *= (0.5 + 0.5 * profile.regime_shift)
        event_impact_breakdown[eid] = round(impact_est, 2)

    # --- Run simulation ---
    dt = 1.0 / 252.0
    start_date = today

    # Pre-allocate price paths
    price_paths = np.zeros((n_simulations, horizon_days + 1))
    price_paths[:, 0] = current_price

    # Generate all random normals upfront
    Z = rng.standard_normal((n_simulations, horizon_days))

    has_temporal = len(temporal_events) > 0

    for t in range(horizon_days):
        # Base drift + flat event adjustment
        day_drift = base_drift_annual + flat_drift_adjustment
        day_vol_mult = flat_vol_multiplier
        day_jumps = None

        if has_temporal:
            # Compute temporal adjustments for this day
            temp_drift, temp_vol, jump_events = _compute_temporal_adjustments(
                t, start_date, temporal_events, stock_info
            )
            day_drift += temp_drift
            day_vol_mult = max(day_vol_mult, temp_vol)

            # Process jumps
            if jump_events:
                day_jumps = np.zeros(n_simulations)
                for je in jump_events:
                    # Bernoulli draw: does the jump happen?
                    jump_mask = rng.random(n_simulations) < je["jump_prob"]
                    # Normal draw: how big is the jump?
                    jump_magnitude = rng.normal(je["jump_mean"], je["jump_std"], n_simulations) / 100.0
                    day_jumps += jump_mask * jump_magnitude

        # GBM step
        adjusted_vol = volatility * day_vol_mult
        drift_daily = day_drift * dt
        vol_daily = adjusted_vol * np.sqrt(dt)

        log_returns = (drift_daily - 0.5 * vol_daily ** 2) + vol_daily * Z[:, t]

        # Apply jumps on event days
        if day_jumps is not None:
            log_returns += day_jumps

        price_paths[:, t + 1] = price_paths[:, t] * np.exp(log_returns)

    # --- Calculate statistics ---
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

    # Sample paths for chart
    if n_simulations > 100:
        indices = np.linspace(0, n_simulations - 1, 100, dtype=int)
        paths_sample = price_paths[indices].tolist()
    else:
        paths_sample = price_paths.tolist()

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
        paths_sample=paths_sample,
        event_dates=event_dates_map if event_dates_map else None,
    )


def simulate_no_events(
    ticker: str,
    horizon_days: int = 30,
    n_simulations: int = 10000,
    seed: Optional[int] = None,
    cached_price: Optional[float] = None,
    cached_vol: Optional[float] = None,
) -> SimulationResult:
    """Baseline simulation with no events."""
    return simulate(ticker, [], horizon_days, n_simulations, seed,
                    cached_price=cached_price, cached_vol=cached_vol)


# ---------------------------------------------------------------------------
# Test / Demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from datetime import timedelta

    print("=" * 60)
    print("MonteCarloo v5 Temporal Simulation Engine Test")
    print("=" * 60)

    today = date.today()
    event_date_15d = (today + timedelta(days=15)).isoformat()

    # Test 1: No events (baseline)
    print("\n--- Test 1: CVX baseline (no events) ---")
    r = simulate("CVX", [], horizon_days=30, n_simulations=5000, seed=42,
                 cached_price=148.0, cached_vol=0.28)
    print(f"  Price: ${r.current_price:.2f} → ${r.median_target:.2f}")
    print(f"  Return: {r.expected_return_pct:+.2f}%")
    print(f"  Range: ${r.percentile_5:.2f} - ${r.percentile_95:.2f}")

    # Test 2: CVX + Iran (v4 flat — NO event_date)
    print("\n--- Test 2: CVX + Iran (v4 FLAT, no date) ---")
    r_flat = simulate("CVX", [
        {"id": "iran_escalation", "params": {"severity": 5, "duration_days": 15}, "probability": 0.67}
    ], horizon_days=30, n_simulations=5000, seed=42,
       cached_price=148.0, cached_vol=0.28)
    print(f"  Price: ${r_flat.current_price:.2f} → ${r_flat.median_target:.2f}")
    print(f"  Return: {r_flat.expected_return_pct:+.2f}%")
    print(f"  Range: ${r_flat.percentile_5:.2f} - ${r_flat.percentile_95:.2f}")
    print(f"  Impact: {r_flat.event_impact_breakdown}")

    # Test 3: CVX + Iran (v5 TEMPORAL — with event_date on day 15)
    print(f"\n--- Test 3: CVX + Iran (v5 TEMPORAL, date={event_date_15d}) ---")
    r_temp = simulate("CVX", [
        {"id": "iran_escalation", "params": {"severity": 5, "duration_days": 15},
         "probability": 0.67, "event_date": event_date_15d}
    ], horizon_days=30, n_simulations=5000, seed=42,
       cached_price=148.0, cached_vol=0.28)
    print(f"  Price: ${r_temp.current_price:.2f} → ${r_temp.median_target:.2f}")
    print(f"  Return: {r_temp.expected_return_pct:+.2f}%")
    print(f"  Range: ${r_temp.percentile_5:.2f} - ${r_temp.percentile_95:.2f}")
    print(f"  Impact: {r_temp.event_impact_breakdown}")
    print(f"  Event dates: {r_temp.event_dates}")

    # Show per-day median to visualize the kink
    median_path = np.median(np.array(r_temp.paths_sample), axis=0)
    print("\n  Day-by-day median (showing temporal shape):")
    for d in [0, 5, 10, 13, 14, 15, 16, 17, 20, 25, 30]:
        if d < len(median_path):
            marker = " ← EVENT" if d == 15 else ""
            print(f"    Day {d:2d}: ${median_path[d]:.2f}{marker}")

    # Test 4: FOMC rate cut with date
    fomc_date = (today + timedelta(days=20)).isoformat()
    print(f"\n--- Test 4: SPY + Fed rate cut (TEMPORAL, date={fomc_date}) ---")
    r_fomc = simulate("SPY", [
        {"id": "fed_rate_cut", "params": {"basis_points": 50, "duration_days": 180},
         "probability": 0.70, "event_date": fomc_date}
    ], horizon_days=30, n_simulations=5000, seed=42,
       cached_price=520.0, cached_vol=0.18)
    print(f"  Price: ${r_fomc.current_price:.2f} → ${r_fomc.median_target:.2f}")
    print(f"  Return: {r_fomc.expected_return_pct:+.2f}%")
    median_fomc = np.median(np.array(r_fomc.paths_sample), axis=0)
    print("  Day-by-day median:")
    for d in [0, 5, 10, 15, 18, 19, 20, 21, 22, 25, 30]:
        if d < len(median_fomc):
            marker = " ← FOMC" if d == 20 else ""
            print(f"    Day {d:2d}: ${median_fomc[d]:.2f}{marker}")

    # Test 5: Compound — two temporal events
    print(f"\n--- Test 5: CVX compound (Iran day 10 + Oil disruption day 20) ---")
    iran_date = (today + timedelta(days=10)).isoformat()
    oil_date = (today + timedelta(days=20)).isoformat()
    r_comp = simulate("CVX", [
        {"id": "iran_escalation", "params": {"severity": 7, "duration_days": 30},
         "probability": 0.60, "event_date": iran_date},
        {"id": "oil_disruption", "params": {"severity": 6, "supply_cut_pct": 10, "duration_days": 60},
         "probability": 0.40, "event_date": oil_date},
    ], horizon_days=30, n_simulations=5000, seed=42,
       cached_price=148.0, cached_vol=0.28)
    print(f"  Price: ${r_comp.current_price:.2f} → ${r_comp.median_target:.2f}")
    print(f"  Return: {r_comp.expected_return_pct:+.2f}%")
    median_comp = np.median(np.array(r_comp.paths_sample), axis=0)
    print("  Day-by-day median:")
    for d in range(0, 31, 2):
        if d < len(median_comp):
            marker = ""
            if d == 10: marker = " ← IRAN"
            if d == 20: marker = " ← OIL"
            print(f"    Day {d:2d}: ${median_comp[d]:.2f}{marker}")

    print("\n" + "=" * 60)
    print("All tests complete. v4 flat vs v5 temporal comparison above.")
    print("=" * 60)
