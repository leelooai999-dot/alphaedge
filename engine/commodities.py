"""
Commodity intermediary layer for MonteCarloo simulation engine.

Events impact commodities first. Commodities then impact stocks via beta exposure.
This replaces the flat event→sector drift model with actual market mechanics.

Architecture: Event → Commodity Impact → Stock Beta → Price Movement
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import numpy as np

# ---------------------------------------------------------------------------
# Commodity definitions
# ---------------------------------------------------------------------------

@dataclass
class CommodityImpact:
    """How an event impacts a specific commodity."""
    base_pct: float          # Expected % change at severity=5, prob=100%
    range_low: float         # Minimum % change (low severity)
    range_high: float        # Maximum % change (high severity)
    delay_days: int = 0      # Days before impact begins
    duration_days: int = 30  # How long the impact lasts before decaying


# Map: event_id → commodity_id → CommodityImpact
EVENT_COMMODITY_IMPACTS: Dict[str, Dict[str, CommodityImpact]] = {
    # ──────────────────── GEOPOLITICAL ────────────────────
    "iran_escalation": {
        "WTI":   CommodityImpact(base_pct=18.0, range_low=10, range_high=35, delay_days=0),
        "BRENT": CommodityImpact(base_pct=20.0, range_low=12, range_high=40, delay_days=0),
        "NATGAS": CommodityImpact(base_pct=8.0, range_low=3, range_high=18, delay_days=1),
        "GOLD":  CommodityImpact(base_pct=5.0, range_low=2, range_high=12, delay_days=0),
        "VIX":   CommodityImpact(base_pct=40.0, range_low=15, range_high=90, delay_days=0, duration_days=14),
        "USD":   CommodityImpact(base_pct=1.5, range_low=0.5, range_high=4, delay_days=0),
        "10Y":   CommodityImpact(base_pct=-0.15, range_low=-0.35, range_high=-0.05, delay_days=2),
    },
    "russia_ukraine": {
        "WTI":   CommodityImpact(base_pct=15.0, range_low=8, range_high=30, delay_days=0),
        "NATGAS": CommodityImpact(base_pct=25.0, range_low=15, range_high=60, delay_days=0),
        "WHEAT": CommodityImpact(base_pct=20.0, range_low=10, range_high=50, delay_days=0),
        "GOLD":  CommodityImpact(base_pct=6.0, range_low=3, range_high=15, delay_days=0),
        "VIX":   CommodityImpact(base_pct=35.0, range_low=15, range_high=80, delay_days=0, duration_days=14),
    },
    "china_taiwan": {
        "WTI":   CommodityImpact(base_pct=8.0, range_low=3, range_high=20, delay_days=1),
        "GOLD":  CommodityImpact(base_pct=8.0, range_low=4, range_high=20, delay_days=0),
        "COPPER": CommodityImpact(base_pct=-12.0, range_low=-25, range_high=-5, delay_days=0),
        "VIX":   CommodityImpact(base_pct=60.0, range_low=30, range_high=120, delay_days=0, duration_days=21),
        "CHIPS": CommodityImpact(base_pct=-20.0, range_low=-35, range_high=-10, delay_days=0),
        "USD":   CommodityImpact(base_pct=3.0, range_low=1, range_high=6, delay_days=0),
    },

    # ──────────────────── MACRO / MONETARY ────────────────────
    "fed_rate_cut": {
        "GOLD":  CommodityImpact(base_pct=3.0, range_low=1, range_high=8, delay_days=0),
        "10Y":   CommodityImpact(base_pct=-0.25, range_low=-0.5, range_high=-0.1, delay_days=0),
        "USD":   CommodityImpact(base_pct=-1.5, range_low=-3, range_high=-0.5, delay_days=0),
        "VIX":   CommodityImpact(base_pct=-10.0, range_low=-20, range_high=-3, delay_days=0, duration_days=7),
        "WTI":   CommodityImpact(base_pct=2.0, range_low=0.5, range_high=5, delay_days=3),
    },
    "fed_rate_hike": {
        "GOLD":  CommodityImpact(base_pct=-2.0, range_low=-6, range_high=-0.5, delay_days=0),
        "10Y":   CommodityImpact(base_pct=0.20, range_low=0.05, range_high=0.5, delay_days=0),
        "USD":   CommodityImpact(base_pct=1.5, range_low=0.5, range_high=3, delay_days=0),
        "VIX":   CommodityImpact(base_pct=15.0, range_low=5, range_high=35, delay_days=0, duration_days=7),
        "WTI":   CommodityImpact(base_pct=-2.0, range_low=-5, range_high=-0.5, delay_days=3),
    },
    "recession_fears": {
        "WTI":   CommodityImpact(base_pct=-15.0, range_low=-30, range_high=-5, delay_days=0),
        "COPPER": CommodityImpact(base_pct=-18.0, range_low=-30, range_high=-8, delay_days=0),
        "GOLD":  CommodityImpact(base_pct=8.0, range_low=3, range_high=20, delay_days=0),
        "10Y":   CommodityImpact(base_pct=-0.5, range_low=-1.0, range_high=-0.2, delay_days=0),
        "VIX":   CommodityImpact(base_pct=50.0, range_low=25, range_high=100, delay_days=0, duration_days=30),
    },

    # ──────────────────── SECTOR / SUPPLY CHAIN ────────────────────
    "opec_cut": {
        "WTI":   CommodityImpact(base_pct=10.0, range_low=4, range_high=22, delay_days=0),
        "BRENT": CommodityImpact(base_pct=12.0, range_low=5, range_high=25, delay_days=0),
        "NATGAS": CommodityImpact(base_pct=3.0, range_low=1, range_high=8, delay_days=2),
    },
    "oil_disruption": {
        "WTI":   CommodityImpact(base_pct=12.0, range_low=5, range_high=30, delay_days=0),
        "BRENT": CommodityImpact(base_pct=14.0, range_low=6, range_high=35, delay_days=0),
        "NATGAS": CommodityImpact(base_pct=5.0, range_low=2, range_high=12, delay_days=1),
    },
    "chip_export_control": {
        "CHIPS": CommodityImpact(base_pct=-15.0, range_low=-30, range_high=-5, delay_days=0),
        "COPPER": CommodityImpact(base_pct=-5.0, range_low=-12, range_high=-2, delay_days=3),
        "VIX":   CommodityImpact(base_pct=12.0, range_low=5, range_high=30, delay_days=0, duration_days=14),
    },
    "tariff_increase": {
        "WTI":   CommodityImpact(base_pct=-3.0, range_low=-8, range_high=-1, delay_days=5),
        "COPPER": CommodityImpact(base_pct=-8.0, range_low=-15, range_high=-3, delay_days=2),
        "GOLD":  CommodityImpact(base_pct=3.0, range_low=1, range_high=8, delay_days=1),
        "VIX":   CommodityImpact(base_pct=20.0, range_low=8, range_high=45, delay_days=0, duration_days=14),
        "USD":   CommodityImpact(base_pct=1.0, range_low=0.3, range_high=2.5, delay_days=0),
    },
    "ev_subsidy": {
        "WTI":   CommodityImpact(base_pct=-2.0, range_low=-5, range_high=-0.5, delay_days=7),
        "COPPER": CommodityImpact(base_pct=5.0, range_low=2, range_high=12, delay_days=3),
        "LITHIUM": CommodityImpact(base_pct=8.0, range_low=3, range_high=18, delay_days=2),
    },
    "pandemic_wave": {
        "WTI":   CommodityImpact(base_pct=-10.0, range_low=-25, range_high=-3, delay_days=3),
        "GOLD":  CommodityImpact(base_pct=5.0, range_low=2, range_high=12, delay_days=1),
        "VIX":   CommodityImpact(base_pct=45.0, range_low=20, range_high=90, delay_days=0, duration_days=21),
        "COPPER": CommodityImpact(base_pct=-8.0, range_low=-18, range_high=-3, delay_days=5),
    },
    "crypto_crash": {
        "GOLD":  CommodityImpact(base_pct=2.0, range_low=0.5, range_high=5, delay_days=1),
        "VIX":   CommodityImpact(base_pct=8.0, range_low=3, range_high=20, delay_days=0, duration_days=7),
    },
}


def calculate_commodity_impacts(
    events: List[Dict],
    horizon_days: int = 30,
) -> Dict[str, float]:
    """
    Calculate net commodity % changes from all events combined.
    Events compound multiplicatively through commodities.
    
    Args:
        events: List of {"id": str, "params": dict, "probability": float}
        horizon_days: Simulation horizon
    
    Returns:
        Dict of commodity_id → net % change (e.g., {"WTI": 22.5, "GOLD": 4.2})
    """
    # Accumulate multiplicative factors per commodity
    commodity_factors: Dict[str, float] = {}  # commodity → cumulative multiplier
    
    for event in events:
        event_id = event.get("id", "")
        params = event.get("params", {})
        probability = event.get("probability", 1.0)
        
        impacts = EVENT_COMMODITY_IMPACTS.get(event_id, {})
        if not impacts:
            continue
        
        # Severity: 1-10 scale, normalized. Power curve for responsiveness.
        raw_severity = params.get("severity", 5.0)
        severity_factor = (raw_severity / 5.0) ** 0.7
        
        # Duration factor: longer events = bigger sustained impact
        duration = params.get("duration_days", 30.0)
        duration_factor = min(duration / 30.0, 3.0)  # Cap at 3x for very long events
        duration_factor = max(duration_factor, 0.3)   # Floor at 0.3 for very short
        
        for commodity_id, impact in impacts.items():
            # Skip if delay exceeds horizon
            if impact.delay_days >= horizon_days:
                continue
            
            # Scale base impact by severity, probability, duration
            scaled_pct = impact.base_pct * severity_factor * probability * duration_factor
            
            # Clamp to range
            if impact.base_pct > 0:
                scaled_pct = max(impact.range_low * probability, min(scaled_pct, impact.range_high * probability))
            else:
                scaled_pct = min(impact.range_low * probability, max(scaled_pct, impact.range_high * probability))
            
            # Compound multiplicatively
            factor = 1.0 + (scaled_pct / 100.0)
            if commodity_id in commodity_factors:
                commodity_factors[commodity_id] *= factor
            else:
                commodity_factors[commodity_id] = factor
    
    # Convert factors to % changes
    return {k: (v - 1.0) * 100.0 for k, v in commodity_factors.items()}


def get_event_commodity_breakdown(
    events: List[Dict],
) -> Dict[str, Dict[str, float]]:
    """
    Get per-event per-commodity impact breakdown for UI display.
    
    Returns:
        Dict of event_id → {commodity_id: impact_pct}
    """
    breakdown = {}
    
    for event in events:
        event_id = event.get("id", "")
        params = event.get("params", {})
        probability = event.get("probability", 1.0)
        
        impacts = EVENT_COMMODITY_IMPACTS.get(event_id, {})
        if not impacts:
            continue
        
        raw_severity = params.get("severity", 5.0)
        severity_factor = (raw_severity / 5.0) ** 0.7
        duration = params.get("duration_days", 30.0)
        duration_factor = min(max(duration / 30.0, 0.3), 3.0)
        
        event_breakdown = {}
        for commodity_id, impact in impacts.items():
            scaled_pct = impact.base_pct * severity_factor * probability * duration_factor
            if impact.base_pct > 0:
                scaled_pct = max(impact.range_low * probability, min(scaled_pct, impact.range_high * probability))
            else:
                scaled_pct = min(impact.range_low * probability, max(scaled_pct, impact.range_high * probability))
            event_breakdown[commodity_id] = round(scaled_pct, 2)
        
        breakdown[event_id] = event_breakdown
    
    return breakdown
