# v8 ML Pipeline → Frontend Connection

**Date:** 2026-05-06

## Problem

Backend already serves v8 model predictions (`model_v8.pkl` + `model_v8_winner.pkl`). The API returns three scores per driver: `PodiumProbability`, `WinnerProbability`, `CombinedScore` (0.6×podium + 0.4×winner). The frontend ignores `CombinedScore` and `WinnerProbability` — it sorts and displays by `PodiumProbability` alone, which produces incorrect winner rankings. The model version label is stale and hidden on mobile. The `pre_quali` state shows no useful information — just a message — when the user could see when qualifying and the race are scheduled.

## Decisions

1. Surface `CombinedScore` as the single user-facing metric called **"Prediction Score"**. Do not expose `PodiumProbability` or `WinnerProbability` as separate numbers — showing three scores confuses users. The combined score is the correct ranking signal for v8.
2. Add a `/schedule/{year}/{round}` backend endpoint that returns qualifying + race UTC times from FastF1. Frontend shows these times (in user's local timezone) in the `pre_quali` state.

## Changes

### Backend: `main.py`

New endpoint `GET /schedule/{year}/{round}`:
- Reads `Session4DateUtc` (qualifying) and `Session5DateUtc` (race) from `fastf1.get_event_schedule(year)` via the existing `_schedule_cache` in `predict.py`
- Returns: `{ "qualifying": "<ISO UTC string>", "race": "<ISO UTC string>" }`
- Cache: reuse `_schedule_cache` already populated by `get_session_status()` — no extra FastF1 call if schedule already loaded
- Error: return `{ "qualifying": null, "race": null }` on failure — frontend degrades gracefully

### `f1-frontend/src/App.jsx`

- **Sort (line 77):** sort `data.predictions` by `CombinedScore` descending (was `PodiumProbability`)
- **maxProb (line 83):** compute from `sorted[0]?.CombinedScore` (was `PodiumProbability`)
- **Schedule fetch:** add a `schedule` state; fetch `GET /schedule/2026/{round}` in the existing `Promise.all` alongside predict + results. Store result in `schedule` state.
- Pass `schedule` down to the `pre_quali` render block.

### `f1-frontend/src/App.jsx` — `pre_quali` render block

Replace the current plain message with a schedule display:
```
Qualifying  —  Sat 7 Mar · 14:00 local
Race        —  Sun 8 Mar · 15:00 local
```
Times formatted with `Intl.DateTimeFormat` in the user's local timezone (weekday + date + time, no seconds). Fallback to "—" if schedule endpoint returns null.

### `f1-frontend/src/components/PodiumCards/PodiumCards.jsx`

- `pct` variable: `d.CombinedScore * 100` (was `d.PodiumProbability * 100`)
- `pc-plbl` text: `% prediction score` (was `% podium probability`)
- Confidence thresholds (LOW / MODERATE / HIGH) unchanged — driven by same `pct`
- SectionHeader `sub` prop: `"ML · LightGBM · v8.0"` (was `"ML · GradientBoostingClassifier · v5.0"`)

### `f1-frontend/src/components/GridTable/GridTable.jsx`

- `GridRow`: `pct` → `d.CombinedScore * 100`; `rel` relative bar width from `CombinedScore`
- Column header `th-bar`: `"Prediction Score"` (was `"Podium Probability"`)
- `gh-sub` subtitle: `"Prediction Score"` (was `"Podium Probability"`)

### `f1-frontend/src/components/SectionHeader/SectionHeader.css`

- Remove `display: none` on `.sh-sub` inside `@media (max-width: 640px)` — makes model label visible on mobile

## Data Flow

```
GET /schedule/{year}/{round}
  └─ { qualifying: ISO_UTC, race: ISO_UTC }
       └─ App.jsx: format via Intl.DateTimeFormat → pre_quali schedule display

GET /predict/{year}/{round}
  └─ predictions[]: { FullName, PodiumProbability, WinnerProbability, CombinedScore }
       ├─ App.jsx: sort by CombinedScore → sorted[], maxProb = sorted[0].CombinedScore
       ├─ PodiumCards: top3[i].CombinedScore * 100 → animated %
       └─ GridTable: d.CombinedScore * 100 → bar width + % column
```

## What Does Not Change

- No new columns in GridTable
- No changes to `predict.py` or `train.py`
- Confidence label thresholds (30 / 60%) unchanged
- All animations unchanged
- `accuracyStats` logic in `App.jsx` unchanged (compares top3 by name, not score)
- Schedule fetch runs in parallel with existing fetches — no latency penalty
