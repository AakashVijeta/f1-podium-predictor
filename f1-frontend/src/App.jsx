import { useState, useEffect } from "react";
import { ROUNDS_2026 } from "./constants/rounds";
import { API_BASE } from "./constants/drivers";
import Header from "./components/Header/Header";
import RaceHero from "./components/RaceHero/RaceHero";
import PodiumCards from "./components/PodiumCards/PodiumCards";
import GridTable from "./components/GridTable/GridTable";
import PostRacePodium from "./components/PostRacePodium/PostRacePodium";
import InfoStrip from "./components/InfoStrip/InfoStrip";
import WinnerStrip from "./components/WinnerStrip/WinnerStrip";
import {
  InfoStripSkeleton,
  PodiumCardsSkeleton,
  GridTableSkeleton,
} from "./components/SkeletonLoader/SkeletonLoader";
import Footer from "./components/Footer/Footer";
import "./App.css";

export default function App() {
  const [round, setRound] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const race = ROUNDS_2026.find(r => r.round === round);

  useEffect(() => {
    setLoading(true); setError(null); setData(null);
    fetch(`${API_BASE}/predict/2026/${round}`)
      .then(r => r.json()).then(setData)
      .catch(() => setError("Cannot reach API — make sure uvicorn is running."))
      .finally(() => setLoading(false));
  }, [round]);

  const sorted = data?.predictions
    ? [...data.predictions].sort((a, b) => b.PodiumProbability - a.PodiumProbability)
    : [];
  const top3 = sorted.slice(0, 3);
  const raceResults = data?.results || [];
  const maxProb = sorted[0]?.PodiumProbability || 1;

  return (
    <div className="app">
      <Header race={race} data={data} />
      <RaceHero race={race} round={round} onRoundChange={setRound} />

      {/* Info strip */}
      {loading ? <InfoStripSkeleton /> : <InfoStrip race={race} round={round} />}

      {/* Error */}
      {error && <div className="err-s">{error}</div>}

      {/* Pre-qualifying: no predictions yet */}
      {!loading && data?.status === "pre_quali" && (
        <div className="state-s fade">
          <div className="state-ico">⏱</div>
          <div className="state-t">Qualifying not yet started</div>
          <div className="state-sub2">Predictions will appear after the qualifying session</div>
        </div>
      )}

      {/* Pre-race: show predictions skeleton → then real cards */}
      {loading ? (
        <>
          <PodiumCardsSkeleton />
          <GridTableSkeleton rows={20} />
        </>
      ) : data?.status === "pre_race" && sorted.length > 0 ? (
        <div className="fade">
          <PodiumCards top3={top3} maxProb={maxProb} hovered={hovered} onHover={setHovered} />
          <GridTable sorted={sorted} maxProb={maxProb} hovered={hovered} onHover={setHovered} />
        </div>
      ) : null}

      {/* Post-race: show skeleton → then real results */}
      {!loading && data?.status === "post_race" && raceResults.length > 0 && (
        <div className="postrace-wrap fade">
          <PostRacePodium raceResults={raceResults} race={race} />
          <InfoStrip race={race} round={round} />
          <WinnerStrip winner={raceResults[0]} />
        </div>
      )}

      <Footer />
    </div>
  );
}