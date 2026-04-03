"""
Whale Signal — consensus scoring and Monte Carlo drift modifier.

Aggregates whale trades into a directional consensus score (-10 to +10)
and converts that into drift/vol adjustments for the simulation engine.
"""

import logging
from datetime import date
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Calibration: +10 consensus ≈ +1% annualized drift adjustment
DRIFT_SCALE = 0.001
# Conviction weights
CONVICTION_OPENING = 1.0
CONVICTION_MIXED = 0.7
CONVICTION_CLOSING = 0.4


def get_consensus(ticker: str, scan_date: Optional[str] = None) -> Dict:
    """
    Calculate whale consensus score for a ticker.

    Returns:
        {
            "ticker": str,
            "score": float (-10 to +10),
            "trade_count": int,
            "net_premium_bullish": float,
            "net_premium_bearish": float,
            "net_premium_neutral": float,
            "total_premium": float,
            "direction": str ("bullish" | "bearish" | "neutral"),
            "scan_date": str
        }
    """
    from whale_flow import get_whale_trades

    target_date = scan_date or date.today().isoformat()
    trades, total = get_whale_trades(
        ticker=ticker, scan_date=target_date, page=1, limit=1000
    )

    if not trades:
        return {
            "ticker": ticker.upper(),
            "score": 0.0,
            "trade_count": 0,
            "net_premium_bullish": 0.0,
            "net_premium_bearish": 0.0,
            "net_premium_neutral": 0.0,
            "total_premium": 0.0,
            "direction": "neutral",
            "scan_date": target_date,
        }

    bullish_premium = 0.0
    bearish_premium = 0.0
    neutral_premium = 0.0
    weighted_sum = 0.0

    for t in trades:
        premium = t["estimated_premium"]
        position = t.get("position_type", "mixed")

        if position == "opening":
            conviction = CONVICTION_OPENING
        elif position == "closing":
            conviction = CONVICTION_CLOSING
        else:
            conviction = CONVICTION_MIXED

        sentiment = t["bullish_bearish"]
        if sentiment == "bullish":
            bullish_premium += premium
            weighted_sum += premium * conviction
        elif sentiment == "bearish":
            bearish_premium += premium
            weighted_sum -= premium * conviction
        else:
            neutral_premium += premium

    total_premium = bullish_premium + bearish_premium + neutral_premium

    # Normalize to -10 to +10 scale
    if total_premium > 0:
        raw_score = weighted_sum / total_premium * 10
    else:
        raw_score = 0.0

    score = max(-10.0, min(10.0, round(raw_score, 1)))

    if score > 1.0:
        direction = "bullish"
    elif score < -1.0:
        direction = "bearish"
    else:
        direction = "neutral"

    return {
        "ticker": ticker.upper(),
        "score": score,
        "trade_count": len(trades),
        "net_premium_bullish": round(bullish_premium, 2),
        "net_premium_bearish": round(bearish_premium, 2),
        "net_premium_neutral": round(neutral_premium, 2),
        "total_premium": round(total_premium, 2),
        "direction": direction,
        "scan_date": target_date,
    }


