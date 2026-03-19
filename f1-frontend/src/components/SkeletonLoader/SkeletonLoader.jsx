import "./SkeletonLoader.css";

/** Shimmer block — reuse for any shape */
function Sk({ className, style }) {
  return <div className={`sk ${className}`} style={style} />;
}

/** Mirrors InfoStrip layout */
export function InfoStripSkeleton() {
  return (
    <div className="sk-info-strip" style={{ marginTop: "2px" }}>
      {[0, 1, 2, 3].map((i) => (
        <div className="sk-istat" key={i}>
          <Sk className="sk-lbl" />
          <Sk className="sk-val" />
          <Sk className="sk-sub" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors PodiumCards layout */
export function PodiumCardsSkeleton() {
  return (
    <div className="sk-podium-wrap">
      {/* Section header shimmer */}
      <div className="sk-grid-header" style={{ marginBottom: "1.5rem" }}>
        <div className="sk-sh-bar" />
        <Sk className="sk-sh-lbl" />
        <div className="sk-sh-line" />
        <Sk className="sk-sh-sub" />
      </div>
      <div className="sk-podium-grid">
        {[0, 1, 2].map((i) => (
          <div className="sk-pc" key={i}>
            <Sk className="sk-pc-top" />
            <Sk className="sk-pc-fn" />
            <Sk className="sk-pc-ln" />
            <Sk className="sk-pc-team" />
            <Sk className="sk-pc-prob" />
            <Sk className="sk-pc-bar" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors GridTable layout */
export function GridTableSkeleton({ rows = 20 }) {
  return (
    <div className="sk-grid-wrap">
      <div className="sk-grid-header">
        <div className="sk-sh-bar" />
        <Sk className="sk-sh-lbl" />
        <div className="sk-sh-line" />
        <Sk className="sk-sh-sub" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="sk-row" key={i}>
          <Sk className="sk-row-i" />
          <Sk className="sk-row-stripe" />
          <Sk className="sk-row-code" />
          <Sk className="sk-row-name" />
          <Sk className="sk-row-team" />
          <Sk className="sk-row-num" />
          <Sk className="sk-row-bar" />
          <Sk className="sk-row-pct" />
        </div>
      ))}
    </div>
  );
}
