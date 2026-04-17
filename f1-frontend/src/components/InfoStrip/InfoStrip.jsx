import { memo } from "react";
import "./InfoStrip.css";

function InfoStrip({ race, round }) {
  return (
    <div className="info-strip" style={{ marginTop: "2px" }} key={round}>
      <div className="istat">
        <div className="istat-lbl">Grand Prix</div>
        <div className="istat-val istat-val--name">{race?.name}</div>
      </div>
      <div className="istat">
        <div className="istat-lbl">Circuit</div>
        <div className="istat-val istat-val--circuit">{race?.circuit}</div>
        <div className="istat-sub">{race?.location}</div>
      </div>
      <div className="istat">
        <div className="istat-lbl">Round</div>
        <div className="istat-val">{String(round).padStart(2, "0")} / 22</div>
        <div className="istat-sub">2026 Season</div>
      </div>
      <div className="istat">
        <div className="istat-lbl">Circuit Type</div>
        <div
          className="istat-val"
          style={{ color: race?.type === "street" ? "var(--red)" : "#e0e0e0" }}
        >
          {race?.type === "street" ? "Street" : "Permanent"}
        </div>
      </div>
    </div>
  );
}

export default memo(InfoStrip);
