"""
Database initialization and connection helper.
Supports Postgres (via DATABASE_URL) with SQLite fallback.
"""

import os
import sqlite3
import logging
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# --- Database backend detection ---
DATABASE_URL = os.environ.get("DATABASE_URL", "")
USE_POSTGRES = DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")

if USE_POSTGRES:
    try:
        import psycopg2
        import psycopg2.extras
        logger.info("Using Postgres backend")
    except ImportError:
        logger.warning("psycopg2 not installed, falling back to SQLite")
        USE_POSTGRES = False

if not USE_POSTGRES:
    DATA_DIR = os.environ.get("DATA_DIR", "/data")
    if not os.path.isdir(DATA_DIR):
        DATA_DIR = "/tmp"
        logger.info(f"No persistent volume at /data, using {DATA_DIR}")
    DB_PATH = os.path.join(DATA_DIR, "alphaedge.db")
    logger.info(f"Using SQLite backend at {DB_PATH}")


# --- Postgres wrapper that mimics sqlite3.Row ---

class DictRow:
    """Mimics sqlite3.Row so existing code using row['column'] works."""
    def __init__(self, keys, values):
        self._data = dict(zip(keys, values))
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self._data.values())[key]
        return self._data[key]
    def __contains__(self, key):
        return key in self._data
    def keys(self):
        return self._data.keys()


class PgConnectionWrapper:
    """Wraps psycopg2 connection to provide sqlite3-compatible interface."""
    def __init__(self, conn):
        self._conn = conn
        self._conn.autocommit = False

    def execute(self, sql, params=None):
        # Convert SQLite ? placeholders to Postgres %s
        sql = _convert_placeholders(sql)
        cur = self._conn.cursor()
        cur.execute(sql, params or ())
        return PgCursorWrapper(cur)

    def executescript(self, sql):
        """Execute multiple statements (Postgres doesn't have executescript)."""
        # Always convert SQLite syntax to Postgres
        sql = _sqlite_to_postgres(sql)
        cur = self._conn.cursor()
        cur.execute(sql)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


