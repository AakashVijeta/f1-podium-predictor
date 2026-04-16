import { useEffect, useRef } from "react";
import gsap from "gsap";
import "./InfoStrip.css";

export default function InfoStrip({ race, round }) {
  const stripRef = useRef(null);

  useEffect(() => {
    if (!stripRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".istat",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.08 }
      );
    }, stripRef.current);
    return () => ctx.revert();
  }, [round]);

  return (
    <div className="info-strip" ref={stripRef} style={{ marginTop: "2px" }}>
      <div className="istat">
        <div className="istat-lbl">Grand Prix</div>
        <div
          className="istat-val"
          style={{
            fontSize: "0.88rem",
            fontFamily: "'Titillium Web', sans-serif",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "#e0e0e0",
          }}
        >
          {race?.name}
        </div>
      </div>
      <div className="istat">
        <div className="istat-lbl">Circuit</div>
        <div
          className="istat-val"
          style={{
            fontSize: "0.82rem",
            fontFamily: "'Titillium Web', sans-serif",
            fontWeight: 600,
            color: "#e0e0e0",
          }}
        >
          {race?.circuit}
        </div>
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
    </div>
  );
}