"""
AlphaEdge Calendar Module.

Provides known future dates for scheduled events:
- FOMC meeting dates (Federal Reserve)
- Earnings dates (via yfinance)
- Economic data releases
"""

from typing import Optional, List
from datetime import datetime, date


# ---------------------------------------------------------------------------
# FOMC Meeting Dates (statement release dates)
# Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
# ---------------------------------------------------------------------------

FOMC_DATES_2025 = [
    "2025-01-29", "2025-03-19", "2025-05-07",
    "2025-06-18", "2025-07-30", "2025-09-17",
    "2025-10-29", "2025-12-17",
]

FOMC_DATES_2026 = [
    "2026-01-28", "2026-03-18", "2026-05-06",
    "2026-06-17", "2026-07-29", "2026-09-16",
    "2026-11-04", "2026-12-16",
]

ALL_FOMC_DATES = sorted(FOMC_DATES_2025 + FOMC_DATES_2026)


def get_next_fomc_date(after: Optional[str] = None) -> Optional[str]:
    """Return the next FOMC date after the given ISO date (default: today)."""
    if after is None:
        ref = date.today()
    else:
        ref = date.fromisoformat(after)
    for d in ALL_FOMC_DATES:
        if date.fromisoformat(d) > ref:
            return d
    return None


def get_fomc_dates(year: Optional[int] = None) -> List[str]:
    """Return FOMC dates, optionally filtered by year."""
    if year == 2025:
        return FOMC_DATES_2025
    elif year == 2026:
        return FOMC_DATES_2026
    return ALL_FOMC_DATES


def get_upcoming_fomc_dates(limit: int = 3) -> List[str]:
    """Return the next N upcoming FOMC dates from today."""
    today = date.today()
    upcoming = [d for d in ALL_FOMC_DATES if date.fromisoformat(d) > today]
    return upcoming[:limit]


# ---------------------------------------------------------------------------
# Earnings Date Fetcher
# ---------------------------------------------------------------------------

def get_next_earnings_date(ticker: str) -> Optional[str]:
    """
    Fetch the next earnings date for a ticker using yfinance.
    Returns ISO date string or None if unavailable.
    """
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker.upper())
        cal = stock.calendar
        if cal is not None:
            # yfinance returns different formats depending on version
            if hasattr(cal, 'get'):
                # Dict format
                earnings_dates = cal.get('Earnings Date', [])
                if earnings_dates:
                    d = earnings_dates[0]
                    if hasattr(d, 'strftime'):
                        return d.strftime("%Y-%m-%d")
                    return str(d)[:10]
            elif hasattr(cal, 'iloc'):
                # DataFrame format
                if 'Earnings Date' in cal.index:
                    d = cal.loc['Earnings Date'].iloc[0]
                    if hasattr(d, 'strftime'):
                        return d.strftime("%Y-%m-%d")
                    return str(d)[:10]
    except Exception:
        pass
    return None


def get_earnings_history(ticker: str, quarters: int = 4) -> List[dict]:
    """
    Fetch recent earnings history (actual vs estimate) for implied move calibration.
    Returns list of {"date": str, "actual_eps": float, "estimate_eps": float, "surprise_pct": float}
    """
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker.upper())
        earnings = stock.earnings_history
        if earnings is not None and not earnings.empty:
            results = []
            for _, row in earnings.tail(quarters).iterrows():
                results.append({
                    "date": str(row.get("Earnings Date", ""))[:10] if "Earnings Date" in row else "",
                    "actual_eps": float(row.get("Reported EPS", 0) or 0),
                    "estimate_eps": float(row.get("EPS Estimate", 0) or 0),
                    "surprise_pct": float(row.get("Surprise(%)", 0) or 0),
                })
            return results
    except Exception:
        pass
    return []


if __name__ == "__main__":
    print("=== AlphaEdge Calendar Module ===\n")
    
    print("Next FOMC date:", get_next_fomc_date())
    print("Upcoming FOMC dates:", get_upcoming_fomc_dates(3))
    print()
    
    for ticker in ["NVDA", "AAPL", "CVX"]:
        ed = get_next_earnings_date(ticker)
        print(f"{ticker} next earnings: {ed or 'N/A'}")
