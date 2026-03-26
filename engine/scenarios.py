"""
Scenario CRUD operations.
"""

import json
import string
import random
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from db import get_db

logger = logging.getLogger(__name__)


def _nanoid(size: int = 10) -> str:
    """Generate a URL-safe nanoid."""
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choices(alphabet, k=size))


def create_scenario(
    ticker: str,
    events: List[Dict],
    result_summary: Optional[Dict] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    author_name: str = "Anonymous",
    author_id: Optional[str] = None,
    is_public: bool = True,
    tags: Optional[str] = None,
    forked_from: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new scenario."""
    scenario_id = _nanoid(10)

    # Auto-generate title if not provided
    if not title:
        event_names = [e.get("name", e.get("id", "")) for e in events[:3]]
        title = f"{ticker} — {' + '.join(event_names)}" if event_names else f"{ticker} Scenario"

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO scenarios
            (id, ticker, title, description, events, result_summary,
             author_name, author_id, is_public, tags, forked_from)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                scenario_id,
                ticker.upper(),
                title[:200],
                (description or "")[:500],
                json.dumps(events),
                json.dumps(result_summary) if result_summary else None,
                author_name[:50],
                author_id,
                1 if is_public else 0,
                tags,
                forked_from,
            ),
        )

        # Increment parent's fork count
        if forked_from:
            conn.execute(
                "UPDATE scenarios SET forks = forks + 1 WHERE id = ?",
                (forked_from,),
            )

        conn.commit()
        return get_scenario(scenario_id)
    finally:
        conn.close()


def get_scenario(scenario_id: str, increment_views: bool = False) -> Optional[Dict]:
    """Get a scenario by ID."""
    conn = get_db()
    try:
        if increment_views:
            conn.execute(
                "UPDATE scenarios SET views = views + 1 WHERE id = ?",
                (scenario_id,),
            )
            conn.commit()

        row = conn.execute(
            "SELECT * FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        if not row:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()


def list_scenarios(
    sort: str = "trending",
    ticker: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[Dict]:
    """List public scenarios with sorting and filtering."""
    conn = get_db()
    try:
        conditions = ["is_public = 1"]
        params: list = []

        if ticker:
            conditions.append("ticker = ?")
            params.append(ticker.upper())
        if tag:
            conditions.append("tags LIKE ?")
            params.append(f"%{tag}%")

        where = " AND ".join(conditions)

        order_map = {
            "trending": "views DESC, created_at DESC",  # Simple trending = most views
            "newest": "created_at DESC",
            "views": "views DESC",
            "forks": "forks DESC",
            "likes": "likes DESC",
        }
        order = order_map.get(sort, "views DESC")

        rows = conn.execute(
            f"SELECT * FROM scenarios WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def fork_scenario(scenario_id: str, author_name: str = "Anonymous", author_id: Optional[str] = None, commentary: str = "", user_id: Optional[str] = None) -> Optional[Dict]:
    """Fork (copy) a scenario with optional commentary."""
    original = get_scenario(scenario_id)
    if not original:
        return None

    # Use user_id if provided, otherwise author_id
    effective_author_id = user_id or author_id

    # Build description: original description + fork commentary
    desc = original.get("description") or ""
    if commentary:
        desc = f"🔄 Forked from {original.get('author_name', 'Anonymous')}: {commentary}"

    return create_scenario(
        ticker=original["ticker"],
        events=original["events"],
        result_summary=original["result_summary"],
        title=f"{original['title']} (fork)",
        description=desc,
        author_name=author_name,
        author_id=effective_author_id,
        is_public=True,
        tags=original.get("tags"),
        forked_from=scenario_id,
    )


def like_scenario(scenario_id: str, session_id: str) -> bool:
    """Like a scenario. Returns True if newly liked, False if already liked."""
    conn = get_db()
    try:
        # Check if already liked
        existing = conn.execute(
            "SELECT 1 FROM scenario_likes WHERE scenario_id = ? AND session_id = ?",
            (scenario_id, session_id),
        ).fetchone()

        if existing:
            return False

        conn.execute(
            "INSERT INTO scenario_likes (scenario_id, session_id) VALUES (?, ?)",
            (scenario_id, session_id),
        )
        conn.execute(
            "UPDATE scenarios SET likes = likes + 1 WHERE id = ?",
            (scenario_id,),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def seed_scenarios():
    """Seed initial scenarios if the database is empty."""
    conn = get_db()
    try:
        count = conn.execute("SELECT COUNT(*) as cnt FROM scenarios").fetchone()["cnt"]
        if count > 0:
            return  # Already seeded

        logger.info("Seeding initial scenarios...")

        seeds = [
            {
                "ticker": "CVX",
                "title": "CVX — Iran War Escalation Scenario",
                "description": "What happens to Chevron if the Iran-Israel conflict escalates further? Oil disruption + defense spending boost.",
                "events": [
                    {"id": "iran_escalation", "probability": 86, "duration": 30, "impact": -12},
                    {"id": "oil_disruption", "probability": 65, "duration": 45, "impact": 15},
                ],
                "result_summary": {"median30d": 162, "probProfit": 68, "eventImpact": 14, "currentPrice": 148},
                "author_name": "AlphaEdge",
                "tags": "iran,oil,geopolitical",
                "views": 342,
                "forks": 12,
                "likes": 28,
            },
            {
                "ticker": "NVDA",
                "title": "NVDA — China Chip Export Controls",
                "description": "If US tightens chip export restrictions to China, NVIDIA faces significant revenue impact from its largest international market.",
                "events": [
                    {"id": "chip_export_control", "probability": 45, "duration": 60, "impact": -20},
                    {"id": "china_taiwan", "probability": 10, "duration": 90, "impact": -25},
                ],
                "result_summary": {"median30d": 98, "probProfit": 35, "eventImpact": -10, "currentPrice": 108},
                "author_name": "ChipWatcher",
                "tags": "china,semiconductors,trade",
                "views": 527,
                "forks": 18,
                "likes": 45,
            },
            {
                "ticker": "TSLA",
                "title": "TSLA — Tariff Impact on EV Market",
                "description": "How tariff increases affect Tesla through supply chain costs and competitive dynamics.",
                "events": [
                    {"id": "tariff_increase", "probability": 70, "duration": 90, "impact": -15},
                ],
                "result_summary": {"median30d": 228, "probProfit": 42, "eventImpact": -20, "currentPrice": 248},
                "author_name": "EVAnalyst",
                "tags": "tariff,ev,trade",
                "views": 415,
                "forks": 8,
                "likes": 31,
            },
            {
                "ticker": "SPY",
                "title": "SPY — Fed Rate Cut Scenario",
                "description": "Market reaction if the Federal Reserve cuts rates in the next meeting. Broad market bullish signal.",
                "events": [
                    {"id": "fed_rate_cut", "probability": 25, "duration": 30, "impact": 8},
                    {"id": "recession", "probability": 15, "duration": 60, "impact": -12},
                ],
                "result_summary": {"median30d": 525, "probProfit": 55, "eventImpact": 5, "currentPrice": 520},
                "author_name": "MacroTrader",
                "tags": "fed,rates,macro",
                "views": 689,
                "forks": 22,
                "likes": 53,
            },
            {
                "ticker": "XOM",
                "title": "XOM — Kharg Island Oil Disruption",
                "description": "If Iran's Kharg Island oil terminal is disrupted, ExxonMobil benefits from higher oil prices.",
                "events": [
                    {"id": "oil_disruption", "probability": 8, "duration": 30, "impact": 18},
                    {"id": "iran_escalation", "probability": 86, "duration": 45, "impact": 5},
                ],
                "result_summary": {"median30d": 115, "probProfit": 72, "eventImpact": 7, "currentPrice": 108},
                "author_name": "OilBull",
                "tags": "oil,iran,energy",
                "views": 256,
                "forks": 6,
                "likes": 19,
            },
            {
                "ticker": "LMT",
                "title": "LMT — Defense Spending Surge",
                "description": "Lockheed Martin if global defense spending increases due to geopolitical tensions.",
                "events": [
                    {"id": "defense_spending", "probability": 70, "duration": 90, "impact": 12},
                    {"id": "iran_escalation", "probability": 86, "duration": 30, "impact": 8},
                ],
                "result_summary": {"median30d": 490, "probProfit": 78, "eventImpact": 30, "currentPrice": 460},
                "author_name": "DefenseAnalyst",
                "tags": "defense,geopolitical,military",
                "views": 312,
                "forks": 9,
                "likes": 24,
            },
            {
                "ticker": "AAPL",
                "title": "AAPL — China-Taiwan Tension Impact",
                "description": "Apple's massive supply chain dependency on Taiwan makes it vulnerable to any China-Taiwan escalation.",
                "events": [
                    {"id": "china_taiwan", "probability": 10, "duration": 90, "impact": -22},
                    {"id": "tariff_increase", "probability": 70, "duration": 60, "impact": -8},
                ],
                "result_summary": {"median30d": 188, "probProfit": 45, "eventImpact": -7, "currentPrice": 195},
                "author_name": "TechBear",
                "tags": "china,taiwan,supply-chain",
                "views": 478,
                "forks": 15,
                "likes": 37,
            },
            {
                "ticker": "GLD",
                "title": "GLD — Inflation Hedge Play",
                "description": "Gold as an inflation hedge if CPI spikes and Fed is forced to respond.",
                "events": [
                    {"id": "inflation_spike", "probability": 30, "duration": 60, "impact": 10},
                    {"id": "fed_rate_hike", "probability": 5, "duration": 30, "impact": -5},
                ],
                "result_summary": {"median30d": 285, "probProfit": 60, "eventImpact": 5, "currentPrice": 280},
                "author_name": "GoldBug",
                "tags": "gold,inflation,macro",
                "views": 198,
                "forks": 4,
                "likes": 15,
            },
        ]

        for s in seeds:
            scenario_id = _nanoid(10)
            conn.execute(
                """INSERT INTO scenarios
                (id, ticker, title, description, events, result_summary,
                 author_name, is_public, tags, views, forks, likes)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)""",
                (
                    scenario_id,
                    s["ticker"],
                    s["title"],
                    s["description"],
                    json.dumps(s["events"]),
                    json.dumps(s["result_summary"]),
                    s["author_name"],
                    s["tags"],
                    s["views"],
                    s["forks"],
                    s["likes"],
                ),
            )

        conn.commit()
        logger.info(f"Seeded {len(seeds)} scenarios")
    finally:
        conn.close()


def _row_to_dict(row) -> Dict:
    """Convert a SQLite Row to a dict with parsed JSON fields."""
    d = dict(row)
    if d.get("events"):
        d["events"] = json.loads(d["events"])
    if d.get("result_summary"):
        d["result_summary"] = json.loads(d["result_summary"])
    d["is_public"] = bool(d.get("is_public"))
    return d


# Seed on import
seed_scenarios()
