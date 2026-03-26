import SectionHeader from "../SectionHeader/SectionHeader";
import { gd, fn, ln, MEDALS, MEDAL_LABELS } from "../../constants/drivers";
import "./PostRacePodium.css";

export default function PostRacePodium({ raceResults, race, top3 }) {
  return (
    <>
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
                // Check if this driver ended up in the actual top 3
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
    </>
  );
}