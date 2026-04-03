"""
MonteCarloo Stripe Billing Module.

Handles subscription tiers, checkout sessions, webhooks, and tier enforcement.

Tiers:
  - free: unlimited scenarios/sims, max 2 events/scenario, 1 Pine Script overlay
  - pro ($49/mo): unlimited events, unlimited Pine overlays
  - premium ($149/mo): API access, priority support

Design: All simulation features work on Free. Paywall only limits
event count and Pine overlay count — the two features that drive
power-user stickiness.
"""

import os
import sqlite3
import logging
import json
import hmac
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from db import get_db

logger = logging.getLogger(__name__)

# Stripe keys from env
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Product/Price IDs (create via Stripe API on first run)
STRIPE_PRODUCTS: Dict[str, Dict[str, str]] = {}

# Tier limits
TIER_LIMITS = {
    "free": {
        "max_events_per_scenario": 2,
        "max_pine_overlays": 1,
        "can_export_pine": True,
        "can_save_scenarios": True,
        "can_use_social": True,
        "api_access": False,
        "priority_support": False,
    },
    "pro": {
        "max_events_per_scenario": 999,
        "max_pine_overlays": 999,
        "can_export_pine": True,
        "can_save_scenarios": True,
        "can_use_social": True,
        "api_access": False,
        "priority_support": False,
    },
    "premium": {
        "max_events_per_scenario": 999,
        "max_pine_overlays": 999,
        "can_export_pine": True,
        "can_save_scenarios": True,
        "can_use_social": True,
        "api_access": True,
        "priority_support": True,
    },
}

# Pricing
PRICING = {
    "pro": {"price": 4900, "name": "Pro", "interval": "month"},
    "premium": {"price": 14900, "name": "Premium", "interval": "month"},
}

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://montecarloo.com")


# ---------------------------------------------------------------------------
# Database schema
# ---------------------------------------------------------------------------

