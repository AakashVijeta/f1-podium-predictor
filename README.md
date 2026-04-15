# F1 Podium Predictor

A full-stack machine learning application that predicts the podium (top 3 finishers) of Formula 1 races using qualifying session data. It consists of a FastAPI backend that serves a scikit-learn model trained on historical F1 data, and a React frontend that visualizes predictions, compares them against actual race results, and tracks season-long accuracy.

Live app: [https://f1.aakashvijeta.me](https://f1.aakashvijeta.me)

---

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Backend](#backend)
  - [API Endpoints](#api-endpoints)
  - [Race Lifecycle State Machine](#race-lifecycle-state-machine)
  - [Database Layer](#database-layer)
  - [External Data Sources](#external-data-sources)
- [Machine Learning Pipeline](#machine-learning-pipeline)
  - [Features](#features)
  - [Model](#model)
  - [Training](#training)
- [Frontend](#frontend)
- [Setup & Installation](#setup--installation)
- [Running Locally](#running-locally)
- [Deployment](#deployment)

---

## Overview

The system answers one question per Grand Prix weekend:

> **Given qualifying results, who are the three drivers most likely to finish on the podium?**

For each driver, the trained classifier outputs a **PodiumProbability** (0–1). Results are surfaced through a responsive React UI alongside the official post-race results, and a rolling accuracy dashboard shows how the model performed across the season.

---

## Architecture

```
 ┌────────────────────┐       ┌──────────────────────┐       ┌─────────────────┐
 │  React (Vite) UI   │ ───▶  │  FastAPI Backend     │ ───▶  │  Postgres /     │
 │  f1-frontend/      │       │  main.py + routers/  │       │  SQLite Cache   │
 └────────────────────┘       └──────────────────────┘       └─────────────────┘
         ▲                             │
         │                             ▼
         │                     ┌──────────────────────┐
         │                     │  FastF1 (sessions)   │
         │                     │  Jolpica/Ergast API  │
         │                     └──────────────────────┘
         │
 ┌────────────────────┐
 │  User's browser    │
 └────────────────────┘
```

- **Frontend** calls `/predict/{year}/{round}` and `/results/{year}/{round}` **in parallel**, with per-round client-side caching and `AbortController` to cancel stale fetches when the user switches rounds mid-load.
- **Backend** resolves the race's state (`pre_quali`, `pre_race`, `post_race`), loads the trained model, fetches qualifying/race data, runs inference, and persists to the database. An in-process LRU TTL cache short-circuits repeat requests (30s / 300s / 3600s by state), and FastF1 calls are wrapped in `asyncio.wait_for` so a hung upstream can't tie up the event loop.
- **Database** is used as an idempotent cache so external APIs (FastF1, Jolpica) are only hit once per race.

---

## Repository Layout

```
F1/
├── main.py                  # FastAPI app — routes, lifespan, state-machine orchestration
├── predict.py               # FastF1 fetch helpers, feature engineering, inference
├── train.py                 # CLI trainer — rebuilds or incrementally updates the model
├── db.py                    # Dual-backend DB layer (Postgres in prod, SQLite locally)
├── requirements.txt         # Python dependencies
├── local_predictions.db     # Local SQLite cache (auto-created)
├── routers/
│   └── results.py           # /results/{year}/{round} — Jolpica/Ergast passthrough
├── models/
│   ├── model_v5.pkl         # Active model (loaded at startup)
│   └── model_v{2..4}.pkl    # Archived older versions
├── data/
│   └── f1_dataset_clean.csv # Cleaned historical training set
├── cache/                   # FastF1 on-disk session cache
├── notebooks/
│   └── main.ipynb           # Exploratory data analysis
└── f1-frontend/             # React + Vite UI (deployed to GitHub Pages)
    ├── src/
    │   ├── App.jsx
    │   ├── components/      # PodiumCards, GridTable, RaceHero, SeasonDashboard, …
    │   └── constants/       # 2026 calendar + driver metadata
    └── vite.config.js
```

---

## Backend

Built with **FastAPI** (async) and served via **uvicorn**. On startup (`lifespan` hook in [`main.py`](main.py)) it:

1. Loads `models/model_v5.pkl` into a module-level `model` global.
2. Calls `init_db()` to create the schema if it doesn’t exist.
3. Pre-warms the FastF1 schedule cache for the current season.

CORS is restricted to the production domain and `localhost:5173` (Vite dev server).

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET`  | `/` | Health banner. |
| `GET`  | `/predict/{year}/{round}` | Core endpoint — returns predictions and/or race results depending on race state. |
| `GET`  | `/results/{year}/{round}` | Fetches the official result from Jolpica (Ergast-compatible). Cached in-process with TTLs (3600s success / 30s empty / 15s error) and a single retry on transient failures — hardens the live-race path when Jolpica is flaky. |
| `GET`  | `/accuracy/{year}` | Aggregates all stored predictions for a season against actual results: winner hit-rate, podium hit-rate, per-round history. |
| `GET`  | `/health` | Lightweight healthcheck (also supports `HEAD`). |

### Race Lifecycle State Machine

`predict.get_session_status(year, round)` classifies the current moment relative to the event schedule:

| State | Condition | Response |
| --- | --- | --- |
| `pre_quali`  | now < qualifying end + 1h30m | Short message — nothing to predict yet. |
| `pre_race`   | now < race end + 3h | If DB has stored predictions → return them. Otherwise fetch quali data, run the model, **persist**, return. |
| `post_race`  | else | Return actual results (from DB or Jolpica). If predictions were never generated (i.e. backend was offline during the race weekend), generate them retroactively and save. |

Buffers (1h30m after quali, 3h after race) absorb session delays, red flags, and FastF1 ingestion lag.

The `get_quali()` helper in `main.py` is the most important piece of orchestration: it **polls FastF1 every 30s for up to 60 minutes** waiting for complete qualifying data (≥18 drivers with lap times *and* grid positions), because FastF1 briefly serves partial data right after a session ends. Once complete, it writes to the `qualifying_data` table so subsequent calls never touch FastF1 again.

### Database Layer

[`db.py`](db.py) exposes a uniform API across two backends, selected at import time by the presence of `DATABASE_URL`:

- **Postgres** (production) — `psycopg2.pool.ThreadedConnectionPool` with TCP keepalives for dead-connection detection (no per-checkout probe round-trip). JSON columns use `JSONB`.
- **SQLite** (local) — `local_predictions.db` file, `TEXT` columns storing JSON.

Three tables:

| Table | Purpose | Conflict behavior |
| --- | --- | --- |
| `predictions`      | Model output per `(year, round)` | `DO NOTHING` — predictions are immutable once saved. |
| `race_results`     | Top-3 finishers per `(year, round)` | `DO UPDATE` — refreshes if FastF1 corrects a classification. |
| `qualifying_data`  | Raw quali lap times + grid | `DO UPDATE` — in case partial data was saved. |

### External Data Sources

- **[FastF1](https://docs.fastf1.dev/)** — official F1 timing data. Used for qualifying laps, grid positions, and full-results ingestion. Cached to `cache/`.
- **[Jolpica F1 API](https://github.com/jolpica/jolpica-f1)** — community-maintained drop-in replacement for the deprecated Ergast API. Used by `routers/results.py` for canonical race classification (positions, points, status).

### Performance & Resilience

The hot path is designed so a live-race spike — or a flaky upstream during that spike — degrades gracefully:

- **Layered caching.** `/predict` has an in-process LRU TTL cache (30s pre-quali, 300s pre-race, 3600s post-race) plus a 60s session-status cache, and emits `Cache-Control: public, max-age=<ttl>` headers for CDN/browser reuse. `/results` caches success for 1h and negatively caches empty/error responses briefly (30s / 15s) to prevent stampedes.
- **Parallel DB reads.** Post-race paths issue the `predictions` and `race_results` lookups concurrently via `asyncio.gather`.
- **Bounded upstream waits.** FastF1 calls are wrapped in `asyncio.wait_for` (45s quali, 30s race) so a hung session fetch never ties up a worker. Jolpica calls retry once on connect/read timeout.
- **Pool prewarm.** Startup opens a Postgres connection and warms the FastF1 schedule cache so the first real request doesn't pay cold-start cost.

---

## Machine Learning Pipeline

### Features

The model operates on nine engineered features designed to be **era-agnostic** (they transfer across F1 regulation changes, including the 2026 reset):

| Feature | Meaning |
| --- | --- |
| `GridPosition` | Starting slot on the grid. |
| `GridPositionSquared` | Captures non-linear penalty for starting further back. |
| `QualiGapToPole` | Seconds behind the fastest qualifier. |
| `QualiGapNormalized` | Same as above, expressed as a % of pole lap time. |
| `MidfieldFlag` | 1 if starting P8–P15 (midfield traffic risk), else 0. |
| `AvgFinishLast3` | Rolling average finish position over last 3 races. |
| `PodiumRateLast5` | Fraction of last 5 races finished on podium. |
| `TrackType_street` / `TrackType_permanent` | One-hot encoding of circuit type. |

Track type is hand-mapped from a dictionary in both [`train.py`](train.py) and [`predict.py`](predict.py).

### Model

- **Algorithm**: `GradientBoostingClassifier` wrapped in `CalibratedClassifierCV` so output probabilities are genuinely calibrated (important because `PodiumProbability` is shown directly to the user).
- **Target**: Binary — did this driver finish in the top 3?
- **Training set**: All rounds from 2023 + 2024 + 2025 (and optionally a specific 2026 round) from `data/f1_dataset_clean.csv`, built by `train.py` from FastF1 sessions.
- **Artifact**: Persisted as `models/model_v5.pkl` via `joblib`.

Evaluation during training reports `classification_report`, `roc_auc_score`, and `brier_score_loss` (the key metric for probability quality).

### Training

```bash
# Fetch a new round's data and retrain from scratch
python train.py --year 2026 --round 4

# Retrain on existing CSV only (no network)
python train.py --retrain-only

# Full historical rebuild (re-fetches 2023–2025 from FastF1 — slow)
python train.py --rebuild
```

The training script writes an updated `f1_dataset_clean.csv` and a new `model_v5.pkl`.

---

## Frontend

Located in [`f1-frontend/`](f1-frontend/). Built with **React 19 + Vite 8**, deployed to GitHub Pages via `gh-pages`.

Key components:

- **`RaceHero`** — Hero banner for the selected round (flag, circuit, date).
- **`PodiumCards`** — Top-3 predicted drivers with probabilities.
- **`GridTable`** — Full ranked table of all drivers with predicted probabilities.
- **`PostRacePodium`** / **`WinnerStrip`** — Renders the official podium once the race has been run, side-by-side with predictions.
- **`InfoStrip`** — Race status badge (`pre_quali` / `pre_race` / `post_race`).
- **`SeasonDashboard`** — Calls `/accuracy/{year}` and plots winner-correct rate, podium hit-rate, per-round breakdown.
- **`SkeletonLoader`** — Loading placeholders while the backend polls FastF1.

The selected round drives a single `useEffect` that issues `/predict` and `/results` in parallel via `Promise.all`, caches completed `post_race` rounds in a `useRef` `Map` (instant revisits), and aborts the in-flight fetch via `AbortController` when the user switches rounds mid-load.

---

## Setup & Installation

### Backend

```bash
# Python 3.11+ recommended
python -m venv sklearn-env
source sklearn-env/Scripts/activate     # Windows (bash)
# or: source sklearn-env/bin/activate   # macOS / Linux

pip install -r requirements.txt
```

Optional — set `DATABASE_URL` to use Postgres; otherwise SQLite is used automatically.

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/f1"
```

### Frontend

```bash
cd f1-frontend
npm install
```

---

## Running Locally

**Terminal 1 — backend**

```bash
uvicorn main:app --reload --port 8000
```

**Terminal 2 — frontend**

```bash
cd f1-frontend
npm run dev
```

The frontend expects `API_BASE` to point at the backend (see [`src/constants/drivers.js`](f1-frontend/src/constants/drivers.js)).

Smoke test:

```bash
curl http://localhost:8000/predict/2025/1
curl http://localhost:8000/accuracy/2025
```

---

## Deployment

- **Backend** — containerizable via `uvicorn main:app`. Set `DATABASE_URL` to a managed Postgres instance. The `/health` endpoint is intended for platform healthchecks.
- **Frontend** — `npm run deploy` publishes the built `dist/` folder to GitHub Pages (`homepage` field in `f1-frontend/package.json`). The CORS allowlist in `main.py` must include the deployed frontend origin.

---

## License

Personal project — all F1 trademarks belong to Formula One World Championship Limited. Data retrieved via FastF1 and the Jolpica API is subject to their respective terms of use.
