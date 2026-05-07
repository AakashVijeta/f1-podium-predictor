"""
F1 Podium Predictor — Training Script (v8)
------------------------------------------
Usage:
    python train.py --year 2026 --round 4
    python train.py --retrain-only
    python train.py --rebuild
"""

import argparse
import os
import time
import joblib
import numpy as np
import pandas as pd
import fastf1
import optuna
from optuna.samplers import TPESampler
from lightgbm import LGBMClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

optuna.logging.set_verbosity(optuna.logging.WARNING)

BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
DATA_PATH         = os.path.join(BASE_DIR, "data",   "f1_dataset_clean.csv")
MODEL_PATH        = os.path.join(BASE_DIR, "models", "model_v8.pkl")
WINNER_MODEL_PATH = os.path.join(BASE_DIR, "models", "model_v8_winner.pkl")
CACHE_PATH        = os.path.join(BASE_DIR, "cache")

DECAY_FACTOR     = 0.38
TARGET           = "Podium"
HISTORICAL_YEARS = [2023, 2024, 2025, 2026]

FEATURE_COLS = [
    "GridPosition",
    "QualiGapNormalized",
    "AvgPositionGainLast3",
    "FinishStdLast5",
    "DNFRateLast5",
    "AvgFinishLast3",
    "PodiumRateLast5",
    "BeatTeammateRate",
    "CurrentSeasonAvgFinish",
    "ConstructorPodiumRate",
    "ConstructorAvgFinish",
    "ConstructorDevelopmentRate",
    "TrackType_street",
    "TrackType_permanent",
    "RainFlag",
]