def init_billing_db():
    """Create billing tables if they don't exist."""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS subscriptions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                stripe_customer_id TEXT,
                stripe_subscription_id TEXT,
                tier TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'active',
                current_period_start TIMESTAMP,
                current_period_end TIMESTAMP,
                cancel_at_period_end INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS stripe_events (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                data TEXT,
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sub_stripe ON subscriptions(stripe_subscription_id);
        """)
        conn.commit()
        logger.info("Billing tables initialized")
    except Exception as e:
        logger.warning(f"Billing table init: {e}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Stripe helpers (using requests instead of stripe SDK to avoid dep)
# ---------------------------------------------------------------------------

def _stripe_request(method: str, path: str, data: dict = None) -> dict:
    """Make a Stripe API request."""
    import urllib.request
    import urllib.parse
    import urllib.error

    url = f"https://api.stripe.com/v1{path}"
    headers = {
        "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
    }

    if data:
        encoded = urllib.parse.urlencode(data, doseq=True)
        body = encoded.encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    else:
        body = None

    req = urllib.request.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        logger.error(f"Stripe API error {e.code}: {error_body}")
        raise Exception(f"Stripe API error: {error_body}")


def _ensure_stripe_products():
    """Create Stripe products/prices if they don't exist. Cache in memory."""
    global STRIPE_PRODUCTS
    if STRIPE_PRODUCTS or not STRIPE_SECRET_KEY:
        return

    for tier_key, info in PRICING.items():
        try:
            # Create product
            product = _stripe_request("POST", "/products", {
                "name": f"MonteCarloo {info['name']}",
                "metadata[tier]": tier_key,
            })
            # Create price
            price = _stripe_request("POST", "/prices", {
                "product": product["id"],
                "unit_amount": info["price"],
                "currency": "usd",
                "recurring[interval]": info["interval"],
            })
            STRIPE_PRODUCTS[tier_key] = {
                "product_id": product["id"],
                "price_id": price["id"],
            }
            logger.info(f"Created Stripe product for {tier_key}: {product['id']} / {price['id']}")
        except Exception as e:
            logger.error(f"Failed to create Stripe product for {tier_key}: {e}")


def get_or_create_customer(user_id: str, email: str) -> str:
    """Get or create a Stripe customer for a user."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        if row and row["stripe_customer_id"]:
            return row["stripe_customer_id"]
    finally:
        conn.close()

    # Create new customer
    customer = _stripe_request("POST", "/customers", {
        "email": email,
        "metadata[user_id]": user_id,
    })
    return customer["id"]


# ---------------------------------------------------------------------------
# Checkout / subscription management
# ---------------------------------------------------------------------------

def create_checkout_session(user_id: str, email: str, tier: str) -> Dict[str, str]:
    """Create a Stripe Checkout session for a subscription."""
    if not STRIPE_SECRET_KEY:
        raise Exception("Stripe is not configured")

    if tier not in PRICING:
        raise ValueError(f"Invalid tier: {tier}")

    _ensure_stripe_products()
    if tier not in STRIPE_PRODUCTS:
        raise Exception(f"Stripe product not set up for {tier}")

    customer_id = get_or_create_customer(user_id, email)

    session = _stripe_request("POST", "/checkout/sessions", {
        "mode": "subscription",
        "customer": customer_id,
        "line_items[0][price]": STRIPE_PRODUCTS[tier]["price_id"],
        "line_items[0][quantity]": "1",
        "success_url": f"{FRONTEND_URL}/pricing?success=true&tier={tier}",
        "cancel_url": f"{FRONTEND_URL}/pricing?canceled=true",
        "metadata[user_id]": user_id,
        "metadata[tier]": tier,
        "subscription_data[metadata][user_id]": user_id,
        "subscription_data[metadata][tier]": tier,
    })
    # NOTE: To display "MonteCarloo.com" on checkout, update the Stripe account's
    # public business name at https://dashboard.stripe.com/settings/public
    # Set: Business name = "MonteCarloo" and Support URL = "https://montecarloo.com"
    # This cannot be set via API — it's an account-level setting.

    return {
        "checkout_url": session["url"],
        "session_id": session["id"],
    }


def create_portal_session(user_id: str) -> Dict[str, str]:
    """Create a Stripe Customer Portal session for managing subscriptions."""
    if not STRIPE_SECRET_KEY:
        raise Exception("Stripe is not configured")

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        if not row or not row["stripe_customer_id"]:
            raise Exception("No subscription found")
    finally:
        conn.close()

    session = _stripe_request("POST", "/billing_portal/sessions", {
        "customer": row["stripe_customer_id"],
        "return_url": f"{FRONTEND_URL}/pricing",
    })

    return {"portal_url": session["url"]}


# ---------------------------------------------------------------------------
# Webhook processing
# ---------------------------------------------------------------------------

def verify_webhook_signature(payload: bytes, sig_header: str) -> bool:
    """Verify Stripe webhook signature."""
    if not STRIPE_WEBHOOK_SECRET:
        return True  # Skip verification in test mode without webhook secret

    try:
        elements = dict(item.split("=", 1) for item in sig_header.split(","))
        timestamp = elements.get("t", "")
        sig = elements.get("v1", "")

        signed_payload = f"{timestamp}.{payload.decode()}"
        expected = hmac.new(
            STRIPE_WEBHOOK_SECRET.encode(),
            signed_payload.encode(),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(sig, expected)
    except Exception:
        return False


def process_webhook_event(event: dict):
    """Process a Stripe webhook event."""
    event_type = event.get("type", "")
    event_id = event.get("id", "")
    data = event.get("data", {}).get("object", {})

    # Deduplicate
    conn = get_db()
    try:
        try:
            existing = conn.execute(
                "SELECT id FROM stripe_events WHERE id = ?", (event_id,)
            ).fetchone()
            if existing:
                return {"status": "already_processed"}
        except Exception:
            # stripe_events table might not exist yet, continue
            pass
    finally:
        conn.close()

    result = {"status": "processed", "event_type": event_type}

    if event_type == "checkout.session.completed":
        # Determine if this is a subscription or a one-time marketplace purchase
        mode = data.get("mode", "")
        purchase_id = data.get("metadata", {}).get("purchase_id")
        listing_id = data.get("metadata", {}).get("listing_id")

        if mode == "payment" and (purchase_id or listing_id):
            # One-time marketplace purchase — complete it
            _handle_marketplace_checkout_completed(data)
        else:
            # Subscription checkout
            _handle_checkout_completed(data)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data)
    elif event_type == "invoice.payment_succeeded":
        _handle_payment_succeeded(data)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data)
    # --- Stripe Connect events ---
    elif event_type == "account.updated":
        _handle_connect_account_updated(data)
    elif event_type in ("transfer.created", "transfer.paid"):
        _handle_connect_transfer(data, event_type)
    elif event_type == "payout.paid":
        _handle_connect_payout_paid(data)

    # Record event (Postgres-compatible upsert)
    conn = get_db()
    try:
        try:
            conn.execute(
                "INSERT INTO stripe_events (id, event_type, data) VALUES (?, ?, ?)",
                (event_id, event_type, json.dumps(data))
            )
        except Exception:
            # Already exists (duplicate event), ignore
            try:
                conn.rollback()
            except Exception:
                pass
        conn.commit()
    finally:
        conn.close()

    return result


def _handle_marketplace_checkout_completed(session: dict):
    """Handle successful one-time marketplace purchase checkout."""
    session_id = session.get("id", "")
    purchase_id = session.get("metadata", {}).get("purchase_id")
    listing_id = session.get("metadata", {}).get("listing_id")
    buyer_id = session.get("metadata", {}).get("buyer_id")

    if not session_id:
        logger.warning("Marketplace checkout completed without session_id")
        return

    try:
        import marketplace
        result = marketplace.complete_purchase(session_id)
        if result:
            logger.info(f"Marketplace purchase completed: purchase={purchase_id}, listing={listing_id}, buyer={buyer_id}")
        else:
            logger.warning(f"Marketplace purchase not found for session: {session_id}")
    except Exception as e:
        logger.error(f"Failed to complete marketplace purchase: {e}")


def _handle_checkout_completed(session: dict):
    """Handle successful checkout — activate subscription."""
    user_id = session.get("metadata", {}).get("user_id")
    tier = session.get("metadata", {}).get("tier", "pro")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    if not user_id:
        logger.warning("Checkout completed without user_id in metadata")
        return

    import secrets
    conn = get_db()
    try:
        # Upsert subscription
        existing = conn.execute(
            "SELECT id FROM subscriptions WHERE user_id = ?", (user_id,)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE subscriptions SET
                    tier = ?, status = 'active',
                    stripe_customer_id = ?, stripe_subscription_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (tier, customer_id, subscription_id, user_id))
        else:
            conn.execute("""
                INSERT INTO subscriptions (id, user_id, tier, status, stripe_customer_id, stripe_subscription_id)
                VALUES (?, ?, ?, 'active', ?, ?)
            """, (secrets.token_urlsafe(16), user_id, tier, customer_id, subscription_id))

        # Update user tier
        conn.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, user_id))
        conn.commit()
        logger.info(f"User {user_id} upgraded to {tier}")
    finally:
        conn.close()


def _handle_subscription_updated(subscription: dict):
    """Handle subscription update (upgrade/downgrade/renewal)."""
    user_id = subscription.get("metadata", {}).get("user_id")
    status = subscription.get("status")
    cancel_at_end = subscription.get("cancel_at_period_end", False)

    if not user_id:
        return

    tier = "free"
    if status == "active" and not cancel_at_end:
        # Determine tier from price
        items = subscription.get("items", {}).get("data", [])
        if items:
            price_id = items[0].get("price", {}).get("id", "")
            for t, prod in STRIPE_PRODUCTS.items():
                if prod.get("price_id") == price_id:
                    tier = t
                    break
        if tier == "free":
            tier = subscription.get("metadata", {}).get("tier", "pro")

    conn = get_db()
    try:
        conn.execute("""
            UPDATE subscriptions SET
                tier = ?, status = ?,
                cancel_at_period_end = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (tier, status, 1 if cancel_at_end else 0, user_id))
        conn.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, user_id))
        conn.commit()
    finally:
        conn.close()


