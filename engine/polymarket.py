"""
Polymarket Live Odds Integration.

Fetches live prediction market odds from Polymarket's public API and maps them
to AlphaEdge events. Uses keyword-based matching with caching.
"""

import time
import json
import logging
from typing import Dict, Optional, Any, List

import requests

logger = logging.getLogger(__name__)

# ── Cache ──────────────────────────────────────────────────────────────────

_odds_cache: Dict[str, Any] = {}  # event_key -> {odds, question, slug, volume_24h, fetched_at}
_CACHE_TTL = 300  # 5 minutes


def _is_fresh(entry: Dict) -> bool:
    return (time.time() - entry.get("fetched_at", 0)) < _CACHE_TTL


# ── Polymarket API ─────────────────────────────────────────────────────────

GAMMA_API = "https://gamma-api.polymarket.com/markets"

# Bulk market cache — fetch once, filter many times
_all_markets_cache: Dict[str, Any] = {"data": [], "fetched_at": 0}
_ALL_MARKETS_TTL = 300  # 5 minutes


def _fetch_all_markets() -> List[Dict]:
    """Fetch top active markets (cached). The API has no search param, so we bulk-fetch and filter."""
    if _all_markets_cache["data"] and (time.time() - _all_markets_cache["fetched_at"]) < _ALL_MARKETS_TTL:
        return _all_markets_cache["data"]

    try:
        r = requests.get(
            GAMMA_API,
            params={
                "limit": 200,
                "order": "volume24hr",
                "ascending": "false",
                "active": "true",
                "closed": "false",
            },
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (compatible; AlphaEdge/1.0)",
            },
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        _all_markets_cache["data"] = data
        _all_markets_cache["fetched_at"] = time.time()
        return data
    except Exception as e:
        logger.warning(f"Polymarket bulk fetch failed: {e}")
        return _all_markets_cache.get("data", [])


def _search_markets(keyword: str, limit: int = 10) -> List[Dict]:
    """Search through cached markets by keyword match in question text."""
    all_markets = _fetch_all_markets()
    keyword_lower = keyword.lower()
    matches = [
        m for m in all_markets
        if keyword_lower in m.get("question", "").lower()
           or keyword_lower in m.get("slug", "").lower()
    ]
    return matches[:limit]


# ── Inverse detection ──────────────────────────────────────────────────────

_INVERSE_WORDS = {"ceasefire", "peace", "no ", "won't", "will not", "end of", "de-escalat"}


def _is_inverse_question(question: str, event_key: str) -> bool:
    """Detect if the Polymarket question is the inverse of our event."""
    q = question.lower()
    # Ceasefire questions are inverse of escalation events
    if "ceasefire" in q and "escalation" in event_key:
        return True
    if "peace" in q and ("conflict" in event_key or "escalation" in event_key or "tension" in event_key):
        return True
    # "end of military operations" is inverse of escalation
    if "end of" in q and ("escalation" in event_key or "conflict" in event_key):
        return True
    return False


# ── Event → Market Mapping ─────────────────────────────────────────────────

# Map each AlphaEdge event key to search keywords and relevance filters
EVENT_SEARCH_CONFIG = {
    "iran_escalation": {
        "keywords": ["iran", "iran israel", "iran war"],
        "filter_out": ["fifa", "world cup", "election", "regime fall"],
    },
    "china_taiwan": {
        "keywords": ["taiwan", "china taiwan"],
        "filter_out": ["election", "olympics"],
    },
    "ukraine_russia": {
        "keywords": ["ukraine russia", "ukraine war"],
        "filter_out": ["election"],
    },
    "north_korea": {
        "keywords": ["north korea", "nuclear test"],
        "filter_out": ["election"],
    },
    "fed_rate_cut": {
        "keywords": ["fed decrease interest", "fed decrease", "federal funds rate"],
        "filter_out": ["increase", "hike", "chair", "confirmed"],
    },
    "fed_rate_hike": {
        "keywords": ["fed increase interest", "fed increase"],
        "filter_out": ["decrease", "cut", "chair", "confirmed"],
    },
    "recession": {
        "keywords": ["recession", "gdp contraction"],
        "filter_out": [],
    },
    "inflation_spike": {
        "keywords": ["inflation", "cpi"],
        "filter_out": ["election"],
    },
    "tariff_increase": {
        "keywords": ["tariff"],
        "filter_out": [],
    },
    "oil_disruption": {
        "keywords": ["oil price", "oil supply", "Kharg Island"],
        "filter_out": [],
    },
    "chip_export_control": {
        "keywords": ["semiconductor", "chip export", "TSMC"],
        "filter_out": [],
    },
    "defense_spending": {
        "keywords": ["defense spending", "military budget"],
        "filter_out": [],
    },
    "crypto_regulation": {
        "keywords": ["crypto regulation", "crypto ban"],
        "filter_out": ["world cup", "fifa", "reach", "price"],
    },
}


