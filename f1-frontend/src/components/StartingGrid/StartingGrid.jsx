import { gd } from "../../constants/drivers";
import "./StartingGrid.css";

// Authentic 2-column staggered F1 starting grid.
// Pole on the left, P2 offset back on the right, P3 on the left, etc.
// Click/hover syncs with GridTable rows below via shared `hovered` state.
export default function StartingGrid({ drivers, hovered, onHover, actualResults }) {
  const withGrid = drivers.filter(d => d.GridPosition != null);
  if (withGrid.length === 0) return null;

  const byGrid = [...withGrid].sort((a, b) => a.GridPosition - b.GridPosition);
  const pole = byGrid[0];
  const poleDrv = gd(pole.FullName);

  // Build actual-position lookup for post-race delta overlay
  const actualByLastName = {};
  if (actualResults) {
    for (const r of actualResults) {
      const key = r.driver_name.split(" ").slice(-1)[0].toUpperCase();
      actualByLastName[key] = r;
    }
  }

  return (
    <div className="sg-wrap">
      <div className="sg-head">
        <div className="sg-pipe" />
        <div className="sg-title-block">
          <span className="sg-title">Starting Grid</span>
          <span className="sg-sub">Qualifying Result</span>
        </div>
        <div className="sg-pole" style={{ "--col": poleDrv.color }}>
          <span className="sg-pole-lbl">Pole</span>
          <span className="sg-pole-code">{poleDrv.short}</span>
        </div>
      </div>

      <div className="sg-track">
        <div className="sg-edge sg-edge-l" />
        <div className="sg-edge sg-edge-r" />

        <div className="sg-lights" aria-hidden>
          <span /><span /><span /><span /><span />
        </div>

        <div className="sg-grid">
          {byGrid.map((d) => {
            const drv = gd(d.FullName);
            const pos = Math.round(d.GridPosition);
            const isLeft = pos % 2 === 1;
            const row = Math.ceil(pos / 2);
            const isHover = hovered === d.FullName;

            // Post-race delta
            const lastName = d.FullName.split(" ").slice(-1)[0].toUpperCase();
            const actual = actualByLastName[lastName];
            const finishPos = actual ? actual.position : null;
            const delta = finishPos != null ? pos - finishPos : null; // + = gained
            const isDNF = actual && actual.status !== "Finished" && !actual.status.startsWith("Lap");

            return (
              <div
                key={d.FullName}
                className={`sg-slot ${isLeft ? "l" : "r"} ${isHover ? "hl" : ""} ${pos === 1 ? "pole" : ""}`}
                style={{ "--col": drv.color, gridColumn: isLeft ? 1 : 2, gridRow: row }}
                onMouseEnter={() => onHover(d.FullName)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onHover(d.FullName)}
                title={`P${pos} — ${d.FullName}${finishPos ? ` → finished P${finishPos}` : ""}`}
              >
                <span className="sg-pos">{pos}</span>
                <div className="sg-body">
                  <span className="sg-code">{drv.short}</span>
                  <span className="sg-num">#{drv.number}</span>
                </div>
                {delta != null && (
                  <span className={`sg-delta ${isDNF ? "dnf" : delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}>
                    {isDNF ? "DNF" : delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : "—"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="sg-start">
          <span className="sg-start-lbl">START / FINISH</span>
        </div>
      </div>
    </div>
  );
}
