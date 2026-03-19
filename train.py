"""
F1 Podium Predictor — Training Script
--------------------------------------
Usage:
    # Fetch a new round and retrain
    python train.py --year 2026 --round 4

    # Retrain on existing data only (no new fetch)
    python train.py --retrain-only

    # Full rebuild from scratch (re-fetches all historical data)
    python train.py --rebuild
"""

import argparse
import time
import os
import joblib
import fastf1
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import classification_report

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_PATH   = os.path.join(BASE_DIR, "data", "f1_dataset_clean.csv")
MODEL_PATH  = os.path.join(BASE_DIR, "models", "model_v4.pkl")
CACHE_PATH  = os.path.join(BASE_DIR, "cache")

# ── Config ───────────────────────────────────────────────────────────────────
FEATURE_COLS   = ["BestQualiTime", "GridPosition", "TrackType_street", "TrackType_permanent"]
HISTORICAL_YEARS = [2023, 2024, 2025]

TRACK_TYPE = {
    # Street circuits
    "Jeddah":        "street",
    "Baku":          "street",
    "Miami":         "street",
    "Monaco":        "street",
    "Marina Bay":    "street",
    "Las Vegas":     "street",
    "Melbourne":     "street",
    "Miami Gardens": "street",
    "Madrid":        "street",

    # Permanent circuits
    "Sakhir":            "permanent",
    "Barcelona":         "permanent",
    "Montréal":          "permanent",
    "Spielberg":         "permanent",
    "Silverstone":       "permanent",
    "Budapest":          "permanent",
    "Spa-Francorchamps": "permanent",
    "Zandvoort":         "permanent",
    "Monza":             "permanent",
    "Suzuka":            "permanent",
    "Lusail":            "permanent",
    "Austin":            "permanent",
    "Mexico City":       "permanent",
    "São Paulo":         "permanent",
    "Yas Island":        "permanent",
    "Shanghai":          "permanent",
    "Imola":             "permanent",
}


# ── Data fetching ─────────────────────────────────────────────────────────────

def fetch_round(year: int, round_num: int) -> pd.DataFrame | None:
    """Fetch race + qualifying data for a single round and return a merged DataFrame."""
    print(f"\n  Fetching {year} R{round_num}...")

    # Race
    try:
        session = fastf1.get_session(year, round_num, "R")
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        result = session.results[["FullName", "TeamName", "GridPosition", "Position"]].copy()
        result["Round"]       = round_num
        result["Year"]        = year
        result["SessionType"] = "R"
        result["Location"]    = session.event["Location"]
    except Exception as e:
        print(f"  ✗ Race fetch failed: {e}")
        return None

    # Qualifying
    try:
        session_q = fastf1.get_session(year, round_num, "Q")
        session_q.load(laps=True, telemetry=False, weather=False, messages=False)
        best_laps = session_q.laps[session_q.laps["IsPersonalBest"] == True].copy()
        best_laps = best_laps.groupby("Driver")["LapTime"].min().reset_index()
        best_laps.columns = ["Driver", "BestQualiTime"]
        best_laps["BestQualiTime"] = best_laps["BestQualiTime"].dt.total_seconds()
        best_laps["Round"] = round_num
        best_laps["Year"]  = year
        driver_map = session_q.results[["Abbreviation", "FullName"]].set_index("Abbreviation")["FullName"].to_dict()
        best_laps["FullName"] = best_laps["Driver"].map(driver_map)
        best_laps = best_laps.drop(columns=["Driver"])
    except Exception as e:
        print(f"  ✗ Quali fetch failed: {e}")
        best_laps = pd.DataFrame(columns=["FullName", "Round", "Year", "BestQualiTime"])

    # Merge
    df = result.merge(best_laps, on=["FullName", "Round", "Year"], how="left")
    df["Podium"]    = (df["Position"] <= 3).astype(int)
    df["TrackType"] = df["Location"].map(TRACK_TYPE)

    if df["TrackType"].isnull().any():
        unknown = df[df["TrackType"].isnull()]["Location"].unique()
        print(f"  ⚠ Unknown track locations (add to TRACK_TYPE): {unknown}")

    print(f"  ✓ {year} R{round_num} — {len(df)} drivers")
    time.sleep(1)
    return df


def fetch_all_historical() -> pd.DataFrame:
    """Fetch all historical data from scratch (2023–2025)."""
    print("\nFetching full historical dataset (this will take a while)...")
    frames = []
    for year in HISTORICAL_YEARS:
        for i in range(1, 25):
            df = fetch_round(year, i)
            if df is not None:
                frames.append(df)
    return pd.concat(frames, ignore_index=True)


