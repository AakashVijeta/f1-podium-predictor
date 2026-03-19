import SectionHeader from "../SectionHeader/SectionHeader";
import { gd, fn, ln } from "../../constants/drivers";
import "./PodiumCards.css";

export default function PodiumCards({ top3, maxProb, hovered, onHover }) {
  return (
    <div className="podium-wrap">
      <SectionHeader
        label="Predicted Podium"
        sub="ML · GradientBoostingClassifier · v4.0"
      />
      <div className="podium-grid">
        {top3.map((d, i) => {
          const drv = gd(d.FullName);
          const pct = d.PodiumProbability * 100;
          const rel = (pct / (maxProb * 100)) * 100;
          return (
            <div
              className="pc"
              key={d.FullName}
              style={{ borderTopColor: drv.color, animationDelay: `${i * 0.07}s` }}
              onMouseEnter={() => onHover(d.FullName)}
              onMouseLeave={() => onHover(null)}
            >
              <div className="pc-bgnum">0{i + 1}</div>
              <div className="pc-top">
                <div className="pc-plabel">P{i + 1} Position</div>
                <div className="pc-short" style={{ color: drv.color }}>{drv.short}</div>
              </div>
              <div className="pc-fn">{fn(d.FullName)}</div>
              <div className="pc-ln" style={{ color: drv.color }}>{ln(d.FullName)}</div>
              <div className="pc-team">{drv.team}</div>
              <div className="pc-prob">
                <div className="pc-pnum" style={{ color: drv.color }}>{pct.toFixed(1)}</div>
                <div className="pc-plbl">% podium<br />probability</div>
              </div>
              <div className="pc-bar">
                <div className="pc-fill" style={{ width: `${rel}%`, background: drv.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
