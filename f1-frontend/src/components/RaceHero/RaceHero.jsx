import { useEffect, useRef } from "react";
import { ROUNDS_2026 } from "../../constants/rounds";
import FlagImg from "../FlagImg/Flagimg";
import gsap from "gsap";
import "./RaceHero.css";

export default function RaceHero({ race, round, onRoundChange }) {
  const heroRef = useRef(null);

  useEffect(() => {
    if (!heroRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.fromTo(".hero-flag", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6 })
        .fromTo(".hero-round", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.5 }, "-=0.3")
        .fromTo(".hero-name", { opacity: 0, y: 15, clipPath: "inset(0 100% 0 0)" }, { opacity: 1, y: 0, clipPath: "inset(0 0% 0 0)", duration: 0.7 }, "-=0.25")
        .fromTo(".hero-circuit", { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.4 }, "-=0.3")
        .fromTo(".hero-badge", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4 }, "-=0.2")
        .fromTo(".hero-sel", { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.5 }, "-=0.5");
    }, heroRef.current);
    return () => ctx.revert();
  }, [round]);

  return (
    <div className="hero" ref={heroRef}>
      <div className="hero-flag">
        <FlagImg code={race?.countryCode} size="xl" />
      </div>
      <div className="hero-info">
        <div className="hero-round">
          Round {String(round).padStart(2, "0")} · 2026 FIA Formula One World Championship
        </div>
        <div className="hero-name">{race?.name}</div>
        <div className="hero-circuit">{race?.circuit} · {race?.location}</div>
        <div className="hero-badge">
          <span
            className="hero-badge-dot"
            style={{ background: race?.type === "street" ? "var(--red)" : "#444" }}
          />
          {race?.type === "street" ? "Street Circuit" : "Permanent Circuit"}
        </div>
      </div>
      <div className="hero-sel">
        <div className="sel-wrap">
          <select
            className="race-sel"
            value={round}
            onChange={(e) => onRoundChange(Number(e.target.value))}
          >
            {ROUNDS_2026.map((r) => (
              <option key={r.round} value={r.round}>
                R{String(r.round).padStart(2, "0")} — {r.name}
              </option>
            ))}
          </select>
          <div className="sel-arr">▼</div>
        </div>
      </div>
    </div>
  );
}