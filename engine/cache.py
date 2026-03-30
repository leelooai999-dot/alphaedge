"""
Redis caching layer for MonteCarloo.

Caches simulation results, Polymarket odds, leaderboard, and feed data.
Degrades gracefully — if Redis is unavailable, all operations are no-ops.
"""

import os
import json
import hashlib
import logging
import time

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

_redis = None
_redis_available = False
_hits = 0
_misses = 0


def _get_redis():
    """Lazy init Redis connection."""
    global _redis, _redis_available
    if _redis is not None:
        return _redis if _redis_available else None

    try:
        import redis
        _redis = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
        _redis.ping()
        _redis_available = True
        logger.info(f"Redis connected: {REDIS_URL}")
        return _redis
    except Exception as e:
        _redis_available = False
        _redis = True  # Sentinel to prevent retry every call
        logger.warning(f"Redis unavailable, caching disabled: {e}")
        return None


def _sim_cache_key(ticker: str, events: list, horizon: int, n_sims: int) -> str:
    """Generate deterministic cache key for a simulation."""
    # Normalize events: sort by id, extract only params that affect simulation
    normalized = []
    for e in sorted(events, key=lambda x: x.get("id", "")):
        normalized.append({
            "id": e.get("id", ""),
            "probability": e.get("probability", e.get("params", {}).get("probability", 50)),
            "impact": e.get("impact", e.get("params", {}).get("impact_pct", 0)),
            "duration": e.get("duration", e.get("params", {}).get("duration_days", 30)),
        })
    event_hash = hashlib.md5(json.dumps(normalized, sort_keys=True).encode()).hexdigest()[:12]
    return f"sim:{ticker}:{event_hash}:{horizon}:{n_sims}"


def cache_simulation(ticker: str, events: list, horizon: int, n_sims: int,
                     result: dict, ttl: int = 300) -> bool:
    """Cache a simulation result. Returns True if cached successfully."""
    r = _get_redis()
    if not r:
        return False
    try:
        key = _sim_cache_key(ticker, events, horizon, n_sims)
        r.setex(key, ttl, json.dumps(result, default=str))
        return True
    except Exception as e:
        logger.warning(f"Cache write failed: {e}")
        return False


def get_cached_simulation(ticker: str, events: list, horizon: int, n_sims: int) -> dict | None:
    """Get a cached simulation result. Returns None on miss."""
    global _hits, _misses
    r = _get_redis()
    if not r:
        _misses += 1
        return None
    try:
        key = _sim_cache_key(ticker, events, horizon, n_sims)
        cached = r.get(key)
        if cached:
            _hits += 1
            return json.loads(cached)
        _misses += 1
        return None
    except Exception as e:
        _misses += 1
        logger.warning(f"Cache read failed: {e}")
        return None


def cache_set(key: str, value, ttl: int = 300) -> bool:
    """Generic cache set."""
    r = _get_redis()
    if not r:
        return False
    try:
        r.setex(key, ttl, json.dumps(value, default=str) if not isinstance(value, str) else value)
        return True
    except Exception as e:
        logger.warning(f"Cache set failed: {e}")
        return False


def cache_get(key: str):
    """Generic cache get. Returns None on miss."""
    global _hits, _misses
    r = _get_redis()
    if not r:
        _misses += 1
        return None
    try:
        val = r.get(key)
        if val:
            _hits += 1
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError):
                return val
        _misses += 1
        return None
    except Exception as e:
        _misses += 1
        logger.warning(f"Cache get failed: {e}")
        return None


def cache_delete(key: str) -> bool:
    """Delete a cache key."""
    r = _get_redis()
    if not r:
        return False
    try:
        r.delete(key)
        return True
    except Exception:
        return False


def get_cache_stats() -> dict:
    """Return cache statistics."""
    r = _get_redis()
    info = {}
    if r:
        try:
            redis_info = r.info("memory")
            info["redis_memory_used"] = redis_info.get("used_memory_human", "unknown")
            info["redis_keys"] = r.dbsize()
        except Exception:
            pass

    return {
        "available": _redis_available,
        "hits": _hits,
        "misses": _misses,
        "hit_rate": round(_hits / max(_hits + _misses, 1) * 100, 1),
        **info,
    }
