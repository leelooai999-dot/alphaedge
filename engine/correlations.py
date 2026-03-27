"""
MonteCarloo Stock-Event Correlation Map.

Maps which stocks are affected by which event types,
with sector-level defaults and per-stock overrides.
"""

from typing import Dict, List, Optional

# Sector classification for major stocks
STOCK_SECTOR_MAP: Dict[str, str] = {
    # Energy
    "XOM": "energy", "CVX": "energy", "COP": "energy", "SLB": "energy",
    "OXY": "energy", "EOG": "energy", "MPC": "energy", "WFC": "energy",
    "ET": "energy", "PXD": "energy",
    # Defense
    "LMT": "defense", "RTX": "defense", "NOC": "defense", "BA": "defense",
    "GD": "defense", "LHX": "defense",
    # Technology
    "AAPL": "technology", "MSFT": "technology", "GOOGL": "technology",
    "META": "technology", "AMZN": "technology", "NVDA": "technology",
    "AMD": "technology", "AVGO": "technology", "CRM": "technology",
    "NOW": "technology", "PANW": "technology", "NET": "technology",
    "PLTR": "technology", "SNOW": "technology",
    # Semiconductors (separate from tech for event sensitivity)
    "TSM": "semiconductor", "INTC": "semiconductor", "QCOM": "semiconductor",
    "MRVL": "semiconductor", "MU": "semiconductor",
    # Finance
    "JPM": "finance", "BAC": "finance", "GS": "finance", "MS": "finance",
    "WFC": "finance", "C": "finance", "V": "finance", "MA": "finance",
    "BLK": "finance", "SCHW": "finance",
    # Healthcare
    "JNJ": "healthcare", "UNH": "healthcare", "PFE": "healthcare",
    "LLY": "healthcare", "ABBV": "healthcare", "MRK": "healthcare",
    "TMO": "healthcare", "ABT": "healthcare",
    # Consumer
    "AMZN": "consumer", "TSLA": "consumer", "WMT": "consumer",
    "NKE": "consumer", "MCD": "consumer", "SBUX": "consumer",
    "RIVN": "consumer", "NIO": "consumer", "LI": "consumer", "XPEV": "consumer",
    # Utilities
    "NEE": "utilities", "DUK": "utilities", "SO": "utilities",
    # Real Estate / Housing
    "AMT": "realestate", "CCI": "realestate", "PLD": "realestate",
    # Commodities (via ETFs)
    "USO": "energy", "GLD": "gold", "SLV": "metals", "UNG": "energy",
    # Indices
    "SPY": "index", "QQQ": "index", "DIA": "index", "IWM": "index",
    "VTI": "index", "XLF": "index", "XLE": "index", "XLK": "index",
}

# Per-stock event sensitivity (overrides sector defaults)
# Higher number = more sensitive to that event category
STOCK_SENSITIVITY: Dict[str, Dict[str, float]] = {
    "XOM": {"geopolitical_oil": 1.5, "macro_rate": 0.8, "macro_cpi": 0.5},
    "CVX": {"geopolitical_oil": 1.4, "macro_rate": 0.8, "macro_cpi": 0.5},
    "SLB": {"geopolitical_oil": 1.6, "macro_rate": 0.7, "macro_cpi": 0.4},
    "NVDA": {"geopolitical_china": 1.8, "geopolitical_tariff": 1.5, "macro_rate": 0.9},
    "AAPL": {"geopolitical_china": 1.3, "geopolitical_tariff": 1.0, "macro_rate": 0.7},
    "TSM": {"geopolitical_china": 2.0, "geopolitical_tariff": 1.8, "macro_rate": 0.8},
    "AMD": {"geopolitical_china": 1.5, "geopolitical_tariff": 1.3, "macro_rate": 0.9},
    "LMT": {"geopolitical_war": 1.5, "defense_spending": 1.8, "macro_rate": 0.5},
    "BA": {"geopolitical_war": 1.2, "defense_spending": 1.0, "macro_rate": 0.7},
    "TSLA": {"geopolitical_tariff": 1.2, "policy_ev": 1.5, "macro_rate": 1.0},
    "GLD": {"geopolitical_war": 1.5, "macro_rate": 1.3, "macro_inflation": 1.5},
    "SPY": {"macro_rate": 1.0, "macro_cpi": 0.8, "geopolitical_war": 0.6},
    "QQQ": {"geopolitical_china": 1.2, "geopolitical_tariff": 1.0, "macro_rate": 0.9},
}

