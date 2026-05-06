# v8 Frontend Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the v8 ML pipeline's `CombinedScore` as the single user-facing prediction metric, add a `/schedule` backend endpoint, and display qualifying + race times in the pre-qualifying state.

**Architecture:** Backend gets a new lightweight `/schedule/{year}/{round}` endpoint that reuses the existing FastF1 schedule cache. Frontend sorts/displays by `CombinedScore` throughout, and shows session times (formatted to user's local timezone) when qualifying hasn't happened yet.

**Tech Stack:** Python / FastAPI / FastF1 (backend); React / Vite / GSAP (frontend)

---

## File Map

| File | Change |
|------|--------|
| `predict.py` | Add `get_session_times(year, round)` function |
| `main.py` | Import `get_session_times`; add `GET /schedule/{year}/{round}` endpoint |
| `f1-frontend/src/App.jsx` | Sort by `CombinedScore`; add `schedule` state + fetch; update pre_quali block; add `formatSessionTime` helper |
| `f1-frontend/src/App.css` | Add `.schedule-times`, `.sched-row`, `.sched-label`, `.sched-time` styles |
| `f1-frontend/src/components/PodiumCards/PodiumCards.jsx` | `pct` from `CombinedScore`; update label + SectionHeader sub |
| `f1-frontend/src/components/GridTable/GridTable.jsx` | `pct` from `CombinedScore`; rename column headers |
| `f1-frontend/src/components/SectionHeader/SectionHeader.css` | Remove `display: none` on `.sh-sub` at mobile breakpoint |

---

## Task 1: Add `get_session_times` to predict.py

**Files:**
- Modify: `predict.py`

- [ ] **Step 1: Add function after `get_session_status`**

Open `predict.py`. After the `get_session_status` function (ends around line 137), add:

```python
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
```

`timezone` is already imported at the top of `predict.py` (`from datetime import datetime, timezone, timedelta`).

- [ ] **Step 2: Verify manually**

In a Python shell inside the venv:
```python
from predict import get_session_times
print(get_session_times(2026, 5))
# Expected: {"qualifying": "2026-05-22T...", "race": "2026-05-24T..."}
```

- [ ] **Step 3: Commit**

```bash
git add predict.py
git commit -m "feat: add get_session_times to predict.py"
```

---

## Task 2: Add `/schedule/{year}/{round}` endpoint to main.py

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Update the import from predict**

Find line 18 in `main.py`:
```python
from predict import fetch_qualifying_data, predict_podium, fetch_race_results, get_session_status
```
Change to:
```python
from predict import fetch_qualifying_data, predict_podium, fetch_race_results, get_session_status, get_session_times
```

- [ ] **Step 2: Add the endpoint**

After the `/health` endpoint at the bottom of `main.py`, add:

```python
# ---------------------------------------------------------------------------
# /schedule/{year}/{round}
# ---------------------------------------------------------------------------
@app.get("/schedule/{year}/{round}")
async def schedule(year: int, round: int):
    return await asyncio.to_thread(get_session_times, year, round)
```

- [ ] **Step 3: Start the server and verify**

```bash
uvicorn main:app --reload
```

Then in a browser or curl:
```
curl http://localhost:8000/schedule/2026/5
```
Expected response:
```json
{"qualifying": "2026-05-22T...", "race": "2026-05-24T..."}
```

- [ ] **Step 4: Commit**

```bash
git add main.py
git commit -m "feat: add /schedule/{year}/{round} endpoint"
```

---

## Task 3: App.jsx — sort, maxProb, schedule fetch, pre_quali display

**Files:**
- Modify: `f1-frontend/src/App.jsx`
- Modify: `f1-frontend/src/App.css`

- [ ] **Step 1: Add `schedule` state**

In `App.jsx`, find the existing state declarations (around line 26–30):
```javascript
const [actualResults, setActualResults] = useState(null);
```
Add immediately after:
```javascript
const [schedule, setSchedule] = useState(null);
```

- [ ] **Step 2: Reset schedule on round change**

In the `useEffect`, find the reset block (around line 47–49):
```javascript
setLoading(true);
setError(null);
setData(null);
setActualResults(null);
```
Add:
```javascript
setSchedule(null);
```

- [ ] **Step 3: Add schedule to Promise.all**

Find the existing Promise.all (around line 51–54):
```javascript
Promise.all([
  fetch(`${API_BASE}/predict/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
  fetch(`${API_BASE}/results/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
])
  .then(([d, r]) => {
    if (ac.signal.aborted) return;
    const actual = r.available ? r.results : null;
    setData(d);
    setActualResults(actual);
```

Replace with:
```javascript
Promise.all([
  fetch(`${API_BASE}/predict/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
  fetch(`${API_BASE}/results/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
  fetch(`${API_BASE}/schedule/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
])
  .then(([d, r, s]) => {
    if (ac.signal.aborted) return;
    const actual = r.available ? r.results : null;
    setData(d);
    setActualResults(actual);
    setSchedule(s);
```

- [ ] **Step 4: Fix sort to use CombinedScore**

Find line 77 (the `sorted` useMemo):
```javascript
const sorted = useMemo(() => (
  data?.predictions
    ? [...data.predictions].sort((a, b) => b.PodiumProbability - a.PodiumProbability)
    : []
), [data]);
```
Change to:
```javascript
const sorted = useMemo(() => (
  data?.predictions
    ? [...data.predictions].sort((a, b) => b.CombinedScore - a.CombinedScore)
    : []
), [data]);
```

- [ ] **Step 5: Fix maxProb to use CombinedScore**

Find line 83:
```javascript
const maxProb = sorted[0]?.PodiumProbability || 1;
```
Change to:
```javascript
const maxProb = sorted[0]?.CombinedScore || 1;
```

- [ ] **Step 6: Add formatSessionTime helper**

Before the `return (` statement of the App component, add:

```javascript
const formatSessionTime = (isoString) => {
  if (!isoString) return "—";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
};
```

- [ ] **Step 7: Update pre_quali render block**

Find the pre_quali block (around line 122–128):
```jsx
{!loading && data?.status === "pre_quali" && (
  <div className="state-s fade">
    <div className="state-ico">⏱</div>
    <div className="state-t">Qualifying not yet started</div>
    <div className="state-sub2">Predictions will appear after the qualifying session</div>
  </div>
)}
```
Replace with:
```jsx
{!loading && data?.status === "pre_quali" && (
  <div className="state-s fade">
    <div className="state-ico">⏱</div>
    <div className="state-t">Qualifying not yet started</div>
    <div className="state-sub2">Predictions will appear after the qualifying session</div>
    {(schedule?.qualifying || schedule?.race) && (
      <div className="schedule-times">
        <div className="sched-row">
          <span className="sched-label">Qualifying</span>
          <span className="sched-time">{formatSessionTime(schedule.qualifying)}</span>
        </div>
        <div className="sched-row">
          <span className="sched-label">Race</span>
          <span className="sched-time">{formatSessionTime(schedule.race)}</span>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 8: Add CSS for schedule display**

Open `f1-frontend/src/App.css`. After the `.state-sub2` rule (around line 114), add:

```css
.schedule-times {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-top: 1px solid var(--border);
  padding-top: 1.25rem;
  width: 100%;
  max-width: 340px;
}

.sched-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.sched-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
}

.sched-time {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--text);
}
```

- [ ] **Step 9: Verify in browser**

Start dev server: `npm run dev` inside `f1-frontend/`.

Navigate to a round where status is `pre_quali`. Confirm:
- Two rows appear: Qualifying and Race with local times
- If schedule endpoint returns nulls, the block does not render (graceful fallback)

- [ ] **Step 10: Commit**

```bash
git add f1-frontend/src/App.jsx f1-frontend/src/App.css
git commit -m "feat: sort by CombinedScore and show schedule in pre_quali state"
```

---

## Task 4: PodiumCards — CombinedScore + label updates

**Files:**
- Modify: `f1-frontend/src/components/PodiumCards/PodiumCards.jsx`

- [ ] **Step 1: Switch pct to CombinedScore**

Find line 65 inside the `.map` callback:
```javascript
const pct = d.PodiumProbability * 100;
```
Change to:
```javascript
const pct = d.CombinedScore * 100;
```

- [ ] **Step 2: Update probability label text**

Find lines 95–96:
```jsx
<div className="pc-pnum" style={{ color: drv.color }} data-target={pct.toFixed(1)}>0.0</div>
<div className="pc-plbl">% podium<br />probability</div>
```
Change to:
```jsx
<div className="pc-pnum" style={{ color: drv.color }} data-target={pct.toFixed(1)}>0.0</div>
<div className="pc-plbl">% prediction<br />score</div>
```

- [ ] **Step 3: Update SectionHeader sub prop**

Find line 59:
```jsx
<SectionHeader
  label="Predicted Podium"
  sub="ML · GradientBoostingClassifier · v5.0"
/>
```
Change to:
```jsx
<SectionHeader
  label="Predicted Podium"
  sub="ML · LightGBM · v8.0"
/>
```

- [ ] **Step 4: Verify in browser**

Check a `pre_race` round. Confirm:
- The animating percentage now reflects `CombinedScore` (values will differ from before)
- Label below the number reads "% prediction score"
- The section header sub reads "ML · LightGBM · v8.0" on desktop

- [ ] **Step 5: Commit**

```bash
git add f1-frontend/src/components/PodiumCards/PodiumCards.jsx
git commit -m "feat: podium cards use CombinedScore and updated labels"
```

---

## Task 5: GridTable — CombinedScore + header renames

**Files:**
- Modify: `f1-frontend/src/components/GridTable/GridTable.jsx`

- [ ] **Step 1: Switch GridRow pct to CombinedScore**

Find lines 14–15 inside `GridRow`:
```javascript
const pct = d.PodiumProbability * 100;
const rel = (pct / (maxProb * 100)) * 100;
```
Change to:
```javascript
const pct = d.CombinedScore * 100;
const rel = (pct / (maxProb * 100)) * 100;
```

- [ ] **Step 2: Rename gh-sub subtitle**

Find lines 163–164:
```jsx
<span className="gh-title">Full Grid</span>
<span className="gh-sub">Podium Probability</span>
```
Change to:
```jsx
<span className="gh-title">Full Grid</span>
<span className="gh-sub">Prediction Score</span>
```

- [ ] **Step 3: Rename th-bar column header**

Find line 193:
```jsx
<th className="th-bar">Podium Probability</th>
```
Change to:
```jsx
<th className="th-bar">Prediction Score</th>
```

- [ ] **Step 4: Verify in browser**

Check a `pre_race` round. Confirm:
- Bar widths reflect `CombinedScore` (driver order may differ from before)
- Column header reads "Prediction Score"
- Subtitle under "Full Grid" reads "Prediction Score"

- [ ] **Step 5: Commit**

```bash
git add f1-frontend/src/components/GridTable/GridTable.jsx
git commit -m "feat: grid table uses CombinedScore and renamed headers"
```

---

## Task 6: SectionHeader.css — fix mobile label visibility

**Files:**
- Modify: `f1-frontend/src/components/SectionHeader/SectionHeader.css`

- [ ] **Step 1: Remove display:none on .sh-sub**

Find the mobile media query (around line 18–21):
```css
@media (max-width: 640px) {
  .sh { gap: 0.5rem; margin-bottom: 1rem; }
  .sh-sub { display: none; }
}
```
Remove the `.sh-sub { display: none; }` line:
```css
@media (max-width: 640px) {
  .sh { gap: 0.5rem; margin-bottom: 1rem; }
}
```

- [ ] **Step 2: Verify on mobile viewport**

In browser DevTools, toggle to a mobile viewport (≤640px). Navigate to a `pre_race` round. Confirm "ML · LightGBM · v8.0" is visible below the "Predicted Podium" label.

- [ ] **Step 3: Commit**

```bash
git add f1-frontend/src/components/SectionHeader/SectionHeader.css
git commit -m "fix: show section header sub-label on mobile"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Sort by `CombinedScore` | Task 3 Step 4 |
| `maxProb` from `CombinedScore` | Task 3 Step 5 |
| PodiumCards animate `CombinedScore` | Task 4 Step 1 |
| PodiumCards label "% prediction score" | Task 4 Step 2 |
| SectionHeader sub "ML · LightGBM · v8.0" | Task 4 Step 3 |
| GridTable bar from `CombinedScore` | Task 5 Step 1 |
| GridTable header renamed "Prediction Score" | Task 5 Steps 2–3 |
| SectionHeader mobile label fix | Task 6 |
| `/schedule/{year}/{round}` endpoint | Tasks 1–2 |
| Schedule fetch in frontend | Task 3 Step 3 |
| pre_quali block shows times | Task 3 Steps 7–8 |
| Graceful fallback if schedule nulls | Task 3 Step 7 (conditional render) |
| Times in user local timezone | Task 3 Step 6 (Intl.DateTimeFormat with `undefined` locale) |

All spec requirements covered. No placeholders. Types consistent across tasks.
