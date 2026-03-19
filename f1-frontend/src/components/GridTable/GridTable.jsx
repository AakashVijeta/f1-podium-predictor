import SectionHeader from "../SectionHeader/SectionHeader";
import { gd, fn, ln } from "../../constants/drivers";
import "./GridTable.css";

export default function GridTable({ sorted, maxProb, hovered, onHover }) {
  return (
    <div className="grid-wrap">
      <SectionHeader
        label="Full Grid · Podium Probability"
        sub={`${sorted.length} drivers`}
      />
      <table className="gtbl">
        <tbody>
          {sorted.map((d, i) => {
            const drv = gd(d.FullName);
            const pct = d.PodiumProbability * 100;
            const rel = (pct / (maxProb * 100)) * 100;
            const cls = pct > 55 ? "t" : pct > 30 ? "h" : pct > 12 ? "m" : "";
            return (
              <tr
                className={`gr ${hovered === d.FullName ? "hl" : ""}`}
                key={d.FullName}
                onMouseEnter={() => onHover(d.FullName)}
                onMouseLeave={() => onHover(null)}
              >
                <td className="td-i">{i + 1}</td>
                <td className="td-stripe">
                  <div className="td-stripe-bar" style={{ background: drv.color }} />
                </td>
                <td className="td-code" style={{ color: drv.color }}>{drv.short}</td>
                <td className="td-drv">
                  <span className="fn2">{fn(d.FullName)}</span>
                  <span className="ln2">{ln(d.FullName)}</span>
                </td>
                <td className="td-team2">{drv.team}</td>
                <td className="td-num2">#{drv.number}</td>
                <td className="td-barcol">
                  <div className="bt">
                    <div className="bf" style={{ width: `${rel}%`, background: drv.color }} />
                  </div>
                </td>
                <td className={`td-pct ${cls}`}>{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
