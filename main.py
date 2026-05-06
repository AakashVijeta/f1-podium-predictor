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
    get_all_predictions_by_year, get_race_result, save_race_result,
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
@app.get("/accuracy/{year}")
async def fetch_accuracy(year: int):
    predictions = await asyncio.to_thread(get_all_predictions_by_year, year)
    if not predictions:
        return {
            "status": "ok",
            "year": year,
            "rounds_analyzed": 0,
            "podium_correct": 0,
            "winner_correct": 0,
            "history": []
        }

    tasks = [results.get_race_results(year, r["round"]) for r in predictions]
    all_actual_results = await asyncio.gather(*tasks, return_exceptions=True)

    rounds_analyzed    = 0
    winner_correct     = 0
    podium_correct     = 0
    total_podium_slots = 0
    history            = []

    for round_data, actual in zip(predictions, all_actual_results):
        if isinstance(actual, Exception) or not actual.get("available") or not actual.get("results"):
            continue

        r_num        = round_data["round"]
        preds        = round_data["predictions"]
        actual_results = actual["results"]

        preds_sorted  = sorted(preds, key=lambda x: x.get("CombinedScore", x.get("PodiumProbability", 0)), reverse=True)
        top3_preds    = preds_sorted[:3]
        top3_actual   = actual_results[:3]

        if not top3_preds or not top3_actual:
            continue

        pred_last_names   = [p["FullName"].split()[-1].upper() for p in top3_preds]
        actual_last_names = [a["driver_name"].split()[-1].upper() for a in top3_actual]

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
            "winner_correct": is_winner_correct,
            "podium_hits": hits,
            "predicted_top3": pred_last_names,
            "actual_top3": actual_last_names
        })

    return {
        "status": "ok",
        "year": year,
        "rounds_analyzed": rounds_analyzed,
        "podium_correct": podium_correct,
        "total_podium_slots": total_podium_slots,
        "winner_correct": winner_correct,
        "history": sorted(history, key=lambda x: x["round"])
    }


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
async def schedule(year: int, round: int):
    return await asyncio.to_thread(get_session_times, year, round)