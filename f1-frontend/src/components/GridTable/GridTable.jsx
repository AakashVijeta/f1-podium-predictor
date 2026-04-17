import { memo, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { gd, fn, ln } from "../../constants/drivers";
import { useShouldAnimate } from "../../hooks/useMotion";
import "./GridTable.css";

gsap.registerPlugin(ScrollTrigger);

const GridRow = memo(function GridRow({
  d, i, hovered, onHover, getActual, showActual, maxProb,
}) {
  const drv = gd(d.FullName);
  const pct = d.PodiumProbability * 100;
  const rel = (pct / (maxProb * 100)) * 100;
  const cls = pct > 55 ? "t" : pct > 30 ? "h" : pct > 12 ? "m" : "";

  const actual = getActual(d.FullName);
  const actualPos = actual ? actual.position : null;
  const isDNF = actual && actual.status !== "Finished" && !actual.status.startsWith("Lap");
  const predRank = i + 1;
  const isCorrectPodium = actualPos !== null && predRank <= 3 && actualPos <= 3;
  const isWrongPodium = actualPos !== null && predRank <= 3 && actualPos > 3;
  const delta = actualPos !== null && !isDNF ? predRank - actualPos : null;

  return (
    <tr
      className={`gr ${hovered === d.FullName ? "hl" : ""}`}
      onMouseEnter={() => onHover(d.FullName)}
      onMouseLeave={() => onHover(null)}
    >
      <td className="td-actual">
        {!showActual ? null : isDNF ? (
          <span className="actual-chip actual-dnf">DNF</span>
        ) : actualPos !== null ? (
          <span className={`actual-chip ${isCorrectPodium ? "actual-hit" : isWrongPodium ? "actual-miss" : ""}`}>
            P{actualPos}
            {delta !== null && delta !== 0 && (
              <span className={`actual-delta ${delta > 0 ? "up" : "down"}`}>
                {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
              </span>
            )}
          </span>
        ) : (
          <span className="actual-chip actual-pending">—</span>
        )}
      </td>

      <td className="td-i">#{i + 1}</td>
      <td className="td-stripe">
        <div className="td-stripe-bar" style={{ background: drv.color }} />
      </td>
      <td className="td-code" style={{ color: drv.color }}>{drv.short}</td>
      <td className="td-drv">
        <span className="fn2">{fn(d.FullName)}</span>
        <span className="ln2">{ln(d.FullName)}</span>
        <span className="td-team-inline">{drv.team}</span>
      </td>
      <td className="td-barcol">
        <div className="bt">
          <div
            className="bf"
            style={{
              "--target-width": `${rel}%`,
              "--row-index": i,
              background: drv.color
            }}
          />
        </div>
      </td>
      <td className={`td-pct ${cls}`}>{pct.toFixed(1)}%</td>
    </tr>
  );
});

export default function GridTable({ sorted, maxProb, hovered, onHover, accuracyStats }) {
  const { podiumCorrect, winnerCorrect, actualResults } = accuracyStats ?? {};
  const showActual = !!actualResults;
  const gridRef = useRef(null);
  const hasAnimated = useRef(false);
  const shouldAnimate = useShouldAnimate({ skipOnMobile: true });

  const actualByLast = useMemo(() => {
    if (!actualResults) return null;
    const map = new Map();
    for (const r of actualResults) {
      const lastName = r.driver_name.split(" ").slice(-1)[0].toUpperCase();
      map.set(lastName, r);
    }
    return map;
  }, [actualResults]);

  const getActual = useMemo(() => {
    if (!actualByLast) return () => null;
    return (fullName) => {
      const lastName = fullName.split(" ").slice(-1)[0].toUpperCase();
      return actualByLast.get(lastName) ?? null;
    };
  }, [actualByLast]);

  useEffect(() => {
    if (!gridRef.current || hasAnimated.current) return;

    if (!shouldAnimate) {
      gridRef.current.querySelectorAll(".bf").forEach((el) => {
        el.style.width = el.style.getPropertyValue("--target-width");
      });
      hasAnimated.current = true;
      return;
    }

    hasAnimated.current = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(".gr",
        { opacity: 0, x: -16 },
        {
          opacity: 1, x: 0,
          duration: 0.4, ease: "power3.out",
          stagger: 0.03,
          scrollTrigger: { trigger: ".gtbl", start: "top 85%", once: true },
        }
      );

      if (gridRef.current.querySelector(".acc-bar")) {
        gsap.fromTo(".acc-card",
          { opacity: 0, y: 20, scale: 0.95 },
          {
            opacity: 1, y: 0, scale: 1,
            duration: 0.5, ease: "back.out(1.4)",
            stagger: 0.1,
            scrollTrigger: { trigger: ".acc-bar", start: "top 90%", once: true },
          }
        );
      }

      gsap.fromTo(".bf",
        { width: 0 },
        {
          width: (i, el) => el.style.getPropertyValue("--target-width"),
          duration: 1, ease: "expo.out",
          stagger: 0.04,
          scrollTrigger: { trigger: ".gtbl", start: "top 85%", once: true },
        }
      );
    }, gridRef.current);

    return () => ctx.revert();
  }, [showActual, shouldAnimate]);

  const winnerName = actualResults?.[0]?.driver_name?.split(" ").slice(-1)[0].toUpperCase() ?? "—";

  const podiumClass = podiumCorrect === 3 ? "correct" : podiumCorrect >= 2 ? "partial" : "wrong";
  const winnerClass = winnerCorrect ? "correct" : "wrong";
  const winnerBadge = winnerCorrect ? "Correct" : "Wrong";
  const podiumBadge = podiumCorrect === 3 ? "Perfect" : podiumCorrect >= 2 ? "Partial" : "Wrong";

  return (
    <div className="grid-wrap" ref={gridRef}>
      <div className="gh-head">
        <div className="gh-pipe" />
        <div className="gh-title-block">
          <span className="gh-title">Full Grid</span>
          <span className="gh-sub">Podium Probability</span>
        </div>
        <span className="gh-count">{sorted.length} Drivers</span>
      </div>

      {showActual && (
        <div className="acc-bar">
          <div className={`acc-card ${winnerClass}`}>
            <div className="acc-left">
              <span className="acc-type">Winner</span>
              <span className={`acc-value ${winnerClass}`}>{winnerName}</span>
            </div>
            <span className={`acc-badge ${winnerClass}`}>{winnerBadge}</span>
          </div>
          <div className={`acc-card ${podiumClass}`}>
            <div className="acc-left">
              <span className="acc-type">Podium</span>
              <span className={`acc-value ${podiumClass}`}>{podiumCorrect} / 3</span>
            </div>
            <span className={`acc-badge ${podiumClass}`}>{podiumBadge}</span>
          </div>
        </div>
      )}

      <table className="gtbl">
        <thead>
          <tr className="gh-row">
            <th className="th-actual">{showActual ? "Finished" : ""}</th>
            <th className="th-rank">Predicted</th>
            <th colSpan={3} className="th-driver">Driver</th>
            <th className="th-bar">Podium Probability</th>
            <th className="th-pct"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => (
            <GridRow
              key={d.FullName}
              d={d}
              i={i}
              hovered={hovered}
              onHover={onHover}
              getActual={getActual}
              showActual={showActual}
              maxProb={maxProb}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
