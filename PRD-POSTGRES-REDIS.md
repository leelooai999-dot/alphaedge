# PRD: Postgres Migration + Redis Caching Layer

## Context
MonteCarloo backend currently uses SQLite (`engine/db.py`). We're migrating to Hetzner VPS with local Postgres and Redis. The code must support both SQLite (local dev) and Postgres (production) via the DATABASE_URL environment variable.

## IMPORTANT: Working directory is /root/.openclaw/workspace/alphaedge

## Task 1: Rewrite engine/db.py for Postgres + SQLite dual support

Current db.py uses `sqlite3` directly. Rewrite to:

1. Read `DATABASE_URL` env var. If starts with `postgresql://`, use psycopg2. Otherwise fall back to SQLite.
2. For Postgres: use `psycopg2.pool.ThreadedConnectionPool(minconn=2, maxconn=10, dsn=DATABASE_URL)`
3. Keep `get_db()` function signature the same but return appropriate connection
4. Add `release_db(conn)` for Postgres pool (no-op for SQLite)
5. Update `init_db()` to create all tables in Postgres-compatible SQL:
   - TEXT types stay the same
   - INTEGER stays the same
   - TIMESTAMP DEFAULT CURRENT_TIMESTAMP → works in both
   - Remove SQLite-specific `WHERE is_public = 1` partial index (not supported in Postgres CREATE INDEX)
   - Add IF NOT EXISTS to all CREATE TABLE
6. Keep the ALTER TABLE migration for `source` and `pyeces_data` columns
7. Add all tables including: scenarios, stats, scenario_likes, users, comments, points_ledger, badges, referrals, shares, social_shares, leaderboard_cache, weekly_recaps, notifications, feed_cache

Tables that may exist across the codebase — check `engine/social.py`, `engine/scenarios.py`, `engine/marketplace.py` and `engine/api.py` for all CREATE TABLE statements and consolidate them into init_db().

## Task 2: Create engine/cache.py — Redis caching layer

1. Read `REDIS_URL` env var (default: `redis://localhost:6379/0`)
2. If Redis not available, degrade gracefully (no-op cache)
3. Functions:
   - `cache_simulation(ticker, events, horizon, n_sims, result_dict, ttl=300)` — hash key from sorted inputs
   - `get_cached_simulation(ticker, events, horizon, n_sims)` → dict or None
   - `cache_set(key, value, ttl)` — generic
   - `cache_get(key)` → value or None
   - `cache_delete(key)`
   - `get_cache_stats()` → hits, misses, size
4. Cache key format: `sim:{ticker}:{md5(json(sorted_events))}:{horizon}:{n_sims}`

## Task 3: Wire cache into /api/simulate endpoint in engine/api.py

1. In the `simulate_endpoint` function, BEFORE running simulation:
   - Check cache with `get_cached_simulation()`
   - If hit, return cached result immediately (add `"cached": true` to response)
2. AFTER running simulation:
   - Store result in cache with `cache_simulation()`
3. Add `Cache-Control: private, max-age=60` header to simulation responses

## Task 4: Add /api/cache/stats endpoint

Return cache hit/miss stats from `get_cache_stats()`.

## Task 5: Update engine/requirements.txt

Add:
- psycopg2-binary>=2.9
- redis>=5.0

## Task 6: Test

1. Verify `python3 -c "from db import get_db, init_db; init_db(); print('DB OK')"` works with DATABASE_URL unset (SQLite fallback)
2. Verify `python3 -c "from cache import get_cache_stats; print(get_cache_stats())"` works with REDIS_URL unset (graceful degradation)
3. Run `python3 -c "from api import app; print('API imports OK')"`

## Tasks Checklist

- [ ] Rewrite engine/db.py with Postgres+SQLite dual support (psycopg2 pool for Postgres, sqlite3 fallback)
- [ ] Consolidate ALL CREATE TABLE statements from social.py, scenarios.py, marketplace.py, api.py into db.py init_db()
- [ ] Create engine/cache.py with Redis caching (simulation results, generic get/set, stats)
- [ ] Wire cache into /api/simulate endpoint in engine/api.py (check before compute, store after)
- [ ] Add GET /api/cache/stats endpoint to engine/api.py
- [ ] Update engine/requirements.txt with psycopg2-binary and redis
- [ ] Test: verify SQLite fallback works, Redis graceful degradation works, API imports succeed
- [ ] git add -A && git commit -m "feat: Postgres+Redis dual backend — SQLite fallback, simulation caching" && git push origin master

## Constraints
- Must not break existing SQLite behavior (no DATABASE_URL = SQLite as before)
- Must not break existing API contract (same response format, just faster)
- Postgres connection pool must handle concurrent requests (2 uvicorn workers × multiple requests)
- Redis must degrade gracefully — if Redis is down, skip cache, run simulation normally
