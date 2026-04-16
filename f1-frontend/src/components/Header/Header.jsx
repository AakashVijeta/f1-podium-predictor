import { useEffect, useRef } from "react";
import gsap from "gsap";
import "./Header.css";
import f1Logo from "../../../public/logo.png";

export default function Header({ data }) {
  const hdrRef = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!hdrRef.current || hasAnimated.current) return;
    hasAnimated.current = true;
    // Animate the container directly (it IS the ref, not a descendant)
    gsap.fromTo(hdrRef.current,
      { y: -60 },
      { y: 0, duration: 0.6, ease: "expo.out" }
    );
    // Children are scoped via context
    const ctx = gsap.context(() => {
      gsap.fromTo(".hdr-logo img",
        { opacity: 0, scale: 0.6, rotation: -10 },
        { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "back.out(1.7)", delay: 0.15 }
      );
      gsap.fromTo(".hdr-app",
        { opacity: 0, x: -15 },
        { opacity: 1, x: 0, duration: 0.4, ease: "power2.out", delay: 0.3 }
      );
    }, hdrRef.current);
    return () => ctx.revert();
  }, []);

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
    <div className="hdr" ref={hdrRef}>
      <div className="hdr-logo"><img src={f1Logo} alt="F1 Logo" /><div className="header-divider" /></div>
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
    </div>
  );
}
