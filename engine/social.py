"""
MonteCarloo Social Layer — Comments, Likes, Forks, Follows, Points, Leaderboard.

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
# Anti-gaming / Rate Limiting
# ---------------------------------------------------------------------------

# In-memory rate limit cache (resets on server restart — fine for MVP)
_rate_cache: Dict[str, List[float]] = {}

def _check_rate_limit(key: str, max_per_minute: int = 5, max_per_hour: int = 30) -> bool:
    """Returns True if action is allowed, False if rate-limited."""
    now = datetime.utcnow().timestamp()
    if key not in _rate_cache:
        _rate_cache[key] = []
    
    # Clean old entries (older than 1 hour)
    _rate_cache[key] = [t for t in _rate_cache[key] if now - t < 3600]
    
    # Check per-minute
    recent_minute = sum(1 for t in _rate_cache[key] if now - t < 60)
    if recent_minute >= max_per_minute:
        logger.warning(f"Rate limited (per-min): {key}")
        return False
    
    # Check per-hour
    if len(_rate_cache[key]) >= max_per_hour:
        logger.warning(f"Rate limited (per-hour): {key}")
        return False
    
    _rate_cache[key].append(now)
    return True


def _is_spam_content(content: str) -> bool:
    """Basic spam detection for comments."""
    if len(content) < 2:
        return True
    if len(content) > 5000:
        return True
    # Repetitive characters
    if len(set(content.lower())) < 3:
        return True
    # All caps over 50 chars
    if len(content) > 50 and content == content.upper():
        return True
    return False


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
    # Anti-gaming checks
    rate_key = f"comment:{user_id or author_name}"
    if not _check_rate_limit(rate_key, max_per_minute=5, max_per_hour=50):
        raise ValueError("Too many comments — please slow down")
    if _is_spam_content(content):
        raise ValueError("Comment flagged as spam")
    
    conn = get_db()
    try:
        comment_id = secrets.token_urlsafe(12)
        conn.execute("""
            INSERT INTO comments (id, scenario_id, user_id, author_name, content, parent_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (comment_id, scenario_id, user_id, author_name, content, parent_id))

        # Award points to scenario author (if not self-comment)
        scenario = conn.execute(
            "SELECT author_id, author_name FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        is_self_comment = (
            scenario and scenario["author_id"] and scenario["author_id"] == user_id
        ) or (
            scenario and scenario["author_name"] == author_name and not user_id
        )
        
        if scenario and scenario["author_id"] and not is_self_comment:
            award_points(scenario["author_id"], "received_comment", 3, comment_id, conn)
            # Notify scenario author
            add_notification(
                scenario["author_id"],
                "comment",
                f"{author_name} commented on your scenario",
                scenario_id,
                conn,
            )

        # Award points to commenter (reduced for self-comments)
        if user_id:
            pts = 1 if is_self_comment else 2  # Self-comments earn less
            award_points(user_id, "posted_comment", pts, comment_id, conn)

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
    "save_scenario": 50,
    "posted_comment": 20,
    "forked_scenario": 10,
    "shared": 30,
    "received_like": 100,
    "received_comment": 100,
    "received_fork": 50,
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


