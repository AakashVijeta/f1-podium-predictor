import os
import fastf1
import pandas as pd
from datetime import datetime, timezone, timedelta

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_PATH  = os.path.join(BASE_DIR, "data", "f1_dataset_clean.csv")
cache_path = os.path.join(BASE_DIR, "cache")

if not os.path.exists(cache_path):
    os.makedirs(cache_path)

fastf1.Cache.enable_cache(cache_path)

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

_DRIVER_FEATURE_COLS = [
    "AvgPositionGainLast3", "FinishStdLast5", "DNFRateLast5",
    "AvgFinishLast3", "PodiumRateLast5", "BeatTeammateRate", "CurrentSeasonAvgFinish",
]
_TEAM_FEATURE_COLS = [
    "ConstructorPodiumRate", "ConstructorAvgFinish", "ConstructorDevelopmentRate",
]
_DRIVER_DEFAULTS = {
    "AvgPositionGainLast3":   0.0,
    "FinishStdLast5":         5.0,
    "DNFRateLast5":           0.1,
    "AvgFinishLast3":         10.0,
    "PodiumRateLast5":        0.15,
    "BeatTeammateRate":       0.5,
    "CurrentSeasonAvgFinish": 11.0,
}
_TEAM_DEFAULTS = {
    "ConstructorPodiumRate":      0.1,
    "ConstructorAvgFinish":       10.0,
    "ConstructorDevelopmentRate": 0.0,
}

