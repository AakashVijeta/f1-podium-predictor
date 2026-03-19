import { ROUNDS_2026 } from "../../constants/rounds";
import FlagImg from "../FlagImg/FlagImg";
import "./RaceHero.css";

export default function RaceHero({ race, round, onRoundChange }) {
  return (
    <div className="hero">
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