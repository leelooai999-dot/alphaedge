"""
Whale Flow Scanner — surfaces options contracts with >$500K estimated premium.

Scans top liquid US tickers via yfinance, detects trade direction (buy/sell),
position type (opening/closing), and multi-leg structures.
"""

import json
import logging
import os
import time
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Top 200 most liquid options tickers
WHALE_TICKERS_PATH = os.path.join(os.path.dirname(__file__), "whale_tickers.json")

DEFAULT_TICKERS = [
    "SPY", "QQQ", "AAPL", "NVDA", "TSLA", "AMZN", "META", "MSFT", "GOOG", "AMD",
    "NFLX", "BA", "JPM", "GS", "BAC", "WFC", "C", "MS", "V", "MA",
    "XOM", "CVX", "COP", "OXY", "SLB", "HAL", "MPC", "VLO", "PSX", "PBR",
    "COIN", "MSTR", "SQ", "PYPL", "SHOP", "ROKU", "SNOW", "PLTR", "CRWD", "ZS",
    "ARM", "SMCI", "AVGO", "MU", "INTC", "QCOM", "TXN", "LRCX", "AMAT", "KLAC",
    "IWM", "DIA", "XLF", "XLE", "XLK", "XLV", "XLI", "XLP", "XLU", "GLD",
    "SLV", "USO", "TLT", "HYG", "LQD", "EEM", "FXI", "EWZ", "VIX", "UVXY",
    "SOXL", "SOXS", "TQQQ", "SQQQ", "SPXL", "SPXS", "TNA", "TZA", "LABU", "LABD",
    "BABA", "JD", "PDD", "NIO", "LI", "XPEV", "BIDU", "TME", "BILI", "KWEB",
    "UNH", "JNJ", "PFE", "MRNA", "ABBV", "LLY", "MRK", "BMY", "AMGN", "GILD",
    "WMT", "TGT", "COST", "HD", "LOW", "NKE", "SBUX", "MCD", "DIS", "CMCSA",
    "CRM", "ORCL", "ADBE", "NOW", "PANW", "NET", "DDOG", "MDB", "TEAM", "WDAY",
    "GM", "F", "RIVN", "LCID", "AAL", "DAL", "UAL", "LUV", "CCL", "RCL",
    "ABNB", "UBER", "LYFT", "DASH", "PINS", "SNAP", "RBLX", "U", "TTWO", "EA",
    "BRK.B", "BX", "KKR", "APO", "SCHW", "HOOD", "SOFI", "AFRM", "UPST", "NU",
    "T", "VZ", "TMUS", "CHTR", "CMCSA", "LUMN", "FYBR", "DISH", "PARA", "WBD",
    "DE", "CAT", "GE", "HON", "RTX", "LMT", "NOC", "GD", "AXON", "TDG",
    "FDX", "UPS", "CSX", "NSC", "UNP", "WAB", "ODFL", "XPO", "SAIA", "JBHT",
    "NEE", "SO", "DUK", "AEP", "EXC", "SRE", "D", "PCG", "ED", "WEC",
    "AMT", "PLD", "CCI", "EQIX", "SPG", "O", "DLR", "VICI", "WELL", "PSA",
]

# Minimum premium threshold in dollars
MIN_PREMIUM = 500_000


