"""
MonteCarloo Feedback Collection Module.

Three channels:
1. Implicit behavioral events (fire-and-forget from frontend)
2. Explicit micro-surveys (contextual, max 1/day)
3. Widget submissions (bug reports, feature requests, event suggestions)

All data stored in SQLite. Nightly analysis generates proposals.
"""

import json
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from db import get_db

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database schema
# ---------------------------------------------------------------------------

def init_feedback_db():
    """Create feedback tables if they don't exist."""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS feedback_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                user_id TEXT,
                event_type TEXT NOT NULL,
                event_data TEXT,
                page TEXT,
                viewport TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS feedback_surveys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                user_id TEXT,
                rating INTEGER,
                comment TEXT,
                trigger_context TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS feedback_widget (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                user_id TEXT,
                category TEXT,
                message TEXT NOT NULL,
                page TEXT,
                status TEXT DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS feedback_proposals (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                tier INTEGER,
                score REAL,
                source_count INTEGER,
                source_type TEXT,
                status TEXT DEFAULT 'proposed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                shipped_at TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_fb_events_type 
                ON feedback_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_fb_events_time 
                ON feedback_events(created_at);
            CREATE INDEX IF NOT EXISTS idx_fb_surveys_time 
                ON feedback_surveys(created_at);
            CREATE INDEX IF NOT EXISTS idx_fb_widget_status 
                ON feedback_widget(status);
        """)
        conn.commit()
        logger.info("Feedback tables initialized")
    except Exception as e:
        logger.warning(f"Feedback table init: {e}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Collection functions
# ---------------------------------------------------------------------------

def record_event(
    event_type: str,
    event_data: Optional[Dict] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    page: Optional[str] = None,
    viewport: Optional[str] = None,
) -> bool:
    """Record an implicit behavioral event."""
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO feedback_events 
            (session_id, user_id, event_type, event_data, page, viewport)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            session_id, user_id, event_type,
            json.dumps(event_data) if event_data else None,
            page, viewport,
        ))
        conn.commit()
        return True
    except Exception as e:
        logger.warning(f"Failed to record event: {e}")
        return False
    finally:
        conn.close()


def record_survey(
    rating: int,
    comment: Optional[str] = None,
    trigger_context: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> bool:
    """Record a micro-survey response."""
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO feedback_surveys 
            (session_id, user_id, rating, comment, trigger_context)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, user_id, rating, comment, trigger_context))
        conn.commit()
        return True
    except Exception as e:
        logger.warning(f"Failed to record survey: {e}")
        return False
    finally:
        conn.close()


def record_widget_feedback(
    category: str,
    message: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    page: Optional[str] = None,
) -> bool:
    """Record a feedback widget submission."""
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO feedback_widget 
            (session_id, user_id, category, message, page)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, user_id, category, message, page))
        conn.commit()
        return True
    except Exception as e:
        logger.warning(f"Failed to record widget feedback: {e}")
        return False
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Analysis functions
# ---------------------------------------------------------------------------

def get_feedback_stats(days: int = 7) -> Dict[str, Any]:
    """Get feedback summary stats for the last N days."""
    conn = get_db()
    try:
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Event counts by type
        event_rows = conn.execute("""
            SELECT event_type, COUNT(*) as cnt 
            FROM feedback_events 
            WHERE created_at > ?
            GROUP BY event_type 
            ORDER BY cnt DESC
            LIMIT 20
        """, (cutoff,)).fetchall()
        event_counts = {r["event_type"]: r["cnt"] for r in event_rows}

        # Survey stats
        survey_row = conn.execute("""
            SELECT COUNT(*) as cnt, 
                   AVG(rating) as avg_rating,
                   COUNT(CASE WHEN comment IS NOT NULL AND comment != '' THEN 1 END) as with_comments
            FROM feedback_surveys 
            WHERE created_at > ?
        """, (cutoff,)).fetchone()

        # Widget stats
        widget_rows = conn.execute("""
            SELECT category, COUNT(*) as cnt, status
            FROM feedback_widget
            WHERE created_at > ?
            GROUP BY category, status
        """, (cutoff,)).fetchall()
        widget_by_category = {}
        for r in widget_rows:
            cat = r["category"] or "general"
            if cat not in widget_by_category:
                widget_by_category[cat] = {"total": 0, "new": 0, "reviewed": 0}
            widget_by_category[cat]["total"] += r["cnt"]
            if r["status"] == "new":
                widget_by_category[cat]["new"] += r["cnt"]

        # Search gaps (things users searched but got no results)
        search_gaps = conn.execute("""
            SELECT json_extract(event_data, '$.query') as query, COUNT(*) as cnt
            FROM feedback_events
            WHERE event_type = 'search_no_results' AND created_at > ?
            GROUP BY query
            ORDER BY cnt DESC
            LIMIT 10
        """, (cutoff,)).fetchall()

        # Top pages by time spent
        page_engagement = conn.execute("""
            SELECT page, COUNT(*) as visits,
                   AVG(CAST(json_extract(event_data, '$.time_on_page_ms') AS REAL)) as avg_time_ms
            FROM feedback_events
            WHERE event_type = 'page_exit' AND created_at > ?
            GROUP BY page
            ORDER BY visits DESC
            LIMIT 10
        """, (cutoff,)).fetchall()

        return {
            "period_days": days,
            "events": {
                "total": sum(event_counts.values()),
                "by_type": event_counts,
            },
            "surveys": {
                "total": survey_row["cnt"] if survey_row else 0,
                "avg_rating": round(survey_row["avg_rating"], 2) if survey_row and survey_row["avg_rating"] else None,
                "with_comments": survey_row["with_comments"] if survey_row else 0,
            },
            "widget": widget_by_category,
            "search_gaps": [{"query": r["query"], "count": r["cnt"]} for r in search_gaps] if search_gaps else [],
            "page_engagement": [
                {"page": r["page"], "visits": r["visits"], 
                 "avg_time_ms": round(r["avg_time_ms"]) if r["avg_time_ms"] else None}
                for r in page_engagement
            ] if page_engagement else [],
        }
    finally:
        conn.close()


def get_recent_widget_feedback(
    status: str = "new",
    limit: int = 50,
) -> List[Dict]:
    """Get recent widget feedback submissions."""
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM feedback_widget
            WHERE status = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (status, limit)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_widget_status(feedback_id: int, status: str) -> bool:
    """Update the status of a widget feedback entry."""
    conn = get_db()
    try:
        conn.execute(
            "UPDATE feedback_widget SET status = ? WHERE id = ?",
            (status, feedback_id)
        )
        conn.commit()
        return True
    finally:
        conn.close()


# Initialize on import
init_feedback_db()
