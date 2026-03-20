import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get("DATABASE_URL")


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db():
    """Create predictions table if it doesn't exist."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id SERIAL PRIMARY KEY,
                    year INT NOT NULL,
                    round INT NOT NULL,
                    predictions JSONB,
                    predicted_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(year, round)
                );
            """)
        conn.commit()


def get_prediction(year: int, round: int):
    """Return stored predictions for a round, or None if not found."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT predictions FROM predictions WHERE year = %s AND round = %s",
                (year, round)
            )
            row = cur.fetchone()
            return row["predictions"] if row else None


def save_prediction(year: int, round: int, predictions: list):
    """Insert or update predictions for a round."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO predictions (year, round, predictions)
                VALUES (%s, %s, %s)
                ON CONFLICT (year, round) DO NOTHING
            """, (year, round, json.dumps(predictions)))
        conn.commit()