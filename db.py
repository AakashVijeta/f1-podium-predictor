import os
import json

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    import psycopg2
    import psycopg2.pool
    from psycopg2.extras import RealDictCursor

    _pool = None

    def get_pool():
        global _pool
        if _pool is None or _pool.closed:  # recreate if closed
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=DATABASE_URL,
                cursor_factory=RealDictCursor,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
            )
        return _pool

    def get_conn():
        # Probe on checkout — Render closes idle connections, and TCP
        # keepalives don't always fire before the first request after idle.
        # A bare SELECT 1 catches the dead conn and forces a fresh one,
        # preventing intermittent 502s.
        pool = get_pool()
        for _ in range(2):
            conn = pool.getconn()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                return conn
            except Exception:
                try: pool.putconn(conn, close=True)
                except Exception: pass
        return pool.getconn()

    def release_conn(conn):
        try:
            if conn.closed:
                # Discard dead connection so the pool recreates it.
                try: get_pool().putconn(conn, close=True)
                except Exception: pass
                return
            get_pool().putconn(conn)
        except Exception:
            try: get_pool().putconn(conn, close=True)
            except Exception: pass

    def init_db():
        conn = get_conn()
        try:
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
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS race_results (
                        id SERIAL PRIMARY KEY,
                        year INT NOT NULL,
                        round INT NOT NULL,
                        results JSONB,
                        fetched_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(year, round)
                    );
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS qualifying_data (
                        year INTEGER,
                        round INTEGER,
                        data TEXT,
                        PRIMARY KEY (year, round)
                    );
                """)
            conn.commit()
        finally:
            release_conn(conn)

    def get_prediction(year: int, round: int):
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT predictions FROM predictions WHERE year = %s AND round = %s",
                    (year, round)
                )
                row = cur.fetchone()
                return row["predictions"] if row else None
        finally:
            release_conn(conn)

    def save_prediction(year: int, round: int, predictions: list):
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO predictions (year, round, predictions)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (year, round) DO NOTHING
                """, (year, round, json.dumps(predictions)))
            conn.commit()
        finally:
            release_conn(conn)

    def get_all_predictions_by_year(year: int):
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT round, predictions FROM predictions WHERE year = %s ORDER BY round ASC",
                    (year,)
                )
                return cur.fetchall()
        finally:
            release_conn(conn)

    def get_race_result(year: int, round: int):
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT results FROM race_results WHERE year = %s AND round = %s",
                    (year, round)
                )
                row = cur.fetchone()
                return row["results"] if row else None
        finally:
            release_conn(conn)

    def save_race_result(year: int, round: int, results: list):
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO race_results (year, round, results)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (year, round) DO UPDATE 
                        SET results = EXCLUDED.results, 
                            fetched_at = NOW()
                """, (year, round, json.dumps(results)))
            conn.commit()
        finally:
            release_conn(conn)

    def get_quali_data(year: int, round: int):
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT data FROM qualifying_data WHERE year = %s AND round = %s",
                    (year, round)
                )
                row = cur.fetchone()
                return json.loads(row["data"]) if row else None
        finally:
            release_conn(conn)

    def save_quali_data(year: int, round: int, data: dict):
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO qualifying_data (year, round, data)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (year, round) DO UPDATE
                        SET data = EXCLUDED.data
                """, (year, round, json.dumps(data)))
            conn.commit()
        finally:
            release_conn(conn)

else:
    import sqlite3

    def get_conn():
        conn = sqlite3.connect("local_predictions.db")
        conn.row_factory = sqlite3.Row
        return conn

    def release_conn(conn):
        conn.close()

    def init_db():
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    year INT NOT NULL,
                    round INT NOT NULL,
                    predictions TEXT,
                    predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(year, round)
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS race_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    year INT NOT NULL,
                    round INT NOT NULL,
                    results TEXT,
                    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(year, round)
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS qualifying_data (
                    year INTEGER,
                    round INTEGER,
                    data TEXT,
                    PRIMARY KEY (year, round)
                );
            """)
            conn.commit()
        finally:
            release_conn(conn)

    def get_prediction(year: int, round: int):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT predictions FROM predictions WHERE year = ? AND round = ?",
                (year, round)
            )
            row = cur.fetchone()
            return json.loads(row["predictions"]) if row else None
        finally:
            release_conn(conn)

    def save_prediction(year: int, round: int, predictions: list):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO predictions (year, round, predictions)
                VALUES (?, ?, ?)
                ON CONFLICT (year, round) DO NOTHING
            """, (year, round, json.dumps(predictions)))
            conn.commit()
        finally:
            release_conn(conn)

    def get_all_predictions_by_year(year: int):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT round, predictions FROM predictions WHERE year = ? ORDER BY round ASC",
                (year,)
            )
            rows = cur.fetchall()
            return [{"round": r["round"], "predictions": json.loads(r["predictions"])} for r in rows]
        finally:
            release_conn(conn)

    def get_race_result(year: int, round: int):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT results FROM race_results WHERE year = ? AND round = ?",
                (year, round)
            )
            row = cur.fetchone()
            return json.loads(row["results"]) if row else None
        finally:
            release_conn(conn)

    def save_race_result(year: int, round: int, results: list):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT OR REPLACE INTO race_results (year, round, results)
                VALUES (?, ?, ?)
            """, (year, round, json.dumps(results)))
            conn.commit()
        finally:
            release_conn(conn)

    def get_quali_data(year: int, round: int):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT data FROM qualifying_data WHERE year = ? AND round = ?",
                (year, round)
            )
            row = cur.fetchone()
            return json.loads(row["data"]) if row else None
        finally:
            release_conn(conn)

    def save_quali_data(year: int, round: int, data: dict):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT OR REPLACE INTO qualifying_data (year, round, data)
                VALUES (?, ?, ?)
            """, (year, round, json.dumps(data)))
            conn.commit()
        finally:
            release_conn(conn)