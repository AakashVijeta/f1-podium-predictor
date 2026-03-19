import os
import fastf1
import pandas as pd
from datetime import datetime, timezone

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

def get_session_status(year, round):
    schedule = fastf1.get_event_schedule(year)
    event = schedule[schedule['RoundNumber'] == round].iloc[0]
    quali_time = event['Session4DateUtc'].to_pydatetime().replace(tzinfo=timezone.utc)
    race_time  = event['Session5DateUtc'].to_pydatetime().replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)

    if now < quali_time:
        return "pre_quali"
    elif now < race_time:
        return "pre_race"
    else:
        return "post_race"

def fetch_qualifying_data(year, round):
    try:
        session = fastf1.get_session(year, round, 'Q')
        session.load(laps=True, telemetry=False, weather=False, messages=False)
        circuit_name = session.event['Location']

        best_laps = session.laps[session.laps['IsPersonalBest'] == True].copy()
        best_laps = best_laps.groupby('Driver')['LapTime'].min().reset_index()
        best_laps.columns = ['Driver', 'BestQualiTime']
        best_laps['BestQualiTime'] = best_laps['BestQualiTime'].dt.total_seconds()
        best_laps['Year']  = year
        best_laps['Round'] = round

        driver_map = session.results[['Abbreviation', 'FullName']].set_index('Abbreviation')['FullName'].to_dict()
        best_laps['FullName'] = best_laps['Driver'].map(driver_map)
        best_laps = best_laps.drop(columns=['Driver'])

        grid = session.results[['FullName', 'Position']].copy()
        grid = grid.rename(columns={'Position': 'GridPosition'})
        best_laps = best_laps.merge(grid, on='FullName', how='left')

        return best_laps, circuit_name
    except Exception as e:
        print(f"Auto Fetch Failed: {e}")
        return None

def predict_podium(df, circuit_name, model):
    df['TrackType'] = track_type[circuit_name]
    df_model = pd.get_dummies(df, columns=['TrackType'], dtype=int)
    feature_cols = ['BestQualiTime', 'GridPosition', 'TrackType_street', 'TrackType_permanent']
    for col in feature_cols:
        if col not in df_model.columns:
            df_model[col] = 0
    proba = model.predict_proba(df_model[feature_cols])
    df['PodiumProbability'] = proba[:, 1]
    return df[['FullName', 'PodiumProbability']].sort_values(by='PodiumProbability', ascending=False)

def fetch_race_results(year, round):
    try:
        session = fastf1.get_session(year, round, 'R')
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        results = session.results[['FullName', 'Position']].copy()
        results = results.rename(columns={'Position': 'RacePosition'})
        results['RacePosition'] = results['RacePosition'].astype(int)
        results = results[results['RacePosition'] <= 3].sort_values('RacePosition')
        return results
    except Exception as e:
        print(f"Auto Fetch Failed: {e}")
        return None