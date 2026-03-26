"""
AlphaEdge Social Layer — Comments, Likes, Forks, Follows, Points, Leaderboard.

The engagement engine that turns simulations into a social network.
"""

import json
import secrets
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from db import get_db

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database schema for social features
# ---------------------------------------------------------------------------

def init_social_db():
    """Create social tables."""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                scenario_id TEXT NOT NULL,
                user_id TEXT,
                author_name TEXT DEFAULT 'Anonymous',
                content TEXT NOT NULL,
                parent_id TEXT,
                upvotes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS follows (
                follower_id TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, following_id)
            );

            CREATE TABLE IF NOT EXISTS points_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                points INTEGER NOT NULL,
                reference_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scenario_id TEXT NOT NULL,
                user_id TEXT,
                session_id TEXT,
                platform TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                reference_id TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_badges (
                user_id TEXT NOT NULL,
                badge_key TEXT NOT NULL,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, badge_key)
            );

            CREATE INDEX IF NOT EXISTS idx_comments_scenario ON comments(scenario_id);
            CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
            CREATE INDEX IF NOT EXISTS idx_points_user ON points_ledger(user_id);
            CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
            CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
            CREATE INDEX IF NOT EXISTS idx_shares_scenario ON shares(scenario_id);
        """)
        conn.commit()
        logger.info("Social tables initialized")
    except Exception as e:
        logger.warning(f"Social table init: {e}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

def add_comment(
    scenario_id: str,
    content: str,
    user_id: Optional[str] = None,
    author_name: str = "Anonymous",
    parent_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Add a comment to a scenario. Returns the new comment."""
    conn = get_db()
    try:
        comment_id = secrets.token_urlsafe(12)
        conn.execute("""
            INSERT INTO comments (id, scenario_id, user_id, author_name, content, parent_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (comment_id, scenario_id, user_id, author_name, content, parent_id))

        # Award points to scenario author (if not self-comment)
        scenario = conn.execute(
            "SELECT author_id FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        if scenario and scenario["author_id"] and scenario["author_id"] != user_id:
            award_points(scenario["author_id"], "received_comment", 3, comment_id, conn)
            # Notify scenario author
            add_notification(
                scenario["author_id"],
                "comment",
                f"{author_name} commented on your scenario",
                scenario_id,
                conn,
            )

        # Award points to commenter
        if user_id:
            award_points(user_id, "posted_comment", 2, comment_id, conn)

        conn.commit()
        return {
            "id": comment_id,
            "scenario_id": scenario_id,
            "user_id": user_id,
            "author_name": author_name,
            "content": content,
            "parent_id": parent_id,
            "upvotes": 0,
            "created_at": datetime.utcnow().isoformat(),
        }
    finally:
        conn.close()


def get_comments(
    scenario_id: str,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict]:
    """Get comments for a scenario, threaded."""
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM comments
            WHERE scenario_id = ?
            ORDER BY created_at ASC
            LIMIT ? OFFSET ?
        """, (scenario_id, limit, offset)).fetchall()

        comments = [dict(r) for r in rows]

        # Build thread tree
        top_level = [c for c in comments if not c.get("parent_id")]
        replies = [c for c in comments if c.get("parent_id")]

        for c in top_level:
            c["replies"] = [r for r in replies if r["parent_id"] == c["id"]]

        return top_level
    finally:
        conn.close()


def get_comment_count(scenario_id: str) -> int:
    """Get total comment count for a scenario."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM comments WHERE scenario_id = ?",
            (scenario_id,)
        ).fetchone()
        return row["cnt"] if row else 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Engagement Score
# ---------------------------------------------------------------------------

def calculate_engagement_score(scenario_id: str) -> float:
    """Calculate the engagement score for a scenario (X/Twitter-style weighting)."""
    conn = get_db()
    try:
        # Comments × 3
        comments = conn.execute(
            "SELECT COUNT(*) as cnt FROM comments WHERE scenario_id = ?",
            (scenario_id,)
        ).fetchone()["cnt"]

        # Forks × 2.5
        forks = conn.execute(
            "SELECT forks FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        fork_count = forks["forks"] if forks else 0

        # Likes × 1
        likes = conn.execute(
            "SELECT likes FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        like_count = likes["likes"] if likes else 0

        # Views × 0.01
        views = conn.execute(
            "SELECT views FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        view_count = views["views"] if views else 0

        # Shares × 2
        shares = conn.execute(
            "SELECT COUNT(*) as cnt FROM shares WHERE scenario_id = ?",
            (scenario_id,)
        ).fetchone()["cnt"]

        # Recency decay
        scenario = conn.execute(
            "SELECT created_at FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        if scenario and scenario["created_at"]:
            try:
                created = datetime.fromisoformat(scenario["created_at"].replace("Z", "+00:00"))
                hours_old = (datetime.utcnow() - created.replace(tzinfo=None)).total_seconds() / 3600
            except:
                hours_old = 24
        else:
            hours_old = 24

        if hours_old < 1:
            decay = 1.5
        elif hours_old < 6:
            decay = 1.2
        elif hours_old < 24:
            decay = 1.0
        elif hours_old < 72:
            decay = 0.7
        else:
            decay = 0.5 ** (hours_old / 168)

        score = (
            comments * 3.0
            + fork_count * 2.5
            + shares * 2.0
            + like_count * 1.0
            + view_count * 0.01
        ) * decay

        return round(score, 2)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Shares
# ---------------------------------------------------------------------------

def record_share(
    scenario_id: str,
    platform: str,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> bool:
    """Record a share event."""
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO shares (scenario_id, user_id, session_id, platform)
            VALUES (?, ?, ?, ?)
        """, (scenario_id, user_id, session_id, platform))

        # Award points
        if user_id:
            award_points(user_id, "shared", 10, scenario_id, conn)

        conn.commit()
        return True
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Follow system
# ---------------------------------------------------------------------------