TRACK_TYPE = {
    "Jeddah":        "street",
    "Baku":          "street",
    "Miami":         "street",
    "Monaco":        "street",
    "Marina Bay":    "street",
    "Las Vegas":     "street",
    "Melbourne":     "street",
    "Miami Gardens": "street",
    "Madrid":        "street",
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


def fetch_round(year, round_num):
    try:
        session_r = fastf1.get_session(year, round_num, "R")
        session_r.load(laps=False, telemetry=False, weather=True, messages=False)
        race = session_r.results[["FullName", "TeamName", "GridPosition", "Position", "Status"]].copy()
        race["Year"]     = year
        race["Round"]    = round_num
        race["Location"] = session_r.event["Location"]
        try:
            rain = session_r.weather_data["Rainfall"].any()
            race["RainFlag"] = int(rain)
        except Exception:
            race["RainFlag"] = 0
    except Exception as e:
        print(f"  ✗ Race failed {year} R{round_num}: {e}")
        return None

    try:
        session_q = fastf1.get_session(year, round_num, "Q")
        session_q.load(laps=False, telemetry=False, weather=False, messages=False)
        q = session_q.results[["FullName", "Q1", "Q2", "Q3"]].copy()
        q["BestQualiTime"] = q[["Q1", "Q2", "Q3"]].min(axis=1).dt.total_seconds()
        q = q[["FullName", "BestQualiTime"]]
    except Exception as e:
        print(f"  ✗ Quali failed {year} R{round_num}: {e}")
        q = pd.DataFrame(columns=["FullName", "BestQualiTime"])

    df = race.merge(q, on="FullName", how="left")
    df["Podium"]    = (df["Position"] <= 3).astype(int)
    df["TrackType"] = df["Location"].map(TRACK_TYPE)

    if df["TrackType"].isnull().any():
        unknown = df[df["TrackType"].isnull()]["Location"].unique()
        print(f"  ⚠ Unknown locations — add to TRACK_TYPE: {unknown}")

    time.sleep(1)
    return df


def fetch_all_historical():
    print("\nFetching full historical dataset...")
    frames = []
    for year in HISTORICAL_YEARS:
        print(f"\n── {year} ──────────────────────")
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        for round_num in schedule["RoundNumber"].tolist():
            df = fetch_round(year, round_num)
            if df is not None and len(df) > 0:
                frames.append(df)
    return pd.concat(frames, ignore_index=True)


def clean(df):
    df = df.copy()
    df = df.dropna(subset=["Position"])
    df["Position"]     = df["Position"].astype(int)
    df["GridPosition"] = df["GridPosition"].fillna(20).astype(int)
    worst_per_round    = df.groupby(["Year", "Round"])["BestQualiTime"].transform("max")
    df["BestQualiTime"] = df["BestQualiTime"].fillna(worst_per_round + 5.0)
    return df.sort_values(["Year", "Round", "Position"]).reset_index(drop=True)


def other_driver_mean(df, by, column):
    counts    = df.groupby(by)[column].transform("count")
    totals    = df.groupby(by)[column].transform("sum")
    peer_mean = (totals - df[column]) / (counts - 1)
    return peer_mean.where(counts > 1, df[column])


def engineer_features(df):
    df = df.copy()
    round_key      = ["Year", "Round"]
    team_round_key = ["Year", "Round", "TeamName"]

    df["QualiGapNormalized"]  = df.groupby(round_key)["BestQualiTime"].transform(
        lambda x: (x - x.min()) / x.min() * 100
    )
    df["GridPositionSquared"] = df["GridPosition"] ** 2

    teammate_grid          = other_driver_mean(df, team_round_key, "GridPosition")
    teammate_quali         = other_driver_mean(df, team_round_key, "BestQualiTime")
    df["TeammateGridDelta"] = df["GridPosition"] - teammate_grid
    df["TeammateQualiGap"]  = df["BestQualiTime"] - teammate_quali

    df["PositionGain"] = df["GridPosition"] - df["Position"]
    df = df.sort_values(["FullName", "Year", "Round"])

    df["AvgPositionGainLast3"] = (
        df.groupby(["FullName", "Year"])["PositionGain"]
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
        .fillna(0.0)
    )
    df["FinishStdLast5"] = (
        df.groupby(["FullName", "Year"])["Position"]
        .transform(lambda x: x.shift(1).rolling(5, min_periods=2).std())
        .fillna(5.0)
    )
    df["AvgFinishLast3"] = (
        df.groupby(["FullName", "Year"])["Position"]
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
        .fillna(10.0)
    )
    df["PodiumRateLast5"] = (
        df.groupby(["FullName", "Year"])["Podium"]
        .transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())
        .fillna(0.15)
    )
    df["DNF"] = df["Status"].isin(
        ["Retired", "Accident", "Collision damage", "Undertray", "Withdrew"]
    ).astype(int)
    df["DNFRateLast5"] = (
        df.groupby(["FullName", "Year"])["DNF"]
        .transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())
        .fillna(0.1)
    )

    teammate_position      = other_driver_mean(df, team_round_key, "Position")
    df["BeatTeammate"]     = (df["Position"] < teammate_position).astype(int)
    df["BeatTeammateRate"] = (
        df.groupby(["FullName", "Year"])["BeatTeammate"]
        .transform(lambda x: x.shift(1).rolling(5, min_periods=2).mean())
        .fillna(0.5)
    )

    team_round = (
        df.groupby(["TeamName", "Year", "Round"], as_index=False)
        .agg(TeamPodiumCurrent=("Podium", "mean"), TeamAvgFinishCurrent=("Position", "mean"))
        .sort_values(["TeamName", "Year", "Round"])
    )
    team_round["ConstructorPodiumRate"] = (
        team_round.groupby(["TeamName", "Year"])["TeamPodiumCurrent"]
        .transform(lambda x: x.shift(1).rolling(5, min_periods=2).mean())
        .fillna(0.1)
    )
    team_round["ConstructorAvgFinish"] = (
        team_round.groupby(["TeamName", "Year"])["TeamAvgFinishCurrent"]
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
        .fillna(10.0)
    )

    df = df.merge(
        team_round[["TeamName", "Year", "Round", "ConstructorPodiumRate", "ConstructorAvgFinish"]],
        on=["TeamName", "Year", "Round"], how="left",
    )
    df = df.sort_values(["Year", "Round", "GridPosition"]).reset_index(drop=True)
    df = df.drop(columns=["PositionGain", "DNF", "BeatTeammate"])
    return df