def _handle_subscription_deleted(subscription: dict):
    """Handle subscription cancellation — downgrade to free."""
    user_id = subscription.get("metadata", {}).get("user_id")
    if not user_id:
        return

    conn = get_db()
    try:
        conn.execute("""
            UPDATE subscriptions SET
                tier = 'free', status = 'canceled',
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (user_id,))
        conn.execute("UPDATE users SET tier = 'free' WHERE id = ?", (user_id,))
        conn.commit()
        logger.info(f"User {user_id} downgraded to free (subscription canceled)")
    finally:
        conn.close()


def _handle_payment_succeeded(invoice: dict):
    """Payment succeeded — ensure tier is active."""
    customer_id = invoice.get("customer")
    if not customer_id:
        return

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT user_id, tier FROM subscriptions WHERE stripe_customer_id = ?",
            (customer_id,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE subscriptions SET status = 'active' WHERE user_id = ?",
                (row["user_id"],)
            )
            conn.commit()
    finally:
        conn.close()


def _handle_payment_failed(invoice: dict):
    """Payment failed — flag but don't immediately downgrade (grace period)."""
    customer_id = invoice.get("customer")
    if not customer_id:
        return

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?",
            (customer_id,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE subscriptions SET status = 'past_due' WHERE user_id = ?",
                (row["user_id"],)
            )
            conn.commit()
            logger.warning(f"Payment failed for user {row['user_id']}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Tier checking
# ---------------------------------------------------------------------------

def get_user_tier(user_id: Optional[str] = None) -> str:
    """Get user's current tier. Returns 'free' for anonymous/unknown users."""
    if not user_id:
        return "free"

    conn = get_db()
    try:
        row = conn.execute("SELECT tier FROM users WHERE id = ?", (user_id,)).fetchone()
        return row["tier"] if row else "free"
    finally:
        conn.close()


def get_tier_limits(tier: str = "free") -> Dict[str, Any]:
    """Get limits for a tier."""
    return TIER_LIMITS.get(tier, TIER_LIMITS["free"])


def check_event_limit(user_id: Optional[str], event_count: int) -> Dict[str, Any]:
    """Check if user can add more events. Returns limit info."""
    tier = get_user_tier(user_id)
    limits = get_tier_limits(tier)
    max_events = limits["max_events_per_scenario"]
    allowed = event_count <= max_events

    return {
        "allowed": allowed,
        "tier": tier,
        "current_count": event_count,
        "max_allowed": max_events,
        "upgrade_needed": not allowed,
    }


def check_pine_overlay_limit(user_id: Optional[str], overlay_count: int) -> Dict[str, Any]:
    """Check if user can add more Pine overlays. Returns limit info."""
    tier = get_user_tier(user_id)
    limits = get_tier_limits(tier)
    max_overlays = limits["max_pine_overlays"]
    allowed = overlay_count <= max_overlays

    return {
        "allowed": allowed,
        "tier": tier,
        "current_count": overlay_count,
        "max_allowed": max_overlays,
        "upgrade_needed": not allowed,
    }


# ---------------------------------------------------------------------------
# Stripe Connect webhook handlers
# ---------------------------------------------------------------------------

def _handle_connect_account_updated(account: dict):
    """Handle account.updated — refresh creator connect status in DB."""
    account_id = account.get("id")
    if not account_id:
        return

    charges_enabled = account.get("charges_enabled", False)
    payouts_enabled = account.get("payouts_enabled", False)
    details_submitted = account.get("details_submitted", False)

    conn = get_db()
    try:
        # Find creator by connected account ID and log the update
        row = conn.execute(
            "SELECT user_id FROM creator_profiles WHERE stripe_connected_account_id = ?",
            (account_id,)
        ).fetchone()
        if row:
            logger.info(
                f"Connect account updated for user {row['user_id']}: "
                f"charges={charges_enabled}, payouts={payouts_enabled}, details={details_submitted}"
            )
    except Exception as e:
        logger.warning(f"account.updated handler error: {e}")
    finally:
        conn.close()


def _handle_connect_transfer(transfer: dict, event_type: str):
    """Handle transfer.created / transfer.paid — log payout record."""
    import secrets
    transfer_id = transfer.get("id")
    amount = transfer.get("amount", 0)
    destination = transfer.get("destination")
    if not transfer_id:
        return

    conn = get_db()
    try:
        # Find creator by connected account ID
        row = conn.execute(
            "SELECT user_id FROM creator_profiles WHERE stripe_connected_account_id = ?",
            (destination,)
        ).fetchone()
        creator_id = row["user_id"] if row else ""

        status = "paid" if event_type == "transfer.paid" else "pending"

        # Upsert payout record
        existing = conn.execute(
            "SELECT id FROM marketplace_payouts WHERE stripe_transfer_id = ?",
            (transfer_id,)
        ).fetchone()

        if existing:
            conn.execute(
                "UPDATE marketplace_payouts SET status = ? WHERE stripe_transfer_id = ?",
                (status, transfer_id)
            )
        else:
            payout_id = secrets.token_urlsafe(12)
            conn.execute("""
                INSERT INTO marketplace_payouts
                (id, creator_id, amount_cents, stripe_transfer_id, status)
                VALUES (?, ?, ?, ?, ?)
            """, (payout_id, creator_id, amount, transfer_id, status))

        conn.commit()
        logger.info(f"Transfer {event_type}: {transfer_id} amount={amount} creator={creator_id}")
    except Exception as e:
        logger.warning(f"{event_type} handler error: {e}")
    finally:
        conn.close()


def _handle_connect_payout_paid(payout: dict):
    """Handle payout.paid — update payout status in DB."""
    payout_id_stripe = payout.get("id")
    if not payout_id_stripe:
        return

    conn = get_db()
    try:
        conn.execute(
            "UPDATE marketplace_payouts SET status = 'paid', stripe_payout_id = ?, completed_at = CURRENT_TIMESTAMP WHERE stripe_transfer_id = ?",
            (payout_id_stripe, payout_id_stripe)
        )
        conn.commit()
        logger.info(f"Payout paid: {payout_id_stripe}")
    except Exception as e:
        logger.warning(f"payout.paid handler error: {e}")
    finally:
        conn.close()


# Initialize on import
init_billing_db()
