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
    "GridPositionSquared",
    "QualiGapToPole",
    "QualiGapNormalized",
    "MidfieldFlag",
    "AvgFinishLast3",
    "PodiumRateLast5",
    "TrackType_street",
    "TrackType_permanent",
]

_DRIVER_DEFAULTS = {
    "AvgFinishLast3":         10.0,
    "PodiumRateLast5":        0.15,
}

track_type = {
    "Jeddah":        "street",
    "Baku":          "street",
    "Miami":         "street",
    "Monaco":        "street",
    "Monte Carlo":   "street",
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
    "Yas Marina":        "permanent",
    "Madrid":            "street",
    "Shanghai":          "permanent",
    "Imola":             "permanent",
    "Kuala Lumpur":      "permanent",
}

_schedule_cache  = {}
_history_df      = None
_history_mtime   = 0.0


def _read_history():
    """Return the dataset sorted by (Year, Round), re-reading only when the CSV changes."""
    global _history_df, _history_mtime
    if not os.path.exists(DATA_PATH):
        return None
    try:
        mtime = os.path.getmtime(DATA_PATH)
        if _history_df is None or mtime != _history_mtime:
            hist = pd.read_csv(DATA_PATH)
            if not {"FullName", "Position", "Podium"}.issubset(hist.columns):
                print("[PREDICT] Warning: CSV lacks FullName/Position/Podium — using defaults for all drivers")
                return None
            _history_df    = hist.sort_values(["Year", "Round"])
            _history_mtime = mtime
    except Exception as e:
        print(f"[PREDICT] _read_history failed: {e}")
    return _history_df


def load_history(target_year=None, target_round=None):
    """Per-driver rolling features using only races before (target_year, target_round)."""
    hist = _read_history()
    if hist is None:
        return {}

    # Prevent data leakage when predicting past races retroactively
    if target_year is not None and target_round is not None:
        hist = hist[
            (hist["Year"] < target_year) |
            ((hist["Year"] == target_year) & (hist["Round"] < target_round))
        ]

    # Mirrors train.py: shift(1).rolling(n) at the next race == tail(n) of prior races
    return {
        driver: {
            "AvgFinishLast3":  grp["Position"].tail(3).mean(),
            "PodiumRateLast5": grp["Podium"].tail(5).mean(),
        }
        for driver, grp in hist.groupby("FullName")
    }


_read_history()


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
        print(f"[SCHEDULE] get_session_times failed for {year} R{round_num}: {e}")
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


def predict_podium(df, circuit_name, podium_model, winner_model=None):
    target_year = int(df["Year"].iloc[0]) if "Year" in df.columns else None
    target_round = int(df["Round"].iloc[0]) if "Round" in df.columns else None
    driver_latest = load_history(target_year, target_round)
    df = df.copy()

    if df["GridPosition"].isna().any():
        missing = df["GridPosition"].isna().sum()
        print(f"[PREDICT] Imputing {missing} missing GridPosition(s) with 15")
        df["GridPosition"] = df["GridPosition"].fillna(15)

    if df["BestQualiTime"].isna().any():
        worst = df["BestQualiTime"].max()
        df["BestQualiTime"] = df["BestQualiTime"].fillna(worst + 5.0)

    # V5-specific computed features
    df["GridPositionSquared"] = df["GridPosition"] ** 2
    df["QualiGapToPole"] = df["BestQualiTime"] - df["BestQualiTime"].min()
    df["QualiGapNormalized"] = (
        (df["BestQualiTime"] - df["BestQualiTime"].min()) / df["BestQualiTime"].min() * 100
    )
    df["MidfieldFlag"] = ((df["GridPosition"] >= 6) & (df["GridPosition"] <= 12)).astype(int)

    tt = track_type.get(circuit_name)
    if tt is None:
        print(f"[PREDICT] Unknown circuit '{circuit_name}' — defaulting to 'permanent'. Add to track_type dict.")
        tt = "permanent"
    df["TrackType_street"]    = int(tt == "street")
    df["TrackType_permanent"] = int(tt == "permanent")

    for feat, default in _DRIVER_DEFAULTS.items():
        df[feat] = df["FullName"].map(
            lambda name, f=feat, d=default: driver_latest.get(name, {}).get(f, d)
        )

    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0.0

    podium_proba = podium_model.predict_proba(df[FEATURE_COLS])[:, 1]

    df["PodiumProbability"] = podium_proba
    df["WinnerProbability"] = podium_proba  # V5 uses single model
    df["CombinedScore"]     = podium_proba

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
