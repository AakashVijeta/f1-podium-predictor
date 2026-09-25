import { useState, useEffect, useRef, useMemo, useCallback, useReducer, Suspense, lazy } from "react";
import SeasonDashboard from "./components/SeasonDashboard/SeasonDashboard";
import { ROUNDS_2026 } from "./constants/rounds";
import { API_BASE } from "./constants/drivers";
import Header from "./components/Header/Header";
import RaceHero from "./components/RaceHero/RaceHero";
import InfoStrip from "./components/InfoStrip/InfoStrip";
import {
  InfoStripSkeleton,
  PodiumCardsSkeleton,
  GridTableSkeleton,
} from "./components/SkeletonLoader/SkeletonLoader";
import Footer from "./components/Footer/Footer";
import { useInView } from "./hooks/useInView";
import "./App.css";

const CircuitMap       = lazy(() => import("./components/CircuitMap/CircuitMap"));
const PodiumCards      = lazy(() => import("./components/PodiumCards/PodiumCards"));
const GridTable        = lazy(() => import("./components/GridTable/GridTable"));
const PostRacePodium   = lazy(() => import("./components/PostRacePodium/PostRacePodium"));
const WinnerStrip      = lazy(() => import("./components/WinnerStrip/WinnerStrip"));

const initialRaceState = {
  data: null,
  dataRound: null,
  actualResults: null,
  schedule: null,
  scheduleRound: null,
  loading: false,
  loadingRound: null,
  error: null,
};

function raceReducer(state, action) {
  switch (action.type) {
    case "start":
      return {
        ...state,
        loading: true,
        loadingRound: action.round,
        error: null,
        schedule: state.scheduleRound === action.round ? state.schedule : null,
        scheduleRound: state.scheduleRound === action.round ? state.scheduleRound : null,
      };
    case "schedule":
      return {
        ...state,
        schedule: action.schedule,
        scheduleRound: action.round,
      };
    case "cached":
      return {
        ...state,
        data: action.entry.data,
        dataRound: action.round,
        actualResults: action.entry.actualResults,
        loading: false,
        loadingRound: null,
        error: null,
      };
    case "success":
      return {
        ...state,
        data: action.data,
        dataRound: action.round,
        actualResults: action.actualResults,
        loading: false,
        loadingRound: null,
        error: null,
      };
    case "error":
      return {
        ...state,
        loading: false,
        loadingRound: null,
        error: action.message,
      };
    default:
      return state;
  }
}

