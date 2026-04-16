import { useEffect, useRef } from "react";
import gsap from "gsap";
import "./SectionHeader.css";

export default function SectionHeader({ label, sub }) {
  const shRef = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!shRef.current || hasAnimated.current) return;
    hasAnimated.current = true;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(".sh-bar", { scaleY: 0, transformOrigin: "bottom" }, { scaleY: 1, duration: 0.4 })
        .fromTo(".sh-lbl", { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.35 }, "-=0.15")
        .fromTo(".sh-line", { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, duration: 0.5 }, "-=0.2")
        .fromTo(".sh-sub", { opacity: 0 }, { opacity: 1, duration: 0.3 }, "-=0.15");
    }, shRef.current);
    return () => ctx.revert();
  }, [label]);

  return (
    <div className="sh" ref={shRef}>
      <div className="sh-bar" />
      <div className="sh-lbl">{label}</div>
      <div className="sh-line" />
      {sub && <div className="sh-sub">{sub}</div>}
    </div>
  );
}
