import { useEffect, useRef } from "react";
import gsap from "gsap";
import SectionHeader from "../SectionHeader/SectionHeader";
import { gd, fn, ln } from "../../constants/drivers";
import { useShouldAnimate } from "../../hooks/useMotion";
import "./PodiumCards.css";

export default function PodiumCards({ top3, maxProb, hovered, onHover }) {
  const wrapRef = useRef(null);
  const shouldAnimate = useShouldAnimate({ skipOnMobile: true });

  useEffect(() => {
    if (!wrapRef.current) return;

    if (!shouldAnimate) {
      wrapRef.current.querySelectorAll(".pc-pnum").forEach((el) => {
        el.textContent = parseFloat(el.dataset.target).toFixed(1);
      });
      wrapRef.current.querySelectorAll(".pc-fill").forEach((el) => {
        el.style.width = el.dataset.width;
      });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(".pc",
        { opacity: 0, y: 40, scale: 0.92, rotateX: 8 },
        { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.7, ease: "expo.out", stagger: 0.12 }
      );

      wrapRef.current.querySelectorAll(".pc-pnum").forEach((el) => {
        const target = parseFloat(el.dataset.target);
        gsap.fromTo(el,
          { textContent: 0 },
          {
            textContent: target,
            duration: 1.4,
            delay: 0.3,
            ease: "power2.out",
            snap: { textContent: 0.1 },
            onUpdate() { el.textContent = parseFloat(el.textContent).toFixed(1); },
          }
        );
      });

      gsap.fromTo(".pc-fill",
        { width: 0 },
        { width: (i, el) => el.dataset.width, duration: 1.2, delay: 0.4, ease: "expo.out", stagger: 0.1 }
      );
    }, wrapRef.current);

    return () => ctx.revert();
  }, [shouldAnimate]);

  return (
    <div className="podium-wrap" ref={wrapRef}>
      <SectionHeader
        label="Predicted Podium"
        sub="ML · LightGBM · v8.0"
      />
      <div className="podium-grid">
        {top3.map((d, i) => {
          const drv = gd(d.FullName);
          const pct = d.CombinedScore * 100;
          const rel = (pct / (maxProb * 100)) * 100;

          let confLabel = "LOW CONFIDENCE";
          let confClass = "conf-low";
          if (pct >= 60) {
            confLabel = "HIGH CONFIDENCE";
            confClass = "conf-high";
          } else if (pct >= 30) {
            confLabel = "MODERATE";
            confClass = "conf-med";
          }

          return (
            <div
              className="pc"
              key={d.FullName}
              style={{ borderTopColor: drv.color }}
              onMouseEnter={() => onHover(d.FullName)}
              onMouseLeave={() => onHover(null)}
            >
              <div className="pc-bgnum">0{i + 1}</div>
              <div className="pc-top">
                <div className="pc-plabel">P{i + 1} Position</div>
                <div className={`pc-conf ${confClass}`}>{confLabel}</div>
              </div>
              <div className="pc-short" style={{ color: drv.color }}>{drv.short}</div>
              <div className="pc-fn">{fn(d.FullName)}</div>
              <div className="pc-ln" style={{ color: drv.color }}>{ln(d.FullName)}</div>
              <div className="pc-team">{drv.team}</div>
              <div className="pc-prob">
                <div className="pc-pnum" style={{ color: drv.color }} data-target={pct.toFixed(1)}>0.0</div>
                <div className="pc-plbl">% prediction<br />score</div>
              </div>
              <div className="pc-bar">
                <div className="pc-fill" data-width={`${rel}%`} style={{ width: 0, background: drv.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