def follow_user(follower_id: str, following_id: str) -> bool:
    """Follow a user."""
    if follower_id == following_id:
        return False
    conn = get_db()
    try:
        conn.execute("""
            INSERT OR IGNORE INTO follows (follower_id, following_id)
            VALUES (?, ?)
        """, (follower_id, following_id))
        conn.commit()
        return True
    finally:
        conn.close()


def unfollow_user(follower_id: str, following_id: str) -> bool:
    """Unfollow a user."""
    conn = get_db()
    try:
        conn.execute(
            "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
            (follower_id, following_id)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def get_follower_count(user_id: str) -> int:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM follows WHERE following_id = ?",
            (user_id,)
        ).fetchone()
        return row["cnt"] if row else 0
    finally:
        conn.close()


def get_following_count(user_id: str) -> int:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM follows WHERE follower_id = ?",
            (user_id,)
        ).fetchone()
        return row["cnt"] if row else 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Points
# ---------------------------------------------------------------------------

DAILY_CAPS = {
    "run_simulation": 20,
    "posted_comment": 20,
    "forked_scenario": 10,
    "shared": 30,
}


def award_points(
    user_id: str,
    action: str,
    points: int,
    reference_id: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> bool:
    """Award points to a user. Respects daily caps."""
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True

    try:
        # Check daily cap
        if action in DAILY_CAPS:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0).isoformat()
            row = conn.execute("""
                SELECT COALESCE(SUM(points), 0) as today_total
                FROM points_ledger
                WHERE user_id = ? AND action = ? AND created_at >= ?
            """, (user_id, action, today_start)).fetchone()
            if row and row["today_total"] >= DAILY_CAPS[action]:
                return False  # Cap reached

        conn.execute("""
            INSERT INTO points_ledger (user_id, action, points, reference_id)
            VALUES (?, ?, ?, ?)
        """, (user_id, action, points, reference_id))

        # Update user total
        conn.execute(
            "UPDATE users SET points = points + ? WHERE id = ?",
            (points, user_id)
        )

        if should_close:
            conn.commit()
        return True
    finally:
        if should_close:
            conn.close()