# Event ID to category mapping
EVENT_CATEGORY_MAP: Dict[str, str] = {
    "iran_escalation": "geopolitical_oil",
    "ukraine_ceasefire": "geopolitical_war",
    "china_taiwan_tension": "geopolitical_china",
    "tariff_increase": "geopolitical_tariff",
    "fed_rate_cut": "macro_rate",
    "cpi_release": "macro_cpi",
    "oil_disruption": "geopolitical_oil",
    "chip_export_control": "geopolitical_china",
    "fda_approval": "healthcare",
    "ev_subsidy_change": "policy_ev",
    "defense_spending": "defense_spending",
}


def get_stock_info(ticker: str) -> Dict:
    """Get stock information including sector and sensitivities."""
    ticker = ticker.upper()
    sector = STOCK_SECTOR_MAP.get(ticker, "technology")
    sensitivities = STOCK_SENSITIVITY.get(ticker, {})

    return {
        "ticker": ticker,
        "sector": sector,
        "sensitivities": sensitivities,
    }


def get_related_events(ticker: str) -> List[str]:
    """Get all event IDs that are relevant to a stock."""
    ticker = ticker.upper()
    info = get_stock_info(ticker)
    sector = info["sector"]
    sensitivities = info["sensitivities"]

    related = set()

    # Add events whose category matches this stock's sensitivity
    for event_id, event_category in EVENT_CATEGORY_MAP.items():
        if event_category in sensitivities and sensitivities[event_category] > 0:
            related.add(event_id)

    # Add sector-level events (broad impact)
    sector_event_map = {
        "energy": ["iran_escalation", "oil_disruption", "fed_rate_cut"],
        "defense": ["iran_escalation", "ukraine_ceasefire", "china_taiwan_tension", "defense_spending"],
        "technology": ["chip_export_control", "china_taiwan_tension", "tariff_increase", "fed_rate_cut"],
        "semiconductor": ["chip_export_control", "china_taiwan_tension", "tariff_increase"],
        "finance": ["fed_rate_cut", "cpi_release"],
        "healthcare": ["fda_approval"],
        "consumer": ["tariff_increase", "ev_subsidy_change", "cpi_release"],
        "gold": ["iran_escalation", "fed_rate_cut", "cpi_release"],
        "metals": ["china_taiwan_tension", "tariff_increase"],
        "index": ["fed_rate_cut", "cpi_release", "iran_escalation", "tariff_increase"],
    }

    if sector in sector_event_map:
        related.update(sector_event_map[sector])

    return sorted(list(related))


def get_sensitivity_multiplier(ticker: str, event_id: str) -> float:
    """Get how sensitive a stock is to a specific event."""
    ticker = ticker.upper()
    info = get_stock_info(ticker)
    sensitivities = info["sensitivities"]
    event_category = EVENT_CATEGORY_MAP.get(event_id, "")

    return sensitivities.get(event_category, 1.0)


# List of popular stocks for the UI autocomplete
POPULAR_STOCKS = [
    ("AAPL", "Apple Inc.", "technology"),
    ("MSFT", "Microsoft Corp.", "technology"),
    ("GOOGL", "Alphabet Inc.", "technology"),
    ("AMZN", "Amazon.com Inc.", "consumer"),
    ("NVDA", "NVIDIA Corp.", "semiconductor"),
    ("META", "Meta Platforms", "technology"),
    ("TSLA", "Tesla Inc.", "consumer"),
    ("JPM", "JPMorgan Chase", "finance"),
    ("XOM", "Exxon Mobil", "energy"),
    ("CVX", "Chevron Corp.", "energy"),
    ("SPY", "S&P 500 ETF", "index"),
    ("QQQ", "Nasdaq 100 ETF", "index"),
    ("GLD", "Gold ETF", "gold"),
    ("LMT", "Lockheed Martin", "defense"),
    ("AMD", "Advanced Micro Devices", "semiconductor"),
    ("BA", "Boeing Co.", "defense"),
    ("INTC", "Intel Corp.", "semiconductor"),
    ("DIS", "Walt Disney Co.", "consumer"),
    ("NFLX", "Netflix Inc.", "technology"),
    ("PFE", "Pfizer Inc.", "healthcare"),
]
