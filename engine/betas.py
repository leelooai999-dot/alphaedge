"""
Stock-Commodity Beta vectors for MonteCarloo simulation engine.

Each stock has a beta vector: how much it moves per 1% move in each commodity.
Betas combine revenue exposure + cost exposure + market correlation.

Usage:
    betas = get_stock_betas("CVX")
    # {"WTI": 0.70, "NATGAS": 0.15, "GOLD": 0.05, "VIX": -0.10}
    
    stock_impact = calculate_stock_impact(commodity_impacts, betas)
    # Returns net % price change for the stock
"""

from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded beta vectors (Phase 1)
# Phase 2 will auto-calculate from yfinance rolling correlations
# ---------------------------------------------------------------------------

# Beta = how much stock moves per 1% commodity move
# Positive = stock moves same direction as commodity
# Negative = stock moves opposite direction (e.g., airlines vs oil)

STOCK_BETAS: Dict[str, Dict[str, float]] = {
    # ══════════════ ENERGY ══════════════
    "CVX":  {"WTI": 0.70, "BRENT": 0.65, "NATGAS": 0.15, "GOLD": 0.03, "VIX": -0.08, "USD": 0.05},
    "XOM":  {"WTI": 0.75, "BRENT": 0.70, "NATGAS": 0.12, "GOLD": 0.02, "VIX": -0.07, "USD": 0.04},
    "COP":  {"WTI": 0.80, "BRENT": 0.75, "NATGAS": 0.10, "VIX": -0.08},
    "SLB":  {"WTI": 0.55, "BRENT": 0.50, "NATGAS": 0.08, "VIX": -0.12},
    "OXY":  {"WTI": 0.85, "BRENT": 0.80, "NATGAS": 0.08, "VIX": -0.10},
    "BP":   {"WTI": 0.60, "BRENT": 0.70, "NATGAS": 0.18, "VIX": -0.06},
    "SHEL": {"WTI": 0.55, "BRENT": 0.65, "NATGAS": 0.20, "VIX": -0.06},
    "EOG":  {"WTI": 0.78, "NATGAS": 0.15, "VIX": -0.09},
    "PXD":  {"WTI": 0.82, "NATGAS": 0.10, "VIX": -0.10},
    "VLO":  {"WTI": 0.45, "BRENT": 0.40, "VIX": -0.10},  # Refiner: less direct oil beta
    "MPC":  {"WTI": 0.42, "BRENT": 0.38, "VIX": -0.09},
    "PSX":  {"WTI": 0.40, "BRENT": 0.35, "VIX": -0.08},

    # ══════════════ AIRLINES (negative oil beta) ══════════════
    "DAL":  {"WTI": -0.30, "BRENT": -0.28, "VIX": -0.18, "USD": 0.08},
    "UAL":  {"WTI": -0.32, "BRENT": -0.30, "VIX": -0.20, "USD": 0.07},
    "AAL":  {"WTI": -0.35, "BRENT": -0.33, "VIX": -0.22, "USD": 0.06},
    "LUV":  {"WTI": -0.25, "BRENT": -0.23, "VIX": -0.15, "USD": 0.05},
    "JBLU": {"WTI": -0.33, "BRENT": -0.30, "VIX": -0.22},

    # ══════════════ DEFENSE ══════════════
    "LMT":  {"WTI": 0.08, "VIX": 0.10, "GOLD": 0.05, "10Y": -0.08},
    "RTX":  {"WTI": 0.06, "VIX": 0.08, "GOLD": 0.04, "10Y": -0.06},
    "NOC":  {"WTI": 0.05, "VIX": 0.12, "GOLD": 0.06, "10Y": -0.07},
    "GD":   {"WTI": 0.04, "VIX": 0.07, "GOLD": 0.03, "10Y": -0.05},
    "BA":   {"WTI": -0.08, "VIX": -0.12, "COPPER": 0.10, "10Y": -0.08},

    # ══════════════ TECHNOLOGY ══════════════
    "AAPL": {"WTI": -0.03, "VIX": -0.18, "USD": -0.15, "CHIPS": 0.20, "10Y": -0.12, "COPPER": 0.05},
    "MSFT": {"WTI": -0.02, "VIX": -0.15, "USD": -0.10, "10Y": -0.15},
    "GOOGL":{"WTI": -0.02, "VIX": -0.16, "USD": -0.08, "10Y": -0.12},
    "META": {"WTI": -0.02, "VIX": -0.18, "USD": -0.12, "10Y": -0.14},
    "AMZN": {"WTI": -0.08, "VIX": -0.15, "USD": -0.10, "10Y": -0.12, "COPPER": 0.03},
    "NFLX": {"WTI": -0.01, "VIX": -0.15, "USD": -0.08, "10Y": -0.12},
    "TSLA": {"WTI": -0.05, "VIX": -0.22, "COPPER": 0.15, "LITHIUM": 0.30, "10Y": -0.15},

    # ══════════════ SEMICONDUCTORS ══════════════
    "NVDA": {"WTI": -0.03, "VIX": -0.22, "CHIPS": 0.60, "COPPER": 0.08, "USD": -0.12, "10Y": -0.15},
    "AMD":  {"WTI": -0.02, "VIX": -0.20, "CHIPS": 0.50, "COPPER": 0.06, "USD": -0.10, "10Y": -0.13},
    "INTC": {"WTI": -0.02, "VIX": -0.12, "CHIPS": 0.35, "COPPER": 0.05, "USD": -0.08, "10Y": -0.10},
    "TSM":  {"WTI": -0.02, "VIX": -0.18, "CHIPS": 0.70, "USD": -0.15},
    "AVGO": {"WTI": -0.02, "VIX": -0.15, "CHIPS": 0.40, "10Y": -0.10},
    "QCOM": {"WTI": -0.02, "VIX": -0.14, "CHIPS": 0.35, "USD": -0.10},
    "MU":   {"WTI": -0.02, "VIX": -0.18, "CHIPS": 0.45, "COPPER": 0.05},

    # ══════════════ FINANCIALS ══════════════
    "JPM":  {"WTI": 0.03, "VIX": -0.12, "10Y": 0.25, "GOLD": -0.05, "USD": 0.08},
    "BAC":  {"WTI": 0.02, "VIX": -0.15, "10Y": 0.30, "GOLD": -0.04, "USD": 0.06},
    "GS":   {"WTI": 0.05, "VIX": -0.08, "10Y": 0.20, "GOLD": 0.03, "USD": 0.05},
    "MS":   {"WTI": 0.04, "VIX": -0.10, "10Y": 0.18, "GOLD": 0.02, "USD": 0.04},
    "WFC":  {"WTI": 0.02, "VIX": -0.14, "10Y": 0.28, "USD": 0.05},
    "C":    {"WTI": 0.03, "VIX": -0.13, "10Y": 0.22, "USD": 0.10},  # More intl exposure

    # ══════════════ CONSUMER / RETAIL ══════════════
    "WMT":  {"WTI": -0.06, "VIX": -0.05, "USD": -0.08, "10Y": -0.05},
    "COST": {"WTI": -0.05, "VIX": -0.06, "USD": -0.06, "10Y": -0.04},
    "TGT":  {"WTI": -0.07, "VIX": -0.10, "10Y": -0.06},
    "HD":   {"WTI": -0.04, "VIX": -0.08, "COPPER": 0.08, "10Y": -0.10},
    "NKE":  {"WTI": -0.03, "VIX": -0.10, "USD": -0.15},
    "SBUX": {"WTI": -0.04, "VIX": -0.08, "USD": -0.10},
    "MCD":  {"WTI": -0.03, "VIX": -0.04, "USD": -0.12, "WHEAT": -0.05},

    # ══════════════ HEALTHCARE ══════════════
    "JNJ":  {"WTI": -0.02, "VIX": -0.03, "USD": -0.10, "10Y": -0.05},
    "UNH":  {"WTI": -0.01, "VIX": -0.05, "10Y": -0.08},
    "PFE":  {"WTI": -0.01, "VIX": 0.05, "USD": -0.12},  # Slight VIX positive (defensive)
    "ABBV": {"WTI": -0.01, "VIX": -0.02, "USD": -0.10},
    "LLY":  {"WTI": -0.01, "VIX": -0.04, "USD": -0.08, "10Y": -0.10},

    # ══════════════ COMMODITIES / ETFs ══════════════
    "GLD":  {"GOLD": 0.95, "VIX": 0.05, "USD": -0.30, "10Y": -0.15},
    "SLV":  {"GOLD": 0.60, "COPPER": 0.30, "VIX": 0.03, "USD": -0.25},
    "USO":  {"WTI": 0.95, "BRENT": 0.90},
    "UNG":  {"NATGAS": 0.92},
    "SPY":  {"WTI": -0.03, "VIX": -0.15, "10Y": -0.08, "USD": -0.05, "GOLD": 0.02},
    "QQQ":  {"WTI": -0.03, "VIX": -0.18, "10Y": -0.15, "USD": -0.10, "CHIPS": 0.15},
    "IWM":  {"WTI": -0.05, "VIX": -0.14, "10Y": -0.05, "USD": -0.03},
    "XLE":  {"WTI": 0.72, "BRENT": 0.68, "NATGAS": 0.12, "VIX": -0.08},
    "XLF":  {"VIX": -0.12, "10Y": 0.25, "USD": 0.06},
    "XLK":  {"VIX": -0.18, "10Y": -0.14, "CHIPS": 0.15, "USD": -0.10},

    # ══════════════ TRANSPORTATION / LOGISTICS ══════════════
    "UPS":  {"WTI": -0.15, "VIX": -0.08, "USD": -0.05},
    "FDX":  {"WTI": -0.18, "VIX": -0.10, "USD": -0.06},

    # ══════════════ MATERIALS / MINING ══════════════
    "FCX":  {"COPPER": 0.80, "GOLD": 0.15, "WTI": 0.05, "VIX": -0.10},
    "NEM":  {"GOLD": 0.85, "COPPER": 0.05, "VIX": 0.05},
    "AA":   {"COPPER": 0.30, "WTI": -0.05, "VIX": -0.12},

    # ══════════════ UTILITIES (defensive) ══════════════
    "NEE":  {"NATGAS": -0.10, "VIX": 0.03, "10Y": -0.15},
    "DUK":  {"NATGAS": -0.08, "VIX": 0.02, "10Y": -0.12},
    "SO":   {"NATGAS": -0.06, "VIX": 0.02, "10Y": -0.10},
}

