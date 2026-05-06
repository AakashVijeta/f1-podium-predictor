# v8 ML Pipeline → Frontend Connection

**Date:** 2026-05-06

## Problem

Backend already serves v8 model predictions (`model_v8.pkl` + `model_v8_winner.pkl`). The API returns three scores per driver: `PodiumProbability`, `WinnerProbability`, `CombinedScore` (0.6×podium + 0.4×winner). The frontend ignores `CombinedScore` and `WinnerProbability` — it sorts and displays by `PodiumProbability` alone, which produces incorrect winner rankings. The model version label is also stale and hidden on mobile.

## Decision

Surface `CombinedScore` as the single user-facing metric called **"Prediction Score"**. Do not expose `PodiumProbability` or `WinnerProbability` as separate numbers — showing three scores confuses users. The combined score is the correct ranking signal for v8.

## Changes

### `f1-frontend/src/App.jsx`

- **Line 77:** Sort `data.predictions` by `CombinedScore` descending (was `PodiumProbability`)
- **Line 83:** Compute `maxProb` from `sorted[0]?.CombinedScore` (was `PodiumProbability`)

### `f1-frontend/src/components/PodiumCards/PodiumCards.jsx`

- `pct` variable: use `d.CombinedScore * 100` (was `d.PodiumProbability * 100`)
- `pc-plbl` text: change to `% prediction score` (was `% podium probability`)
- Confidence thresholds (LOW/MODERATE/HIGH) remain unchanged — driven by same `pct`
- SectionHeader `sub` prop: change to `"ML · LightGBM · v8.0"` (was `"ML · GradientBoostingClassifier · v5.0"`)

### `f1-frontend/src/components\GridTable\GridTable.jsx`

- `GridRow`: `pct` → `d.CombinedScore * 100`; `rel` computed from `CombinedScore`
- Column header `th-bar`: rename to `"Prediction Score"` (was `"Podium Probability"`)
- `gh-sub` subtitle: rename to `"Prediction Score"` (was `"Podium Probability"`)

### `f1-frontend/src/components/SectionHeader/SectionHeader.css`

- Remove `display: none` on `.sh-sub` inside the `max-width: 640px` media query so the model label is visible on mobile

## Data Flow

```
API /predict/{year}/{round}
  └─ predictions[]: { FullName, PodiumProbability, WinnerProbability, CombinedScore }
       │
       ├─ App.jsx: sort by CombinedScore → sorted[]
       │                   maxProb = sorted[0].CombinedScore
       │
       ├─ PodiumCards: top3[i].CombinedScore * 100 → animated %
       │
       └─ GridTable: d.CombinedScore * 100 → bar width + % column
```

## What Does Not Change

- No new API endpoints
- No new columns in GridTable
- No changes to backend (`main.py`, `predict.py`, `train.py`)
- Confidence label thresholds (30 / 60%) unchanged
- All animations unchanged
- `accuracyStats` logic in `App.jsx` unchanged (compares top3 by name, not score)
