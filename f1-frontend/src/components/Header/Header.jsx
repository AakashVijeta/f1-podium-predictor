import "./Header.css";

export default function Header({ race, data }) {
  const statusColor =
    data?.status === "pre_race"  ? "#22c55e" :
    data?.status === "post_race" ? "#e8000d" : "#444";

  const statusBg =
    data?.status === "pre_race"  ? "rgba(34,197,94,0.08)" :
    data?.status === "post_race" ? "rgba(232,0,13,0.08)"  : "transparent";

  const statusLabel =
    data?.status === "pre_race"  ? "Race Pending" :
    data?.status === "post_race" ? "Completed"    : "Pre-Qualifying";

  return (
    <div className="hdr">
      <div className="hdr-logo">F1</div>
      <div className="hdr-mid">
        <div className="hdr-app">Podium Predictor</div>
        {race && <div className="hdr-race">{race.flag} {race.name}</div>}
      </div>
      <div className="hdr-right">
        {data && (
          <div
            className="hdr-status"
            style={{ color: statusColor, borderColor: statusColor + "44", background: statusBg }}
          >
            <div
              className="hdr-dot"
              style={{
                background: statusColor,
                animation: data.status === "pre_race" ? "pulse 1.5s infinite" : "none",
              }}
            />
            {statusLabel}
          </div>
        )}
      </div>
    </div>
  );
}