def _find_best_market(event_key: str) -> Optional[Dict]:
    """Find the best Polymarket market for an event."""
    config = EVENT_SEARCH_CONFIG.get(event_key)
    if not config:
        return None

    all_markets = []
    for keyword in config["keywords"]:
        markets = _search_markets(keyword, limit=10)
        all_markets.extend(markets)

    # Deduplicate by conditionId
    seen = set()
    unique = []
    for m in all_markets:
        cid = m.get("conditionId", m.get("slug", ""))
        if cid not in seen:
            seen.add(cid)
            unique.append(m)

    # Filter out irrelevant markets
    filter_words = [w.lower() for w in config.get("filter_out", [])]
    filtered = []
    for m in unique:
        q = m.get("question", "").lower()
        if any(fw in q for fw in filter_words):
            continue
        filtered.append(m)

    if not filtered:
        return None

    # Sort by 24h volume (highest = most reliable)
    filtered.sort(key=lambda m: float(m.get("volume24hr", 0) or 0), reverse=True)
    return filtered[0]


def _parse_odds(market: Dict) -> float:
    """Parse the Yes probability from a Polymarket market."""
    prices_raw = market.get("outcomePrices", "[]")
    try:
        prices = json.loads(prices_raw) if isinstance(prices_raw, str) else prices_raw
        return float(prices[0])  # First element is "Yes" probability
    except (json.JSONDecodeError, IndexError, TypeError, ValueError):
        return 0.5


# ── Public API ─────────────────────────────────────────────────────────────

def get_live_odds(event_key: str) -> Optional[Dict[str, Any]]:
    """
    Get live Polymarket odds for an AlphaEdge event.

    Returns:
        {
            "odds": 0.145,          # probability (0-1)
            "question": "US x Iran ceasefire by March 31?",
            "slug": "us-x-iran-ceasefire-by-march-31",
            "volume_24h": 4322744.78,
            "is_inverse": false,     # true if we inverted the odds
            "last_updated": "2026-03-25T20:00:00Z"
        }
        or None if no match found
    """
    # Check cache
    if event_key in _odds_cache and _is_fresh(_odds_cache[event_key]):
        return _odds_cache[event_key]

    market = _find_best_market(event_key)
    if not market:
        return None

    odds = _parse_odds(market)
    is_inverse = _is_inverse_question(market.get("question", ""), event_key)
    if is_inverse:
        odds = 1.0 - odds

    result = {
        "odds": round(odds, 4),
        "question": market.get("question", ""),
        "slug": market.get("slug", ""),
        "volume_24h": round(float(market.get("volume24hr", 0) or 0), 2),
        "is_inverse": is_inverse,
        "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "fetched_at": time.time(),
    }

    _odds_cache[event_key] = result
    return result


def get_all_live_odds() -> Dict[str, Dict[str, Any]]:
    """Fetch live odds for ALL configured events. Returns a dict keyed by event_key."""
    results = {}
    for event_key in EVENT_SEARCH_CONFIG:
        data = get_live_odds(event_key)
        if data:
            # Strip internal fields
            results[event_key] = {
                "odds": data["odds"],
                "question": data["question"],
                "slug": data["slug"],
                "volume_24h": data["volume_24h"],
                "is_inverse": data["is_inverse"],
                "last_updated": data["last_updated"],
            }
    return results