def mark_single_notification_read(notif_id: int) -> bool:
    conn = get_db()
    try:
        conn.execute(
            "UPDATE notifications SET is_read = 1 WHERE id = ?",
            (notif_id,)
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

        # Use try/except for is_public which may not exist in older DB schemas
        try:
            rows = conn.execute(f"""
                SELECT 
                    s.author_id,
                    COALESCE(s.author_name, 'Anonymous') as author_name,
                    COUNT(DISTINCT s.id) as scenario_count,
                    COALESCE(SUM(s.views), 0) as total_views,
                    COALESCE(SUM(s.likes), 0) as total_likes,
                    COALESCE(SUM(s.forks), 0) as total_forks,
                    COALESCE(SUM(
                        s.forks * 2.5
                        + s.likes * 1.0
                        + s.views * 0.01
                    ), 0) as engagement_score,
                    0 as points,
                    0 as streak_days,
                    NULL as avatar_url
                FROM scenarios s
                WHERE 1=1
                    {time_filter}
                    {ticker_filter}
                GROUP BY COALESCE(s.author_id, s.author_name)
                HAVING engagement_score > 0
                ORDER BY engagement_score DESC
                LIMIT ?
            """, (limit,)).fetchall()
        except Exception as e:
            logger.warning(f"Leaderboard query failed: {e}")
            rows = []

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
                WHERE 1=1
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
                WHERE 1=1
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
                WHERE 1=1
                ORDER BY s.created_at DESC
                LIMIT ? OFFSET ?
            """, (limit, offset)).fetchall()
        elif feed_type == "for_you" and user_id:
            # Personalized: boost tickers/events the user has interacted with
            # 1. Find user's ticker interests (from their scenarios + likes)
            user_tickers = conn.execute("""
                SELECT ticker, COUNT(*) as cnt FROM (
                    SELECT ticker FROM scenarios WHERE author_id = ?
                    UNION ALL
                    SELECT s.ticker FROM scenario_likes sl 
                    JOIN scenarios s ON sl.scenario_id = s.id 
                    WHERE sl.session_id = ?
                ) GROUP BY ticker ORDER BY cnt DESC LIMIT 10
            """, (user_id, user_id)).fetchall()
            
            ticker_boost = {r["ticker"]: min(r["cnt"] * 0.3, 2.0) for r in user_tickers}
            
            # 2. Get candidates (recent + engaging)
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
                    ) as base_score,
                    CASE WHEN s.author_id IN (
                        SELECT following_id FROM follows WHERE follower_id = ?
                    ) THEN 1.3 ELSE 1.0 END as follow_boost
                FROM scenarios s
                WHERE 1=1
                ORDER BY base_score DESC
                LIMIT 100
            """, (user_id,)).fetchall()
            
            # 3. Re-rank with personalization
            scored = []
            seen_tickers: Dict[str, int] = {}
            for r in rows:
                d = dict(r)
                score = d.get("base_score", 0) * d.get("follow_boost", 1.0)
                # Ticker affinity
                score *= (1 + ticker_boost.get(d["ticker"], 0))
                # Diversity penalty (don't show 5 of same ticker)
                seen_tickers[d["ticker"]] = seen_tickers.get(d["ticker"], 0) + 1
                if seen_tickers[d["ticker"]] > 2:
                    score *= 0.5
                d["_score"] = score
                scored.append(d)
            
            scored.sort(key=lambda x: x.get("_score", 0), reverse=True)
            rows = scored[offset:offset + limit]
            # Clean up internal fields
            for r in rows:
                r.pop("_score", None)
                r.pop("base_score", None)
                r.pop("follow_boost", None)
            return rows
        
        else:
            # Default: all, sorted by engagement
            rows = conn.execute("""
                SELECT s.*,
                    (SELECT COUNT(*) FROM comments c WHERE c.scenario_id = s.id) as comment_count,
                    (SELECT COUNT(*) FROM shares sh WHERE sh.scenario_id = s.id) as share_count
                FROM scenarios s
                WHERE 1=1
                ORDER BY (s.views * 0.01 + s.likes + s.forks * 2.5) DESC
                LIMIT ? OFFSET ?
            """, (limit, offset)).fetchall()

        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Weekly Recap
# ---------------------------------------------------------------------------

def generate_weekly_recaps():
    """Generate weekly recap notifications for all active users.
    Call this weekly (e.g., Sunday night cron job)."""
    conn = get_db()
    recaps_sent = 0
    try:
        # Get all users who had scenario activity in the past 7 days
        users = conn.execute("""
            SELECT DISTINCT s.author_id, s.author_name,
                COALESCE(SUM(s.views), 0) as week_views,
                COALESCE(SUM(s.likes), 0) as week_likes,
                COALESCE(SUM(s.forks), 0) as week_forks,
                COUNT(*) as scenario_count
            FROM scenarios s
            WHERE s.author_id IS NOT NULL
                AND s.created_at > datetime('now', '-7 days')
            GROUP BY s.author_id
        """).fetchall()
        
        for user in users:
            views = user["week_views"]
            likes = user["week_likes"]
            forks = user["week_forks"]
            
            if views + likes + forks == 0:
                continue
            
            message = f"📊 Your weekly recap: {views:,} views, {likes} likes, {forks} forks on {user['scenario_count']} scenarios this week!"
            
            try:
                add_notification(user["author_id"], "weekly_recap", message, None, conn)
                recaps_sent += 1
            except Exception:
                pass
        
        conn.commit()
        logger.info(f"Weekly recaps sent: {recaps_sent}")
    except Exception as e:
        logger.warning(f"Weekly recap generation failed: {e}")
    finally:
        conn.close()
    
    return recaps_sent


# Initialize on import
init_social_db()
