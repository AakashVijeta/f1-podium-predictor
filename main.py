import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
import joblib
from fastapi.middleware.cors import CORSMiddleware
from routers import results
from db import init_db, get_prediction, save_prediction, get_all_predictions_by_year, get_race_result, save_race_result

from predict import fetch_qualifying_data, predict_podium, fetch_race_results, get_session_status

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = joblib.load(os.path.join(BASE_DIR, 'models', 'model_v5.pkl'))
    init_db()  # ensure tables exist
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


@app.get("/predict/{year}/{round}")
async def predict(year: int, round: int):
    status = get_session_status(year, round)

    if status == "pre_quali":
        return {"status": "pre_quali", "message": "Qualifying hasn't happened yet"}

    # Check DB for stored predictions first
    stored = get_prediction(year, round)

    if status == "pre_race":
        if stored:
            return {"status": "pre_race", "predictions": stored}

        result = fetch_qualifying_data(year, round)
        if result is None:
            return {"status": "error", "message": "Failed to fetch qualifying data"}
        quali_data, circuit_name = result
        predictions = predict_podium(quali_data, circuit_name, model)
        predictions_list = predictions.to_dict(orient="records")

        save_prediction(year, round, predictions_list)
        return {"status": "pre_race", "predictions": predictions_list}

    elif status == "post_race":
        # --- Predictions ---
        if stored:
            predictions_list = stored
        else:
            loop = asyncio.get_running_loop()
            quali_result = await loop.run_in_executor(None, fetch_qualifying_data, year, round)
            if quali_result is not None:
                quali_data, circuit_name = quali_result
                predictions_df = predict_podium(quali_data, circuit_name, model)
                predictions_list = predictions_df.to_dict(orient="records")
                save_prediction(year, round, predictions_list)
            else:
                predictions_list = None

        # --- Race results: DB first, FastF1 only as fallback ---
        race_results_list = get_race_result(year, round)

        if race_results_list is None:
            loop = asyncio.get_running_loop()
            race_results = await loop.run_in_executor(None, fetch_race_results, year, round)
            if race_results is None:
                return {"status": "error", "message": "Failed to fetch race results"}
            race_results_list = race_results.to_dict(orient="records")
            save_race_result(year, round, race_results_list)

        response = {
            "status": "post_race",
            "results": race_results_list,
        }
        if predictions_list:
            response["predictions"] = predictions_list

        return response


@app.get("/accuracy/{year}")
async def fetch_accuracy(year: int):
    predictions = get_all_predictions_by_year(year)
    if not predictions:
        return {"status": "ok", "year": year, "rounds_analyzed": 0, "podium_correct": 0, "winner_correct": 0, "history": []}
    
    rounds_analyzed = 0
    winner_correct = 0
    podium_correct = 0
    total_podium_slots = 0
    history = []

    for round_data in predictions:
        r_num = round_data["round"]
        preds = round_data["predictions"]
        
        try:
            actual = await results.get_race_results(year, r_num)
        except Exception:
            continue
            
        if not actual.get("available") or not actual.get("results"):
            continue

        actual_results = actual["results"]
        preds_sorted = sorted(preds, key=lambda x: x["PodiumProbability"], reverse=True)
        top3_preds = preds_sorted[:3]
        top3_actual = actual_results[:3]

        if len(top3_preds) == 0 or len(top3_actual) == 0:
            continue

        pred_last_names = [p["FullName"].split()[-1].upper() for p in top3_preds]
        actual_last_names = [a["driver_name"].split()[-1].upper() for a in top3_actual]

        hits = 0
        for p_name in pred_last_names:
            if any(p_name in a_name or a_name in p_name for a_name in actual_last_names):
                hits += 1
                
        is_winner_correct = False
        if pred_last_names[0] in actual_last_names[0] or actual_last_names[0] in pred_last_names[0]:
            is_winner_correct = True
            
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
        "history": history
    }


@app.head("/health")
@app.get("/health")
async def health():
    return {}