class PgCursorWrapper:
    """Wraps psycopg2 cursor to return DictRow objects."""
    def __init__(self, cursor):
        self._cursor = cursor
        self._keys = getattr(cursor, '_pg_keys', [])
        if cursor.description:
            self._keys = [d[0] for d in cursor.description]

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return DictRow(self._keys, row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        return [DictRow(self._keys, r) for r in rows]

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount


def _convert_placeholders(sql):
    """Convert ? placeholders to %s for psycopg2."""
    result = []
    in_string = False
    quote_char = None
    i = 0
    while i < len(sql):
        c = sql[i]
        if in_string:
            result.append(c)
            if c == quote_char:
                in_string = False
        elif c in ("'", '"'):
            in_string = True
            quote_char = c
            result.append(c)
        elif c == '?':
            result.append('%s')
        else:
            result.append(c)
        i += 1
    return ''.join(result)


def _sqlite_to_postgres(sql):
    """Convert SQLite-specific SQL to Postgres-compatible SQL."""
    # Replace AUTOINCREMENT with SERIAL (not needed, we use TEXT PKs)
    sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    # Replace INSERT OR IGNORE with INSERT ... ON CONFLICT DO NOTHING
    sql = sql.replace("INSERT OR IGNORE INTO", "INSERT INTO")
    # Add ON CONFLICT DO NOTHING to INSERT INTO stats
    sql = sql.replace(
        "VALUES ('total_simulations', 0)",
        "VALUES ('total_simulations', 0) ON CONFLICT (key) DO NOTHING"
    )
    sql = sql.replace(
        "VALUES ('simulations_today', 0)",
        "VALUES ('simulations_today', 0) ON CONFLICT (key) DO NOTHING"
    )
    sql = sql.replace(
        "VALUES ('today_date', date('now'))",
        "VALUES ('today_date', CURRENT_DATE::text) ON CONFLICT (key) DO NOTHING"
    )
    # Replace datetime('now', '-7 days') with Postgres equivalent
    sql = sql.replace("datetime('now', '-7 days')", "(NOW() - INTERVAL '7 days')")
    sql = sql.replace("datetime('now', '-30 days')", "(NOW() - INTERVAL '30 days')")
    sql = sql.replace("date('now')", "CURRENT_DATE::text")
    # Remove SQLite PRAGMAs
    lines = sql.split('\n')
    lines = [l for l in lines if not l.strip().startswith('PRAGMA')]
    sql = '\n'.join(lines)
    # Postgres partial index syntax is the same (WHERE clause in CREATE INDEX)
    return sql


def get_db():
    """Get a database connection (Postgres or SQLite)."""
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        return PgConnectionWrapper(conn)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn


def init_db():
    """Initialize database tables."""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS scenarios (
                id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                title TEXT,
                description TEXT,
                events TEXT NOT NULL,
                result_summary TEXT,
                author_name TEXT DEFAULT 'Anonymous',
                author_id TEXT,
                views INTEGER DEFAULT 0,
                forks INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                is_public INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                forked_from TEXT,
                tags TEXT,
                source TEXT,
                pyeces_data TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_scenarios_ticker ON scenarios(ticker);
            CREATE INDEX IF NOT EXISTS idx_scenarios_views ON scenarios(views DESC);
            CREATE INDEX IF NOT EXISTS idx_scenarios_created ON scenarios(created_at DESC);

            CREATE TABLE IF NOT EXISTS stats (
                key TEXT PRIMARY KEY,
                value TEXT DEFAULT '0'
            );

            CREATE TABLE IF NOT EXISTS scenario_likes (
                scenario_id TEXT,
                session_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (scenario_id, session_id)
            );

            INSERT INTO stats (key, value) VALUES ('total_simulations', '0') ON CONFLICT (key) DO NOTHING;
            INSERT INTO stats (key, value) VALUES ('simulations_today', '0') ON CONFLICT (key) DO NOTHING;
            INSERT INTO stats (key, value) VALUES ('today_date', CURRENT_DATE::text) ON CONFLICT (key) DO NOTHING;
        """)
        conn.commit()

        # Add columns if they don't exist (safe migration for both PG and SQLite)
        for col, coltype in [("source", "TEXT"), ("pyeces_data", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE scenarios ADD COLUMN {col} {coltype}")
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass

        logger.info(f"Database initialized ({'Postgres' if USE_POSTGRES else 'SQLite'})")
    finally:
        conn.close()


def _init_db_sqlite():
    """SQLite-specific init (for local dev fallback)."""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS scenarios (
                id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                title TEXT,
                description TEXT,
                events TEXT NOT NULL,
                result_summary TEXT,
                author_name TEXT DEFAULT 'Anonymous',
                author_id TEXT,
                views INTEGER DEFAULT 0,
                forks INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                is_public INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                forked_from TEXT,
                tags TEXT,
                source TEXT,
                pyeces_data TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_scenarios_ticker ON scenarios(ticker);
            CREATE INDEX IF NOT EXISTS idx_scenarios_views ON scenarios(views DESC);
            CREATE INDEX IF NOT EXISTS idx_scenarios_created ON scenarios(created_at DESC);

            CREATE TABLE IF NOT EXISTS stats (
                key TEXT PRIMARY KEY,
                value INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS scenario_likes (
                scenario_id TEXT,
                session_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (scenario_id, session_id)
            );

            INSERT OR IGNORE INTO stats (key, value) VALUES ('total_simulations', 0);
            INSERT OR IGNORE INTO stats (key, value) VALUES ('simulations_today', 0);
            INSERT OR IGNORE INTO stats (key, value) VALUES ('today_date', date('now'));
        """)
        conn.commit()
        logger.info(f"SQLite database initialized at {DB_PATH}")
    finally:
        conn.close()


def increment_sim_counter():
    """Increment the simulation counter. Resets daily."""
    conn = get_db()
    try:
        if USE_POSTGRES:
            date_check = "CURRENT_DATE::text"
        else:
            date_check = "date('now')"

        row = conn.execute("SELECT value FROM stats WHERE key = 'today_date'").fetchone()
        from datetime import date
        today = date.today().isoformat()
        if row and row["value"] != today:
            conn.execute("UPDATE stats SET value = 0 WHERE key = 'simulations_today'")
            conn.execute("UPDATE stats SET value = %s WHERE key = 'today_date'" if USE_POSTGRES
                         else "UPDATE stats SET value = ? WHERE key = 'today_date'", (today,))

        conn.execute("UPDATE stats SET value = value + 1 WHERE key = 'total_simulations'")
        conn.execute("UPDATE stats SET value = value + 1 WHERE key = 'simulations_today'")
        conn.commit()
    finally:
        conn.close()


def get_stats() -> dict:
    """Get global stats for social proof."""
    conn = get_db()
    try:
        stats = {}
        for row in conn.execute("SELECT key, value FROM stats").fetchall():
            stats[row["key"]] = row["value"]

        row = conn.execute("SELECT COUNT(*) as cnt FROM scenarios WHERE is_public = 1").fetchone()
        stats["total_scenarios"] = row["cnt"] if row else 0

        if USE_POSTGRES:
            interval = "(NOW() - INTERVAL '7 days')"
        else:
            interval = "datetime('now', '-7 days')"
        rows = conn.execute(f"""
            SELECT ticker, COUNT(*) as cnt FROM scenarios
            WHERE is_public = 1 AND created_at > {interval}
            GROUP BY ticker ORDER BY cnt DESC LIMIT 5
        """).fetchall()
        stats["trending_tickers"] = [r["ticker"] for r in rows]

        return stats
    finally:
        conn.close()


# Initialize on import
if USE_POSTGRES:
    init_db()
else:
    _init_db_sqlite()