def get_user_points(user_id: str) -> int:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COALESCE(SUM(points), 0) as total FROM points_ledger WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        return row["total"] if row else 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def add_notification(
    user_id: str,
    type: str,
    message: str,
    reference_id: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> bool:
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True
    try:
        conn.execute("""
            INSERT INTO notifications (user_id, type, message, reference_id)
            VALUES (?, ?, ?, ?)
        """, (user_id, type, message, reference_id))
        if should_close:
            conn.commit()
        return True
    finally:
        if should_close:
            conn.close()


def get_notifications(user_id: str, unread_only: bool = False, limit: int = 20) -> List[Dict]:
    conn = get_db()
    try:
        if unread_only:
            rows = conn.execute("""
                SELECT * FROM notifications
                WHERE user_id = ? AND is_read = 0
                ORDER BY created_at DESC LIMIT ?
            """, (user_id, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT * FROM notifications
                WHERE user_id = ?
                ORDER BY created_at DESC LIMIT ?
            """, (user_id, limit)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def mark_notifications_read(user_id: str) -> bool:
    conn = get_db()
    try:
        conn.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
            (user_id,)
        )
        conn.commit()
        return True
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------

def get_leaderboard(
    period: str = "all_time",
    ticker: Optional[str] = None,
    limit: int = 50,
) -> List[Dict]:
    """Get leaderboard ranked by engagement score."""
    conn = get_db()
    try:
        # Time filter
        time_filter = ""
        if period == "week":
            time_filter = "AND s.created_at > datetime('now', '-7 days')"
        elif period == "month":
            time_filter = "AND s.created_at > datetime('now', '-30 days')"

        ticker_filter = ""
        if ticker:
            ticker_filter = f"AND s.ticker = '{ticker.upper()}'"

        rows = conn.execute(f"""
            SELECT 
                s.author_id,
                COALESCE(s.author_name, 'Anonymous') as author_name,
                COUNT(DISTINCT s.id) as scenario_count,
                COALESCE(SUM(s.views), 0) as total_views,
                COALESCE(SUM(s.likes), 0) as total_likes,
                COALESCE(SUM(s.forks), 0) as total_forks,
                COALESCE(SUM(
                    (SELECT COUNT(*) FROM comments c WHERE c.scenario_id = s.id) * 3.0
                    + s.forks * 2.5
                    + (SELECT COUNT(*) FROM shares sh WHERE sh.scenario_id = s.id) * 2.0
                    + s.likes * 1.0
                    + s.views * 0.01
                ), 0) as engagement_score,
                u.points,
                u.streak_days,
                u.avatar_url
            FROM scenarios s
            LEFT JOIN users u ON s.author_id = u.id
            WHERE s.is_public = 1
                AND s.author_id IS NOT NULL
                {time_filter}
                {ticker_filter}
            GROUP BY s.author_id
            ORDER BY engagement_score DESC
            LIMIT ?
        """, (limit,)).fetchall()

        return [
            {
                "rank": i + 1,
                "user_id": r["author_id"],
                "author_name": r["author_name"],
                "scenario_count": r["scenario_count"],
                "total_views": r["total_views"],
                "total_likes": r["total_likes"],
                "total_forks": r["total_forks"],
                "engagement_score": round(r["engagement_score"], 1),
                "points": r["points"] or 0,
                "streak_days": r["streak_days"] or 0,
                "avatar_url": r["avatar_url"],
            }
            for i, r in enumerate(rows)
        ]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------

def get_feed(
    feed_type: str = "trending",
    user_id: Optional[str] = None,
    ticker: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[Dict]:
    """Get scenario feed sorted by type."""
    conn = get_db()
    try:
        if feed_type == "following" and user_id:
            # Only from followed users
            rows = conn.execute("""
                SELECT s.*, 
                    (SELECT COUNT(*) FROM comments c WHERE c.scenario_id = s.id) as comment_count,
                    (SELECT COUNT(*) FROM shares sh WHERE sh.scenario_id = s.id) as share_count
                FROM scenarios s
                WHERE s.is_public = 1
                    AND s.author_id IN (
                        SELECT following_id FROM follows WHERE follower_id = ?
                    )
                ORDER BY s.created_at DESC
                LIMIT ? OFFSET ?
            """, (user_id, limit, offset)).fetchall()
        elif feed_type == "trending":
            # Highest engagement velocity (engagement / hours)
            rows = conn.execute("""
                SELECT s.*,
                    (SELECT COUNT(*) FROM comments c WHERE c.scenario_id = s.id) as comment_count,
                    (SELECT COUNT(*) FROM shares sh WHERE sh.scenario_id = s.id) as share_count,
                    (
                        (SELECT COUNT(*) FROM comments c WHERE c.scenario_id = s.id) * 3.0
                        + s.forks * 2.5
                        + (SELECT COUNT(*) FROM shares sh WHERE sh.scenario_id = s.id) * 2.0
                        + s.likes * 1.0
                        + s.views * 0.01
                    ) / MAX(1.0, (julianday('now') - julianday(s.created_at)) * 24) as velocity
                FROM scenarios s
                WHERE s.is_public = 1
                    AND s.created_at > datetime('now', '-7 days')
                ORDER BY velocity DESC
                LIMIT ? OFFSET ?
            """, (limit, offset)).fetchall()
        elif feed_type == "new":
            rows = conn.execute("""
                SELECT s.*,
                    (SELECT COUNT(*) FROM comments c WHERE c.scenario_id = s.id) as comment_count,
                    (SELECT COUNT(*) FROM shares sh WHERE sh.scenario_id = s.id) as share_count
                FROM scenarios s
                WHERE s.is_public = 1
                ORDER BY s.created_at DESC
                LIMIT ? OFFSET ?
            """, (limit, offset)).fetchall()
        else:
            # Default: all, sorted by engagement
            rows = conn.execute("""
                SELECT s.*,
                    (SELECT COUNT(*) FROM comments c WHERE c.scenario_id = s.id) as comment_count,
                    (SELECT COUNT(*) FROM shares sh WHERE sh.scenario_id = s.id) as share_count
                FROM scenarios s
                WHERE s.is_public = 1
                ORDER BY (s.views * 0.01 + s.likes + s.forks * 2.5) DESC
                LIMIT ? OFFSET ?
            """, (limit, offset)).fetchall()

        return [dict(r) for r in rows]
    finally:
        conn.close()


# Initialize on import
init_social_db()