# Sector default betas (fallback for unknown stocks)
SECTOR_DEFAULT_BETAS: Dict[str, Dict[str, float]] = {
    "energy":           {"WTI": 0.65, "BRENT": 0.60, "NATGAS": 0.12, "VIX": -0.08},
    "technology":       {"WTI": -0.03, "VIX": -0.18, "CHIPS": 0.15, "USD": -0.10, "10Y": -0.12},
    "semiconductors":   {"WTI": -0.02, "VIX": -0.20, "CHIPS": 0.50, "USD": -0.12, "10Y": -0.14},
    "healthcare":       {"WTI": -0.01, "VIX": -0.03, "USD": -0.10, "10Y": -0.06},
    "financials":       {"WTI": 0.03, "VIX": -0.12, "10Y": 0.25, "USD": 0.06},
    "consumer_cyclical":{"WTI": -0.06, "VIX": -0.10, "USD": -0.08, "10Y": -0.06},
    "consumer_defensive":{"WTI": -0.03, "VIX": -0.03, "USD": -0.08, "10Y": -0.04},
    "industrials":      {"WTI": -0.05, "VIX": -0.10, "COPPER": 0.12, "USD": -0.05},
    "transportation":   {"WTI": -0.25, "VIX": -0.15, "USD": 0.05},
    "defense":          {"WTI": 0.06, "VIX": 0.10, "GOLD": 0.04},
    "utilities":        {"NATGAS": -0.08, "VIX": 0.02, "10Y": -0.12},
    "real_estate":      {"VIX": -0.08, "10Y": -0.25, "USD": -0.05},
    "materials":        {"COPPER": 0.40, "GOLD": 0.10, "WTI": 0.05, "VIX": -0.10},
    "communication":    {"VIX": -0.14, "USD": -0.08, "10Y": -0.10},
}


