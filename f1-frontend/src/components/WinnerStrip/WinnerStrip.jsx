import { gd, fn, ln, MEDALS } from "../../constants/drivers";
import "./WinnerStrip.css";

export default function WinnerStrip({ winner }) {
  if (!winner) return null;
  const drv = gd(winner.FullName);

  return (
    <div
      className="winner-strip"
      style={{ borderTop: `3px solid ${drv.color}`, borderLeftColor: drv.color + "22" }}
    >
      <div className="winner-bg-code">{drv.short}</div>

      <div className="winner-label" style={{ color: MEDALS[0] }}>Race Winner</div>

      <div className="winner-divider" />

      <div>
        <div className="winner-name-fn">{fn(winner.FullName)}</div>
        <div className="winner-name-ln" style={{ color: drv.color }}>{ln(winner.FullName)}</div>
      </div>

      <div className="winner-divider" />

      <div>
        <div className="winner-meta-lbl">Constructor</div>
        <div className="winner-meta-val">{drv.team}</div>
      </div>

      <div className="winner-divider" />

      <div>
        <div className="winner-meta-lbl">Car Number</div>
        <div className="winner-number" style={{ color: drv.color }}>#{drv.number}</div>
      </div>
    </div>
  );
}
