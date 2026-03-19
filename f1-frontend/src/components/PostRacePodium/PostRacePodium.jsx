import SectionHeader from "../SectionHeader/SectionHeader";
import { gd, fn, ln, MEDALS, MEDAL_LABELS } from "../../constants/drivers";
import "./PostRacePodium.css";

export default function PostRacePodium({ raceResults, race }) {
  return (
    <>
      <SectionHeader
        label="Race Podium"
        sub={`Official Results · ${race?.name}`}
      />
      <div className="podium3">
        {raceResults.map((r) => {
          const drv = gd(r.FullName);
          const medalColor = MEDALS[r.RacePosition - 1];
          return (
            <div className="rc" key={r.FullName} style={{ borderTopColor: medalColor }}>
              <div className="rc-bgnum">{drv.short}</div>
              <div className="rc-medal" style={{ color: medalColor }}>
                {MEDAL_LABELS[r.RacePosition - 1]}
              </div>
              <div className="rc-pos" style={{ color: medalColor }}>P{r.RacePosition}</div>
              <div className="rc-short" style={{ color: drv.color }}>{drv.short}</div>
              <div className="rc-fn2">{fn(r.FullName)}</div>
              <div className="rc-ln2" style={{ color: drv.color }}>{ln(r.FullName)}</div>
              <div className="rc-team2">{drv.team}</div>
              <div className="rc-bar" style={{ background: drv.color }} />
            </div>
          );
        })}
      </div>
    </>
  );
}