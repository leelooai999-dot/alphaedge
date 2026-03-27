"""
MonteCarloo User Authentication Module.

Lightweight auth system:
- Anonymous users get a session_id (stored in localStorage on frontend)
- Registered users get email + password hash
- All features work without registration (public access)
- Registration unlocks: save more scenarios, profile, leaderboard name

Design principle: public by default, registration is optional upgrade.
"""

import os
import hashlib
import secrets
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from db import get_db

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database schema for auth
# ---------------------------------------------------------------------------

def init_auth_db():
    """Create auth tables if they don't exist."""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                display_name TEXT NOT NULL,
                password_hash TEXT,
                avatar_url TEXT,
                bio TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_verified INTEGER DEFAULT 0,
                session_id TEXT,
                points INTEGER DEFAULT 0,
                streak_days INTEGER DEFAULT 0,
                streak_last_date TEXT,
                tier TEXT DEFAULT 'free',
                referral_code TEXT UNIQUE,
                referred_by TEXT
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                is_active INTEGER DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_session ON users(session_id);
            CREATE INDEX IF NOT EXISTS idx_tokens_user ON auth_tokens(user_id);
        """)
        conn.commit()
        logger.info("Auth tables initialized")
    except Exception as e:
        logger.warning(f"Auth table init: {e}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Password hashing (bcrypt-like with hashlib — no external deps)
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt: Optional[str] = None) -> str:
    """Hash a password with salt. Returns 'salt$hash'."""
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100_000)
    return f"{salt}${h.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against stored 'salt$hash'."""
    try:
        salt, _ = stored_hash.split('$', 1)
        return _hash_password(password, salt) == stored_hash
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# User operations
# ---------------------------------------------------------------------------

def create_user(
    email: str,
    password: str,
    display_name: str,
    session_id: Optional[str] = None,
    referral_code: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Register a new user. Returns user dict + auth token.
    Raises ValueError if email already exists.
    """
    conn = get_db()
    try:
        # Check for existing email
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email.lower(),)).fetchone()
        if existing:
            raise ValueError("Email already registered")

        user_id = secrets.token_urlsafe(16)
        # Generate unique referral code for this user
        user_referral_code = secrets.token_urlsafe(6)
        password_hash = _hash_password(password)
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(days=90)).isoformat()

        conn.execute("""
            INSERT INTO users (id, email, display_name, password_hash, session_id, referral_code)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, email.lower(), display_name, password_hash, session_id, user_referral_code))

        conn.execute("""
            INSERT INTO auth_tokens (token, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (token, user_id, expires))

        # If session_id provided, migrate their anonymous scenarios
        if session_id:
            conn.execute("""
                UPDATE scenarios SET author_id = ?, author_name = ?
                WHERE author_id IS NULL AND author_name = 'Anonymous'
                AND id IN (
                    SELECT scenario_id FROM scenario_likes WHERE session_id = ?
                )
            """, (user_id, display_name, session_id))

        # Handle referral — award points to referrer
        if referral_code:
            referrer = conn.execute(
                "SELECT id FROM users WHERE referral_code = ?", (referral_code,)
            ).fetchone()
            if referrer:
                conn.execute("""
                    INSERT INTO points_ledger (user_id, action, points, reference_id)
                    VALUES (?, 'referral', 50, ?)
                """, (referrer["id"], user_id))
                conn.execute("""
                    INSERT INTO points_ledger (user_id, action, points, reference_id)
                    VALUES (?, 'referred_bonus', 10, ?)
                """, (user_id, referrer["id"]))
                logger.info(f"Referral: {referrer['id']} referred {user_id}, +50pts to referrer")

        conn.commit()

        return {
            "user_id": user_id,
            "email": email.lower(),
            "display_name": display_name,
            "token": token,
            "tier": "free",
            "points": 10 if referral_code else 0,
            "referral_code": user_referral_code,
        }
    finally:
        conn.close()


def login_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    """
    Authenticate a user. Returns user dict + new token, or None.
    """
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email.lower(),)
        ).fetchone()

        if not row:
            return None

        if not _verify_password(password, row["password_hash"]):
            return None

        # Create new token
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(days=90)).isoformat()
        conn.execute("""
            INSERT INTO auth_tokens (token, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (token, row["id"], expires))

        # Update last seen
        conn.execute(
            "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
            (row["id"],)
        )
        conn.commit()

        return {
            "user_id": row["id"],
            "email": row["email"],
            "display_name": row["display_name"],
            "token": token,
            "tier": row["tier"],
            "points": row["points"],
            "streak_days": row["streak_days"],
            "avatar_url": row["avatar_url"],
            "bio": row["bio"],
        }
    finally:
        conn.close()


def get_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Look up a user by auth token. Returns user dict or None."""
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT u.* FROM users u
            JOIN auth_tokens t ON t.user_id = u.id
            WHERE t.token = ? AND t.is_active = 1
            AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))
        """, (token,)).fetchone()

        if not row:
            return None

        return {
            "user_id": row["id"],
            "email": row["email"],
            "display_name": row["display_name"],
            "tier": row["tier"],
            "points": row["points"],
            "streak_days": row["streak_days"],
            "avatar_url": row["avatar_url"],
            "bio": row["bio"],
        }
    finally:
        conn.close()


def update_user_profile(
    user_id: str,
    display_name: Optional[str] = None,
    bio: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> bool:
    """Update user profile fields."""
    conn = get_db()
    try:
        updates = []
        params = []
        if display_name is not None:
            updates.append("display_name = ?")
            params.append(display_name)
        if bio is not None:
            updates.append("bio = ?")
            params.append(bio)
        if avatar_url is not None:
            updates.append("avatar_url = ?")
            params.append(avatar_url)

        if not updates:
            return False

        params.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        return True
    finally:
        conn.close()


def logout_user(token: str) -> bool:
    """Invalidate a token."""
    conn = get_db()
    try:
        conn.execute("UPDATE auth_tokens SET is_active = 0 WHERE token = ?", (token,))
        conn.commit()
        return True
    finally:
        conn.close()


def get_user_stats(user_id: str) -> Dict[str, Any]:
    """Get user scenario stats."""
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT 
                COUNT(*) as total_scenarios,
                COALESCE(SUM(views), 0) as total_views,
                COALESCE(SUM(likes), 0) as total_likes,
                COALESCE(SUM(forks), 0) as total_forks
            FROM scenarios WHERE author_id = ?
        """, (user_id,)).fetchone()

        return {
            "total_scenarios": row["total_scenarios"],
            "total_views": row["total_views"],
            "total_likes": row["total_likes"],
            "total_forks": row["total_forks"],
        }
    finally:
        conn.close()


# Initialize on import
init_auth_db()