def get_stock_betas(ticker: str, sector: str = "") -> Dict[str, float]:
    """
    Get commodity beta vector for a stock.
    
    Priority:
    1. Individual stock betas (STOCK_BETAS)
    2. Sector default betas (SECTOR_DEFAULT_BETAS)
    3. Generic market beta (SPY-like)
    """
    ticker = ticker.upper()
    
    # Individual stock
    if ticker in STOCK_BETAS:
        return STOCK_BETAS[ticker].copy()
    
    # Sector default
    sector_lower = sector.lower().replace(" ", "_") if sector else ""
    if sector_lower in SECTOR_DEFAULT_BETAS:
        return SECTOR_DEFAULT_BETAS[sector_lower].copy()
    
    # Try partial sector match
    for key, betas in SECTOR_DEFAULT_BETAS.items():
        if key in sector_lower or sector_lower in key:
            return betas.copy()
    
    # Generic fallback (roughly SPY-like)
    logger.warning(f"No beta data for {ticker} (sector={sector}), using generic market beta")
    return {"WTI": -0.03, "VIX": -0.12, "10Y": -0.08, "USD": -0.05}


def calculate_stock_impact(
    commodity_impacts: Dict[str, float],
    stock_betas: Dict[str, float],
) -> float:
    """
    Calculate net stock price impact from commodity movements.
    Handles correlated commodities (WTI/BRENT, etc.) to avoid double-counting.
    
    Args:
        commodity_impacts: Dict of commodity_id → % change (from calculate_commodity_impacts)
        stock_betas: Dict of commodity_id → beta (from get_stock_betas)
    
    Returns:
        Net stock impact in % (e.g., 14.2 means +14.2%)
    """
    # Correlation groups: commodities that are >80% correlated.
    # Within a group, use the single largest impact × max beta (not sum).
    CORRELATION_GROUPS = {
        "oil": ["WTI", "BRENT"],          # ~95% correlated
    }
    
    # Build reverse map: commodity → group name
    commodity_to_group = {}
    for group_name, members in CORRELATION_GROUPS.items():
        for m in members:
            commodity_to_group[m] = group_name
    
    total_impact = 0.0
    processed_groups = set()
    
    for commodity_id, beta in stock_betas.items():
        commodity_change = commodity_impacts.get(commodity_id, 0.0)
        if commodity_change == 0.0 and beta == 0.0:
            continue
            
        group = commodity_to_group.get(commodity_id)
        if group and group not in processed_groups:
            # For correlated group: pick the member with the largest absolute
            # weighted impact (change × beta) and use only that one.
            members = CORRELATION_GROUPS[group]
            best_impact = 0.0
            for member in members:
                m_beta = stock_betas.get(member, 0.0)
                m_change = commodity_impacts.get(member, 0.0)
                m_impact = m_change * m_beta
                if abs(m_impact) > abs(best_impact):
                    best_impact = m_impact
            total_impact += best_impact
            processed_groups.add(group)
        elif group:
            # Already processed this group
            continue
        else:
            # Independent commodity — add normally
            total_impact += commodity_change * beta
    
    return total_impact


def get_stock_impact_breakdown(
    commodity_impacts: Dict[str, float],
    stock_betas: Dict[str, float],
) -> Dict[str, float]:
    """
    Get per-commodity contribution to stock impact for UI display.
    
    Returns:
        Dict of commodity_id → stock impact contribution in %
    """
    breakdown = {}
    for commodity_id, beta in stock_betas.items():
        commodity_change = commodity_impacts.get(commodity_id, 0.0)
        if commodity_change != 0.0 and beta != 0.0:
            breakdown[commodity_id] = round(commodity_change * beta, 2)
    return breakdown