export default function App() {
  const [round, setRound] = useState(1);
  const [hovered, setHovered] = useState(null);
  const [raceState, dispatchRace] = useReducer(raceReducer, initialRaceState);
  const cacheRef = useRef(new Map());
  const [seasonRef, seasonInView] = useInView({ rootMargin: "1000px" });

  const race = useMemo(() => ROUNDS_2026.find(r => r.round === round), [round]);
  const data = raceState.dataRound === round ? raceState.data : null;
  const actualResults = raceState.dataRound === round ? raceState.actualResults : null;
  const schedule = raceState.scheduleRound === round ? raceState.schedule : null;
  const loading = raceState.loading && raceState.loadingRound === round;
  const initialLoading = loading && !data;

  useEffect(() => {
    const cached = cacheRef.current.get(round);
    const ac = new AbortController();
    dispatchRace({ type: "start", round });

    fetch(`${API_BASE}/schedule/2026/${round}`, { signal: ac.signal })
      .then(r => r.json())
      .then(s => {
        if (ac.signal.aborted) return;
        dispatchRace({ type: "schedule", round, schedule: s });
        const entry = cacheRef.current.get(round);
        if (entry) cacheRef.current.set(round, { ...entry, schedule: s });
      })
      .catch(() => {});

    if (cached) {
      dispatchRace({ type: "cached", round, entry: cached });
      return () => ac.abort();
    }

    Promise.all([
      fetch(`${API_BASE}/predict/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
      fetch(`${API_BASE}/results/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
    ])
      .then(([d, r]) => {
        if (ac.signal.aborted) return;
        const actual = r.available ? r.results : null;
        dispatchRace({ type: "success", round, data: d, actualResults: actual });
        if (d?.status === "post_race") {
          cacheRef.current.set(round, { data: d, actualResults: actual });
        }
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        dispatchRace({ type: "error", message: "Cannot reach API - make sure uvicorn is running." });
      });

    return () => ac.abort();
  }, [round]);

  const sorted = useMemo(() => (
    data?.predictions
      ? [...data.predictions].sort((a, b) => b.CombinedScore - a.CombinedScore)
      : []
  ), [data]);

  const top3 = useMemo(() => sorted.slice(0, 3), [sorted]);
  // Stored results may come from FastF1 (FullName/RacePosition) or Jolpica
  // (driver_name/position) — normalize so components can rely on one shape.
  const raceResults = useMemo(() => (
    (data?.results || [])
      .map((r, i) => ({
        ...r,
        FullName: r.FullName || r.driver_name || "",
        RacePosition: Number(r.RacePosition ?? r.position ?? r.Position ?? i + 1),
      }))
      .sort((a, b) => a.RacePosition - b.RacePosition)
  ), [data]);
  const maxProb = sorted[0]?.CombinedScore || 1;

  const accuracyStats = useMemo(() => {
    if (!actualResults || sorted.length === 0) return null;
    const actualMap = Object.fromEntries(
      actualResults.map(r => [r.driver_code.toUpperCase(), r.position])
    );
    const predictedTop3Codes = top3.map(d => {
      const lastName = d.FullName.split(" ").slice(-1)[0].toUpperCase();
      return actualResults.find(r =>
        r.driver_name.toUpperCase().includes(lastName)
      )?.driver_code?.toUpperCase() ?? null;
    }).filter(Boolean);

    const actualTop3Codes = actualResults.slice(0, 3).map(r => r.driver_code.toUpperCase());
    const podiumCorrect = predictedTop3Codes.filter(c => actualTop3Codes.includes(c)).length;
    const winnerCorrect = predictedTop3Codes[0] === actualTop3Codes[0];

    return { podiumCorrect, winnerCorrect, actualMap, actualResults };
  }, [actualResults, sorted, top3]);

  const handleHover = useCallback((name) => setHovered(name), []);
  const handleRoundChange = useCallback((r) => setRound(r), []);

  return (
    <div className="app">
      <Header data={data} />
      <RaceHero race={race} round={round} onRoundChange={handleRoundChange} />

      {race ? <InfoStrip race={race} round={round} schedule={schedule} /> : <InfoStripSkeleton />}

      {race && (
        <Suspense fallback={<div className="lazy-ph" />}>
          <CircuitMap race={race} />
        </Suspense>
      )}

      {raceState.error && <div className="err-s">{raceState.error}</div>}

      {!initialLoading && data?.status === "pre_quali" && (
        <div className="state-s fade">
          <div className="state-ico">⏱</div>
          <div className="state-t">Qualifying not yet started</div>
          <div className="state-sub2">Predictions will appear after the qualifying session</div>
        </div>
      )}

      {initialLoading ? (
        <>
          <PodiumCardsSkeleton />
          <GridTableSkeleton rows={20} />
        </>
      ) : data?.status === "pre_race" && sorted.length > 0 ? (
        <div className="fade">
          <Suspense fallback={<PodiumCardsSkeleton />}>
            <PodiumCards top3={top3} maxProb={maxProb} hovered={hovered} onHover={handleHover} />
          </Suspense>
          <Suspense fallback={<GridTableSkeleton rows={20} />}>
            <GridTable
              sorted={sorted}
              maxProb={maxProb}
              hovered={hovered}
              onHover={handleHover}
              accuracyStats={accuracyStats}
            />
          </Suspense>
        </div>
      ) : null}

      {!initialLoading && data?.status === "post_race" && raceResults.length > 0 && (
        <div className="postrace-wrap fade">
          <Suspense fallback={<PodiumCardsSkeleton />}>
            <PostRacePodium
              raceResults={raceResults}
              race={race}
              top3={top3}
              accuracyStats={accuracyStats}
            />
          </Suspense>
          <Suspense fallback={<div className="lazy-ph" />}>
            <WinnerStrip winner={raceResults[0]} />
          </Suspense>
          {sorted.length > 0 && (
            <Suspense fallback={<GridTableSkeleton rows={20} />}>
              <GridTable
                sorted={sorted}
                maxProb={maxProb}
                hovered={hovered}
                onHover={handleHover}
                accuracyStats={accuracyStats}
              />
            </Suspense>
          )}
        </div>
      )}

      <div ref={seasonRef}>
        {seasonInView && <SeasonDashboard year={2026} />}
      </div>

      <Footer />
    </div>
  );
}
