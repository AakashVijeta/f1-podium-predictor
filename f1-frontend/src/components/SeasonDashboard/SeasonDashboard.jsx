import { useState, useEffect, useRef } from "react";
import SectionHeader from "../SectionHeader/SectionHeader";
import { API_BASE } from "../../constants/drivers";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./SeasonDashboard.css";

gsap.registerPlugin(ScrollTrigger);

export default function SeasonDashboard({ year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const sdRef = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/accuracy/${year}`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch accuracy data", err);
        setLoading(false);
      });
  }, [year]);

  useEffect(() => {
    if (!sdRef.current || !data || hasAnimated.current) return;
    hasAnimated.current = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(".sd-statbox",
        { opacity: 0, y: 25 },
        {
          opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.15,
          scrollTrigger: { trigger: ".sd-stats", start: "top 90%", once: true },
        }
      );
      sdRef.current.querySelectorAll(".sd-sbig").forEach((el) => {
        const val = parseInt(el.textContent, 10);
        gsap.fromTo(el,
          { textContent: 0 },
          {
            textContent: val, duration: 1.2, ease: "power2.out",
            snap: { textContent: 1 },
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          }
        );
      });
      gsap.fromTo(".sd-card",
        { opacity: 0, y: 20, scale: 0.9 },
        {
          opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.2)", stagger: 0.06,
          scrollTrigger: { trigger: ".sd-grid", start: "top 90%", once: true },
        }
      );
    }, sdRef.current);
    return () => ctx.revert();
  }, [data]);

  if (loading) {
    return (
      <div className="sd-wrap">
        <SectionHeader label={`${year} Season`} sub="Model Accuracy Tracker" />
        <div className="sd-loading">Loading season accuracy metrics...</div>
      </div>
    );
  }

  if (!data || data.rounds_analyzed === 0) {
    return null;
  }

  const winnerPct = ((data.winner_correct / data.rounds_analyzed) * 100).toFixed(0);
  const podiumPct = ((data.podium_correct / data.total_podium_slots) * 100).toFixed(0);

  return (
    <div className="sd-wrap" ref={sdRef}>
      <SectionHeader
        label={`${year} Season`}
        sub="Model Accuracy Tracker"
      />

      <div className="sd-stats">
        <div className="sd-statbox">
          <div className="sd-slabel">Winner Correct</div>
          <div className="sd-sval">
            <span className="sd-sbig">{data.winner_correct}</span> / {data.rounds_analyzed}
            <span className="sd-spct">({winnerPct}%)</span>
          </div>
        </div>
        <div className="sd-statbox">
          <div className="sd-slabel">Podium Drivers Predicted</div>
          <div className="sd-sval">
            <span className="sd-sbig">{data.podium_correct}</span> / {data.total_podium_slots}
            <span className="sd-spct">({podiumPct}%)</span>
          </div>
        </div>
      </div>

      <div className="sd-history">
        <div className="sd-h-title">Per-Round Breakdown</div>
        <div className="sd-grid">
          {data.history.map((h, i) => (
            <div className={`sd-card ${h.winner_correct ? "sd-hit" : "sd-miss"}`} key={i}>
              <div className="sd-rnum">R{String(h.round).padStart(2, "0")}</div>
              <div className="sd-rdetail">
                <div className="sd-rmetric">
                  <span className="sd-mlbl">Winner</span>
                  {h.winner_correct ? <span className="sd-tick">✓ Correct</span> : <span className="sd-cross">✗ Missed</span>}
                </div>
                <div className="sd-rmetric">
                  <span className="sd-mlbl">Podium</span>
                  <span className="sd-mtext">{h.podium_hits} / 3 Hit</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
