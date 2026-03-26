"""
AlphaEdge Accuracy Tracking System

Records predictions when scenarios are saved.
After the prediction horizon expires, compares predicted vs actual price.
Scores accuracy and awards badges/points.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from db import get_db

logger = logging.getLogger(__name__)


def record_prediction(scenario_id: str, ticker: str, predicted_median: float, 
                       horizon_days: int = 30, user_id: Optional[str] = None):
    """Record a prediction when a scenario is saved."""
    conn = get_db()
    try:
        predicted_date = (datetime.utcnow() + timedelta(days=horizon_days)).strftime("%Y-%m-%d")
        
        # Avoid duplicate predictions for same scenario
        existing = conn.execute(
            "SELECT 1 FROM accuracy_tracking WHERE scenario_id = ?", (scenario_id,)
        ).fetchone()
        if existing:
            return  # Already tracked
        
        conn.execute("""
            INSERT INTO accuracy_tracking (id, scenario_id, ticker, predicted_price, 
                                            predicted_date, user_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        """, (
            f"acc_{scenario_id}",
            scenario_id,
            ticker,
            predicted_median,
            predicted_date,
            user_id,
            datetime.utcnow().isoformat(),
        ))
        conn.commit()
        logger.info(f"Prediction recorded: {ticker} ${predicted_median:.2f} by {predicted_date}")
    except Exception as e:
        logger.warning(f"Failed to record prediction: {e}")
    finally:
        conn.close()


def score_pending_predictions():
    """Check all pending predictions and score those whose date has passed.
    Called by nightly build or cron job."""
    conn = get_db()
    scored = []
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        pending = conn.execute("""
            SELECT id, scenario_id, ticker, predicted_price, predicted_date, user_id
            FROM accuracy_tracking
            WHERE status = 'pending' AND predicted_date <= ?
        """, (today,)).fetchall()
        
        if not pending:
            return scored
        
        # Fetch actual prices via yfinance
        try:
            import yfinance as yf
        except ImportError:
            logger.warning("yfinance not available for accuracy scoring")
            return scored
        
        for row in pending:
            try:
                ticker = row["ticker"]
                predicted = row["predicted_price"]
                
                stock = yf.Ticker(ticker)
                hist = stock.history(period="5d")
                if hist.empty:
                    continue
                
                actual_price = float(hist["Close"].iloc[-1])
                
                # Calculate accuracy: 100 - abs(percentage error), capped at 0-100
                pct_error = abs((predicted - actual_price) / actual_price) * 100
                accuracy = max(0, min(100, 100 - pct_error))
                
                conn.execute("""
                    UPDATE accuracy_tracking 
                    SET actual_price = ?, accuracy_score = ?, status = 'scored', scored_at = ?
                    WHERE id = ?
                """, (actual_price, accuracy, datetime.utcnow().isoformat(), row["id"]))
                
                scored.append({
                    "scenario_id": row["scenario_id"],
                    "ticker": ticker,
                    "predicted": predicted,
                    "actual": actual_price,
                    "accuracy": accuracy,
                    "user_id": row["user_id"],
                })
                
                # Award points for good predictions
                if row["user_id"]:
                    points = 0
                    if accuracy >= 95:
                        points = 100
                    elif accuracy >= 85:
                        points = 25
                    elif accuracy >= 70:
                        points = 10
                    
                    if points > 0:
                        try:
                            from social import award_points
                            award_points(row["user_id"], "accuracy", points, row["scenario_id"])
                        except Exception:
                            pass
                
                logger.info(f"Scored {ticker}: predicted ${predicted:.2f}, actual ${actual_price:.2f}, accuracy {accuracy:.1f}%")
                
            except Exception as e:
                logger.warning(f"Failed to score prediction {row['id']}: {e}")
        
        conn.commit()
    except Exception as e:
        logger.error(f"Error in score_pending_predictions: {e}")
    finally:
        conn.close()
    
    return scored


def get_user_accuracy(user_id: str) -> Dict:
    """Get accuracy stats for a user."""
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT accuracy_score FROM accuracy_tracking
            WHERE user_id = ? AND status = 'scored'
        """, (user_id,)).fetchall()
        
        if not rows:
            return {"total_predictions": 0, "scored": 0, "avg_accuracy": None, "badge": None}
        
        scores = [r["accuracy_score"] for r in rows]
        avg = sum(scores) / len(scores)
        
        badge = None
        if len(scores) >= 10 and avg >= 85:
            badge = "oracle"
        elif len(scores) >= 5 and avg >= 70:
            badge = "sharp"
        
        return {
            "total_predictions": len(scores),
            "scored": len(scores),
            "avg_accuracy": round(avg, 1),
            "badge": badge,
            "best": round(max(scores), 1),
            "worst": round(min(scores), 1),
        }
    finally:
        conn.close()


def get_scenario_accuracy(scenario_id: str) -> Optional[Dict]:
    """Get accuracy result for a specific scenario."""
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT * FROM accuracy_tracking WHERE scenario_id = ?
        """, (scenario_id,)).fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def get_pending_count() -> int:
    """Get count of pending accuracy checks."""
    conn = get_db()
    try:
        row = conn.execute("SELECT COUNT(*) FROM accuracy_tracking WHERE status = 'pending'").fetchone()
        return row[0] if row else 0
    finally:
        conn.close()


# Ensure accuracy_tracking table exists
def init_accuracy_table():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS accuracy_tracking (
                id TEXT PRIMARY KEY,
                scenario_id TEXT NOT NULL,
                ticker TEXT NOT NULL,
                predicted_price REAL NOT NULL,
                predicted_date TEXT NOT NULL,
                actual_price REAL,
                accuracy_score REAL,
                user_id TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                scored_at TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_accuracy_status ON accuracy_tracking(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_accuracy_user ON accuracy_tracking(user_id)")
        conn.commit()
    finally:
        conn.close()


# Initialize on import
init_accuracy_table()
