"""
MonteCarloo — Debate Arena Game Engine

Gamified character debate system:
1. "Stock Market of Ideas" — bet points on character positions
2. "Draft Your Team" — build an advisory board of characters
3. Accuracy tracking — 30-day scoring against real prices
4. Streaks, badges, XP progression

Tables: debate_bets, debate_teams, debate_scores, debate_xp
"""

import json
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from db import get_db

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database Schema
# ---------------------------------------------------------------------------

def init_debate_game_db():
    """Create debate game tables."""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS debate_bets (
                id TEXT PRIMARY KEY,
                debate_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                character_name TEXT NOT NULL,
                side TEXT NOT NULL DEFAULT 'bullish',
                points_wagered INTEGER NOT NULL DEFAULT 10,
                odds_at_bet REAL DEFAULT 1.0,
                ticker TEXT NOT NULL,
                target_price REAL,
                actual_price REAL,
                resolved INTEGER DEFAULT 0,
                won INTEGER DEFAULT 0,
                points_won INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS debate_teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                character_name TEXT NOT NULL,
                character_emoji TEXT DEFAULT '🧑',
                slot_position INTEGER DEFAULT 0,
                drafted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, character_id)
            );

            CREATE TABLE IF NOT EXISTS debate_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                debate_id TEXT NOT NULL,
                ticker TEXT NOT NULL,
                predicted_direction TEXT,
                actual_direction TEXT,
                accuracy_pct REAL DEFAULT 0,
                points_earned INTEGER DEFAULT 0,
                scored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS debate_xp (
                user_id TEXT PRIMARY KEY,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                win_streak INTEGER DEFAULT 0,
                max_streak INTEGER DEFAULT 0,
                total_bets INTEGER DEFAULT 0,
                total_wins INTEGER DEFAULT 0,
                total_points_wagered INTEGER DEFAULT 0,
                total_points_won INTEGER DEFAULT 0,
                team_score REAL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS debate_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                debate_id TEXT NOT NULL,
                reaction_index INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                reaction_type TEXT NOT NULL DEFAULT 'fire',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(debate_id, reaction_index, user_id)
            );

            CREATE TABLE IF NOT EXISTS character_elo (
                character_id TEXT PRIMARY KEY,
                elo_rating REAL DEFAULT 1200,
                total_predictions INTEGER DEFAULT 0,
                correct_predictions INTEGER DEFAULT 0,
                avg_accuracy REAL DEFAULT 0,
                win_rate REAL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_bets_debate ON debate_bets(debate_id);
            CREATE INDEX IF NOT EXISTS idx_bets_user ON debate_bets(user_id);
            CREATE INDEX IF NOT EXISTS idx_bets_unresolved ON debate_bets(resolved);
            CREATE INDEX IF NOT EXISTS idx_teams_user ON debate_teams(user_id);
            CREATE INDEX IF NOT EXISTS idx_scores_user ON debate_scores(user_id);
            CREATE INDEX IF NOT EXISTS idx_reactions_debate ON debate_reactions(debate_id);
        """)
        conn.commit()
        logger.info("Debate game tables initialized")
    except Exception as e:
        logger.warning(f"Debate game table init: {e}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# XP & Leveling
# ---------------------------------------------------------------------------

LEVEL_THRESHOLDS = [
    0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500,
    7500, 10000, 13000, 17000, 22000, 28000, 35000, 45000, 60000, 80000
]

LEVEL_TITLES = [
    "Intern", "Analyst I", "Analyst II", "Associate", "VP",
    "Senior VP", "Director", "Managing Director", "Partner", "Senior Partner",
    "Fund Manager", "Portfolio Manager", "Chief Strategist", "CIO",
    "Hedge Fund Boss", "Market Wizard", "Oracle", "Legend", "GOAT", "Ascended"
]

def _get_level(xp: int) -> tuple:
    """Return (level, title, xp_for_next, progress_pct)."""
    level = 1
    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
        else:
            break
    
    title = LEVEL_TITLES[min(level - 1, len(LEVEL_TITLES) - 1)]
    next_threshold = LEVEL_THRESHOLDS[min(level, len(LEVEL_THRESHOLDS) - 1)]
    current_threshold = LEVEL_THRESHOLDS[min(level - 1, len(LEVEL_THRESHOLDS) - 1)]
    
    if next_threshold > current_threshold:
        progress = (xp - current_threshold) / (next_threshold - current_threshold)
    else:
        progress = 1.0
    
    return level, title, next_threshold, round(progress * 100)


def _ensure_xp_row(conn, user_id: str):
    """Create XP row if it doesn't exist."""
    conn.execute(
        "INSERT OR IGNORE INTO debate_xp (user_id) VALUES (?)",
        (user_id,)
    )


def award_xp(user_id: str, amount: int, reason: str = "") -> Dict[str, Any]:
    """Award XP and return updated stats."""
    conn = get_db()
    try:
        _ensure_xp_row(conn, user_id)
        conn.execute(
            "UPDATE debate_xp SET xp = xp + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (amount, user_id)
        )
        conn.commit()
        
        row = conn.execute("SELECT xp FROM debate_xp WHERE user_id = ?", (user_id,)).fetchone()
        xp = row[0] if row else 0
        level, title, next_xp, progress = _get_level(xp)
        
        # Update level in DB
        conn.execute("UPDATE debate_xp SET level = ? WHERE user_id = ?", (level, user_id))
        conn.commit()
        
        return {
            "xp": xp,
            "xp_gained": amount,
            "level": level,
            "title": title,
            "next_level_xp": next_xp,
            "progress_pct": progress,
            "reason": reason,
        }
    finally:
        conn.close()


def get_xp_stats(user_id: str) -> Dict[str, Any]:
    """Get user's XP and game stats."""
    conn = get_db()
    try:
        _ensure_xp_row(conn, user_id)
        conn.commit()
        row = conn.execute(
            "SELECT xp, level, win_streak, max_streak, total_bets, total_wins, "
            "total_points_wagered, total_points_won, team_score FROM debate_xp WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        
        if not row:
            return {"xp": 0, "level": 1, "title": "Intern", "progress_pct": 0}
        
        xp = row[0]
        level, title, next_xp, progress = _get_level(xp)
        
        win_rate = (row[5] / row[4] * 100) if row[4] > 0 else 0
        
        return {
            "xp": xp,
            "level": level,
            "title": title,
            "next_level_xp": next_xp,
            "progress_pct": progress,
            "win_streak": row[2],
            "max_streak": row[3],
            "total_bets": row[4],
            "total_wins": row[5],
            "win_rate": round(win_rate, 1),
            "total_points_wagered": row[6],
            "total_points_won": row[7],
            "team_score": row[8],
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Betting — "Stock Market of Ideas"
# ---------------------------------------------------------------------------

def place_bet(
    user_id: str,
    debate_id: str,
    character_id: str,
    character_name: str,
    side: str,  # "bullish" or "bearish"
    points_wagered: int,
    ticker: str,
    target_price: float = 0,
    odds: float = 1.0,
) -> Dict[str, Any]:
    """Place a bet on a character's position."""
    if points_wagered < 1:
        return {"error": "Minimum bet is 1 point"}
    if points_wagered > 500:
        return {"error": "Maximum bet is 500 points"}
    
    bet_id = secrets.token_hex(8)
    conn = get_db()
    try:
        _ensure_xp_row(conn, user_id)
        
        # Check existing bets on this debate
        existing = conn.execute(
            "SELECT COUNT(*) FROM debate_bets WHERE debate_id = ? AND user_id = ?",
            (debate_id, user_id)
        ).fetchone()[0]
        
        if existing >= 5:
            return {"error": "Max 5 bets per debate"}
        
        conn.execute(
            """INSERT INTO debate_bets 
               (id, debate_id, user_id, character_id, character_name, side, 
                points_wagered, odds_at_bet, ticker, target_price) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (bet_id, debate_id, user_id, character_id, character_name,
             side, points_wagered, odds, ticker, target_price)
        )
        
        # Update total wagered
        conn.execute(
            "UPDATE debate_xp SET total_bets = total_bets + 1, "
            "total_points_wagered = total_points_wagered + ? WHERE user_id = ?",
            (points_wagered, user_id)
        )
        conn.commit()
        
        # Award XP for placing bet
        xp_result = award_xp(user_id, 5, "placed_bet")
        
        return {
            "bet_id": bet_id,
            "character": character_name,
            "side": side,
            "points_wagered": points_wagered,
            "odds": odds,
            "potential_win": int(points_wagered * odds * 2),
            "xp": xp_result,
        }
    finally:
        conn.close()


def get_debate_bets(debate_id: str) -> Dict[str, Any]:
    """Get all bets for a debate with aggregated odds."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT character_id, character_name, side, SUM(points_wagered) as total_wagered, COUNT(*) as num_bets "
            "FROM debate_bets WHERE debate_id = ? GROUP BY character_id, side",
            (debate_id,)
        ).fetchall()
        
        pool = {}
        total_pool = 0
        for row in rows:
            char_id = row[0]
            side = row[2]
            wagered = row[3]
            total_pool += wagered
            
            if char_id not in pool:
                pool[char_id] = {
                    "character_id": char_id,
                    "character_name": row[1],
                    "bullish_pool": 0,
                    "bearish_pool": 0,
                    "bullish_bets": 0,
                    "bearish_bets": 0,
                }
            
            if side == "bullish":
                pool[char_id]["bullish_pool"] = wagered
                pool[char_id]["bullish_bets"] = row[4]
            else:
                pool[char_id]["bearish_pool"] = wagered
                pool[char_id]["bearish_bets"] = row[4]
        
        # Calculate live odds for each position
        for char in pool.values():
            total = char["bullish_pool"] + char["bearish_pool"]
            if total > 0:
                char["bullish_odds"] = round(total / max(char["bullish_pool"], 1), 2)
                char["bearish_odds"] = round(total / max(char["bearish_pool"], 1), 2)
            else:
                char["bullish_odds"] = 2.0
                char["bearish_odds"] = 2.0
        
        return {
            "debate_id": debate_id,
            "total_pool": total_pool,
            "positions": list(pool.values()),
        }
    finally:
        conn.close()


def get_user_bets(user_id: str, resolved: Optional[bool] = None) -> List[Dict]:
    """Get user's betting history."""
    conn = get_db()
    try:
        query = "SELECT * FROM debate_bets WHERE user_id = ?"
        params = [user_id]
        if resolved is not None:
            query += " AND resolved = ?"
            params.append(1 if resolved else 0)
        query += " ORDER BY created_at DESC LIMIT 50"
        
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Team Draft — "Advisory Board"
# ---------------------------------------------------------------------------

MAX_TEAM_SIZE = 5

def draft_character(user_id: str, character_id: str, character_name: str, emoji: str = "🧑") -> Dict[str, Any]:
    """Add a character to user's advisory board."""
    conn = get_db()
    try:
        # Check team size
        count = conn.execute(
            "SELECT COUNT(*) FROM debate_teams WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        
        if count >= MAX_TEAM_SIZE:
            return {"error": f"Team full! Max {MAX_TEAM_SIZE} advisors. Drop one first."}
        
        # Check if already drafted
        existing = conn.execute(
            "SELECT 1 FROM debate_teams WHERE user_id = ? AND character_id = ?",
            (user_id, character_id)
        ).fetchone()
        
        if existing:
            return {"error": f"{character_name} is already on your team"}
        
        conn.execute(
            "INSERT INTO debate_teams (user_id, character_id, character_name, character_emoji, slot_position) VALUES (?, ?, ?, ?, ?)",
            (user_id, character_id, character_name, emoji, count)
        )
        conn.commit()
        
        # Award XP for building team
        xp_result = award_xp(user_id, 10, "drafted_character")
        
        return {
            "success": True,
            "character": character_name,
            "team_size": count + 1,
            "max_size": MAX_TEAM_SIZE,
            "xp": xp_result,
        }
    finally:
        conn.close()


def drop_character(user_id: str, character_id: str) -> Dict[str, Any]:
    """Remove a character from user's team."""
    conn = get_db()
    try:
        conn.execute(
            "DELETE FROM debate_teams WHERE user_id = ? AND character_id = ?",
            (user_id, character_id)
        )
        conn.commit()
        return {"success": True, "dropped": character_id}
    finally:
        conn.close()


def get_team(user_id: str) -> Dict[str, Any]:
    """Get user's advisory board."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT character_id, character_name, character_emoji, slot_position "
            "FROM debate_teams WHERE user_id = ? ORDER BY slot_position",
            (user_id,)
        ).fetchall()
        
        team = [
            {
                "character_id": row[0],
                "character_name": row[1],
                "emoji": row[2],
                "slot": row[3],
            }
            for row in rows
        ]
        
        return {
            "team": team,
            "size": len(team),
            "max_size": MAX_TEAM_SIZE,
            "slots_remaining": MAX_TEAM_SIZE - len(team),
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Reactions — emoji reactions on debate messages
# ---------------------------------------------------------------------------

REACTION_TYPES = {
    "fire": "🔥",
    "brain": "🧠",
    "cap": "🧢",  # cap = bullshit
    "money": "💰",
    "skull": "💀",
    "rocket": "🚀",
    "clown": "🤡",
    "100": "💯",
}

def add_reaction(
    debate_id: str,
    reaction_index: int,
    user_id: str,
    reaction_type: str = "fire"
) -> Dict[str, Any]:
    """Add a reaction to a specific debate message."""
    if reaction_type not in REACTION_TYPES:
        return {"error": f"Unknown reaction. Options: {list(REACTION_TYPES.keys())}"}
    
    conn = get_db()
    try:
        try:
            conn.execute(
                "INSERT INTO debate_reactions (debate_id, reaction_index, user_id, reaction_type) VALUES (?, ?, ?, ?)",
                (debate_id, reaction_index, user_id, reaction_type)
            )
            conn.commit()
        except Exception:
            # Already reacted — toggle off
            conn.execute(
                "DELETE FROM debate_reactions WHERE debate_id = ? AND reaction_index = ? AND user_id = ?",
                (debate_id, reaction_index, user_id)
            )
            conn.commit()
            return {"toggled_off": True, "reaction": reaction_type}
        
        # Award tiny XP for engagement
        award_xp(user_id, 1, "reaction")
        
        return {"success": True, "reaction": reaction_type, "emoji": REACTION_TYPES[reaction_type]}
    finally:
        conn.close()


def get_reactions(debate_id: str) -> Dict[int, Dict[str, int]]:
    """Get reaction counts per message index."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT reaction_index, reaction_type, COUNT(*) FROM debate_reactions "
            "WHERE debate_id = ? GROUP BY reaction_index, reaction_type",
            (debate_id,)
        ).fetchall()
        
        result = {}
        for row in rows:
            idx = row[0]
            rtype = row[1]
            count = row[2]
            if idx not in result:
                result[idx] = {}
            result[idx][rtype] = count
        
        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Character ELO Ratings
# ---------------------------------------------------------------------------

def update_character_elo(character_id: str, was_correct: bool, accuracy: float = 0):
    """Update a character's ELO rating based on prediction accuracy."""
    conn = get_db()
    try:
        # Ensure character row exists
        conn.execute(
            "INSERT OR IGNORE INTO character_elo (character_id) VALUES (?)",
            (character_id,)
        )
        
        K = 32  # Standard ELO K-factor
        expected = 0.5  # Baseline expectation
        actual = 1.0 if was_correct else 0.0
        elo_change = K * (actual - expected)
        
        conn.execute(
            """UPDATE character_elo SET 
                elo_rating = elo_rating + ?,
                total_predictions = total_predictions + 1,
                correct_predictions = correct_predictions + ?,
                avg_accuracy = (avg_accuracy * total_predictions + ?) / (total_predictions + 1),
                updated_at = CURRENT_TIMESTAMP
               WHERE character_id = ?""",
            (elo_change, 1 if was_correct else 0, accuracy, character_id)
        )
        conn.commit()
    finally:
        conn.close()


def get_character_rankings() -> List[Dict]:
    """Get character rankings by ELO."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT character_id, elo_rating, total_predictions, correct_predictions, avg_accuracy, win_rate "
            "FROM character_elo ORDER BY elo_rating DESC"
        ).fetchall()
        
        return [
            {
                "character_id": row[0],
                "elo": round(row[1]),
                "predictions": row[2],
                "correct": row[3],
                "accuracy": round(row[4], 1),
                "win_rate": round(row[5] if row[5] else 0, 1),
            }
            for row in rows
        ]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Game Leaderboard
# ---------------------------------------------------------------------------

def get_game_leaderboard(limit: int = 20) -> List[Dict]:
    """Get top players by XP."""
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT dx.user_id, dx.xp, dx.level, dx.win_streak, dx.max_streak,
                      dx.total_bets, dx.total_wins, dx.total_points_won,
                      COALESCE(a.username, 'Anonymous') as username
               FROM debate_xp dx
               LEFT JOIN auth a ON a.user_id = dx.user_id
               ORDER BY dx.xp DESC LIMIT ?""",
            (limit,)
        ).fetchall()
        
        leaderboard = []
        for i, row in enumerate(rows):
            xp = row[1]
            level, title, _, progress = _get_level(xp)
            win_rate = (row[6] / row[5] * 100) if row[5] > 0 else 0
            leaderboard.append({
                "rank": i + 1,
                "user_id": row[0],
                "username": row[8],
                "xp": xp,
                "level": level,
                "title": title,
                "win_streak": row[3],
                "max_streak": row[4],
                "total_bets": row[5],
                "wins": row[6],
                "win_rate": round(win_rate, 1),
                "total_won": row[7],
            })
        
        return leaderboard
    finally:
        conn.close()