def add_constructor_development(df):
    df = df.sort_values(["Year", "Round"])
    constructor_round_avg = (
        df.groupby(["Year", "Round", "TeamName"])["Position"]
        .mean()
        .reset_index()
        .rename(columns={"Position": "ConstructorRoundAvgFinish"})
        .drop_duplicates(subset=["Year", "Round", "TeamName"])
    )
    constructor_round_avg = constructor_round_avg.sort_values(["Year", "TeamName", "Round"])
    constructor_round_avg["ConstructorFirst3Avg"] = (
        constructor_round_avg.groupby(["Year", "TeamName"])["ConstructorRoundAvgFinish"]
        .transform(lambda x: x.iloc[:3].mean())
    )
    constructor_round_avg["ConstructorLast3Avg"] = (
        constructor_round_avg.groupby(["Year", "TeamName"])["ConstructorRoundAvgFinish"]
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
    )
    constructor_round_avg["ConstructorDevelopmentRate"] = (
        constructor_round_avg["ConstructorLast3Avg"] - constructor_round_avg["ConstructorFirst3Avg"]
    )
    df = df.merge(
        constructor_round_avg[["Year", "Round", "TeamName", "ConstructorDevelopmentRate"]],
        on=["Year", "Round", "TeamName"], how="left",
    )
    df["ConstructorDevelopmentRate"] = df["ConstructorDevelopmentRate"].fillna(0)
    return df


def add_current_season_avg(df):
    df = df.sort_values(["Year", "Round"])
    df["CurrentSeasonAvgFinish"] = (
        df.groupby(["Year", "FullName"])["Position"]
        .transform(lambda x: x.shift(1).expanding().mean())
        .fillna(11.0)
    )
    return df


def build_model_frame(df):
    df_model = pd.get_dummies(df, columns=["TrackType"], dtype=int)
    df_model["Winner"] = (df_model["Position"] == 1).astype(int)
    for col in ["TrackType_street", "TrackType_permanent"]:
        if col not in df_model.columns:
            df_model[col] = 0
    for col in FEATURE_COLS:
        if col not in df_model.columns:
            df_model[col] = 0.0
        df_model[col] = df_model[col].fillna(df_model[col].median())
    return df_model


def top3_hits(eval_df, score_col, largest=True):
    correct, total = 0, 0
    for (yr, rnd), grp in eval_df.groupby(["Year", "Round"]):
        ranked      = grp.nlargest(3, score_col) if largest else grp.nsmallest(3, score_col)
        pred_top3   = set(ranked["FullName"])
        actual_top3 = set(grp[grp[TARGET] == 1]["FullName"])
        correct += len(pred_top3 & actual_top3)
        total   += min(3, len(actual_top3))
    return correct, total, correct / total if total else float("nan")


def train(df_model):
    tune_df  = df_model[df_model["Year"] < 2025].copy()
    val_df   = df_model[df_model["Year"] == 2025].copy()
    train_df = df_model[df_model["Year"] < 2026].copy()
    test_df  = df_model[df_model["Year"] == 2026].copy()

    print(f"Tune: {len(tune_df)}  Val: {len(val_df)}  Train: {len(train_df)}  Test: {len(test_df)}")

    tune_weights = (DECAY_FACTOR ** (2024 - tune_df["Year"])).values

    def objective(trial):
        params = {
            "n_estimators":      trial.suggest_int("n_estimators", 100, 600),
            "max_depth":         trial.suggest_int("max_depth", 3, 7),
            "learning_rate":     trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
            "num_leaves":        trial.suggest_int("num_leaves", 15, 63),
            "min_child_samples": trial.suggest_int("min_child_samples", 10, 30),
            "subsample":         trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree":  trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "scale_pos_weight":  trial.suggest_float("scale_pos_weight", 4, 10),
            "random_state": 42,
            "verbose": -1,
        }
        mdl = CalibratedClassifierCV(LGBMClassifier(**params), cv=3, method="isotonic")
        mdl.fit(tune_df[FEATURE_COLS], tune_df[TARGET], sample_weight=tune_weights)
        proba = mdl.predict_proba(val_df[FEATURE_COLS])[:, 1]
        return average_precision_score(val_df[TARGET], proba)

    study = optuna.create_study(direction="maximize", sampler=TPESampler(seed=42))
    study.optimize(objective, n_trials=100, show_progress_bar=True)
    print(f"\nBest AP (val):  {study.best_value:.4f}")
    print(f"Best params:    {study.best_params}")

    best_params   = study.best_params | {"random_state": 42, "verbose": -1}
    train_weights = (DECAY_FACTOR ** (2025 - train_df["Year"])).values

    podium_model = CalibratedClassifierCV(LGBMClassifier(**best_params), cv=3, method="isotonic")
    podium_model.fit(train_df[FEATURE_COLS], train_df[TARGET], sample_weight=train_weights)

    winner_params = best_params.copy()
    winner_params["scale_pos_weight"] = (
        (train_df["Winner"] == 0).sum() / (train_df["Winner"] == 1).sum()
    )
    winner_model = CalibratedClassifierCV(LGBMClassifier(**winner_params), cv=3, method="isotonic")
    winner_model.fit(train_df[FEATURE_COLS], train_df["Winner"], sample_weight=train_weights)

    if len(test_df) > 0 and test_df[TARGET].nunique() > 1:
        podium_proba = podium_model.predict_proba(test_df[FEATURE_COLS])[:, 1]
        winner_proba = winner_model.predict_proba(test_df[FEATURE_COLS])[:, 1]
        combined     = 0.6 * podium_proba + 0.4 * winner_proba

        eval_df = test_df.reset_index(drop=True).copy()
        eval_df["ranking_score"] = combined

        print(f"\n── 2026 holdout ──")
        print(f"ROC AUC:           {roc_auc_score(eval_df[TARGET], podium_proba):.4f}")
        print(f"Average Precision: {average_precision_score(eval_df[TARGET], podium_proba):.4f}")
        print(f"Brier Score:       {brier_score_loss(eval_df[TARGET], podium_proba):.4f}")
        mc, mt, mr = top3_hits(eval_df, "ranking_score")
        gc, gt, gr = top3_hits(eval_df, "GridPosition", largest=False)
        print(f"Model Top-3:       {mc}/{mt} ({mr:.1%})")
        print(f"Grid baseline:     {gc}/{gt} ({gr:.1%})")
        print(f"Edge vs grid:      {mr - gr:+.1%}")

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(podium_model, MODEL_PATH)
    joblib.dump(winner_model, WINNER_MODEL_PATH)
    print(f"\nModels saved → {MODEL_PATH}")
    return podium_model, winner_model


