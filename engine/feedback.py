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
import html
import re
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from db import get_db

logger = logging.getLogger(__name__)

ALLOWED_WIDGET_CATEGORIES = {"bug", "feature", "event", "general", "ux", "security"}
ALLOWED_WIDGET_STATUSES = {"new", "reviewed", "triaged", "closed", "spam"}
_MAX_MESSAGE_LEN = 2000
_MAX_PAGE_LEN = 300
_MAX_SESSION_ID_LEN = 128
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_RE = re.compile(r"https?://|javascript:|data:", re.IGNORECASE)
_SCRIPT_RE = re.compile(r"<\s*/?\s*script\b", re.IGNORECASE)


def _clean_text(value: Optional[str], *, max_len: int) -> str:
    value = (value or "").replace("\x00", "").strip()
    value = html.escape(value, quote=True)
    if len(value) > max_len:
        value = value[:max_len]
    return value


def sanitize_feedback_message(message: Optional[str]) -> str:
    return _clean_text(message, max_len=_MAX_MESSAGE_LEN)


def sanitize_page(page: Optional[str]) -> str:
    page = _clean_text(page, max_len=_MAX_PAGE_LEN)
    if page and not page.startswith("/"):
        return ""
    return page


def sanitize_session_id(session_id: Optional[str]) -> Optional[str]:
    session_id = _clean_text(session_id, max_len=_MAX_SESSION_ID_LEN)
    return session_id or None


def sanitize_email(email: Optional[str]) -> str:
    email = (email or "").strip().lower()
    if not email:
        return ""
    if len(email) > 254 or not _EMAIL_RE.match(email):
        return ""
    return email


def looks_suspicious_feedback(message: str) -> bool:
    lowered = message.lower()
    return bool(
        _SCRIPT_RE.search(message)
        or _URL_RE.search(message)
        or "<iframe" in lowered
        or "onerror=" in lowered
        or "onload=" in lowered
    )


def normalize_widget_category(category: Optional[str]) -> str:
    category = _clean_text(category, max_len=32).lower()
    return category if category in ALLOWED_WIDGET_CATEGORIES else "general"


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
    rating = max(1, min(5, int(rating)))
    safe_comment = sanitize_feedback_message(comment)
    safe_trigger_context = _clean_text(trigger_context, max_len=200)
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO feedback_surveys 
            (session_id, user_id, rating, comment, trigger_context)
            VALUES (?, ?, ?, ?, ?)
        """, (sanitize_session_id(session_id), user_id, rating, safe_comment, safe_trigger_context))
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
    safe_category = normalize_widget_category(category)
    safe_message = sanitize_feedback_message(message)
    safe_page = sanitize_page(page)
    safe_session_id = sanitize_session_id(session_id)
    if not safe_message:
        return False
    status = "spam" if looks_suspicious_feedback(safe_message) else "new"
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO feedback_widget 
            (session_id, user_id, category, message, page, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (safe_session_id, user_id, safe_category, safe_message, safe_page, status))
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
    status = status if status in ALLOWED_WIDGET_STATUSES else "new"
    limit = max(1, min(int(limit), 100))
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
    if status not in ALLOWED_WIDGET_STATUSES:
        return False
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
