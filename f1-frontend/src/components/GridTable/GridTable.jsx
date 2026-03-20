import { gd, fn, ln } from "../../constants/drivers";
import "./GridTable.css";

export default function GridTable({ sorted, maxProb, hovered, onHover, accuracyStats }) {
  const { podiumCorrect, winnerCorrect, actualResults } = accuracyStats ?? {};

  const getActual = (fullName) => {
    if (!actualResults) return null;
    const lastName = fullName.split(" ").slice(-1)[0].toUpperCase();
    return actualResults.find(r =>
      r.driver_name.toUpperCase().includes(lastName)
    ) ?? null;
  };

  const showActual = !!actualResults;

  // Winner name for display in accuracy card
  const winnerName = actualResults?.[0]?.driver_name?.split(" ").slice(-1)[0].toUpperCase() ?? "—";

  const podiumClass = podiumCorrect === 3 ? "correct" : podiumCorrect >= 2 ? "partial" : "wrong";
  const winnerClass = winnerCorrect ? "correct" : "wrong";
  const winnerBadge = winnerCorrect ? "Correct" : "Wrong";
  const podiumBadge = podiumCorrect === 3 ? "Perfect" : podiumCorrect >= 2 ? "Partial" : "Wrong";

  return (
    <div className="grid-wrap">

      {/* Section header */}
      <div className="gh-head">
        <div className="gh-pipe" />
        <div className="gh-title-block">
          <span className="gh-title">Full Grid</span>
          <span className="gh-sub">Podium Probability</span>
        </div>
        <span className="gh-count">{sorted.length} Drivers</span>
      </div>

      {/* Accuracy cards — only when actual results are available */}
      {showActual && (
        <div className="acc-bar">
          <div className={`acc-card ${winnerClass}`}>
            <div className="acc-left">
              <span className="acc-type">Winner</span>
              <span className={`acc-value ${winnerClass}`}>{winnerName}</span>
            </div>
            <span className={`acc-badge ${winnerClass}`}>{winnerBadge}</span>
          </div>
          <div className={`acc-card ${podiumClass}`}>
            <div className="acc-left">
              <span className="acc-type">Podium</span>
              <span className={`acc-value ${podiumClass}`}>{podiumCorrect} / 3</span>
            </div>
            <span className={`acc-badge ${podiumClass}`}>{podiumBadge}</span>
          </div>
        </div>
      )}

      <table className="gtbl">
        <tbody>
          {sorted.map((d, i) => {
            const drv = gd(d.FullName);
            const pct = d.PodiumProbability * 100;
            const rel = (pct / (maxProb * 100)) * 100;
            const cls = pct > 55 ? "t" : pct > 30 ? "h" : pct > 12 ? "m" : "";

            const actual = getActual(d.FullName);
            const actualPos = actual ? actual.position : null;
            const isDNF = actual && actual.status !== "Finished" && !actual.status.startsWith("Lap");
            // Highlight match quality: predicted rank vs actual position
            const predRank = i + 1;
            const isCorrectPodium = actualPos !== null && predRank <= 3 && actualPos <= 3;
            const isWrongPodium = actualPos !== null && predRank <= 3 && actualPos > 3;

            return (
              <tr
                className={`gr ${hovered === d.FullName ? "hl" : ""}`}
                key={d.FullName}
                onMouseEnter={() => onHover(d.FullName)}
                onMouseLeave={() => onHover(null)}
              >
                {/* Actual result column — leftmost */}
                <td className="td-actual">
                  {!showActual ? (
                    <span className="actual-pending">—</span>
                  ) : isDNF ? (
                    <span className="actual-dnf">DNF</span>
                  ) : actualPos !== null ? (
                    <span className={`actual-pos ${isCorrectPodium ? "actual-hit" : isWrongPodium ? "actual-miss" : ""}`}>
                      P{actualPos}
                    </span>
                  ) : (
                    <span className="actual-pending">—</span>
                  )}
                </td>

                <td className="td-i">{i + 1}</td>
                <td className="td-stripe">
                  <div className="td-stripe-bar" style={{ background: drv.color }} />
                </td>
                <td className="td-code" style={{ color: drv.color }}>{drv.short}</td>
                <td className="td-drv">
                  <span className="fn2">{fn(d.FullName)}</span>
                  <span className="ln2">{ln(d.FullName)}</span>
                  <span className="td-team-inline">{drv.team}</span>
                </td>
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