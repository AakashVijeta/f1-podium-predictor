import fastf1
import joblib
import pandas as pd

fastf1.Cache.enable_cache('./cache')

ROUND = 2
YEAR = 2026
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

def fetch_qualifying_data():
    try:
        session = fastf1.get_session(YEAR, ROUND, 'Q')
        session.load(laps=True, telemetry=False, weather=False, messages=False)
        circuit_name = session.event['Location']
        best_laps = session.laps[session.laps['IsPersonalBest'] == True].copy()
        best_laps = best_laps.groupby('Driver')['LapTime'].min().reset_index()
        best_laps.columns = ['Driver', 'BestQualiTime']
        best_laps['BestQualiTime'] = best_laps['BestQualiTime'].dt.total_seconds()
        # best_laps['BestQualiTimeNorm'] = (
        #     (best_laps['BestQualiTime'] - best_laps['BestQualiTime'].min()) /
        #     (best_laps['BestQualiTime'].max() - best_laps['BestQualiTime'].min())
        # )
        best_laps['Year'] = YEAR
        best_laps['Round'] = ROUND
        best_laps = best_laps.drop(columns=['BestQualiTime'])
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

def predict_podium(df, ciucuit_name):
    df['TrackType'] = track_type[ciucuit_name]
    df_model = pd.get_dummies(df, columns=['TrackType'], dtype=int)
    feature_cols = ['BestQualiTime', 'GridPosition', 'TrackType_street', 'TrackType_permanent']  
    for col in feature_cols:
        if col not in df_model.columns:
            df_model[col] = 0
    model = joblib.load('models/model_v4.pkl')
    proba = model.predict_proba(df_model[feature_cols])
    df['PodiumProbability'] = proba[:, 1]
    return df[['FullName', 'PodiumProbability']].sort_values(by='PodiumProbability', ascending=False)

if __name__ == "__main__":
    result = fetch_qualifying_data()
    if result is None:
        print("Failed to fetch qualifying data.")
    else:
        quali_data, circuit_name = result
        predictions = predict_podium(quali_data, circuit_name)
        print(predictions)