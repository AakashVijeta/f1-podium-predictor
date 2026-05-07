import { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from "react";
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

export default function App() {
  const [round, setRound] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [actualResults, setActualResults] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const cacheRef = useRef(new Map());
  const [seasonRef, seasonInView] = useInView({ rootMargin: "1000px" });

  const race = useMemo(() => ROUNDS_2026.find(r => r.round === round), [round]);

  useEffect(() => {
    const cached = cacheRef.current.get(round);
    if (cached) {
      setData(cached.data);
      setActualResults(cached.actualResults);
      setSchedule(null);
      setLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setActualResults(null);
    setSchedule(null);

    fetch(`${API_BASE}/schedule/2026/${round}`, { signal: ac.signal })
      .then(r => r.json())
      .then(s => { if (!ac.signal.aborted) setSchedule(s); })
      .catch(() => {});

    Promise.all([
      fetch(`${API_BASE}/predict/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
      fetch(`${API_BASE}/results/2026/${round}`, { signal: ac.signal }).then(r => r.json()),
    ])
      .then(([d, r]) => {
        if (ac.signal.aborted) return;
        const actual = r.available ? r.results : null;
        setData(d);
        setActualResults(actual);
        if (d?.status === "post_race") {
          cacheRef.current.set(round, { data: d, actualResults: actual });
        }
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        setError("Cannot reach API — make sure uvicorn is running.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [round]);

  const sorted = useMemo(() => (
    data?.predictions
      ? [...data.predictions].sort((a, b) => b.CombinedScore - a.CombinedScore)
      : []
  ), [data]);

  const top3 = useMemo(() => sorted.slice(0, 3), [sorted]);
  const raceResults = data?.results || [];
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

      {loading ? <InfoStripSkeleton /> : <InfoStrip race={race} round={round} />}

      {!loading && race && (
        <Suspense fallback={<div className="lazy-ph" />}>
          <CircuitMap race={race} />
        </Suspense>
      )}

      {error && <div className="err-s">{error}</div>}

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

      {loading ? (
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

      {!loading && data?.status === "post_race" && raceResults.length > 0 && (
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
