import { useEffect, useRef, useState } from "react";
import "./CircuitMap.css";

// bacinger/f1-circuits — MIT-licensed GeoJSONs, served via jsdelivr CDN.
// Round -> circuit code. "Madrid" absent — fallback renders a placeholder.
const CIRCUIT_CODE = {
  1:  "au-1953",  // Albert Park
  2:  "cn-2004",  // Shanghai
  3:  "jp-1962",  // Suzuka
  4:  "us-2022",  // Miami
  5:  "ca-1978",  // Montreal
  6:  "mc-1929",  // Monaco
  7:  "es-1991",  // Barcelona
  8:  "at-1969",  // Red Bull Ring
  9:  "gb-1948",  // Silverstone
  10: "be-1925",  // Spa
  11: "hu-1986",  // Hungaroring
  12: "nl-1948",  // Zandvoort
  13: "it-1922",  // Monza
  // 14: Madrid — no map yet
  15: "az-2016",  // Baku
  16: "sg-2008",  // Marina Bay
  17: "us-2012",  // COTA
  18: "mx-1962",  // Mexico City
  19: "br-1940",  // Interlagos
  20: "us-2023",  // Las Vegas
  21: "qa-2004",  // Lusail
  22: "ae-2009",  // Yas Marina
};

const BASE = "https://cdn.jsdelivr.net/gh/bacinger/f1-circuits@master/circuits";
const _cache = new Map();

async function fetchCircuit(code) {
  if (_cache.has(code)) return _cache.get(code);
  const res = await fetch(`${BASE}/${code}.geojson`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  _cache.set(code, json);
  return json;
}

// Project GeoJSON LineString coords onto a fixed SVG viewBox, preserving aspect.
function buildPath(coords, w = 800, h = 360, pad = 20) {
  if (!coords || coords.length === 0) return { d: "", startMarker: null };
  const xs = coords.map(c => c[0]);
  const ys = coords.map(c => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const scale = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy);
  const offX = (w - dx * scale) / 2;
  const offY = (h - dy * scale) / 2;
  // Flip Y (geo lat increases upward, SVG y increases downward)
  const project = ([x, y]) => [
    offX + (x - minX) * scale,
    h - (offY + (y - minY) * scale),
  ];
  const pts = coords.map(project);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
  const startMarker = pts[0];
  return { d, startMarker };
}

export default function CircuitMap({ race }) {
  const [geo, setGeo] = useState(null);
  const [err, setErr] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const pathRef = useRef(null);

  const code = CIRCUIT_CODE[race?.round];

  useEffect(() => {
    setGeo(null);
    setErr(false);
    setDrawn(false);
    if (!code) { setErr(true); return; }

    let cancelled = false;
    fetchCircuit(code)
      .then(json => { if (!cancelled) setGeo(json); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [code]);

  // Extract LineString coords (GeoJSON shape varies — handle both Feature and FeatureCollection)
  let coords = null;
  if (geo) {
    const feature = geo.type === "FeatureCollection" ? geo.features?.[0] : geo;
    const g = feature?.geometry;
    if (g?.type === "LineString") coords = g.coordinates;
    else if (g?.type === "MultiLineString") coords = g.coordinates[0];
  }

  const { d, startMarker } = coords ? buildPath(coords) : { d: "", startMarker: null };

  // Trigger stroke-draw animation after path renders
  useEffect(() => {
    if (!d || !pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = len;
    pathRef.current.style.strokeDashoffset = len;
    // force reflow then animate
    // eslint-disable-next-line no-unused-expressions
    pathRef.current.getBoundingClientRect();
    pathRef.current.style.transition = "stroke-dashoffset 1.8s cubic-bezier(0.7, 0, 0.3, 1)";
    pathRef.current.style.strokeDashoffset = "0";
    const t = setTimeout(() => setDrawn(true), 1800);
    return () => clearTimeout(t);
  }, [d]);

  return (
    <div className="cm-wrap">
      <div className="cm-head">
        <div className="cm-pipe" />
        <div className="cm-title-block">
          <span className="cm-title">Circuit Layout</span>
          <span className="cm-sub">{race?.circuit || "—"}</span>
        </div>
        <div className="cm-meta">
          <span className="cm-meta-val">{race?.type === "street" ? "STREET" : "PERMANENT"}</span>
          <span className="cm-meta-lbl">Type</span>
        </div>
      </div>

      <div className="cm-stage">
        <svg viewBox="0 0 800 360" className="cm-svg" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <defs>
            <linearGradient id="cm-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ff2222" stopOpacity="0.95" />
            </linearGradient>
            <filter id="cm-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {d && (
            <>
              {/* shadow/underlay */}
              <path d={d} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />
              {/* main track */}
              <path
                ref={pathRef}
                d={d}
                fill="none"
                stroke="url(#cm-stroke)"
                strokeWidth="3.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                filter="url(#cm-glow)"
              />
              {/* start/finish marker */}
              {drawn && startMarker && (
                <>
                  <circle cx={startMarker[0]} cy={startMarker[1]} r="7"
                          fill="#e10600" stroke="#fff" strokeWidth="2"
                          className="cm-start-dot" />
                  <text x={startMarker[0] + 12} y={startMarker[1] + 4}
                        className="cm-start-text" fill="#fff"
                        fontFamily="Barlow Condensed, sans-serif"
                        fontSize="11" fontWeight="800" letterSpacing="0.18em">
                    START
                  </text>
                </>
              )}
            </>
          )}
        </svg>

        {!geo && !err && <div className="cm-placeholder">Loading circuit…</div>}
        {err && (
          <div className="cm-placeholder">
            <span className="cm-placeholder-code">{race?.countryCode?.toUpperCase() ?? "—"}</span>
            <span>Circuit map not available</span>
          </div>
        )}
      </div>
    </div>
  );
}
