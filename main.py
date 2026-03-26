import os
import asyncio
import pandas as pd
from contextlib import asynccontextmanager
from fastapi import FastAPI
import joblib
from fastapi.middleware.cors import CORSMiddleware
from routers import results
from db import init_db, get_prediction, save_prediction, get_all_predictions_by_year, get_race_result, save_race_result, get_quali_data, save_quali_data
from predict import fetch_qualifying_data, predict_podium, fetch_race_results, get_session_status

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = joblib.load(os.path.join(BASE_DIR, 'models', 'model_v5.pkl'))
    init_db()
    await asyncio.to_thread(get_session_status, 2026, 1)  # pre-warms _schedule_cache
    # Gracefully close all pool connections on shutdown
    import db
    if hasattr(db, '_pool') and db._pool:
        db._pool.closeall()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://f1.aakashvijeta.me", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(results.router)


@app.get("/")
async def root():
    return {"status": "ok", "message": "F1 Podium Predictor API"}


# ---------------------------------------------------------------------------
# Helper: resolve qualifying data — DB first, FastF1 only as fallback
# ---------------------------------------------------------------------------
async def get_quali(year: int, round: int):
    """
    Returns (quali_df, circuit_name) or None.
    Checks DB first. Only calls FastF1 if data isn't cached yet.
    After a FastF1 fetch, saves raw data to DB so it's never fetched again.
    """
    raw = await asyncio.to_thread(get_quali_data, year, round)

    if raw is not None:
        # DB hit — reconstruct DataFrame, no FastF1 call
        return pd.DataFrame(raw["laps"]), raw["circuit"]

    # DB miss — fetch from FastF1
    result = await asyncio.to_thread(fetch_qualifying_data, year, round)
    if result is None:
        return None

    quali_df, circuit_name = result

    # Persist raw data so future calls never touch FastF1 for this round
    asyncio.create_task(
        asyncio.to_thread(
            save_quali_data, year, round,
            {"laps": quali_df.to_dict(orient="records"), "circuit": circuit_name}
        )
    )
    return quali_df, circuit_name


# ---------------------------------------------------------------------------
# /predict/{year}/{round}
# ---------------------------------------------------------------------------
@app.get("/predict/{year}/{round}")
async def predict(year: int, round: int):
    import time

    t0 = time.time()
    status = await asyncio.to_thread(get_session_status, year, round)
    print(f"[TIMING] get_session_status: {time.time()-t0:.2f}s")

    if status == "pre_quali":
        return {"status": "pre_quali", "message": "Qualifying hasn't happened yet"}

    if status == "pre_race":
        t1 = time.time()
        stored = await asyncio.to_thread(get_prediction, year, round)
        print(f"[TIMING] get_prediction: {time.time()-t1:.2f}s")

        if stored:
            return {"status": "pre_race", "predictions": stored}

        t2 = time.time()
        quali_result = await get_quali(year, round)
        print(f"[TIMING] get_quali: {time.time()-t2:.2f}s")

        t3 = time.time()
        predictions = await asyncio.to_thread(predict_podium, quali_data, circuit_name, model)
        print(f"[TIMING] predict_podium: {time.time()-t3:.2f}s")

    elif status == "post_race":
        t1 = time.time()
        stored = await asyncio.to_thread(get_prediction, year, round)
        race_results_list = await asyncio.to_thread(get_race_result, year, round)
        print(f"[TIMING] db lookups: {time.time()-t1:.2f}s | stored={stored is not None} | race={race_results_list is not None}")

        needs_quali = not stored
        needs_race = race_results_list is None

        if needs_quali or needs_race:
            # Build only the tasks that are actually missing
            task_keys = []
            tasks = []

            if needs_quali:
                task_keys.append("quali")
                tasks.append(get_quali(year, round))

            if needs_race:
                task_keys.append("race")
                tasks.append(asyncio.to_thread(fetch_race_results, year, round))

            # Fetch both simultaneously instead of sequentially
            fetched_results = await asyncio.gather(*tasks, return_exceptions=True)
            fetched = dict(zip(task_keys, fetched_results))

            if needs_quali:
                quali_result = fetched.get("quali")
                if quali_result and not isinstance(quali_result, Exception):
                    quali_data, circuit_name = quali_result
                    predictions_df = await asyncio.to_thread(
                        predict_podium, quali_data, circuit_name, model
                    )
                    stored = predictions_df.to_dict(orient="records")
                    asyncio.create_task(
                        asyncio.to_thread(save_prediction, year, round, stored)
                    )

            if needs_race:
                race_df = fetched.get("race")
                if race_df is not None and not isinstance(race_df, Exception):
                    race_results_list = race_df.to_dict(orient="records")
                    await asyncio.to_thread(save_race_result, year, round, race_results_list)

        if race_results_list is None:
            return {"status": "error", "message": "Failed to fetch race results"}

        response = {"status": "post_race", "results": race_results_list}
        if stored:
            response["predictions"] = stored
        return response


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

    rounds_analyzed = 0
    winner_correct = 0
    podium_correct = 0
    total_podium_slots = 0
    history = []

    for round_data, actual in zip(predictions, all_actual_results):
        if isinstance(actual, Exception) or not actual.get("available") or not actual.get("results"):
            continue

        r_num = round_data["round"]
        preds = round_data["predictions"]
        actual_results = actual["results"]

        preds_sorted = sorted(preds, key=lambda x: x["PodiumProbability"], reverse=True)
        top3_preds = preds_sorted[:3]
        top3_actual = actual_results[:3]

        if not top3_preds or not top3_actual:
            continue

        pred_last_names = [p["FullName"].split()[-1].upper() for p in top3_preds]
        actual_last_names = [a["driver_name"].split()[-1].upper() for a in top3_actual]

        hits = 0
        for p_name in pred_last_names:
            if any(p_name in a_name or a_name in p_name for a_name in actual_last_names):
                hits += 1

        is_winner_correct = (
            pred_last_names[0] in actual_last_names[0] or
            actual_last_names[0] in pred_last_names[0]
        )

        rounds_analyzed += 1
        podium_correct += hits
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


@app.head("/health")
@app.get("/health")
async def health():
    return {}