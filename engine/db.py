"""
Database initialization and connection helper.
Uses SQLite for zero-cost scenario storage.
"""

import os
import sqlite3
import logging

logger = logging.getLogger(__name__)

# Railway persistent volume or fallback
DATA_DIR = os.environ.get("DATA_DIR", "/data")
if not os.path.isdir(DATA_DIR):
    DATA_DIR = "/tmp"
    logger.info(f"No persistent volume at /data, using {DATA_DIR}")

DB_PATH = os.path.join(DATA_DIR, "alphaedge.db")


def get_db() -> sqlite3.Connection:
    """Get a database connection with row_factory."""
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
                tags TEXT
            );

            -- Pyeces bridge columns (added v7.2)
            -- SQLite doesn't support IF NOT EXISTS for ALTER TABLE,
            -- so we add these via separate try/except in Python below.

            CREATE INDEX IF NOT EXISTS idx_scenarios_ticker ON scenarios(ticker);
            CREATE INDEX IF NOT EXISTS idx_scenarios_views ON scenarios(views DESC);
            CREATE INDEX IF NOT EXISTS idx_scenarios_created ON scenarios(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_scenarios_public ON scenarios(is_public) WHERE is_public = 1;

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

        # Add Pyeces bridge columns if they don't exist (safe migration)
        for col, coltype, default in [
            ("source", "TEXT", None),
            ("pyeces_data", "TEXT", None),
        ]:
            try:
                conn.execute(f"ALTER TABLE scenarios ADD COLUMN {col} {coltype}")
                conn.commit()
            except Exception:
                pass  # Column already exists

        logger.info(f"Database initialized at {DB_PATH}")
    finally:
        conn.close()


def increment_sim_counter():
    """Increment the simulation counter. Resets daily."""
    conn = get_db()
    try:
        # Check if we need to reset daily counter
        row = conn.execute("SELECT value FROM stats WHERE key = 'today_date'").fetchone()
        from datetime import date
        today = date.today().isoformat()
        if row and row["value"] != today:
            conn.execute("UPDATE stats SET value = 0 WHERE key = 'simulations_today'")
            conn.execute("UPDATE stats SET value = ? WHERE key = 'today_date'", (today,))

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
        for row in conn.execute("SELECT key, value FROM stats"):
            stats[row["key"]] = row["value"]

        # Count scenarios
        row = conn.execute("SELECT COUNT(*) as cnt FROM scenarios WHERE is_public = 1").fetchone()
        stats["total_scenarios"] = row["cnt"] if row else 0

        # Trending tickers (most scenarios in last 7 days)
        rows = conn.execute("""
            SELECT ticker, COUNT(*) as cnt FROM scenarios
            WHERE is_public = 1 AND created_at > datetime('now', '-7 days')
            GROUP BY ticker ORDER BY cnt DESC LIMIT 5
        """).fetchall()
        stats["trending_tickers"] = [r["ticker"] for r in rows]

        return stats
    finally:
        conn.close()


# Initialize on import
init_db()