track_type = {
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

_schedule_cache  = {}
_driver_latest   = {}
_team_latest     = {}
_history_mtime   = 0.0


def load_history():
    """Load latest per-driver and per-team rolling features from the engineered CSV."""
    global _driver_latest, _team_latest, _history_mtime
    if not os.path.exists(DATA_PATH):
        return
    try:
        mtime = os.path.getmtime(DATA_PATH)
        if mtime == _history_mtime:
            return
        hist = pd.read_csv(DATA_PATH)
        avail_driver = [c for c in _DRIVER_FEATURE_COLS if c in hist.columns]
        avail_team   = [c for c in _TEAM_FEATURE_COLS   if c in hist.columns]
        if not avail_driver:
            print("[PREDICT] Warning: CSV lacks engineered columns — using defaults for all drivers")
            return
        hist_sorted = hist.sort_values(["Year", "Round"])
        driver_last = hist_sorted.groupby("FullName").last().reset_index()
        _driver_latest = {
            row["FullName"]: {c: row[c] for c in avail_driver}
            for _, row in driver_last.iterrows()
        }
        team_last = hist_sorted.groupby("TeamName").last().reset_index()
        _team_latest = {
            row["TeamName"]: {c: row[c] for c in avail_team}
            for _, row in team_last.iterrows()
        }
        _history_mtime = mtime
    except Exception as e:
        print(f"[PREDICT] load_history failed: {e}")


load_history()


def get_session_status(year, round):
    if year not in _schedule_cache:
        _schedule_cache[year] = fastf1.get_event_schedule(year)
    schedule  = _schedule_cache[year]
    event     = schedule[schedule["RoundNumber"] == round].iloc[0]
    quali_time = event["Session4DateUtc"].to_pydatetime().replace(tzinfo=timezone.utc)
    race_time  = event["Session5DateUtc"].to_pydatetime().replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if now < quali_time + timedelta(hours=1, minutes=30):
        return "pre_quali"
    elif now < race_time + timedelta(hours=3):
        return "pre_race"
    else:
        return "post_race"


def get_session_times(year: int, round_num: int) -> dict:
    try:
        if year not in _schedule_cache:
            _schedule_cache[year] = fastf1.get_event_schedule(year)
        schedule = _schedule_cache[year]
        event = schedule[schedule["RoundNumber"] == round_num].iloc[0]
        quali = event["Session4DateUtc"].to_pydatetime().replace(tzinfo=timezone.utc).isoformat()
        race  = event["Session5DateUtc"].to_pydatetime().replace(tzinfo=timezone.utc).isoformat()
        return {"qualifying": quali, "race": race}
    except Exception as e:
        print(f"[SCHEDULE] get_session_times failed: {e}")
        return {"qualifying": None, "race": None}


def fetch_qualifying_data(year, round):
    try:
        session = fastf1.get_session(year, round, "Q")
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        circuit_name = session.event["Location"]

        results = session.results[["FullName", "TeamName", "Q1", "Q2", "Q3", "Position"]].copy()
        results["BestQualiTime"] = results[["Q1", "Q2", "Q3"]].min(axis=1).dt.total_seconds()
        results = results.rename(columns={"Position": "GridPosition"})
        results = results[["FullName", "TeamName", "BestQualiTime", "GridPosition"]]
        results["Year"]  = year
        results["Round"] = round

        valid_drivers   = results["BestQualiTime"].notna().sum()
        valid_positions = results["GridPosition"].notna().sum()

        if valid_drivers < 18 or valid_positions < 18:
            print(
                f"[QUALI] Incomplete data — "
                f"{valid_drivers} drivers with lap times, "
                f"{valid_positions} with grid positions — returning None to retry"
            )
            return None

        return results, circuit_name

    except Exception as e:
        print(f"[QUALI] fetch_qualifying_data failed: {e}")
        return None


def predict_podium(df, circuit_name, podium_model, winner_model):
    load_history()
    df = df.copy()

    if df["GridPosition"].isna().any():
        missing = df["GridPosition"].isna().sum()
        print(f"[PREDICT] Imputing {missing} missing GridPosition(s) with 15")
        df["GridPosition"] = df["GridPosition"].fillna(15)

    if df["BestQualiTime"].isna().any():
        worst = df["BestQualiTime"].max()
        df["BestQualiTime"] = df["BestQualiTime"].fillna(worst + 5.0)

    df["QualiGapNormalized"] = (
        (df["BestQualiTime"] - df["BestQualiTime"].min()) / df["BestQualiTime"].min() * 100
    )
    df["RainFlag"] = 0

    tt = track_type.get(circuit_name)
    if tt is None:
        print(f"[PREDICT] Unknown circuit '{circuit_name}' — defaulting to 'permanent'. Add to track_type dict.")
        tt = "permanent"
    df["TrackType_street"]    = int(tt == "street")
    df["TrackType_permanent"] = int(tt == "permanent")

    for feat, default in _DRIVER_DEFAULTS.items():
        df[feat] = df["FullName"].map(
            lambda name, f=feat, d=default: _driver_latest.get(name, {}).get(f, d)
        )

    for feat, default in _TEAM_DEFAULTS.items():
        if "TeamName" in df.columns:
            df[feat] = df["TeamName"].map(
                lambda name, f=feat, d=default: _team_latest.get(name, {}).get(f, d)
            )
        else:
            df[feat] = default

    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0.0

    podium_proba = podium_model.predict_proba(df[FEATURE_COLS])[:, 1]
    winner_proba = winner_model.predict_proba(df[FEATURE_COLS])[:, 1]
    combined     = 0.6 * podium_proba + 0.4 * winner_proba

    df["PodiumProbability"] = podium_proba
    df["WinnerProbability"] = winner_proba
    df["CombinedScore"]     = combined

    return df[["FullName", "PodiumProbability", "WinnerProbability", "CombinedScore"]].sort_values(
        by="CombinedScore", ascending=False
    )


def fetch_race_results(year, round):
    try:
        session = fastf1.get_session(year, round, "R")
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        results = session.results[["FullName", "Position"]].copy()
        if results.empty:
            return None
        results = results.rename(columns={"Position": "RacePosition"})
        results["RacePosition"] = results["RacePosition"].astype(int)
        results = results[results["RacePosition"] <= 3].sort_values("RacePosition")
        return results if not results.empty else None
    except Exception as e:
        print(f"[RACE] fetch_race_results failed: {e}")
        return None
