import { useEffect, useRef } from "react";
import { gd, fn, ln, MEDALS } from "../../constants/drivers";
import gsap from "gsap";
import "./WinnerStrip.css";

export default function WinnerStrip({ winner }) {
  const stripRef = useRef(null);

  useEffect(() => {
    if (!stripRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.fromTo(".winner-strip", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.6 })
        .fromTo(".winner-label", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.4 }, "-=0.2")
        .fromTo(".winner-name-ln", { opacity: 0, y: 20, clipPath: "inset(0 100% 0 0)" }, { opacity: 1, y: 0, clipPath: "inset(0 0% 0 0)", duration: 0.6 }, "-=0.15")
        .fromTo(".winner-divider", { scaleY: 0 }, { scaleY: 1, duration: 0.3, stagger: 0.08 }, "-=0.3")
        .fromTo(".winner-number", { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, "-=0.2");
    }, stripRef.current);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!winner) return null;
  const drv = gd(winner.FullName);

  return (
    <div ref={stripRef}>
      <div
        className="winner-strip"
        style={{ borderTop: `3px solid ${drv.color}`, borderLeftColor: drv.color + "22" }}
      >
        <div className="winner-bg-code">{drv.short}</div>

        <div className="winner-label" style={{ color: MEDALS[0] }}>Race Winner</div>

        <div className="winner-divider" />

        <div>
          <div className="winner-name-fn">{fn(winner.FullName)}</div>
          <div className="winner-name-ln" style={{ color: drv.color }}>{ln(winner.FullName)}</div>
        </div>

        <div className="winner-divider" />

        <div>
          <div className="winner-meta-lbl">Constructor</div>
          <div className="winner-meta-val">{drv.team}</div>
        </div>

        <div className="winner-divider" />

        <div>
          <div className="winner-meta-lbl">Car Number</div>
          <div className="winner-number" style={{ color: drv.color }}>#{drv.number}</div>
        </div>
      </div>
    </div>
  );
}
