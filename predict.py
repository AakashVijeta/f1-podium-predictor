import os
import fastf1
import pandas as pd
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
cache_path = os.path.join(BASE_DIR, 'cache')

if not os.path.exists(cache_path):
    os.makedirs(cache_path)

fastf1.Cache.enable_cache(cache_path)

track_type = {
    # Street circuits
    'Jeddah': 'street',
    'Baku': 'street',
    'Miami': 'street',
    'Monaco': 'street',
    'Marina Bay': 'street',
    'Las Vegas': 'street',
    'Melbourne': 'street',
    'Miami Gardens': 'street',
    'Madrid': 'street',

    # Permanent circuits
    'Sakhir': 'permanent',
    'Barcelona': 'permanent',
    'Montréal': 'permanent',
    'Spielberg': 'permanent',
    'Silverstone': 'permanent',
    'Budapest': 'permanent',
    'Spa-Francorchamps': 'permanent',
    'Zandvoort': 'permanent',
    'Monza': 'permanent',
    'Suzuka': 'permanent',
    'Lusail': 'permanent',
    'Austin': 'permanent',
    'Mexico City': 'permanent',
    'São Paulo': 'permanent',
    'Yas Island': 'permanent',
    'Shanghai': 'permanent',
    'Imola': 'permanent',
}

_schedule_cache = {}


def get_session_status(year, round):
    if year not in _schedule_cache:
        _schedule_cache[year] = fastf1.get_event_schedule(year)
    schedule = _schedule_cache[year]
    event = schedule[schedule['RoundNumber'] == round].iloc[0]
    quali_time = event['Session4DateUtc'].to_pydatetime().replace(tzinfo=timezone.utc)
    race_time  = event['Session5DateUtc'].to_pydatetime().replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)

    # Added 1.5-hour buffer for qualifying completion
    if now < quali_time + timedelta(hours=1, minutes=30):
        return "pre_quali"
    # Added 3-hour buffer for race completion
    elif now < race_time + timedelta(hours=3):
        return "pre_race"
    else:
        return "post_race"


def fetch_qualifying_data(year, round):
    try:
        session = fastf1.get_session(year, round, 'Q')
        session.load(laps=True, telemetry=False, weather=False, messages=False)
        circuit_name = session.event['Location']

        laps = session.laps
        if laps is None or laps.empty:
            print(f"[QUALI] No laps data available for {year} R{round}")
            return None

        best_laps = laps[laps['IsPersonalBest'] == True].copy()
        best_laps = best_laps.groupby('Driver')['LapTime'].min().reset_index()
        best_laps.columns = ['Driver', 'BestQualiTime']
        best_laps['BestQualiTime'] = best_laps['BestQualiTime'].dt.total_seconds()
        best_laps['Year']  = year
        best_laps['Round'] = round

        driver_map = (
            session.results[['Abbreviation', 'FullName']]
            .set_index('Abbreviation')['FullName']
            .to_dict()
        )
        best_laps['FullName'] = best_laps['Driver'].map(driver_map)
        best_laps = best_laps.drop(columns=['Driver'])

        grid = session.results[['FullName', 'Position']].copy()
        grid = grid.rename(columns={'Position': 'GridPosition'})
        best_laps = best_laps.merge(grid, on='FullName', how='left')

        # Completeness guard — both lap times AND grid positions must be present
        # Missing GridPosition means FastF1 couldn't compute quali results yet
        # (usually because race control messages haven't been processed yet)
        valid_drivers   = best_laps['BestQualiTime'].notna().sum()
        valid_positions = best_laps['GridPosition'].notna().sum()

        if valid_drivers < 18 or valid_positions < 18:
            print(
                f"[QUALI] Incomplete data — "
                f"{valid_drivers} drivers with lap times, "
                f"{valid_positions} with grid positions — returning None to retry"
            )
            return None

        return best_laps, circuit_name

    except Exception as e:
        print(f"[QUALI] fetch_qualifying_data failed: {e}")
        return None


def predict_podium(df, circuit_name, model):
    df = df.copy()

    # Impute any remaining NaN GridPositions with a midfield default (worst case)
    if df['GridPosition'].isna().any():
        missing = df['GridPosition'].isna().sum()
        print(f"[PREDICT] Imputing {missing} missing GridPosition(s) with fallback value 15")
        df['GridPosition'] = df['GridPosition'].fillna(15)

    # Impute any remaining NaN BestQualiTimes with worst lap + small penalty
    if df['BestQualiTime'].isna().any():
        worst = df['BestQualiTime'].max()
        df['BestQualiTime'] = df['BestQualiTime'].fillna(worst + 5.0)

    df['TrackType'] = track_type[circuit_name]
    df['QualiGapToPole']      = df['BestQualiTime'] - df['BestQualiTime'].min()
    df['QualiGapNormalized']  = (df['BestQualiTime'] - df['BestQualiTime'].min()) / df['BestQualiTime'].min() * 100
    df['GridPositionSquared'] = df['GridPosition'] ** 2
    df['MidfieldFlag']        = ((df['GridPosition'] >= 8) & (df['GridPosition'] <= 15)).astype(int)

    df['AvgFinishLast3']  = 10.0
    df['PodiumRateLast5'] = 0.15

    df_model = pd.get_dummies(df, columns=['TrackType'], dtype=int)

    feature_cols = [
        'GridPosition', 'GridPositionSquared',
        'QualiGapToPole', 'QualiGapNormalized',
        'MidfieldFlag', 'AvgFinishLast3', 'PodiumRateLast5',
        'TrackType_street', 'TrackType_permanent',
    ]
    for col in feature_cols:
        if col not in df_model.columns:
            df_model[col] = 0

    proba = model.predict_proba(df_model[feature_cols])
    df['PodiumProbability'] = proba[:, 1]
    print(f"[DEBUG] proba sample: {proba[:3]}")
    print(f"[DEBUG] df sample:\n{df[['FullName', 'GridPosition', 'PodiumProbability']].head(3)}")
    return df[['FullName', 'PodiumProbability', 'GridPosition']].sort_values(
        by='PodiumProbability', ascending=False
    )


def fetch_race_results(year, round):
    try:
        session = fastf1.get_session(year, round, 'R')
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        results = session.results[['FullName', 'Position']].copy()
        if results.empty:
            return None
        results = results.rename(columns={'Position': 'RacePosition'})
        results['RacePosition'] = results['RacePosition'].astype(int)
        results = results[results['RacePosition'] <= 3].sort_values('RacePosition')
        return results if not results.empty else None
    except Exception as e:
        print(f"[RACE] fetch_race_results failed: {e}")
        return None