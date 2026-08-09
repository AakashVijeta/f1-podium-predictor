import os
import time
import asyncio
import traceback
from collections import OrderedDict
from contextlib import asynccontextmanager
import pandas as pd
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
import joblib
from fastapi.middleware.cors import CORSMiddleware
from routers import results
from db import (
    init_db, get_prediction, save_prediction,
    get_all_predictions_by_year, get_race_result, get_all_race_results_by_year, save_race_result,
    get_quali_data, save_quali_data
)
from predict import fetch_qualifying_data, predict_podium, fetch_race_results, get_session_status, get_session_times

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
model        = None
winner_model = None

# ── In-process response cache (hot path) ──────────────────────────────
# Keyed by (year, round). Value: (expires_at_monotonic, ttl_seconds, payload).
# pre_quali: 30s, pre_race: 300s, post_race: 3600s.
_PREDICT_CACHE: "OrderedDict[tuple, tuple[float, int, dict]]" = OrderedDict()
_PREDICT_CACHE_MAX = 256
_NO_STORED_RESULTS = object()

# Status cache — schedule boundaries shift slowly, 60s is safe.
_STATUS_CACHE: dict = {}
_STATUS_TTL = 60


def _cache_get(key):
    entry = _PREDICT_CACHE.get(key)
    if entry is None:
        return None
    expires_at, ttl, payload = entry
    remaining = expires_at - time.monotonic()
    if remaining <= 0:
        _PREDICT_CACHE.pop(key, None)
        return None
    _PREDICT_CACHE.move_to_end(key)
    return payload, int(remaining), ttl


def _cache_put(key, payload, ttl_s):
    _PREDICT_CACHE[key] = (time.monotonic() + ttl_s, ttl_s, payload)
    _PREDICT_CACHE.move_to_end(key)
    while len(_PREDICT_CACHE) > _PREDICT_CACHE_MAX:
        _PREDICT_CACHE.popitem(last=False)


def _cached_status(year: int, round: int) -> str:
    key = (year, round)
    entry = _STATUS_CACHE.get(key)
    now = time.monotonic()
    if entry is not None and entry[0] > now:
        return entry[1]
    # pure-python + cached pandas lookup — no thread hop needed
    status = get_session_status(year, round)
    _STATUS_CACHE[key] = (now + _STATUS_TTL, status)
    return status


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, winner_model
    model        = joblib.load(os.path.join(BASE_DIR, "models", "model_v8.pkl"))
    winner_model = joblib.load(os.path.join(BASE_DIR, "models", "model_v8_winner.pkl"))
    init_db()  # also opens the pool and runs CREATE TABLE IF NOT EXISTS
    # Pre-warm: schedule cache + a no-op query so the pool's first conn is hot
    await asyncio.to_thread(get_session_status, 2026, 1)
    try:
        await asyncio.to_thread(get_prediction, 2026, 1)
    except Exception:
        pass
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://f1.aakashvijeta.me", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(results.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal server error"},
    )


@app.get("/")
async def root():
    return {"status": "ok", "message": "F1 Podium Predictor API"}


# ---------------------------------------------------------------------------
# Helper: resolve qualifying data — DB first, FastF1 only as fallback.
# Polls until complete data is available (up to max_wait_minutes).
# ---------------------------------------------------------------------------
async def get_quali(year: int, round: int, max_wait_minutes: int = 60, poll_interval_seconds: int = 30):
    """
    Returns (quali_df, circuit_name) or None.

    1. DB hit  → return immediately, no FastF1 call.
    2. DB miss → poll FastF1 until fetch_qualifying_data returns complete data
                 (≥18 drivers with lap times AND grid positions), then cache to DB.
    Polls every poll_interval_seconds for up to max_wait_minutes.
    """
    # --- DB first ---
    raw = await asyncio.to_thread(get_quali_data, year, round)
    if raw is not None:
        print(f"[QUALI] DB hit for {year} R{round}")
        return pd.DataFrame(raw["laps"]), raw["circuit"]

    # --- Poll FastF1 ---
    max_attempts = (max_wait_minutes * 60) // poll_interval_seconds
    attempt = 0

    while attempt < max_attempts:
        attempt += 1
        print(f"[QUALI] Attempt {attempt}/{max_attempts} — fetching from FastF1 for {year} R{round}")

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(fetch_qualifying_data, year, round),
                timeout=45,
            )
        except asyncio.TimeoutError:
            print(f"[QUALI] FastF1 timeout for {year} R{round}")
            result = None

        if result is not None:
            quali_df, circuit_name = result
            # Persist to DB so future calls never touch FastF1 for this round
            asyncio.create_task(
                asyncio.to_thread(
                    save_quali_data, year, round,
                    {"laps": quali_df.to_dict(orient="records"), "circuit": circuit_name}
                )
            )
            print(f"[QUALI] Complete data fetched and saved for {year} R{round}")
            return quali_df, circuit_name

        if attempt < max_attempts:
            print(f"[QUALI] Incomplete — waiting {poll_interval_seconds}s before retry")
            await asyncio.sleep(poll_interval_seconds)

    print(f"[QUALI] Gave up after {max_wait_minutes} minutes for {year} R{round}")
    return None