def _pipeline(df_raw):
    df_clean = clean(df_raw)
    df_feat  = engineer_features(df_clean)
    df_feat  = add_constructor_development(df_feat)
    df_feat  = add_current_season_avg(df_feat)
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    df_feat.to_csv(DATA_PATH, index=False)
    print(f"Dataset saved → {DATA_PATH} ({len(df_feat)} rows)")
    df_model = build_model_frame(df_feat)
    train(df_model)


def main():
    parser = argparse.ArgumentParser(description="F1 Podium Predictor — Training Script (v8)")
    parser.add_argument("--year",         type=int, help="Year of new round to fetch")
    parser.add_argument("--round",        type=int, help="Round number to fetch")
    parser.add_argument("--retrain-only", action="store_true", help="Retrain on existing CSV without fetching")
    parser.add_argument("--rebuild",      action="store_true", help="Re-fetch all historical data from scratch")
    args = parser.parse_args()

    fastf1.Cache.enable_cache(CACHE_PATH)
    os.makedirs(os.path.join(BASE_DIR, "data"),   exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "models"), exist_ok=True)

    if args.retrain_only:
        print(f"Loading existing dataset from {DATA_PATH}...")
        df = pd.read_csv(DATA_PATH)
        print(f"Loaded {df.shape[0]} rows.")
        df_model = build_model_frame(df)
        train(df_model)
        return

    if args.rebuild:
        df_raw = fetch_all_historical()
        _pipeline(df_raw)
        return

    if not args.year or not args.round:
        parser.error("Provide --year and --round, or use --retrain-only / --rebuild")

    df_raw = pd.read_csv(DATA_PATH) if os.path.exists(DATA_PATH) else pd.DataFrame()

    if not df_raw.empty:
        already = ((df_raw["Year"] == args.year) & (df_raw["Round"] == args.round)).any()
        if already:
            print(f"⚠ {args.year} R{args.round} already in dataset. Retraining on existing data.")
            df_model = build_model_frame(df_raw)
            train(df_model)
            return

    new_df = fetch_round(args.year, args.round)
    if new_df is None:
        print("✗ Failed to fetch new round. Aborting.")
        return

    df_raw = pd.concat([df_raw, new_df], ignore_index=True) if not df_raw.empty else new_df
    _pipeline(df_raw)


if __name__ == "__main__":
    main()
