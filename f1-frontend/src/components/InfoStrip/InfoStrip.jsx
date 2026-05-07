import { memo } from "react";
import "./InfoStrip.css";

function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const day   = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);
  const date  = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(d);
  const time  = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(d);
  return { day, date, time };
}

function SessionStat({ label, iso }) {
  const fmt = fmtTime(iso);
  return (
    <div className="istat">
      <div className="istat-lbl">{label}</div>
      {fmt ? (
        <>
          <div className="istat-val istat-val--time">{fmt.day} · {fmt.time}</div>
          <div className="istat-sub">{fmt.date}</div>
        </>
      ) : (
        <div className="istat-val istat-val--dim">TBD</div>
      )}
    </div>
  );
}

function InfoStrip({ race, round, schedule }) {
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
      <SessionStat label="Qualifying" iso={schedule?.qualifying} />
      <SessionStat label="Race" iso={schedule?.race} />
    </div>
  );
}

export default memo(InfoStrip);
