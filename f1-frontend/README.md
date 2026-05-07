# F1 Podium Predictor — Frontend

React + Vite frontend for the F1 Podium Predictor. Deployed to GitHub Pages at [f1.aakashvijeta.me](https://f1.aakashvijeta.me).

## Dev

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

Set `VITE_API_URL` in `.env` to point at the FastAPI backend (default: `http://localhost:8000`).

## Components

| Component | Purpose |
|-----------|---------|
| `RaceHero` | Hero banner with circuit name and round info |
| `InfoStrip` | Session schedule strip (quali / race times) |
| `PodiumCards` | Pre-race prediction cards with probabilities |
| `PostRacePodium` | Post-race actual results podium |
| `GridTable` | Full driver grid with CombinedScore ranking |
| `WinnerStrip` | Season winner accuracy strip |
| `SeasonDashboard` | Full-season accuracy and history view |
| `Header` / `Footer` | Chrome |

## Key files

- `src/App.jsx` — root app, race lifecycle state machine, API orchestration
- `src/constants/drivers.js` — driver roster, team colors, flag codes, `API_BASE`
- `src/constants/rounds.js` — 2026 calendar round metadata
