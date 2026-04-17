import { memo } from "react";
import "./Header.css";

function Header({ data }) {
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
    <header className="hdr">
      <div className="hdr-logo">
        <picture>
          <source srcSet="/logo.avif" type="image/avif" />
          <source srcSet="/logo.webp" type="image/webp" />
          <img src="/logo.png" alt="F1 Logo" width="44" height="44" fetchpriority="high" decoding="async" />
        </picture>
        <div className="header-divider" />
      </div>
      <div className="hdr-mid">
        <div className="hdr-app">Podium Predictor</div>
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
    </header>
  );
}

export default memo(Header);