def compute_drift_adjustment(trade_ids: List[int] = None, ticker: str = None) -> Dict:
    """
    Compute drift and volatility adjustments from whale trades.

    Can work in two modes:
    1. Specific trade_ids — user dragged specific trades onto the chart
    2. Ticker consensus — applies all whale trades for the ticker

    Returns:
        {
            "drift_adjustment": float,
            "vol_multiplier": float,
            "whale_score": float,
            "trade_count": int,
            "description": str
        }
    """
    from whale_flow import get_trade_by_id, get_whale_trades

    trades = []
    if trade_ids:
        for tid in trade_ids:
            trade = get_trade_by_id(tid)
            if trade:
                trades.append(trade)
    elif ticker:
        fetched, _ = get_whale_trades(ticker=ticker, page=1, limit=500)
        trades = fetched

    if not trades:
        return {
            "drift_adjustment": 0.0,
            "vol_multiplier": 1.0,
            "whale_score": 0.0,
            "trade_count": 0,
            "description": "No whale trades applied",
        }

    weighted_sum = 0.0
    total_premium = 0.0
    vol_signals = []

    for t in trades:
        premium = t["estimated_premium"]
        position = t.get("position_type", "mixed")
        conviction = CONVICTION_OPENING if position == "opening" else (
            CONVICTION_CLOSING if position == "closing" else CONVICTION_MIXED
        )

        sentiment = t["bullish_bearish"]
        if sentiment == "bullish":
            weighted_sum += premium * conviction
        elif sentiment == "bearish":
            weighted_sum -= premium * conviction

        total_premium += premium

        # High IV trades increase expected volatility
        iv = t.get("iv", 0) or 0
        if iv > 0.5:  # IV > 50% is elevated
            vol_signals.append(iv)

    # Drift adjustment
    if total_premium > 0:
        raw_score = weighted_sum / total_premium * 10
    else:
        raw_score = 0.0

    score = max(-10.0, min(10.0, raw_score))
    drift_adj = score * DRIFT_SCALE

    # Vol multiplier: if many high-IV trades, increase simulated vol
    vol_mult = 1.0
    if vol_signals:
        avg_iv = sum(vol_signals) / len(vol_signals)
        vol_mult = 1.0 + (avg_iv - 0.5) * 0.3  # Scale modestly
        vol_mult = max(0.8, min(1.5, vol_mult))

    # Human-readable description
    if drift_adj > 0.001:
        desc = f"Whale sentiment: +{drift_adj*100:.2f}% drift adjustment ({len(trades)} trades, ${total_premium/1e6:.1f}M net bullish)"
    elif drift_adj < -0.001:
        desc = f"Whale sentiment: {drift_adj*100:.2f}% drift adjustment ({len(trades)} trades, ${total_premium/1e6:.1f}M net bearish)"
    else:
        desc = f"Whale sentiment: neutral ({len(trades)} trades, ${total_premium/1e6:.1f}M mixed)"

    return {
        "drift_adjustment": round(drift_adj, 6),
        "vol_multiplier": round(vol_mult, 3),
        "whale_score": round(score, 1),
        "trade_count": len(trades),
        "description": desc,
    }


def get_flow_stats(scan_date: Optional[str] = None) -> Dict:
    """Get aggregate whale flow stats for the day."""
    from db import get_db

    target_date = scan_date or date.today().isoformat()
    conn = get_db()
    try:
        # Total premium today
        row = conn.execute(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(estimated_premium), 0) as total FROM whale_trades WHERE scan_date = ?",
            (target_date,)
        ).fetchone()
        total_trades = row["cnt"] if row else 0
        total_premium = row["total"] if row else 0

        # Top tickers by premium
        top_tickers = conn.execute(
            """SELECT ticker, COUNT(*) as cnt, SUM(estimated_premium) as total,
                      SUM(CASE WHEN bullish_bearish='bullish' THEN estimated_premium ELSE 0 END) as bull,
                      SUM(CASE WHEN bullish_bearish='bearish' THEN estimated_premium ELSE 0 END) as bear
               FROM whale_trades WHERE scan_date = ?
               GROUP BY ticker ORDER BY total DESC LIMIT 10""",
            (target_date,)
        ).fetchall()

        # Sector sentiment (we don't have sector in whale_trades, so group by ticker)
        bullish_total = conn.execute(
            "SELECT COALESCE(SUM(estimated_premium), 0) as total FROM whale_trades WHERE scan_date = ? AND bullish_bearish = 'bullish'",
            (target_date,)
        ).fetchone()
        bearish_total = conn.execute(
            "SELECT COALESCE(SUM(estimated_premium), 0) as total FROM whale_trades WHERE scan_date = ? AND bullish_bearish = 'bearish'",
            (target_date,)
        ).fetchone()

        return {
            "scan_date": target_date,
            "total_trades": total_trades,
            "total_premium": round(float(total_premium), 2),
            "bullish_premium": round(float(bullish_total["total"]) if bullish_total else 0, 2),
            "bearish_premium": round(float(bearish_total["total"]) if bearish_total else 0, 2),
            "top_tickers": [
                {
                    "ticker": r["ticker"],
                    "trade_count": r["cnt"],
                    "total_premium": round(float(r["total"]), 2),
                    "bullish_premium": round(float(r["bull"]), 2),
                    "bearish_premium": round(float(r["bear"]), 2),
                }
                for r in top_tickers
            ],
        }
    finally:
        conn.close()