# ── Preprocessing ─────────────────────────────────────────────────────────────

def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Fill missing quali times with round median, drop rows missing position."""
    df["BestQualiTime"] = df.groupby(["Round", "Year"])["BestQualiTime"].transform(
        lambda x: x.fillna(x.median())
    )
    df = df.dropna(subset=["Position", "GridPosition"])
    df = df.sort_values(["Year", "Round"]).reset_index(drop=True)
    return df


# ── Training ──────────────────────────────────────────────────────────────────

def train(df: pd.DataFrame):
    """One-hot encode, split, train, evaluate, save model."""
    print("\nTraining model...")

    df_model = pd.get_dummies(df, columns=["TrackType"], dtype=int)

    # Ensure both dummy columns exist even if one track type is absent
    for col in ["TrackType_street", "TrackType_permanent"]:
        if col not in df_model.columns:
            df_model[col] = 0

    # Train: everything except last 6 rounds of 2025 | Test: last 6 rounds of 2025
    train_df = df_model[
        (df_model["Year"] < 2025) |
        ((df_model["Year"] == 2025) & (df_model["Round"] <= 16)) |
        (df_model["Year"] == 2026)
    ]
    test_df = df_model[(df_model["Year"] == 2025) & (df_model["Round"] > 16)]

    X_train = train_df[FEATURE_COLS]
    y_train = train_df["Podium"]
    X_test  = test_df[FEATURE_COLS]
    y_test  = test_df["Podium"]

    model = GradientBoostingClassifier(random_state=42)
    model.fit(X_train, y_train)

    print(f"\nTrain size: {len(X_train)} | Test size: {len(X_test)}")
    print("\nEvaluation on held-out test set:")
    print(classification_report(y_test, model.predict(X_test)))

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"✓ Model saved → {MODEL_PATH}")

    return model


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="F1 Podium Predictor — Training Script")
    parser.add_argument("--year",         type=int, help="Year of the new round to fetch")
    parser.add_argument("--round",        type=int, help="Round number to fetch")
    parser.add_argument("--retrain-only", action="store_true", help="Retrain on existing CSV without fetching new data")
    parser.add_argument("--rebuild",      action="store_true", help="Re-fetch all historical data from scratch")
    args = parser.parse_args()

    fastf1.Cache.enable_cache(CACHE_PATH)
    os.makedirs(os.path.join(BASE_DIR, "data"),   exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "models"), exist_ok=True)

    # ── Mode 1: retrain only ──────────────────────────────────────────────────
    if args.retrain_only:
        print(f"Loading existing dataset from {DATA_PATH}...")
        df = pd.read_csv(DATA_PATH)
        print(f"Loaded {df.shape[0]} rows.")
        train(df)
        return

    # ── Mode 2: full rebuild ──────────────────────────────────────────────────
    if args.rebuild:
        df = fetch_all_historical()
        df = clean(df)
        df.to_csv(DATA_PATH, index=False)
        print(f"\n✓ Dataset saved → {DATA_PATH} ({df.shape[0]} rows)")
        train(df)
        return

    # ── Mode 3: append new round (default) ───────────────────────────────────
    if not args.year or not args.round:
        parser.error("Provide --year and --round, or use --retrain-only / --rebuild")

    # Load existing data
    if os.path.exists(DATA_PATH):
        print(f"Loading existing dataset ({DATA_PATH})...")
        df = pd.read_csv(DATA_PATH)
        print(f"Loaded {df.shape[0]} rows.")

        # Check if round already exists
        already = ((df["Year"] == args.year) & (df["Round"] == args.round)).any()
        if already:
            print(f"⚠ {args.year} R{args.round} already in dataset. Retraining on existing data.")
            train(df)
            return
    else:
        print("No existing dataset found. Starting fresh.")
        df = pd.DataFrame()

    # Fetch new round
    new_df = fetch_round(args.year, args.round)
    if new_df is None:
        print("✗ Failed to fetch new round. Aborting.")
        return

    # Append and clean
    df = pd.concat([df, new_df], ignore_index=True)
    df = clean(df)

    # Save updated dataset
    df.to_csv(DATA_PATH, index=False)
    print(f"\n✓ Dataset updated → {DATA_PATH} ({df.shape[0]} rows)")

    # Retrain
    train(df)


if __name__ == "__main__":
    main()
