import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SectionHeader from "../SectionHeader/SectionHeader";
import { API_BASE } from "../../constants/drivers";
import { useShouldAnimate } from "../../hooks/useMotion";
import "./SeasonDashboard.css";

gsap.registerPlugin(ScrollTrigger);

function normalizeBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "correct", "1", "yes"].includes(normalized)) return true;
    if (["false", "wrong", "missed", "0", "no"].includes(normalized)) return false;
  }
  return null;
}

export default function SeasonDashboard({ year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const sdRef = useRef(null);
  const hasAnimated = useRef(false);
  const shouldAnimate = useShouldAnimate({ skipOnMobile: true });

  useEffect(() => {
    const ac = new AbortController();
    fetch(`${API_BASE}/accuracy/${year}`, { signal: ac.signal })
      .then((res) => res.json())
      .then((d) => {
        if (ac.signal.aborted) return;
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Failed to fetch accuracy data", err);
        setLoading(false);
      });
    return () => ac.abort();
  }, [year]);

  useEffect(() => {
    if (!sdRef.current || !data || hasAnimated.current) return;
    if (!shouldAnimate) {
      hasAnimated.current = true;
      return;
    }
    hasAnimated.current = true;
    const root = sdRef.current;
    const statsEl = root.querySelector(".sd-stats");
    const gridEl = root.querySelector(".sd-grid");
    const statboxEls = root.querySelectorAll(".sd-statbox");
    const cardEls = root.querySelectorAll(".sd-card");

    const ctx = gsap.context(() => {
      gsap.fromTo(
        statboxEls,
        { opacity: 0, y: 25 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: "power3.out",
          stagger: 0.15,
          scrollTrigger: { trigger: statsEl, start: "top 90%", once: true },
        }
      );
      root.querySelectorAll(".sd-sbig").forEach((el) => {
        const val = parseInt(el.textContent, 10);
        gsap.fromTo(
          el,
          { textContent: 0 },
          {
            textContent: val,
            duration: 1.2,
            ease: "power2.out",
            snap: { textContent: 1 },
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          }
        );
      });
      gsap.fromTo(
        cardEls,
        { opacity: 0, y: 20, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.4,
          ease: "power3.out",
          stagger: 0.06,
          scrollTrigger: { trigger: gridEl, start: "top 90%", once: true },
        }
      );
    }, root);
    return () => ctx.revert();
  }, [data, shouldAnimate]);

  if (loading) {
    return (
      <div className="sd-wrap">
        <SectionHeader label={`${year} Season`} sub="Model Accuracy Tracker" />
        <div className="sd-loading">Loading season accuracy metrics...</div>
      </div>
    );
  }

  if (!data || !data.history?.length) return null;

  const roundsAnalyzed = data.rounds_analyzed || 0;
  const totalPodiumSlots = data.total_podium_slots || 0;
  const winnerPct = roundsAnalyzed ? ((data.winner_correct / roundsAnalyzed) * 100).toFixed(0) : "0";
  const podiumPct = totalPodiumSlots ? ((data.podium_correct / totalPodiumSlots) * 100).toFixed(0) : "0";

  return (
    <div className="sd-wrap" ref={sdRef}>
      <SectionHeader label={`${year} Season`} sub="Model Accuracy Tracker" />

      <div className="sd-stats">
        <div className="sd-statbox">
          <div className="sd-slabel">Winner Correct</div>
          <div className="sd-sval">
            <span className="sd-sbig">{data.winner_correct}</span> / {roundsAnalyzed}
            <span className="sd-spct">({winnerPct}%)</span>
          </div>
        </div>
        <div className="sd-statbox">
          <div className="sd-slabel">Podium Drivers Predicted</div>
          <div className="sd-sval">
            <span className="sd-sbig">{data.podium_correct}</span> / {totalPodiumSlots}
            <span className="sd-spct">({podiumPct}%)</span>
          </div>
        </div>
      </div>

      <div className="sd-history">
        <div className="sd-h-title">Per-Round Breakdown</div>
        <div className="sd-grid">
          {data.history.map((h) => {
            const winnerCorrect = normalizeBool(h.winner_correct);
            const podiumHits = Number(h.podium_hits);
            const podiumTotalValue = Number(h.podium_total);
            const hasPodiumScore =
              Number.isFinite(podiumHits) &&
              Number.isFinite(podiumTotalValue) &&
              podiumTotalValue > 0;
            const hasResults =
              h.results_available === true ||
              h.status === "evaluated" ||
              winnerCorrect !== null ||
              hasPodiumScore;
            const cardState = hasResults
              ? (winnerCorrect ? "sd-hit" : "sd-miss")
              : h.status === "missing_results" ? "sd-missing" : "sd-pending";
            const podiumTotal = hasPodiumScore ? podiumTotalValue : 3;
            const unavailableText =
              h.status === "missing_results" ? "Results Missing" :
              h.status === "insufficient_predictions" ? "Insufficient Data" :
              "Pending";
            const podiumUnavailableText =
              h.status === "missing_results" ? "Actual Results Missing" :
              h.status === "insufficient_predictions" ? "Predictions Missing" :
              "Results Pending";

            return (
              <div className={`sd-card ${cardState}`} key={h.round}>
                <div className="sd-rnum">R{String(h.round).padStart(2, "0")}</div>
                <div className="sd-rdetail">
                  <div className="sd-rmetric">
                    <span className="sd-mlbl">Winner</span>
                    {!hasResults ? (
                      <span className="sd-mtext">{unavailableText}</span>
                    ) : winnerCorrect ? (
                      <span className="sd-tick">Correct</span>
                    ) : (
                      <span className="sd-cross">Missed</span>
                    )}
                  </div>
                  <div className="sd-rmetric">
                    <span className="sd-mlbl">Podium</span>
                    <span className="sd-mtext">
                      {hasResults ? `${h.podium_hits} / ${podiumTotal} Hit` : podiumUnavailableText}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
