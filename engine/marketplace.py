"""
MonteCarloo Marketplace — AI Personality & Skills Store
"Etsy for Financial AI"

Handles: listings, search, reviews, purchases, creator profiles, payouts,
         file uploads with malicious code scanning.
"""

import os
import sqlite3
import hashlib
import secrets
import time
import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Tuple
from dataclasses import dataclass

import file_scanner
from db import get_db, USE_POSTGRES

logger = logging.getLogger(__name__)

# Use same persistent data directory as main DB
_DATA_DIR = os.environ.get("DATA_DIR", "/data")
if not os.path.isdir(_DATA_DIR):
    _DATA_DIR = "/tmp"
STRIPE_SECRET = os.environ.get("STRIPE_SECRET_KEY", "")
PLATFORM_COMMISSION = 0.30  # 30% platform take

# File uploads
UPLOAD_DIR = os.path.join(_DATA_DIR, "marketplace_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------- DB Setup ----------

def _db():
    """Use the shared DB connection (Postgres in prod, SQLite in dev)."""
    return get_db()

def init_marketplace_db():
    """Create marketplace tables if they don't exist."""
    conn = _db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS marketplace_payouts (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            stripe_transfer_id TEXT DEFAULT '',
            stripe_payout_id TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_payouts_creator ON marketplace_payouts(creator_id);

        CREATE TABLE IF NOT EXISTS marketplace_listings (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'persona',
            title TEXT NOT NULL,
            subtitle TEXT DEFAULT '',
            tagline TEXT DEFAULT '',
            description TEXT DEFAULT '',
            capabilities TEXT DEFAULT '[]',
            whats_new TEXT DEFAULT '',
            price_cents INTEGER NOT NULL DEFAULT 0,
            pricing_model TEXT DEFAULT 'one_time',
            category TEXT DEFAULT 'finance',
            tags TEXT DEFAULT '[]',
            avatar_url TEXT DEFAULT '',
            version TEXT DEFAULT 'v1',
            version_history TEXT DEFAULT '[]',
            sales_count INTEGER DEFAULT 0,
            avg_rating REAL DEFAULT 0.0,
            review_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'draft',
            download_url TEXT DEFAULT '',
            file_size_bytes INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS marketplace_reviews (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            title TEXT DEFAULT '',
            body TEXT DEFAULT '',
            verified_purchase INTEGER DEFAULT 0,
            helpful_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
            UNIQUE(listing_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS marketplace_purchases (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            buyer_id TEXT NOT NULL,
            price_cents INTEGER NOT NULL,
            commission_cents INTEGER NOT NULL,
            creator_payout_cents INTEGER NOT NULL,
            stripe_payment_id TEXT DEFAULT '',
            stripe_checkout_session_id TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            refunded INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id)
        );

        CREATE TABLE IF NOT EXISTS creator_profiles (
            user_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            bio TEXT DEFAULT '',
            avatar_url TEXT DEFAULT '',
            company TEXT DEFAULT '',
            website TEXT DEFAULT '',
            stripe_connected_account_id TEXT DEFAULT '',
            total_sales INTEGER DEFAULT 0,
            total_revenue_cents INTEGER DEFAULT 0,
            total_payout_cents INTEGER DEFAULT 0,
            verified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS marketplace_files (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            uploader_id TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            file_hash TEXT NOT NULL DEFAULT '',
            mime_type TEXT DEFAULT '',
            scan_status TEXT DEFAULT 'pending',
            scan_result TEXT DEFAULT '{}',
            risk_level TEXT DEFAULT 'unknown',
            download_count INTEGER DEFAULT 0,
            is_primary INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id)
        );

        CREATE INDEX IF NOT EXISTS idx_listings_creator ON marketplace_listings(creator_id);
        CREATE INDEX IF NOT EXISTS idx_listings_type ON marketplace_listings(type);
        CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status);
        CREATE INDEX IF NOT EXISTS idx_reviews_listing ON marketplace_reviews(listing_id);
        CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON marketplace_purchases(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_purchases_listing ON marketplace_purchases(listing_id);
        CREATE INDEX IF NOT EXISTS idx_files_listing ON marketplace_files(listing_id);
        CREATE INDEX IF NOT EXISTS idx_files_uploader ON marketplace_files(uploader_id);
    """)
    conn.commit()
    conn.close()


def _gen_id():
    return secrets.token_urlsafe(12)


# ---------- Listings ----------

def create_listing(creator_id: str, data: dict) -> dict:
    """Create a new marketplace listing."""
    conn = _db()
    listing_id = _gen_id()
    
    conn.execute("""
        INSERT INTO marketplace_listings 
        (id, creator_id, type, title, subtitle, tagline, description, 
         capabilities, whats_new, price_cents, pricing_model, category, 
         tags, avatar_url, version, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        listing_id,
        creator_id,
        data.get("type", "persona"),
        data["title"],
        data.get("subtitle", ""),
        data.get("tagline", ""),
        data.get("description", ""),
        json.dumps(data.get("capabilities", [])),
        data.get("whats_new", ""),
        int(data.get("price_cents", 0)),
        data.get("pricing_model", "one_time"),
        data.get("category", "finance"),
        json.dumps(data.get("tags", [])),
        data.get("avatar_url", ""),
        data.get("version", "v1"),
        data.get("status", "draft"),
    ))
    conn.commit()
    
    listing = get_listing(listing_id)
    conn.close()
    return listing


def get_listing(listing_id: str) -> Optional[dict]:
    """Get a single listing by ID."""
    conn = _db()
    row = conn.execute(
        "SELECT * FROM marketplace_listings WHERE id = ?", (listing_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    return _row_to_listing(row)


def update_listing(listing_id: str, creator_id: str, data: dict) -> Optional[dict]:
    """Update a listing (only creator can update their own)."""
    conn = _db()
    existing = conn.execute(
        "SELECT creator_id FROM marketplace_listings WHERE id = ?", (listing_id,)
    ).fetchone()
    if not existing or existing["creator_id"] != creator_id:
        conn.close()
        return None
    
    fields = []
    values = []
    updatable = [
        "title", "subtitle", "tagline", "description", "whats_new",
        "price_cents", "pricing_model", "category", "avatar_url",
        "version", "status", "type"
    ]
    for key in updatable:
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    
    if "capabilities" in data:
        fields.append("capabilities = ?")
        values.append(json.dumps(data["capabilities"]))
    if "tags" in data:
        fields.append("tags = ?")
        values.append(json.dumps(data["tags"]))
    if "version_history" in data:
        fields.append("version_history = ?")
        values.append(json.dumps(data["version_history"]))
    
    fields.append("updated_at = datetime('now')")
    values.append(listing_id)
    
    conn.execute(
        f"UPDATE marketplace_listings SET {', '.join(fields)} WHERE id = ?",
        values
    )
    conn.commit()
    listing = get_listing(listing_id)
    conn.close()
    return listing


def delete_listing(listing_id: str, creator_id: str) -> bool:
    """Delete a listing (only creator can delete their own)."""
    conn = _db()
    result = conn.execute(
        "DELETE FROM marketplace_listings WHERE id = ? AND creator_id = ?",
        (listing_id, creator_id)
    )
    conn.commit()
    deleted = result.rowcount > 0
    conn.close()
    return deleted


def search_listings(
    query: str = "",
    listing_type: str = "",
    category: str = "",
    sort: str = "popular",
    limit: int = 20,
    offset: int = 0,
    min_price: int = 0,
    max_price: int = 99999,
) -> dict:
    """Search and browse marketplace listings."""
    conn = _db()
    
    conditions = ["status = 'active'"]
    params = []
    
    if query:
        conditions.append("(title LIKE ? OR description LIKE ? OR tagline LIKE ?)")
        q = f"%{query}%"
        params.extend([q, q, q])
    
    if listing_type:
        conditions.append("type = ?")
        params.append(listing_type)
    
    if category:
        conditions.append("category = ?")
        params.append(category)
    
    conditions.append("price_cents >= ? AND price_cents <= ?")
    params.extend([min_price, max_price * 100])
    
    where = " AND ".join(conditions)
    
    order_map = {
        "popular": "sales_count DESC",
        "newest": "created_at DESC",
        "rating": "avg_rating DESC",
        "price_low": "price_cents ASC",
        "price_high": "price_cents DESC",
    }
    order = order_map.get(sort, "sales_count DESC")
    
    # Get total count
    total = conn.execute(
        f"SELECT COUNT(*) FROM marketplace_listings WHERE {where}", params
    ).fetchone()[0]
    
    # Get page
    rows = conn.execute(
        f"SELECT * FROM marketplace_listings WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()
    
    conn.close()
    
    return {
        "listings": [_row_to_listing(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
    }


def get_categories() -> list:
    """Get all unique categories with counts."""
    conn = _db()
    rows = conn.execute("""
        SELECT category, COUNT(*) as count 
        FROM marketplace_listings 
        WHERE status = 'active'
        GROUP BY category 
        ORDER BY count DESC
    """).fetchall()
    conn.close()
    return [{"name": r["category"], "count": r["count"]} for r in rows]


# ---------- Reviews ----------

def create_review(listing_id: str, user_id: str, data: dict) -> dict:
    """Create a review for a listing."""
    conn = _db()
    
    # Check if user purchased this listing
    purchase = conn.execute(
        "SELECT id FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ? AND status = 'completed'",
        (listing_id, user_id)
    ).fetchone()
    
    review_id = _gen_id()
    conn.execute("""
        INSERT INTO marketplace_reviews (id, listing_id, user_id, rating, title, body, verified_purchase)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        review_id, listing_id, user_id,
        data["rating"],
        data.get("title", ""),
        data.get("body", ""),
        1 if purchase else 0,
    ))
    
    # Update listing avg rating
    stats = conn.execute("""
        SELECT AVG(rating) as avg, COUNT(*) as cnt 
        FROM marketplace_reviews WHERE listing_id = ?
    """, (listing_id,)).fetchone()
    
    conn.execute("""
        UPDATE marketplace_listings 
        SET avg_rating = ?, review_count = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (round(stats["avg"], 1), stats["cnt"], listing_id))
    
    conn.commit()
    conn.close()
    
    return {
        "id": review_id,
        "listing_id": listing_id,
        "user_id": user_id,
        "rating": data["rating"],
        "title": data.get("title", ""),
        "body": data.get("body", ""),
        "verified_purchase": bool(purchase),
    }


def get_reviews(listing_id: str, limit: int = 20, offset: int = 0) -> dict:
    """Get reviews for a listing."""
    conn = _db()
    
    total = conn.execute(
        "SELECT COUNT(*) FROM marketplace_reviews WHERE listing_id = ?", (listing_id,)
    ).fetchone()[0]
    
    rows = conn.execute("""
        SELECT r.*
        FROM marketplace_reviews r
        WHERE r.listing_id = ?
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
    """, (listing_id, limit, offset)).fetchall()
    
    # Rating distribution
    dist = conn.execute("""
        SELECT rating, COUNT(*) as count 
        FROM marketplace_reviews WHERE listing_id = ?
        GROUP BY rating
    """, (listing_id,)).fetchall()
    
    conn.close()
    
    distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for d in dist:
        distribution[d["rating"]] = d["count"]
    
    # Resolve author names from auth DB
    def _get_author_name(user_id):
        try:
            import auth
            user = auth._db().execute("SELECT display_name FROM users WHERE id = ?", (user_id,)).fetchone()
            return user["display_name"] if user else "Anonymous"
        except:
            return "Anonymous"
    
    return {
        "reviews": [{
            "id": r["id"],
            "rating": r["rating"],
            "title": r["title"],
            "body": r["body"],
            "author_name": _get_author_name(r["user_id"]),
            "verified_purchase": bool(r["verified_purchase"]),
            "created_at": r["created_at"],
        } for r in rows],
        "total": total,
        "distribution": distribution,
        "has_more": (offset + limit) < total,
    }


# ---------- Purchases ----------

def create_purchase(listing_id: str, buyer_id: str) -> dict:
    """Create a purchase record and return Stripe checkout URL."""
    conn = _db()
    
    listing = conn.execute(
        "SELECT * FROM marketplace_listings WHERE id = ? AND status = 'active'",
        (listing_id,)
    ).fetchone()
    
    if not listing:
        conn.close()
        raise ValueError("Listing not found or not active")
    
    # Check if already purchased
    existing = conn.execute(
        "SELECT id, status, stripe_checkout_session_id FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ?",
        (listing_id, buyer_id)
    ).fetchone()
    if existing:
        if existing["status"] == "completed":
            conn.close()
            raise ValueError("Already purchased")
        # If pending, delete the stale record so user can retry
        if existing["status"] == "pending":
            conn.execute("DELETE FROM marketplace_purchases WHERE id = ?", (existing["id"],))
            conn.commit()
    
    price = listing["price_cents"]
    commission = int(price * PLATFORM_COMMISSION)
    creator_payout = price - commission
    
    purchase_id = _gen_id()
    
    # Create Stripe checkout session
    checkout_url = ""
    session_id = ""
    if STRIPE_SECRET and price > 0:
        try:
            import stripe
            stripe.api_key = STRIPE_SECRET

            session_params = {
                "payment_method_types": ["card"],
                "line_items": [{
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": listing["title"],
                            "description": listing["tagline"] or f"{listing['type'].title()} on MonteCarloo Marketplace",
                        },
                        "unit_amount": price,
                    },
                    "quantity": 1,
                }],
                "mode": "payment",
                "success_url": f"{os.environ.get('FRONTEND_URL', 'https://montecarloo.com')}/marketplace/{listing_id}?purchased=true",
                "cancel_url": f"{os.environ.get('FRONTEND_URL', 'https://montecarloo.com')}/marketplace/{listing_id}",
                "metadata": {
                    "purchase_id": purchase_id,
                    "listing_id": listing_id,
                    "buyer_id": buyer_id,
                    "creator_id": listing["creator_id"],
                },
            }

            # If creator has a connected Stripe account, split the payment
            creator_profile = conn.execute(
                "SELECT stripe_connected_account_id FROM creator_profiles WHERE user_id = ?",
                (listing["creator_id"],)
            ).fetchone()

            if creator_profile and creator_profile["stripe_connected_account_id"]:
                connected_account_id = creator_profile["stripe_connected_account_id"]
                session_params["payment_intent_data"] = {
                    "application_fee_amount": commission,  # 30% to platform
                    "transfer_data": {
                        "destination": connected_account_id,  # 70% to creator
                    },
                }

            session = stripe.checkout.Session.create(**session_params)
            checkout_url = session.url
            session_id = session.id
        except Exception as e:
            conn.close()
            raise ValueError(f"Stripe error: {str(e)}")
    
    conn.execute("""
        INSERT INTO marketplace_purchases 
        (id, listing_id, buyer_id, price_cents, commission_cents, creator_payout_cents,
         stripe_checkout_session_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        purchase_id, listing_id, buyer_id, price, commission, creator_payout,
        session_id, "pending" if price > 0 else "completed",
    ))
    
    # If free, mark as completed immediately
    if price == 0:
        conn.execute("""
            UPDATE marketplace_listings 
            SET sales_count = sales_count + 1, updated_at = datetime('now')
            WHERE id = ?
        """, (listing_id,))
    
    conn.commit()
    conn.close()
    
    return {
        "purchase_id": purchase_id,
        "checkout_url": checkout_url,
        "price_cents": price,
        "status": "pending" if price > 0 else "completed",
    }


def complete_purchase(session_id: str) -> Optional[dict]:
    """Complete a purchase after successful Stripe payment (called by webhook)."""
    conn = _db()
    
    purchase = conn.execute(
        "SELECT * FROM marketplace_purchases WHERE stripe_checkout_session_id = ?",
        (session_id,)
    ).fetchone()
    
    if not purchase:
        conn.close()
        return None
    
    conn.execute(
        "UPDATE marketplace_purchases SET status = 'completed' WHERE id = ?",
        (purchase["id"],)
    )
    
    # Increment sales count
    conn.execute("""
        UPDATE marketplace_listings 
        SET sales_count = sales_count + 1, updated_at = datetime('now')
        WHERE id = ?
    """, (purchase["listing_id"],))
    
    # Update creator stats
    conn.execute("""
        UPDATE creator_profiles 
        SET total_sales = total_sales + 1,
            total_revenue_cents = total_revenue_cents + ?,
            total_payout_cents = total_payout_cents + ?,
            updated_at = datetime('now')
        WHERE user_id = (SELECT creator_id FROM marketplace_listings WHERE id = ?)
    """, (purchase["price_cents"], purchase["creator_payout_cents"], purchase["listing_id"]))
    
    conn.commit()
    conn.close()
    
    return dict(purchase)


def get_my_purchases(user_id: str) -> list:
    """Get all purchases by a user."""
    conn = _db()
    rows = conn.execute("""
        SELECT p.*, l.title, l.type, l.avatar_url, l.creator_id
        FROM marketplace_purchases p
        JOIN marketplace_listings l ON p.listing_id = l.id
        WHERE p.buyer_id = ? AND p.status = 'completed'
        ORDER BY p.created_at DESC
    """, (user_id,)).fetchall()
    conn.close()
    
    return [{
        "id": r["id"],
        "listing_id": r["listing_id"],
        "title": r["title"],
        "type": r["type"],
        "avatar_url": r["avatar_url"],
        "price_cents": r["price_cents"],
        "created_at": r["created_at"],
    } for r in rows]


def has_purchased(listing_id: str, user_id: str) -> bool:
    """Check if a user has purchased a listing."""
    conn = _db()
    row = conn.execute(
        "SELECT id FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ? AND status = 'completed'",
        (listing_id, user_id)
    ).fetchone()
    conn.close()
    return row is not None


# ---------- Creator Profiles ----------

def get_or_create_creator(user_id: str, display_name: str = "") -> dict:
    """Get or create a creator profile."""
    conn = _db()
    
    row = conn.execute(
        "SELECT * FROM creator_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    
    if row:
        conn.close()
        return dict(row)
    
    # Create new profile
    if not display_name:
        user = conn.execute("SELECT display_name FROM users WHERE id = ?", (user_id,)).fetchone()
        display_name = user["display_name"] if user else "Creator"
    
    conn.execute("""
        INSERT INTO creator_profiles (user_id, display_name)
        VALUES (?, ?)
    """, (user_id, display_name))
    conn.commit()
    
    row = conn.execute(
        "SELECT * FROM creator_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return dict(row)


def update_creator_profile(user_id: str, data: dict) -> dict:
    """Update a creator profile."""
    conn = _db()
    
    fields = []
    values = []
    for key in ["display_name", "bio", "avatar_url", "company", "website"]:
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    
    if fields:
        fields.append("updated_at = datetime('now')")
        values.append(user_id)
        conn.execute(
            f"UPDATE creator_profiles SET {', '.join(fields)} WHERE user_id = ?",
            values
        )
        conn.commit()
    
    row = conn.execute(
        "SELECT * FROM creator_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


def get_creator_dashboard(user_id: str) -> dict:
    """Get creator dashboard data."""
    conn = _db()
    
    profile = conn.execute(
        "SELECT * FROM creator_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    
    if not profile:
        conn.close()
        return {"error": "Not a creator"}
    
    listings = conn.execute(
        "SELECT * FROM marketplace_listings WHERE creator_id = ? ORDER BY created_at DESC",
        (user_id,)
    ).fetchall()
    
    # Recent sales
    recent_sales = conn.execute("""
        SELECT p.*, l.title 
        FROM marketplace_purchases p
        JOIN marketplace_listings l ON p.listing_id = l.id
        WHERE l.creator_id = ? AND p.status = 'completed'
        ORDER BY p.created_at DESC
        LIMIT 20
    """, (user_id,)).fetchall()
    
    # Monthly revenue — use Postgres-compatible date formatting when needed
    if USE_POSTGRES:
        month_expr = "to_char(p.created_at, 'YYYY-MM')"
    else:
        month_expr = "strftime('%Y-%m', p.created_at)"
    monthly = conn.execute(f"""
        SELECT {month_expr} as month,
               SUM(p.creator_payout_cents) as revenue,
               COUNT(*) as sales
        FROM marketplace_purchases p
        JOIN marketplace_listings l ON p.listing_id = l.id
        WHERE l.creator_id = ? AND p.status = 'completed'
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
    """, (user_id,)).fetchall()
    
    conn.close()
    
    return {
        "profile": dict(profile),
        "listings": [_row_to_listing(l) for l in listings],
        "recent_sales": [{
            "id": s["id"],
            "title": s["title"],
            "price_cents": s["price_cents"],
            "payout_cents": s["creator_payout_cents"],
            "created_at": s["created_at"],
        } for s in recent_sales],
        "monthly_revenue": [{
            "month": m["month"],
            "revenue_cents": m["revenue"],
            "sales": m["sales"],
        } for m in monthly],
        "total_sales": profile["total_sales"],
        "total_revenue_cents": profile["total_revenue_cents"],
        "total_payout_cents": profile["total_payout_cents"],
    }


def get_creator_public_profile(user_id: str) -> Optional[dict]:
    """Get public creator profile."""
    conn = _db()
    
    profile = conn.execute(
        "SELECT * FROM creator_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    
    if not profile:
        conn.close()
        return None
    
    listings = conn.execute("""
        SELECT * FROM marketplace_listings 
        WHERE creator_id = ? AND status = 'active'
        ORDER BY sales_count DESC
    """, (user_id,)).fetchall()
    
    conn.close()
    
    return {
        "display_name": profile["display_name"],
        "bio": profile["bio"],
        "avatar_url": profile["avatar_url"],
        "company": profile["company"],
        "website": profile["website"],
        "verified": bool(profile["verified"]),
        "total_sales": profile["total_sales"],
        "listings": [_row_to_listing(l) for l in listings],
        "created_at": profile["created_at"],
    }


# ---------- File Uploads ----------

def upload_product_file(
    listing_id: str,
    uploader_id: str,
    filename: str,
    content: bytes,
    is_primary: bool = False,
) -> dict:
    """
    Upload a product file with security scanning.
    
    Returns dict with file info and scan results.
    Rejects files that fail the security scan.
    """
    # Verify listing exists and uploader owns it
    conn = _db()
    listing = conn.execute(
        "SELECT creator_id FROM marketplace_listings WHERE id = ?", (listing_id,)
    ).fetchone()
    if not listing:
        conn.close()
        raise ValueError("Listing not found")
    if listing["creator_id"] != uploader_id:
        conn.close()
        raise ValueError("Only the listing creator can upload files")
    
    # Run security scan
    scan_result = file_scanner.scan_file(filename, content)
    
    if not scan_result.safe:
        conn.close()
        return {
            "uploaded": False,
            "rejected": True,
            "reason": "File failed security scan",
            "scan": scan_result.to_dict(),
            "disclaimer": file_scanner.CREATOR_UPLOAD_TERMS,
        }
    
    # Store the file
    file_id = _gen_id()
    ext = os.path.splitext(filename)[1].lower()
    stored_name = f"{file_id}{ext}"
    
    # Create listing subdirectory
    listing_dir = os.path.join(UPLOAD_DIR, listing_id)
    os.makedirs(listing_dir, exist_ok=True)
    
    file_path = os.path.join(listing_dir, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)
    
    # If this is the primary file, unmark any existing primary
    if is_primary:
        conn.execute(
            "UPDATE marketplace_files SET is_primary = 0 WHERE listing_id = ?",
            (listing_id,)
        )
    
    conn.execute("""
        INSERT INTO marketplace_files
        (id, listing_id, uploader_id, original_filename, stored_filename,
         file_size, file_hash, scan_status, scan_result, risk_level, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        file_id, listing_id, uploader_id, filename, stored_name,
        scan_result.file_size, scan_result.file_hash,
        "passed", json.dumps(scan_result.to_dict()),
        scan_result.risk_level, 1 if is_primary else 0,
    ))
    
    # Update listing with download URL and file size
    if is_primary:
        conn.execute("""
            UPDATE marketplace_listings 
            SET download_url = ?, file_size_bytes = ?, updated_at = datetime('now')
            WHERE id = ?
        """, (f"/api/marketplace/files/{file_id}/download", scan_result.file_size, listing_id))
    
    conn.commit()
    conn.close()
    
    return {
        "uploaded": True,
        "rejected": False,
        "file_id": file_id,
        "filename": filename,
        "file_size": scan_result.file_size,
        "file_hash": scan_result.file_hash,
        "scan": scan_result.to_dict(),
        "is_primary": is_primary,
        "disclaimer": file_scanner.CREATOR_UPLOAD_TERMS,
    }


def get_listing_files(listing_id: str) -> list:
    """Get all files for a listing."""
    conn = _db()
    rows = conn.execute("""
        SELECT id, original_filename, file_size, file_hash, risk_level,
               scan_status, download_count, is_primary, created_at
        FROM marketplace_files
        WHERE listing_id = ?
        ORDER BY is_primary DESC, created_at ASC
    """, (listing_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_file_for_download(file_id: str, user_id: Optional[str] = None) -> Optional[dict]:
    """
    Get file path for download. Checks purchase status if listing is paid.
    Returns file info including disk path, or None.
    """
    conn = _db()
    row = conn.execute("""
        SELECT f.*, l.price_cents, l.creator_id, l.status as listing_status
        FROM marketplace_files f
        JOIN marketplace_listings l ON f.listing_id = l.id
        WHERE f.id = ?
    """, (file_id,)).fetchone()
    
    if not row:
        conn.close()
        return None
    
    # If listing is paid and user hasn't purchased, block download
    if row["price_cents"] > 0 and user_id:
        if user_id != row["creator_id"]:  # Creators can always download their own
            purchased = conn.execute(
                "SELECT id FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ? AND status = 'completed'",
                (row["listing_id"], user_id)
            ).fetchone()
            if not purchased:
                conn.close()
                return {"error": "Purchase required", "listing_id": row["listing_id"]}
    elif row["price_cents"] > 0 and not user_id:
        conn.close()
        return {"error": "Login and purchase required", "listing_id": row["listing_id"]}
    
    # Increment download counter
    conn.execute(
        "UPDATE marketplace_files SET download_count = download_count + 1 WHERE id = ?",
        (file_id,)
    )
    conn.commit()
    
    file_path = os.path.join(UPLOAD_DIR, row["listing_id"], row["stored_filename"])
    conn.close()
    
    return {
        "file_path": file_path,
        "original_filename": row["original_filename"],
        "file_size": row["file_size"],
        "risk_level": row["risk_level"],
        "scan_status": row["scan_status"],
        "disclaimer": file_scanner.PRODUCT_DISCLAIMER,
    }


def delete_product_file(file_id: str, user_id: str) -> bool:
    """Delete a product file (creator only)."""
    conn = _db()
    row = conn.execute("""
        SELECT f.listing_id, f.stored_filename, l.creator_id
        FROM marketplace_files f
        JOIN marketplace_listings l ON f.listing_id = l.id
        WHERE f.id = ?
    """, (file_id,)).fetchone()
    
    if not row or row["creator_id"] != user_id:
        conn.close()
        return False
    
    # Delete from disk
    file_path = os.path.join(UPLOAD_DIR, row["listing_id"], row["stored_filename"])
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        logger.error(f"Failed to delete file from disk: {e}")
    
    # Delete from DB
    conn.execute("DELETE FROM marketplace_files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    return True


def rescan_file(file_id: str) -> Optional[dict]:
    """Re-scan an existing file (admin/moderation use)."""
    conn = _db()
    row = conn.execute(
        "SELECT listing_id, stored_filename, original_filename FROM marketplace_files WHERE id = ?",
        (file_id,)
    ).fetchone()
    
    if not row:
        conn.close()
        return None
    
    file_path = os.path.join(UPLOAD_DIR, row["listing_id"], row["stored_filename"])
    if not os.path.exists(file_path):
        conn.close()
        return {"error": "File not found on disk"}
    
    with open(file_path, "rb") as f:
        content = f.read()
    
    scan_result = file_scanner.scan_file(row["original_filename"], content)
    
    conn.execute("""
        UPDATE marketplace_files 
        SET scan_status = ?, scan_result = ?, risk_level = ?
        WHERE id = ?
    """, (
        "passed" if scan_result.safe else "failed",
        json.dumps(scan_result.to_dict()),
        scan_result.risk_level,
        file_id,
    ))
    conn.commit()
    conn.close()
    
    return scan_result.to_dict()


# ---------- Stripe Connect ----------

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://montecarloo.com")


def create_connect_account(user_id: str, email: str) -> dict:
    """Create a Stripe Connect Express account for a creator."""
    if not STRIPE_SECRET:
        raise ValueError("Stripe not configured")

    conn = _db()
    try:
        profile = conn.execute(
            "SELECT stripe_connected_account_id FROM creator_profiles WHERE user_id = ?",
            (user_id,)
        ).fetchone()

        if profile and profile["stripe_connected_account_id"]:
            return {"account_id": profile["stripe_connected_account_id"], "existing": True}

        import stripe
        stripe.api_key = STRIPE_SECRET

        account = stripe.Account.create(
            type="express",
            email=email,
            capabilities={
                "transfers": {"requested": True},
            },
            business_type="individual",
            metadata={"user_id": user_id},
        )

        conn.execute(
            "UPDATE creator_profiles SET stripe_connected_account_id = ? WHERE user_id = ?",
            (account.id, user_id)
        )
        conn.commit()
        return {"account_id": account.id, "existing": False}
    finally:
        conn.close()


def create_connect_onboarding_link(user_id: str) -> dict:
    """Create a Stripe Account Link for creator onboarding."""
    if not STRIPE_SECRET:
        raise ValueError("Stripe not configured")

    conn = _db()
    try:
        profile = conn.execute(
            "SELECT stripe_connected_account_id FROM creator_profiles WHERE user_id = ?",
            (user_id,)
        ).fetchone()

        if not profile or not profile["stripe_connected_account_id"]:
            raise ValueError("No connected account. Call create_connect_account first.")

        import stripe
        stripe.api_key = STRIPE_SECRET

        account_link = stripe.AccountLink.create(
            account=profile["stripe_connected_account_id"],
            refresh_url=f"{FRONTEND_URL}/marketplace/dashboard?connect=refresh",
            return_url=f"{FRONTEND_URL}/marketplace/dashboard?connect=complete",
            type="account_onboarding",
        )
        return {"url": account_link.url}
    finally:
        conn.close()


def create_connect_login_link(user_id: str) -> dict:
    """Create a Stripe Express dashboard login link for a creator."""
    if not STRIPE_SECRET:
        raise ValueError("Stripe not configured")

    conn = _db()
    try:
        profile = conn.execute(
            "SELECT stripe_connected_account_id FROM creator_profiles WHERE user_id = ?",
            (user_id,)
        ).fetchone()

        if not profile or not profile["stripe_connected_account_id"]:
            raise ValueError("No connected Stripe account")

        import stripe
        stripe.api_key = STRIPE_SECRET

        login_link = stripe.Account.create_login_link(profile["stripe_connected_account_id"])
        return {"url": login_link.url}
    finally:
        conn.close()


def get_connect_account_status(user_id: str) -> dict:
    """Check if a creator's Stripe account is fully onboarded."""
    conn = _db()
    try:
        profile = conn.execute(
            "SELECT stripe_connected_account_id FROM creator_profiles WHERE user_id = ?",
            (user_id,)
        ).fetchone()

        if not profile or not profile["stripe_connected_account_id"]:
            return {
                "connected": False,
                "account_id": None,
                "charges_enabled": False,
                "payouts_enabled": False,
                "details_submitted": False,
            }

        if not STRIPE_SECRET:
            return {
                "connected": True,
                "account_id": profile["stripe_connected_account_id"],
                "charges_enabled": False,
                "payouts_enabled": False,
                "details_submitted": False,
            }

        import stripe
        stripe.api_key = STRIPE_SECRET

        account = stripe.Account.retrieve(profile["stripe_connected_account_id"])
        return {
            "connected": True,
            "account_id": account.id,
            "charges_enabled": account.charges_enabled,
            "payouts_enabled": account.payouts_enabled,
            "details_submitted": account.details_submitted,
            "requirements": {
                "currently_due": list(account.requirements.currently_due or []),
                "eventually_due": list(account.requirements.eventually_due or []),
                "disabled_reason": account.requirements.disabled_reason,
            } if account.requirements else {},
        }
    finally:
        conn.close()


# ---------- Seed Data ----------

def seed_marketplace():
    """Seed the marketplace with initial listings."""
    conn = _db()
    
    # Check if already seeded
    count = conn.execute("SELECT COUNT(*) FROM marketplace_listings").fetchone()[0]
    if count > 0:
        conn.close()
        return
    
    # Create system creator profile
    system_id = "system-montecarloo"
    try:
        conn.execute("""
            INSERT INTO creator_profiles 
            (user_id, display_name, bio, company, verified)
            VALUES (?, ?, ?, ?, 1)
        """, (
            system_id,
            "MonteCarloo Team",
            "The creators of MonteCarloo — What-if Stock Event Simulator. We build tools that help you think about the future of markets.",
            "MonteCarloo",
        ))
    except Exception:
        # Already exists
        try:
            conn.rollback()
        except Exception:
            pass
    
    # Seed listings
    listings = [
        {
            "type": "persona",
            "title": "MonteCarloo Analyst",
            "subtitle": "Financial AI Analyst",
            "tagline": "Your AI Monte Carlo expert — simulates events, generates Pine Scripts, tracks accuracy",
            "description": """MonteCarloo Analyst is a battle-tested AI personality trained on Monte Carlo simulation methodology, temporal event modeling, and financial market analysis.

**What's included:**
- Pre-loaded knowledge of 18+ geopolitical, macro, and sector event models
- Temporal profile understanding (anticipation → shock → decay patterns)
- Pine Script indicator generation from simulation results
- Probability-weighted scenario analysis
- Real-time Polymarket odds integration awareness
- Portfolio impact assessment across multiple events

**How it works:**
Install the MonteCarloo Analyst persona in your OpenClaw agent (or any compatible AI agent platform). It enhances your agent's financial reasoning with simulation-first thinking — instead of just reading news, it models the probabilistic impact of events on specific stocks.

**Best for:**
- Individual investors who want AI-assisted scenario analysis
- Financial advisors building client presentations
- Content creators making market commentary
- Students learning quantitative finance""",
            "capabilities": [
                "Monte Carlo simulation methodology",
                "18+ event temporal profiles (FOMC, earnings, geopolitical, tariff, etc.)",
                "Pine Script v5 indicator generation",
                "Probability calibration with Polymarket live odds",
                "Multi-event portfolio impact analysis",
                "Historical accuracy tracking",
                "Stock correlation modeling",
                "Risk-adjusted scenario ranking",
            ],
            "whats_new": "v1 — Initial release with 18 event models, Pine Script export, and accuracy tracking.",
            "price_cents": 9900,
            "category": "finance",
            "tags": ["monte-carlo", "simulation", "options", "events", "pine-script"],
            "version": "v1",
            "status": "active",
        },
        {
            "type": "skill",
            "title": "Geopolitical Crisis Kit",
            "subtitle": "Event Simulation Templates",
            "tagline": "12 pre-built geopolitical event models with temporal profiles for war, sanctions, and trade conflicts",
            "description": """Ready-to-use simulation templates for major geopolitical scenarios.

Each template includes calibrated probability ranges, temporal profiles (anticipation → shock → decay), sector impact weights, and suggested stock tickers.

**Included events:**
- Iran-Israel military escalation
- China-Taiwan tensions
- Ukraine-Russia conflict shifts
- US-China trade war escalation
- OPEC supply disruption
- Suez Canal blockade
- North Korea nuclear test
- EU energy crisis
- India-Pakistan tensions
- Venezuela oil sanctions
- Arctic resource dispute
- South China Sea confrontation""",
            "capabilities": [
                "12 geopolitical event templates",
                "Calibrated probability ranges",
                "Temporal profiles (anticipation/shock/decay)",
                "Sector impact weights",
                "Suggested stock tickers per event",
                "Historical analog data",
            ],
            "price_cents": 2900,
            "category": "finance",
            "tags": ["geopolitical", "events", "simulation", "war", "sanctions"],
            "version": "v1",
            "status": "active",
        },
        {
            "type": "skill",
            "title": "Pine Strategy Pack",
            "subtitle": "20 Battle-Tested Pine Scripts",
            "tagline": "Professional Pine Script v5 strategies and indicators for TradingView — RSI, MACD, Bollinger, and more",
            "description": """20 production-ready Pine Script v5 strategies optimized for simulation overlay on MonteCarloo and direct use on TradingView.

**Included strategies:**
- RSI Divergence Scanner
- MACD Signal + Histogram
- Bollinger Band Squeeze
- EMA Ribbon (8/13/21/55)
- Volume-Weighted VWAP Bands
- Ichimoku Cloud
- Stochastic RSI
- ADX Trend Strength
- Fibonacci Auto-Levels
- Support/Resistance Finder
- And 10 more...""",
            "capabilities": [
                "20 Pine Script v5 strategies",
                "TradingView compatible",
                "MonteCarloo overlay compatible",
                "Backtesting-ready",
                "Clear entry/exit signals",
                "Alert conditions included",
            ],
            "price_cents": 1900,
            "category": "finance",
            "tags": ["pine-script", "tradingview", "strategies", "indicators", "technical-analysis"],
            "version": "v1",
            "status": "active",
        },
        {
            "type": "skill",
            "title": "Earnings Surprise Pack",
            "subtitle": "50 Earnings Event Models",
            "tagline": "Pre-built earnings event templates for mega-cap stocks with historical surprise data",
            "description": """50 earnings event models for the most-traded US stocks, calibrated with historical earnings surprise data.

Each model includes pre/post earnings temporal profiles, historical beat/miss rates, average price moves, and option IV crush patterns.

**Covers:** AAPL, MSFT, AMZN, GOOGL, META, NVDA, TSLA, JPM, BAC, GS, WFC, XOM, CVX, and 38 more.""",
            "capabilities": [
                "50 earnings event templates",
                "Historical beat/miss rates",
                "Average post-earnings price moves",
                "IV crush modeling",
                "Pre/post temporal profiles",
                "Sector-relative performance",
            ],
            "price_cents": 3900,
            "category": "finance",
            "tags": ["earnings", "events", "options", "iv-crush", "mega-cap"],
            "version": "v1",
            "status": "active",
        },
        {
            "type": "persona",
            "title": "Options Flow Analyst",
            "subtitle": "Unusual Activity Detection",
            "tagline": "AI analyst trained on unusual options flow — detects institutional positioning and generates trade ideas",
            "description": """An AI analyst personality specialized in reading unusual options activity to detect institutional positioning.

**Core methodology:**
- Scans for unusual volume (>2x average) in options chains
- Identifies large block trades and sweeps
- Correlates flow with upcoming catalysts (earnings, FOMC, etc.)
- Generates directional bias with confidence scores
- Tracks historical accuracy of flow-based signals

**Best for:** Active traders who want AI-assisted options flow analysis without expensive terminal subscriptions.""",
            "capabilities": [
                "Unusual options volume detection",
                "Block trade and sweep analysis",
                "Catalyst correlation",
                "Directional bias scoring",
                "Historical accuracy tracking",
                "Daily summary reports",
            ],
            "price_cents": 14900,
            "category": "finance",
            "tags": ["options", "flow", "institutional", "unusual-activity", "trading"],
            "version": "v1",
            "status": "active",
        },
    ]
    
    for data in listings:
        lid = _gen_id()
        conn.execute("""
            INSERT INTO marketplace_listings
            (id, creator_id, type, title, subtitle, tagline, description,
             capabilities, whats_new, price_cents, category, tags, version, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            lid, system_id, data["type"], data["title"],
            data.get("subtitle", ""), data.get("tagline", ""),
            data["description"], json.dumps(data.get("capabilities", [])),
            data.get("whats_new", ""), data["price_cents"],
            data["category"], json.dumps(data.get("tags", [])),
            data["version"], data["status"],
        ))
    
    conn.commit()
    conn.close()


# ---------- Helpers ----------

def _row_to_listing(row) -> dict:
    """Convert a DB row to a listing dict."""
    d = dict(row)
    # Parse JSON fields
    for field in ["capabilities", "tags", "version_history"]:
        if field in d and isinstance(d[field], str):
            try:
                d[field] = json.loads(d[field])
            except:
                d[field] = []
    # Convert price to dollars for display
    d["price"] = d["price_cents"] / 100
    return d
