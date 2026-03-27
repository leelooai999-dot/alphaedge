"""
MonteCarloo Badge System

Badges are earned (not bought). They appear on profiles and boost credibility.
Called periodically (nightly build) or when relevant actions occur.
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime
from db import get_db

logger = logging.getLogger(__name__)

# Badge definitions
BADGES = {
    "oracle": {
        "name": "🎯 Oracle",
        "description": "85%+ average accuracy over 10+ scenarios",
        "criteria": {"min_accuracy": 85, "min_scenarios": 10},
        "credibility_multiplier": 1.5,
    },
    "sharp": {
        "name": "🔮 Sharp Predictor",
        "description": "70%+ average accuracy over 5+ scenarios",
        "criteria": {"min_accuracy": 70, "min_scenarios": 5},
        "credibility_multiplier": 1.2,
    },
    "trending": {
        "name": "🔥 Trending Creator",
        "description": "3+ scenarios hit Trending in 30 days",
        "criteria": {"trending_count": 3, "days": 30},
        "credibility_multiplier": 1.1,
    },
    "wave_maker": {
        "name": "🌊 Wave Maker",
        "description": "A single scenario got 100+ comments",
        "criteria": {"min_comments": 100},
        "credibility_multiplier": 1.1,
    },
    "most_forked": {
        "name": "🍴 Most Forked",
        "description": "A single scenario got 50+ forks",
        "criteria": {"min_forks": 50},
        "credibility_multiplier": 1.1,
    },
    "influencer": {
        "name": "📢 Influencer",
        "description": "Referred 10+ users who signed up",
        "criteria": {"min_referrals": 10},
        "credibility_multiplier": 1.0,
    },
    "streak_30": {
        "name": "🗓️ 30-Day Streak",
        "description": "Active 30 consecutive days",
        "criteria": {"streak_days": 30},
        "credibility_multiplier": 1.0,
    },
    "top_10": {
        "name": "🏆 Top 10",
        "description": "Ranked Top 10 in any given week",
        "criteria": {"top_rank": 10},
        "credibility_multiplier": 1.15,
    },
    "founding_member": {
        "name": "🏛️ Founding Member",
        "description": "Among the first 1000 registered users",
        "criteria": {"max_user_number": 1000},
        "credibility_multiplier": 1.05,
    },
}


def check_and_award_badges(user_id: str) -> List[str]:
    """Check all badge criteria for a user and award any newly earned badges."""
    conn = get_db()
    newly_awarded = []
    
    try:
        # Get existing badges
        existing = set(
            r["badge_key"] for r in conn.execute(
                "SELECT badge_key FROM user_badges WHERE user_id = ?", (user_id,)
            ).fetchall()
        )
        
        # Check each badge
        for badge_key, badge in BADGES.items():
            if badge_key in existing:
                continue  # Already earned
            
            criteria = badge["criteria"]
            earned = False
            
            if badge_key == "oracle" or badge_key == "sharp":
                # Check accuracy
                rows = conn.execute("""
                    SELECT accuracy_score FROM accuracy_tracking
                    WHERE user_id = ? AND status = 'scored'
                """, (user_id,)).fetchall()
                if len(rows) >= criteria.get("min_scenarios", 5):
                    avg = sum(r["accuracy_score"] for r in rows) / len(rows)
                    earned = avg >= criteria["min_accuracy"]
            
            elif badge_key == "wave_maker":
                row = conn.execute("""
                    SELECT MAX(cnt) as max_comments FROM (
                        SELECT COUNT(*) as cnt FROM comments
                        WHERE scenario_id IN (SELECT id FROM scenarios WHERE author_id = ?)
                        GROUP BY scenario_id
                    )
                """, (user_id,)).fetchone()
                earned = (row and row["max_comments"] and row["max_comments"] >= criteria["min_comments"])
            
            elif badge_key == "most_forked":
                row = conn.execute("""
                    SELECT MAX(forks) as max_forks FROM scenarios WHERE author_id = ?
                """, (user_id,)).fetchone()
                earned = (row and row["max_forks"] and row["max_forks"] >= criteria["min_forks"])
            
            elif badge_key == "influencer":
                row = conn.execute("""
                    SELECT COUNT(*) as ref_count FROM points_ledger
                    WHERE user_id = ? AND action = 'referral'
                """, (user_id,)).fetchone()
                earned = (row and row["ref_count"] >= criteria["min_referrals"])
            
            elif badge_key == "streak_30":
                user = conn.execute(
                    "SELECT streak_days FROM users WHERE id = ?", (user_id,)
                ).fetchone()
                earned = (user and user["streak_days"] >= criteria["streak_days"])
            
            elif badge_key == "founding_member":
                user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                earned = user_count <= criteria["max_user_number"]
            
            if earned:
                try:
                    conn.execute("""
                        INSERT INTO user_badges (user_id, badge_key) VALUES (?, ?)
                    """, (user_id, badge_key))
                    newly_awarded.append(badge_key)
                    logger.info(f"Badge awarded: {badge_key} to {user_id}")
                except Exception:
                    pass  # Already exists (race condition)
        
        if newly_awarded:
            conn.commit()
            
            # Create notifications for new badges
            for bk in newly_awarded:
                try:
                    conn.execute("""
                        INSERT INTO notifications (user_id, type, message, reference_id)
                        VALUES (?, 'badge', ?, ?)
                    """, (user_id, f"You earned the {BADGES[bk]['name']} badge!", bk))
                    conn.commit()
                except Exception:
                    pass
    
    except Exception as e:
        logger.warning(f"Badge check failed for {user_id}: {e}")
    finally:
        conn.close()
    
    return newly_awarded


def get_user_badges(user_id: str) -> List[Dict]:
    """Get all badges for a user."""
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT badge_key, earned_at FROM user_badges WHERE user_id = ?
            ORDER BY earned_at DESC
        """, (user_id,)).fetchall()
        
        result = []
        for row in rows:
            badge_def = BADGES.get(row["badge_key"], {})
            result.append({
                "key": row["badge_key"],
                "name": badge_def.get("name", row["badge_key"]),
                "description": badge_def.get("description", ""),
                "earned_at": row["earned_at"],
            })
        return result
    finally:
        conn.close()


def get_credibility_multiplier(user_id: str) -> float:
    """Get the combined credibility multiplier for a user based on badges."""
    badges = get_user_badges(user_id)
    multiplier = 1.0
    for badge in badges:
        badge_def = BADGES.get(badge["key"], {})
        multiplier = max(multiplier, badge_def.get("credibility_multiplier", 1.0))
    return multiplier


# Ensure badges table exists
def init_badges_table():
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS user_badges (
                user_id TEXT NOT NULL,
                badge_key TEXT NOT NULL,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, badge_key)
            );
            CREATE INDEX IF NOT EXISTS idx_badges_user ON user_badges(user_id);
        """)
        conn.commit()
    finally:
        conn.close()

init_badges_table()
