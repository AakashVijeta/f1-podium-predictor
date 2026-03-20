import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
import joblib
from fastapi.middleware.cors import CORSMiddleware

from predict import fetch_qualifying_data, predict_podium, fetch_race_results, get_session_status

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = joblib.load(os.path.join(BASE_DIR, 'models', 'model_v4.pkl'))
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://f1.aakashvijeta.me"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "F1 Podium Predictor API"}

@app.get("/predict/{year}/{round}")
async def predict(year: int, round: int):
    status = get_session_status(year, round)

    if status == "pre_quali":
        return {"status": "pre_quali", "message": "Qualifying hasn't happened yet"}

    elif status == "pre_race":
        result = fetch_qualifying_data(year, round)
        if result is None:
            return {"status": "error", "message": "Failed to fetch qualifying data"}
        quali_data, circuit_name = result
        predictions = predict_podium(quali_data, circuit_name, model)
        return {"status": "pre_race", "predictions": predictions.to_dict(orient="records")}

    elif status == "post_race":
        results = fetch_race_results(year, round)
        if results is None:
            return {"status": "error", "message": "Failed to fetch race results"}
        return {"status": "post_race", "results": results.to_dict(orient="records")}