# ---------------------------------------------------------------------------
# /predict/{year}/{round}
# ---------------------------------------------------------------------------
def _set_cache_headers(response: Response, max_age: int):
    response.headers["Cache-Control"] = f"public, max-age={max_age}"


@app.get("/predict/{year}/{round}")
async def predict(year: int, round: int, response: Response):
    key = (year, round)

    # ── Fast path: in-process response cache ──────────────────────────
    cached = _cache_get(key)
    if cached is not None:
        payload, remaining, ttl = cached
        _set_cache_headers(response, remaining)
        return payload

    status = _cached_status(year, round)

    # ────────────────────────────────────────────────────────── pre_quali
    if status == "pre_quali":
        payload = {"status": "pre_quali", "message": "Qualifying hasn't happened yet"}
        _cache_put(key, payload, 30)
        _set_cache_headers(response, 30)
        return payload

    # ────────────────────────────────────────────────────────── pre_race
    if status == "pre_race":
        stored = await asyncio.to_thread(get_prediction, year, round)

        if stored:
            payload = {"status": "pre_race", "predictions": stored}
            _cache_put(key, payload, 300)
            _set_cache_headers(response, 300)
            return payload

        quali_result = await get_quali(year, round)
        if quali_result is None:
            # Do not cache transient errors
            return {"status": "error", "message": "Qualifying data not available yet — try again shortly"}

        quali_data, circuit_name = quali_result
        predictions = await asyncio.to_thread(predict_podium, quali_data, circuit_name, model, winner_model)
        stored = predictions.to_dict(orient="records")
        asyncio.create_task(asyncio.to_thread(save_prediction, year, round, stored))

        payload = {"status": "pre_race", "predictions": stored}
        _cache_put(key, payload, 300)
        _set_cache_headers(response, 300)
        return payload

    # ────────────────────────────────────────────────────────── post_race
    # Concurrent DB reads
    stored, race_results_list = await asyncio.gather(
        asyncio.to_thread(get_prediction, year, round),
        asyncio.to_thread(get_race_result, year, round),
    )

    needs_quali = not stored
    needs_race  = not race_results_list

    if needs_quali or needs_race:
        task_keys, tasks = [], []
        if needs_quali:
            task_keys.append("quali"); tasks.append(get_quali(year, round))
        if needs_race:
            task_keys.append("race")
            tasks.append(asyncio.wait_for(
                asyncio.to_thread(fetch_race_results, year, round),
                timeout=30,
            ))

        fetched = dict(zip(task_keys, await asyncio.gather(*tasks, return_exceptions=True)))

        if needs_quali:
            qr = fetched.get("quali")
            if qr and not isinstance(qr, Exception):
                quali_data, circuit_name = qr
                predictions_df = await asyncio.to_thread(predict_podium, quali_data, circuit_name, model, winner_model)
                stored = predictions_df.to_dict(orient="records")
                asyncio.create_task(asyncio.to_thread(save_prediction, year, round, stored))

        if needs_race:
            race_df = fetched.get("race")
            if race_df is not None and not isinstance(race_df, Exception):
                race_results_list = race_df.to_dict(orient="records")
                if race_results_list:
                    asyncio.create_task(
                        asyncio.to_thread(save_race_result, year, round, race_results_list)
                    )

    if race_results_list is None:
        return {"status": "error", "message": "Failed to fetch race results"}

    payload = {"status": "post_race", "results": race_results_list}
    if stored:
        payload["predictions"] = stored

    # Post-race data is immutable once both halves are present — cache longer.
    ttl = 3600 if stored and race_results_list else 120
    _cache_put(key, payload, ttl)
    _set_cache_headers(response, ttl)
    return payload


