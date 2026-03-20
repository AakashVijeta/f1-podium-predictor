import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
import joblib
from fastapi.middleware.cors import CORSMiddleware
from routers import results
  
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

    elif status == "pre_race":
        result = fetch_qualifying_data(year, round)
        if result is None:
            return {"status": "error", "message": "Failed to fetch qualifying data"}
        quali_data, circuit_name = result
        predictions = predict_podium(quali_data, circuit_name, model)
        return {"status": "pre_race", "predictions": predictions.to_dict(orient="records")}

    elif status == "post_race":
        race_results = fetch_race_results(year, round)
        if race_results is None:
            return {"status": "error", "message": "Failed to fetch race results"}

        predictions = None
        quali_result = fetch_qualifying_data(year, round)
        if quali_result is not None:
            quali_data, circuit_name = quali_result
            predictions = predict_podium(quali_data, circuit_name, model)

        response = {
            "status": "post_race",
            "results": race_results.to_dict(orient="records"),
        }
        if predictions is not None:
            response["predictions"] = predictions.to_dict(orient="records")

        return response

@app.head("/health")
@app.get("/health")
async def health():
    return {}