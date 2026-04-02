"""
Whale Trade AI Analysis — generates market reasoning for individual whale trades.

Uses the existing LLM router (Claude → OpenAI fallback).
Caches analysis for 4 hours.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

logger = logging.getLogger(__name__)

ANALYSIS_TTL_HOURS = 4


def generate_analysis(trade: Dict) -> str:
    """Generate AI market analysis for a whale trade."""
    from llm_router import llm_completion

    premium_m = trade["estimated_premium"] / 1_000_000
    direction_word = "bought" if trade["direction"] == "buy" else "sold"
    sentiment = trade["bullish_bearish"]
    position = trade["position_type"]

    prompt = f"""Analyze this large options trade and explain what it might mean for the stock.
Be concise (3-4 sentences max). Include upcoming catalysts if relevant.

Trade details:
- Ticker: {trade['ticker']}
- Contract: {trade['strike']} {trade['option_type'].upper()} expiring {trade['expiry']}
- Direction: {direction_word} (estimated premium: ${premium_m:.1f}M)
- Sentiment: {sentiment}
- Volume: {trade['volume']:,} contracts vs Open Interest: {trade['open_interest']:,}
- Position type: {position} (volume/OI ratio: {trade['volume_oi_ratio']})
- IV: {trade['iv']:.1%}
- Multi-leg: {'Yes' if trade.get('is_multileg') else 'No'}

Provide a brief, actionable analysis covering:
1. What this bet likely means (directional conviction, hedging, or vol play)
2. Key upcoming catalysts for {trade['ticker']} (earnings, FDA, macro events)
3. Whether this size is unusual for {trade['ticker']}
Keep it under 100 words. No disclaimers."""

    try:
        analysis = llm_completion(prompt, max_tokens=200, temperature=0.3)
        return analysis.strip()
    except Exception as e:
        logger.warning(f"LLM analysis failed for {trade['ticker']}: {e}")
        # Fallback to template-based analysis
        return _template_analysis(trade)


def _template_analysis(trade: Dict) -> str:
    """Fallback template-based analysis when LLM is unavailable."""
    premium_m = trade["estimated_premium"] / 1_000_000
    sentiment = trade["bullish_bearish"]
    position = trade["position_type"]

    if sentiment == "bullish":
        direction_text = "Smart money appears to be positioning for upside"
    elif sentiment == "bearish":
        direction_text = "Institutional flow suggests downside positioning"
    else:
        direction_text = "This appears to be a volatility or hedging play"

    if position == "opening":
        position_text = "High volume/OI ratio indicates new positions being established — high conviction."
    elif position == "closing":
        position_text = "Volume near open interest suggests position closing — potentially reducing exposure."
    else:
        position_text = "Mixed signals on whether this is a new or closing position."

    return f"{direction_text} in {trade['ticker']} with a ${premium_m:.1f}M {trade['option_type']} bet targeting {trade['strike']} by {trade['expiry']}. {position_text}"


def get_or_generate_analysis(trade_id: int) -> Optional[str]:
    """Get cached analysis or generate new one."""
    from db import get_db
    from whale_flow import get_trade_by_id

    trade = get_trade_by_id(trade_id)
    if not trade:
        return None

    # Check cache
    if trade.get("analysis_cache") and trade.get("analysis_cached_at"):
        try:
            cached_at = datetime.fromisoformat(trade["analysis_cached_at"])
            if datetime.utcnow() - cached_at < timedelta(hours=ANALYSIS_TTL_HOURS):
                return trade["analysis_cache"]
        except (ValueError, TypeError):
            pass

    # Generate new analysis
    analysis = generate_analysis(trade)

    # Cache it
    conn = get_db()
    try:
        conn.execute(
            "UPDATE whale_trades SET analysis_cache = ?, analysis_cached_at = ? WHERE id = ?",
            (analysis, datetime.utcnow().isoformat(), trade_id)
        )
        conn.commit()
    except Exception as e:
        logger.warning(f"Failed to cache analysis for trade {trade_id}: {e}")
    finally:
        conn.close()

    return analysis