# ---------------------------------------------------------------------------
# /accuracy/{year}
# ---------------------------------------------------------------------------
def _coerce_position(value, fallback=None):
    if value is None or value == "":
        return fallback
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _driver_name_from_result(row):
    if not isinstance(row, dict):
        return None

    driver = row.get("Driver")
    if isinstance(driver, dict):
        given = driver.get("givenName", "")
        family = driver.get("familyName", "")
        full_name = f"{given} {family}".strip()
        if full_name:
            return full_name
        if driver.get("fullName"):
            return driver["fullName"]
    elif isinstance(driver, str) and driver.strip():
        return driver.strip()

    for key in ("driver_name", "FullName", "DriverName", "name"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return None


def _result_rows(raw_results):
    if isinstance(raw_results, dict):
        raw_results = raw_results.get("results")
    return raw_results if isinstance(raw_results, list) else []


def _normalize_top3_results(raw_results):
    normalized = []
    for idx, row in enumerate(_result_rows(raw_results)):
        if not isinstance(row, dict):
            continue
        driver_name = _driver_name_from_result(row)
        position = _coerce_position(
            row.get("position", row.get("RacePosition", row.get("Position"))),
            idx + 1,
        )
        if driver_name and position is not None:
            normalized.append({"driver_name": driver_name, "position": position})

    normalized.sort(key=lambda row: row["position"])
    top3 = normalized[:3]
    return top3 if len(top3) == 3 else []


def _last_name(value):
    if not isinstance(value, str) or not value.strip():
        return ""
    return value.strip().split()[-1].upper()


def _prediction_score(row):
    if not isinstance(row, dict):
        return 0
    score = row.get("CombinedScore", row.get("PodiumProbability", 0)) or 0
    try:
        return float(score)
    except (TypeError, ValueError):
        return 0


async def _get_accuracy_actual_top3(
    year: int,
    round_num: int,
    session_status: str = "unknown",
    stored_results=_NO_STORED_RESULTS,
):
    db_error = None
    if stored_results is _NO_STORED_RESULTS:
        try:
            stored_results = await asyncio.to_thread(get_race_result, year, round_num)
        except Exception as exc:
            stored_results = None
            db_error = str(exc)

    stored_top3 = _normalize_top3_results(stored_results)
    if stored_top3:
        return {"source": "stored", "top3": stored_top3}

    if session_status in {"pre_quali", "pre_race"}:
        return {"source": "not_yet_raced", "top3": [], "error": db_error}

    live_error = None
    live_payload = None
    try:
        live_payload = await asyncio.wait_for(
            results.get_race_results(year, round_num),
            timeout=12,
        )
    except Exception as exc:
        live_error = str(exc)

    live_results = live_payload.get("results") if isinstance(live_payload, dict) else []
    live_top3 = _normalize_top3_results(live_results)
    if live_top3:
        try:
            await asyncio.to_thread(save_race_result, year, round_num, live_results)
        except Exception:
            pass
        return {"source": "live", "top3": live_top3}

    if session_status == "post_race":
        try:
            fastf1_results = await asyncio.wait_for(
                asyncio.to_thread(fetch_race_results, year, round_num),
                timeout=45,
            )
            if fastf1_results is not None:
                fastf1_rows = fastf1_results.to_dict(orient="records")
                fastf1_top3 = _normalize_top3_results(fastf1_rows)
                if fastf1_top3:
                    try:
                        await asyncio.to_thread(save_race_result, year, round_num, fastf1_rows)
                    except Exception:
                        pass
                    return {"source": "fastf1", "top3": fastf1_top3}
        except Exception as exc:
            live_error = live_error or str(exc)

    return {
        "source": "unavailable",
        "top3": [],
        "error": (
            live_payload.get("error")
            if isinstance(live_payload, dict) and live_payload.get("error")
            else live_error or db_error
        ),
    }


@app.get("/accuracy/{year}")
async def fetch_accuracy(year: int, response: Response):
    cache_key = ("accuracy", year)
    cached = _cache_get(cache_key)
    if cached is not None:
        payload, remaining, ttl = cached
        _set_cache_headers(response, remaining)
        return payload

    predictions, stored_result_rows = await asyncio.gather(
        asyncio.to_thread(get_all_predictions_by_year, year),
        asyncio.to_thread(get_all_race_results_by_year, year),
    )
    if not predictions:
        payload = {
            "status": "ok",
            "year": year,
            "rounds_tracked": 0,
            "rounds_analyzed": 0,
            "rounds_pending": 0,
            "podium_correct": 0,
            "total_podium_slots": 0,
            "winner_correct": 0,
            "history": []
        }
        _cache_put(cache_key, payload, 300)
        _set_cache_headers(response, 300)
        return payload

    stored_results_by_round = {
        row["round"]: row.get("results")
        for row in stored_result_rows
        if isinstance(row, dict) and row.get("round") is not None
    }

    session_statuses = {}
    for row in predictions:
        r_num = row["round"]
        try:
            session_statuses[r_num] = await asyncio.to_thread(_cached_status, year, r_num)
        except Exception:
            session_statuses[r_num] = "unknown"

    result_lookup_sem = asyncio.Semaphore(3)

    async def limited_actual_lookup(round_num: int):
        async with result_lookup_sem:
            return await _get_accuracy_actual_top3(
                year,
                round_num,
                session_statuses.get(round_num, "unknown"),
                stored_results_by_round.get(round_num),
            )

    tasks = [limited_actual_lookup(r["round"]) for r in predictions]
    all_actual_results = await asyncio.gather(*tasks, return_exceptions=True)

    rounds_analyzed    = 0
    winner_correct     = 0
    podium_correct     = 0
    total_podium_slots = 0
    rounds_pending     = 0
    rounds_missing     = 0
    history            = []

    for round_data, actual in zip(predictions, all_actual_results):
        r_num        = round_data["round"]
        preds        = round_data.get("predictions") or []
        session_status = session_statuses.get(r_num, "unknown")

        preds_sorted  = sorted(preds, key=_prediction_score, reverse=True)
        top3_preds    = preds_sorted[:3]
        pred_last_names = [
            _last_name(p.get("FullName"))
            for p in top3_preds
            if isinstance(p, dict) and _last_name(p.get("FullName"))
        ]

        if isinstance(actual, Exception):
            actual = {"source": "unavailable", "top3": [], "error": str(actual)}

        top3_actual = actual.get("top3", []) if isinstance(actual, dict) else []
        source = actual.get("source", "unavailable") if isinstance(actual, dict) else "unavailable"

        if len(top3_preds) < 3:
            history.append({
                "round": r_num,
                "status": "insufficient_predictions",
                "session_status": session_status,
                "results_available": len(top3_actual) == 3,
                "result_source": source,
                "winner_correct": None,
                "podium_hits": 0,
                "podium_total": 0,
                "predicted_top3": pred_last_names,
                "actual_top3": [_last_name(a.get("driver_name")) for a in top3_actual],
                "error": actual.get("error") if isinstance(actual, dict) else None,
            })
            continue

        if len(top3_actual) < 3:
            is_future_or_live = session_status != "post_race"
            if is_future_or_live:
                rounds_pending += 1
            else:
                rounds_missing += 1

            history.append({
                "round": r_num,
                "status": "pending_results" if is_future_or_live else "missing_results",
                "session_status": session_status,
                "results_available": False,
                "result_source": source,
                "winner_correct": None,
                "podium_hits": 0,
                "podium_total": 0,
                "predicted_top3": pred_last_names,
                "actual_top3": [],
                "error": actual.get("error") if isinstance(actual, dict) else None,
            })
            continue

        actual_last_names = [_last_name(a.get("driver_name")) for a in top3_actual]

        hits = 0
        for p_name in pred_last_names:
            if any(p_name in a_name or a_name in p_name for a_name in actual_last_names):
                hits += 1

        is_winner_correct = (
            pred_last_names[0] in actual_last_names[0] or
            actual_last_names[0] in pred_last_names[0]
        )

        rounds_analyzed    += 1
        podium_correct     += hits
        total_podium_slots += min(3, len(top3_actual))
        if is_winner_correct:
            winner_correct += 1

        history.append({
            "round": r_num,
            "status": "evaluated",
            "session_status": session_status,
            "results_available": True,
            "result_source": source,
            "winner_correct": is_winner_correct,
            "podium_hits": hits,
            "podium_total": min(3, len(top3_actual)),
            "predicted_top3": pred_last_names,
            "actual_top3": actual_last_names
        })

    payload = {
        "status": "ok",
        "year": year,
        "rounds_tracked": len(predictions),
        "rounds_analyzed": rounds_analyzed,
        "rounds_pending": rounds_pending,
        "rounds_missing_results": rounds_missing,
        "podium_correct": podium_correct,
        "total_podium_slots": total_podium_slots,
        "winner_correct": winner_correct,
        "history": sorted(history, key=lambda x: x["round"])
    }
    ttl = 60 if rounds_pending or rounds_missing else 900
    _cache_put(cache_key, payload, ttl)
    _set_cache_headers(response, ttl)
    return payload


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------
@app.head("/health")
@app.get("/health")
async def health():
    return {}


# ---------------------------------------------------------------------------
# /schedule/{year}/{round}
# ---------------------------------------------------------------------------
@app.get("/schedule/{year}/{round}")
async def schedule(year: int, round: int, response: Response):
    result = await asyncio.to_thread(get_session_times, year, round)
    has_data = result.get("qualifying") is not None
    _set_cache_headers(response, 3600 if has_data else 30)
    return result