def load_tickers() -> List[str]:
    """Load ticker list from JSON file, or use defaults."""
    if os.path.exists(WHALE_TICKERS_PATH):
        try:
            with open(WHALE_TICKERS_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return DEFAULT_TICKERS


def detect_direction(last_price: float, bid: float, ask: float) -> str:
    """Detect if trade was buy-side or sell-side based on bid/ask proximity."""
    if bid <= 0 and ask <= 0:
        return "unknown"
    mid = (bid + ask) / 2
    if mid <= 0:
        return "unknown"
    if last_price >= mid:
        return "buy"
    return "sell"


def detect_bullish_bearish(option_type: str, direction: str) -> str:
    """Determine bullish/bearish sentiment from option type + direction."""
    if direction == "unknown":
        return "neutral"
    if option_type == "call":
        return "bullish" if direction == "buy" else "bearish"
    else:  # put
        return "bearish" if direction == "buy" else "bullish"


def detect_position_type(volume: int, open_interest: int) -> str:
    """Detect if this is a new position opening or closing."""
    if open_interest <= 0:
        return "opening"
    ratio = volume / open_interest
    if ratio > 2.0:
        return "opening"
    elif ratio > 0.8:
        return "mixed"
    return "closing"


def scan_ticker(ticker: str, max_expiry_days: int = 60) -> List[Dict]:
    """Scan a single ticker for whale options activity."""
    import yfinance as yf

    trades = []
    try:
        stock = yf.Ticker(ticker)
        expirations = stock.options
        if not expirations:
            return trades

        today = date.today()
        cutoff = today + timedelta(days=max_expiry_days)

        for exp_str in expirations:
            exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
            if exp_date > cutoff:
                continue

            try:
                chain = stock.option_chain(exp_str)
            except Exception as e:
                logger.debug(f"Failed to get chain for {ticker} {exp_str}: {e}")
                continue

            for opt_type, df in [("call", chain.calls), ("put", chain.puts)]:
                if df is None or df.empty:
                    continue

                for _, row in df.iterrows():
                    try:
                        raw_vol = row.get("volume", 0)
                        raw_price = row.get("lastPrice", 0)
                        # yfinance returns NaN for some contracts
                        import math
                        if raw_vol is None or (isinstance(raw_vol, float) and math.isnan(raw_vol)):
                            continue
                        if raw_price is None or (isinstance(raw_price, float) and math.isnan(raw_price)):
                            continue
                        volume = int(raw_vol)
                        last_price = float(raw_price)
                    except (ValueError, TypeError):
                        continue
                    if volume <= 0 or last_price <= 0:
                        continue

                    estimated_premium = volume * last_price * 100
                    if estimated_premium < MIN_PREMIUM:
                        continue

                    def safe_float(val, default=0.0):
                        import math
                        if val is None:
                            return default
                        try:
                            f = float(val)
                            return default if math.isnan(f) else f
                        except (ValueError, TypeError):
                            return default

                    def safe_int(val, default=0):
                        import math
                        if val is None:
                            return default
                        try:
                            f = float(val)
                            return default if math.isnan(f) else int(f)
                        except (ValueError, TypeError):
                            return default

                    bid = safe_float(row.get("bid", 0))
                    ask = safe_float(row.get("ask", 0))
                    oi = safe_int(row.get("openInterest", 0))
                    iv = safe_float(row.get("impliedVolatility", 0))
                    strike = safe_float(row.get("strike", 0))

                    direction = detect_direction(last_price, bid, ask)
                    sentiment = detect_bullish_bearish(opt_type, direction)
                    position_type = detect_position_type(volume, oi)
                    vol_oi_ratio = round(volume / max(oi, 1), 2)

                    trades.append({
                        "ticker": ticker,
                        "strike": strike,
                        "expiry": exp_str,
                        "option_type": opt_type,
                        "direction": direction,
                        "bullish_bearish": sentiment,
                        "volume": volume,
                        "open_interest": oi,
                        "last_price": last_price,
                        "bid": bid,
                        "ask": ask,
                        "estimated_premium": round(estimated_premium, 2),
                        "iv": round(iv, 4),
                        "volume_oi_ratio": vol_oi_ratio,
                        "position_type": position_type,
                        "is_multileg": False,
                        "multileg_group_id": None,
                        "scanned_at": datetime.utcnow().isoformat(),
                        "scan_date": today.isoformat(),
                    })

    except Exception as e:
        logger.warning(f"Failed to scan {ticker}: {e}")

    return trades


def detect_multilleg(trades: List[Dict]) -> List[Dict]:
    """Detect potential multi-leg strategies (spreads, straddles)."""
    # Group by ticker + expiry
    groups: Dict[str, List[Dict]] = {}
    for t in trades:
        key = f"{t['ticker']}_{t['expiry']}"
        groups.setdefault(key, []).append(t)

    group_id = 0
    for key, group in groups.items():
        if len(group) < 2:
            continue

        calls = [t for t in group if t["option_type"] == "call"]
        puts = [t for t in group if t["option_type"] == "put"]

        # Straddle/strangle: call + put at same or nearby strikes
        for c in calls:
            for p in puts:
                strike_diff = abs(c["strike"] - p["strike"]) / max(c["strike"], 1)
                if strike_diff < 0.05:  # Within 5% strike range
                    group_id += 1
                    gid = f"ml_{group_id}"
                    c["is_multileg"] = True
                    c["multileg_group_id"] = gid
                    p["is_multileg"] = True
                    p["multileg_group_id"] = gid
                    # Mark as neutral since it's a vol play
                    c["bullish_bearish"] = "neutral"
                    p["bullish_bearish"] = "neutral"

        # Vertical spread: same type, different strikes, opposing directions
        for opt_list in [calls, puts]:
            if len(opt_list) < 2:
                continue
            sorted_opts = sorted(opt_list, key=lambda x: x["strike"])
            for i in range(len(sorted_opts) - 1):
                a, b = sorted_opts[i], sorted_opts[i + 1]
                if a["direction"] != b["direction"] and not a["is_multileg"]:
                    group_id += 1
                    gid = f"ml_{group_id}"
                    a["is_multileg"] = True
                    a["multileg_group_id"] = gid
                    b["is_multileg"] = True
                    b["multileg_group_id"] = gid

    return trades


def save_trades(trades: List[Dict]):
    """Save whale trades to database."""
    from db import get_db, USE_POSTGRES

    if not trades:
        return

    conn = get_db()
    try:
        # Create table if not exists
        if USE_POSTGRES:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS whale_trades (
                    id SERIAL PRIMARY KEY,
                    ticker TEXT NOT NULL,
                    strike REAL NOT NULL,
                    expiry TEXT NOT NULL,
                    option_type TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    bullish_bearish TEXT NOT NULL,
                    volume INTEGER NOT NULL,
                    open_interest INTEGER NOT NULL,
                    last_price REAL NOT NULL,
                    bid REAL NOT NULL,
                    ask REAL NOT NULL,
                    estimated_premium REAL NOT NULL,
                    iv REAL,
                    volume_oi_ratio REAL,
                    position_type TEXT,
                    is_multileg BOOLEAN DEFAULT FALSE,
                    multileg_group_id TEXT,
                    analysis_cache TEXT,
                    analysis_cached_at TEXT,
                    scanned_at TEXT NOT NULL,
                    scan_date TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(ticker, strike, expiry, option_type, scan_date)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_whale_ticker ON whale_trades(ticker)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_whale_premium ON whale_trades(estimated_premium DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_whale_date ON whale_trades(scan_date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_whale_direction ON whale_trades(bullish_bearish)")
        else:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS whale_trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker TEXT NOT NULL,
                    strike REAL NOT NULL,
                    expiry TEXT NOT NULL,
                    option_type TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    bullish_bearish TEXT NOT NULL,
                    volume INTEGER NOT NULL,
                    open_interest INTEGER NOT NULL,
                    last_price REAL NOT NULL,
                    bid REAL NOT NULL,
                    ask REAL NOT NULL,
                    estimated_premium REAL NOT NULL,
                    iv REAL,
                    volume_oi_ratio REAL,
                    position_type TEXT,
                    is_multileg BOOLEAN DEFAULT FALSE,
                    multileg_group_id TEXT,
                    analysis_cache TEXT,
                    analysis_cached_at TEXT,
                    scanned_at TEXT NOT NULL,
                    scan_date TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(ticker, strike, expiry, option_type, scan_date)
                );
                CREATE INDEX IF NOT EXISTS idx_whale_ticker ON whale_trades(ticker);
                CREATE INDEX IF NOT EXISTS idx_whale_premium ON whale_trades(estimated_premium DESC);
                CREATE INDEX IF NOT EXISTS idx_whale_date ON whale_trades(scan_date);
                CREATE INDEX IF NOT EXISTS idx_whale_direction ON whale_trades(bullish_bearish);
            """)

        conn.commit()

        # Upsert trades
        for t in trades:
            try:
                if USE_POSTGRES:
                    conn.execute("""
                        INSERT INTO whale_trades (ticker, strike, expiry, option_type, direction,
                            bullish_bearish, volume, open_interest, last_price, bid, ask,
                            estimated_premium, iv, volume_oi_ratio, position_type,
                            is_multileg, multileg_group_id, scanned_at, scan_date)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (ticker, strike, expiry, option_type, scan_date)
                        DO UPDATE SET volume=EXCLUDED.volume, last_price=EXCLUDED.last_price,
                            bid=EXCLUDED.bid, ask=EXCLUDED.ask, estimated_premium=EXCLUDED.estimated_premium,
                            direction=EXCLUDED.direction, bullish_bearish=EXCLUDED.bullish_bearish,
                            open_interest=EXCLUDED.open_interest, iv=EXCLUDED.iv,
                            volume_oi_ratio=EXCLUDED.volume_oi_ratio, position_type=EXCLUDED.position_type,
                            is_multileg=EXCLUDED.is_multileg, multileg_group_id=EXCLUDED.multileg_group_id,
                            scanned_at=EXCLUDED.scanned_at
                    """, (
                        t["ticker"], t["strike"], t["expiry"], t["option_type"], t["direction"],
                        t["bullish_bearish"], t["volume"], t["open_interest"], t["last_price"],
                        t["bid"], t["ask"], t["estimated_premium"], t["iv"], t["volume_oi_ratio"],
                        t["position_type"], t["is_multileg"], t["multileg_group_id"],
                        t["scanned_at"], t["scan_date"]
                    ))
                else:
                    conn.execute("""
                        INSERT OR REPLACE INTO whale_trades (ticker, strike, expiry, option_type, direction,
                            bullish_bearish, volume, open_interest, last_price, bid, ask,
                            estimated_premium, iv, volume_oi_ratio, position_type,
                            is_multileg, multileg_group_id, scanned_at, scan_date)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, (
                        t["ticker"], t["strike"], t["expiry"], t["option_type"], t["direction"],
                        t["bullish_bearish"], t["volume"], t["open_interest"], t["last_price"],
                        t["bid"], t["ask"], t["estimated_premium"], t["iv"], t["volume_oi_ratio"],
                        t["position_type"], t["is_multileg"], t["multileg_group_id"],
                        t["scanned_at"], t["scan_date"]
                    ))
            except Exception as e:
                logger.warning(f"Failed to insert trade {t['ticker']} {t['strike']}: {e}")
                try:
                    conn.rollback()
                except Exception:
                    pass

        conn.commit()
        logger.info(f"Saved {len(trades)} whale trades")
    finally:
        conn.close()


def get_whale_trades(
    ticker: Optional[str] = None,
    direction: Optional[str] = None,
    min_premium: float = MIN_PREMIUM,
    option_type: Optional[str] = None,
    scan_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Tuple[List[Dict], int]:
    """Query whale trades with filters. Returns (trades, total_count)."""
    from db import get_db, USE_POSTGRES

    conn = get_db()
    try:
        conditions = ["estimated_premium >= ?"]
        params: list = [min_premium]

        if ticker:
            conditions.append("ticker = ?")
            params.append(ticker.upper())
        if direction and direction != "all":
            conditions.append("bullish_bearish = ?")
            params.append(direction)
        if option_type and option_type != "all":
            conditions.append("option_type = ?")
            params.append(option_type)
        if scan_date:
            conditions.append("scan_date = ?")
            params.append(scan_date)
        else:
            # Default to today
            conditions.append("scan_date = ?")
            params.append(date.today().isoformat())

        where = " AND ".join(conditions)

        # Count
        count_row = conn.execute(
            f"SELECT COUNT(*) as cnt FROM whale_trades WHERE {where}", params
        ).fetchone()
        total = count_row["cnt"] if count_row else 0

        # Fetch page
        offset = (page - 1) * limit
        rows = conn.execute(
            f"""SELECT * FROM whale_trades WHERE {where}
                ORDER BY estimated_premium DESC LIMIT ? OFFSET ?""",
            params + [limit, offset]
        ).fetchall()

        trades = []
        for r in rows:
            trades.append({
                "id": r["id"],
                "ticker": r["ticker"],
                "strike": r["strike"],
                "expiry": r["expiry"],
                "option_type": r["option_type"],
                "direction": r["direction"],
                "bullish_bearish": r["bullish_bearish"],
                "volume": r["volume"],
                "open_interest": r["open_interest"],
                "last_price": r["last_price"],
                "bid": r["bid"],
                "ask": r["ask"],
                "estimated_premium": r["estimated_premium"],
                "iv": r["iv"],
                "volume_oi_ratio": r["volume_oi_ratio"],
                "position_type": r["position_type"],
                "is_multileg": r["is_multileg"],
                "multileg_group_id": r["multileg_group_id"],
                "analysis_cache": r["analysis_cache"],
                "scanned_at": r["scanned_at"],
                "scan_date": r["scan_date"],
            })

        return trades, total
    finally:
        conn.close()


def get_trade_by_id(trade_id: int) -> Optional[Dict]:
    """Get a single whale trade by ID."""
    from db import get_db

    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM whale_trades WHERE id = ?", (trade_id,)).fetchone()
        if not row:
            return None
        return {k: row[k] for k in [
            "id", "ticker", "strike", "expiry", "option_type", "direction",
            "bullish_bearish", "volume", "open_interest", "last_price", "bid", "ask",
            "estimated_premium", "iv", "volume_oi_ratio", "position_type",
            "is_multileg", "multileg_group_id", "analysis_cache", "analysis_cached_at",
            "scanned_at", "scan_date"
        ]}
    finally:
        conn.close()


def run_full_scan(tickers: Optional[List[str]] = None) -> int:
    """Run a full scan of all tickers. Returns number of whale trades found."""
    if tickers is None:
        tickers = load_tickers()

    all_trades = []
    for i, ticker in enumerate(tickers):
        if i > 0 and i % 20 == 0:
            logger.info(f"Scanned {i}/{len(tickers)} tickers, found {len(all_trades)} whale trades so far")

        trades = scan_ticker(ticker)
        all_trades.extend(trades)

    # Detect multi-leg structures
    all_trades = detect_multilleg(all_trades)

    # Save to DB
    save_trades(all_trades)

    logger.info(f"Scan complete: {len(all_trades)} whale trades from {len(tickers)} tickers")
    return len(all_trades)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import sys

    tickers = sys.argv[1:] if len(sys.argv) > 1 else None
    count = run_full_scan(tickers)
    print(f"\n🐋 Found {count} whale trades (>${MIN_PREMIUM/1000:.0f}K premium)")
