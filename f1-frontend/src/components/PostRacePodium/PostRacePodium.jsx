import { useEffect, useRef } from "react";
import SectionHeader from "../SectionHeader/SectionHeader";
import { gd, fn, ln, MEDALS, MEDAL_LABELS } from "../../constants/drivers";
import gsap from "gsap";
import "./PostRacePodium.css";

export default function PostRacePodium({ raceResults, race, top3 }) {
  const podRef = useRef(null);

  useEffect(() => {
    if (!podRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".vs-side:first-child .vs-row",
        { opacity: 0, x: -30 },
        { opacity: 1, x: 0, duration: 0.5, ease: "power3.out", stagger: 0.1, delay: 0.2 }
      );
      gsap.fromTo(".vs-divider",
        { opacity: 0, scale: 0 },
        { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)", delay: 0.4 }
      );
      gsap.fromTo(".vs-side:last-child .vs-row",
        { opacity: 0, x: 30 },
        { opacity: 1, x: 0, duration: 0.5, ease: "power3.out", stagger: 0.1, delay: 0.5 }
      );
      gsap.fromTo(".vs-status",
        { opacity: 0, scale: 0 },
        { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)", stagger: 0.12, delay: 0.7 }
      );
    }, podRef.current);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={podRef}>
      <SectionHeader
        label="Podium Results"
        sub={`Predicted vs Actual · ${race?.name}`}
      />
      <div className="vs-podium-wrap">
        {top3 && top3.length > 0 && (
          <div className="vs-side">
            <div className="vs-header">
              <span className="vs-title">Predicted Podium</span>
              <span className="vs-sub">ML Model v5</span>
            </div>
            <div className="vs-podium">
              {top3.slice(0, 3).map((d, i) => {
                const drv = gd(d.FullName);
                const medalColor = MEDALS[i];
                const actualIndex = raceResults.slice(0, 3).findIndex(r => {
                  const actualName = r.FullName || r.driver_name || "";
                  const rLastName = actualName.split(" ").slice(-1)[0].toUpperCase();
                  const dLastName = d.FullName.split(" ").slice(-1)[0].toUpperCase();
                  return rLastName.includes(dLastName) || dLastName.includes(rLastName);
                });

                let matchStatus = "miss";
                let matchIcon = "✗";
                if (actualIndex === i) {
                  matchStatus = "hit";
                  matchIcon = "✓";
                } else if (actualIndex !== -1) {
                  matchStatus = "partial";
                  matchIcon = "~";
                }

                return (
                  <div className={`vs-row ${matchStatus}`} key={d.FullName} style={{ borderLeftColor: drv.color }}>
                    <div className="vs-pos" style={{ color: medalColor }}>P{i + 1}</div>
                    <div className="vs-code" style={{ color: drv.color }}>{drv.short}</div>
                    <div className="vs-name">
                      <span className="vs-fn">{fn(d.FullName)}</span>
                      <span className="vs-ln">{ln(d.FullName)}</span>
                    </div>
                    <div className={`vs-status ${matchStatus}`}>{matchIcon}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="vs-divider">VS</div>

        <div className="vs-side">
          <div className="vs-header">
            <span className="vs-title">Actual Podium</span>
            <span className="vs-sub">Official Results</span>
          </div>
          <div className="vs-podium">
            {raceResults.slice(0, 3).map((r, i) => {
              const drv = gd(r.FullName);
              const medalColor = MEDALS[i];
              return (
                <div className="vs-row hit" key={r.FullName} style={{ borderLeftColor: drv.color }}>
                  <div className="vs-pos" style={{ color: medalColor }}>P{r.RacePosition}</div>
                  <div className="vs-code" style={{ color: drv.color }}>{drv.short}</div>
                  <div className="vs-name">
                    <span className="vs-fn">{fn(r.FullName)}</span>
                    <span className="vs-ln">{ln(r.FullName)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
