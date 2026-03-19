import { useState, useEffect } from "react";

const ROUNDS_2026 = [
  { round: 1,  name: "Australian Grand Prix",   location: "Melbourne",         flag: "🇦🇺", circuit: "Albert Park Circuit",                  type: "permanent" },
  { round: 2,  name: "Chinese Grand Prix",       location: "Shanghai",          flag: "🇨🇳", circuit: "Shanghai International Circuit",       type: "permanent" },
  { round: 3,  name: "Japanese Grand Prix",      location: "Suzuka",            flag: "🇯🇵", circuit: "Suzuka Circuit",                        type: "permanent" },
  { round: 4,  name: "Miami Grand Prix",         location: "Miami Gardens",     flag: "🇺🇸", circuit: "Miami International Autodrome",        type: "street"    },
  { round: 5,  name: "Canadian Grand Prix",      location: "Montréal",          flag: "🇨🇦", circuit: "Circuit Gilles Villeneuve",             type: "permanent" },
  { round: 6,  name: "Monaco Grand Prix",        location: "Monte Carlo",       flag: "🇲🇨", circuit: "Circuit de Monaco",                    type: "street"    },
  { round: 7,  name: "Barcelona Grand Prix",     location: "Barcelona",         flag: "🇪🇸", circuit: "Circuit de Barcelona-Catalunya",       type: "permanent" },
  { round: 8,  name: "Austrian Grand Prix",      location: "Spielberg",         flag: "🇦🇹", circuit: "Red Bull Ring",                        type: "permanent" },
  { round: 9,  name: "British Grand Prix",       location: "Silverstone",       flag: "🇬🇧", circuit: "Silverstone Circuit",                  type: "permanent" },
  { round: 10, name: "Belgian Grand Prix",       location: "Spa-Francorchamps", flag: "🇧🇪", circuit: "Circuit de Spa-Francorchamps",         type: "permanent" },
  { round: 11, name: "Hungarian Grand Prix",     location: "Budapest",          flag: "🇭🇺", circuit: "Hungaroring",                          type: "permanent" },
  { round: 12, name: "Dutch Grand Prix",         location: "Zandvoort",         flag: "🇳🇱", circuit: "Circuit Zandvoort",                    type: "permanent" },
  { round: 13, name: "Italian Grand Prix",       location: "Monza",             flag: "🇮🇹", circuit: "Autodromo Nazionale Monza",            type: "permanent" },
  { round: 14, name: "Spanish Grand Prix",       location: "Madrid",            flag: "🇪🇸", circuit: "Circuit de Madrid",                    type: "street"    },
  { round: 15, name: "Azerbaijan Grand Prix",    location: "Baku",              flag: "🇦🇿", circuit: "Baku City Circuit",                    type: "street"    },
  { round: 16, name: "Singapore Grand Prix",     location: "Marina Bay",        flag: "🇸🇬", circuit: "Marina Bay Street Circuit",            type: "street"    },
  { round: 17, name: "United States Grand Prix", location: "Austin",            flag: "🇺🇸", circuit: "Circuit of the Americas",              type: "permanent" },
  { round: 18, name: "Mexico City Grand Prix",   location: "Mexico City",       flag: "🇲🇽", circuit: "Autodromo Hermanos Rodriguez",         type: "permanent" },
  { round: 19, name: "São Paulo Grand Prix",     location: "São Paulo",         flag: "🇧🇷", circuit: "Autodromo Jose Carlos Pace",           type: "permanent" },
  { round: 20, name: "Las Vegas Grand Prix",     location: "Las Vegas",         flag: "🇺🇸", circuit: "Las Vegas Strip Circuit",              type: "street"    },
  { round: 21, name: "Qatar Grand Prix",         location: "Lusail",            flag: "🇶🇦", circuit: "Lusail International Circuit",         type: "permanent" },
  { round: 22, name: "Abu Dhabi Grand Prix",     location: "Yas Marina",        flag: "🇦🇪", circuit: "Yas Marina Circuit",                   type: "permanent" },
];

const DRIVERS = {
  "Lewis Hamilton":    { team: "Ferrari",       color: "#DC0000", short: "HAM", number: 44 },
  "George Russell":    { team: "Mercedes",      color: "#00D2BE", short: "RUS", number: 63 },
  "Kimi Antonelli":    { team: "Mercedes",      color: "#00D2BE", short: "ANT", number: 12 },
  "Max Verstappen":    { team: "Red Bull",      color: "#3671C6", short: "VER", number: 1  },
  "Liam Lawson":       { team: "Red Bull",      color: "#3671C6", short: "LAW", number: 30 },
  "Charles Leclerc":   { team: "Ferrari",       color: "#DC0000", short: "LEC", number: 16 },
  "Carlos Sainz":      { team: "Williams",      color: "#005AFF", short: "SAI", number: 55 },
  "Lando Norris":      { team: "McLaren",       color: "#FF8000", short: "NOR", number: 4  },
  "Oscar Piastri":     { team: "McLaren",       color: "#FF8000", short: "PIA", number: 81 },
  "Fernando Alonso":   { team: "Aston Martin",  color: "#358C75", short: "ALO", number: 14 },
  "Lance Stroll":      { team: "Aston Martin",  color: "#358C75", short: "STR", number: 18 },
  "Nico Hülkenberg":   { team: "Haas",          color: "#B6BABD", short: "HUL", number: 27 },
  "Kevin Magnussen":   { team: "Haas",          color: "#B6BABD", short: "MAG", number: 20 },
  "Pierre Gasly":      { team: "Alpine",        color: "#0093CC", short: "GAS", number: 10 },
  "Esteban Ocon":      { team: "Alpine",        color: "#0093CC", short: "OCO", number: 31 },
  "Alexander Albon":   { team: "Williams",      color: "#005AFF", short: "ALB", number: 23 },
  "Yuki Tsunoda":      { team: "RB",            color: "#6692FF", short: "TSU", number: 22 },
  "Daniel Ricciardo":  { team: "RB",            color: "#6692FF", short: "RIC", number: 3  },
  "Valtteri Bottas":   { team: "Kick Sauber",   color: "#52E252", short: "BOT", number: 77 },
  "Zhou Guanyu":       { team: "Kick Sauber",   color: "#52E252", short: "ZHO", number: 24 },
};

const API_BASE = "http://127.0.0.1:8000";
const gd = n => DRIVERS[n] || { team: "Unknown", color: "#555", short: n.split(" ").map(w=>w[0]).join("").slice(0,3).toUpperCase(), number: "?" };
const ln = n => { const p = n.split(" "); return p.slice(1).join(" ") || p[0]; };
const fn = n => n.split(" ")[0];
const MEDALS = ["#F5C518","#A8A9AD","#CD7F32"];
const MEDAL_LABELS = ["WINNER","2ND PLACE","3RD PLACE"];

export default function App() {
  const [round, setRound] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const race = ROUNDS_2026.find(r => r.round === round);

  useEffect(() => {
    setLoading(true); setError(null); setData(null);
    fetch(`${API_BASE}/predict/2026/${round}`)
      .then(r => r.json()).then(setData)
      .catch(() => setError("Cannot reach API — make sure uvicorn is running."))
      .finally(() => setLoading(false));
  }, [round]);

  const sorted = data?.predictions
    ? [...data.predictions].sort((a,b) => b.PodiumProbability - a.PodiumProbability)
    : [];
  const top3 = sorted.slice(0,3);
  const raceResults = data?.results || [];
  const maxProb = sorted[0]?.PodiumProbability || 1;

  const statusColor = data?.status === "pre_race" ? "#22c55e" : data?.status === "post_race" ? "#e8000d" : "#444";
  const statusBg    = data?.status === "pre_race" ? "rgba(34,197,94,0.08)" : data?.status === "post_race" ? "rgba(232,0,13,0.08)" : "transparent";
  const statusLabel = data?.status === "pre_race" ? "Race Pending" : data?.status === "post_race" ? "Completed" : "Pre-Qualifying";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700;900&family=Barlow+Condensed:wght@300;400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #080808; min-height: 100vh; }
        :root { --red:#e8000d; --bg:#080808; --bg1:#0e0e0e; --bg2:#131313; --bg3:#181818; --border:rgba(255,255,255,0.055); --text:#f0ede8; }
        .app { min-height: 100vh; background: var(--bg); color: var(--text); font-family: 'Titillium Web', sans-serif; }

        /* HEADER */
        .hdr { position: sticky; top:0; z-index:100; display:flex; align-items:stretch; background:#090909; border-bottom:1px solid var(--border); height:50px; }
        .hdr-logo { display:flex; align-items:center; background:var(--red); padding:0 1.1rem 0 1rem; font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:1.35rem; color:#fff; clip-path:polygon(0 0,calc(100% - 8px) 0,100% 100%,0 100%); padding-right:1.5rem; flex-shrink:0; letter-spacing:0.02em; }
        .hdr-mid { flex:1; display:flex; align-items:center; padding:0 1.75rem; gap:1.5rem; }
        .hdr-app { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:0.78rem; letter-spacing:0.25em; color:#3a3a3a; text-transform:uppercase; }
        .hdr-race { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:0.88rem; letter-spacing:0.1em; color:#666; text-transform:uppercase; }
        .hdr-right { display:flex; align-items:center; padding:0 1.25rem; border-left:1px solid var(--border); gap:0.6rem; }
        .hdr-status { display:flex; align-items:center; gap:6px; font-family:'Barlow Condensed',sans-serif; font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; padding:4px 10px; border:1px solid; }
        .hdr-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }

        /* RACE HERO */
        .hero { display:flex; align-items:stretch; background:var(--bg1); border-bottom:1px solid var(--border); }
        .hero-flag { display:flex; align-items:center; justify-content:center; min-width:96px; font-size:3rem; line-height:1; background:var(--bg2); border-right:1px solid var(--border); flex-shrink:0; }
        .hero-info { flex:1; padding:1.1rem 1.75rem; display:flex; flex-direction:column; justify-content:center; gap:0.18rem; }
        .hero-round { font-family:'Barlow Condensed',sans-serif; font-size:0.6rem; font-weight:700; letter-spacing:0.22em; color:var(--red); text-transform:uppercase; }
        .hero-name { font-family:'Barlow Condensed',sans-serif; font-size:1.65rem; font-weight:900; letter-spacing:0.04em; text-transform:uppercase; line-height:1; }
        .hero-circuit { font-size:0.7rem; color:#3a3a3a; letter-spacing:0.1em; text-transform:uppercase; margin-top:0.1rem; }
        .hero-badge { display:inline-flex; align-items:center; gap:4px; font-size:0.56rem; font-weight:700; letter-spacing:0.12em; color:#333; border:1px solid #1e1e1e; padding:2px 8px; margin-top:0.35rem; text-transform:uppercase; width:fit-content; }
        .hero-sel { display:flex; align-items:center; padding:1rem 1.75rem; border-left:1px solid var(--border); flex-shrink:0; }
        .sel-wrap { position:relative; }
        .race-sel { background:var(--bg2); border:1px solid #1e1e1e; border-left:3px solid var(--red); color:var(--text); padding:0.55rem 2.2rem 0.55rem 0.8rem; font-family:'Titillium Web',sans-serif; font-size:0.8rem; font-weight:600; appearance:none; cursor:pointer; min-width:260px; }
        .race-sel:focus { outline:none; }
        .sel-arr { position:absolute; right:0.65rem; top:50%; transform:translateY(-50%); color:var(--red); pointer-events:none; font-size:0.6rem; }

        /* SEC HEADER */
        .sh { display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem; }
        .sh-bar { width:3px; height:16px; background:var(--red); flex-shrink:0; }
        .sh-lbl { font-family:'Barlow Condensed',sans-serif; font-size:0.65rem; font-weight:700; letter-spacing:0.25em; color:#333; text-transform:uppercase; white-space:nowrap; }
        .sh-line { flex:1; height:1px; background:var(--border); }
        .sh-sub { font-family:'Barlow Condensed',sans-serif; font-size:0.6rem; color:#252525; letter-spacing:0.1em; white-space:nowrap; }

        /* PRE-RACE: PODIUM */
        .podium-wrap { padding:2rem 2rem 0; }
        .podium-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:2px; }
        .pc { background:var(--bg1); padding:2rem 1.75rem; position:relative; overflow:hidden; border-top:3px solid; transition:background 0.15s; cursor:default; }
        .pc:hover { background:var(--bg2); }
        .pc-bgnum { position:absolute; right:-0.75rem; bottom:-2rem; font-family:'Barlow Condensed',sans-serif; font-size:11rem; font-weight:900; color:rgba(255,255,255,0.018); line-height:1; pointer-events:none; letter-spacing:-0.05em; }
        .pc-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; }
        .pc-plabel { font-family:'Barlow Condensed',sans-serif; font-size:0.58rem; font-weight:700; letter-spacing:0.2em; color:#252525; text-transform:uppercase; }
        .pc-short { font-family:'Barlow Condensed',sans-serif; font-size:0.95rem; font-weight:900; letter-spacing:0.1em; }
        .pc-fn { font-size:0.65rem; color:#383838; text-transform:uppercase; letter-spacing:0.14em; line-height:1; }
        .pc-ln { font-family:'Barlow Condensed',sans-serif; font-size:2.6rem; font-weight:900; letter-spacing:0.03em; text-transform:uppercase; line-height:0.9; margin-top:0.12rem; }
        .pc-team { font-size:0.62rem; color:#2e2e2e; text-transform:uppercase; letter-spacing:0.12em; margin-top:0.35rem; }
        .pc-prob { display:flex; align-items:baseline; gap:0.3rem; margin-top:1.5rem; }
        .pc-pnum { font-family:'Barlow Condensed',sans-serif; font-size:3.2rem; font-weight:700; line-height:1; }
        .pc-plbl { font-size:0.58rem; color:#252525; letter-spacing:0.12em; text-transform:uppercase; padding-bottom:0.4rem; }
        .pc-bar { height:2px; background:rgba(255,255,255,0.04); margin-top:1rem; }
        .pc-fill { height:100%; transition:width 1s cubic-bezier(0.16,1,0.3,1); }

        /* PRE-RACE: GRID TABLE */
        .grid-wrap { padding:1.75rem 2rem 2rem; border-top:1px solid var(--border); }
        .gtbl { width:100%; border-collapse:collapse; }
        .gr { border-bottom:1px solid rgba(255,255,255,0.03); transition:background 0.1s; }
        .gr:hover, .gr.hl { background:var(--bg2); }
        .gr td { padding:0.65rem 0.45rem; vertical-align:middle; }
        .td-i { width:28px; font-family:'Barlow Condensed',sans-serif; font-size:0.72rem; color:#222; text-align:center; }
        .td-stripe { width:3px; padding:0 !important; }
        .td-stripe-bar { width:100%; min-height:32px; }
        .td-code { width:50px; font-family:'Barlow Condensed',sans-serif; font-size:0.88rem; font-weight:900; letter-spacing:0.08em; }
        .td-drv .ln2 { font-size:0.85rem; font-weight:700; display:block; line-height:1.1; }
        .td-drv .fn2 { font-size:0.6rem; color:#2e2e2e; letter-spacing:0.1em; text-transform:uppercase; }
        .td-team2 { font-size:0.62rem; color:#252525; letter-spacing:0.07em; text-transform:uppercase; width:130px; }
        .td-num2 { width:36px; font-family:'Barlow Condensed',sans-serif; font-size:0.72rem; color:#1e1e1e; text-align:center; }
        .td-barcol { width:25%; }
        .bt { height:2px; background:rgba(255,255,255,0.035); }
        .bf { height:100%; transition:width 1s cubic-bezier(0.16,1,0.3,1); }
        .td-pct { width:52px; text-align:right; font-family:'Barlow Condensed',sans-serif; font-size:0.88rem; color:#222; }
        .td-pct.m { color:#666; } .td-pct.h { color:#ccc; } .td-pct.t { color:var(--text); }

        /* POST-RACE */
        .postrace-wrap { padding:2rem; }
        .podium3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:2px; margin-bottom:2px; }
        .rc { position:relative; overflow:hidden; background:var(--bg1); border-top:4px solid; padding:2.5rem 2rem; }
        .rc-bgnum { position:absolute; right:-1rem; top:50%; transform:translateY(-50%); font-family:'Barlow Condensed',sans-serif; font-size:12rem; font-weight:900; color:rgba(255,255,255,0.02); line-height:1; pointer-events:none; letter-spacing:-0.05em; }
        .rc-medal { font-family:'Barlow Condensed',sans-serif; font-size:0.6rem; font-weight:700; letter-spacing:0.22em; text-transform:uppercase; margin-bottom:1.25rem; }
        .rc-pos { font-family:'Barlow Condensed',sans-serif; font-size:4rem; font-weight:900; line-height:1; margin-bottom:0.5rem; }
        .rc-short { font-family:'Barlow Condensed',sans-serif; font-size:1rem; font-weight:900; letter-spacing:0.1em; margin-bottom:1rem; }
        .rc-fn2 { font-size:0.68rem; color:#555; text-transform:uppercase; letter-spacing:0.14em; line-height:1; }
        .rc-ln2 { font-family:'Barlow Condensed',sans-serif; font-size:3rem; font-weight:900; letter-spacing:0.03em; text-transform:uppercase; line-height:0.95; margin-top:0.1rem; }
        .rc-team2 { font-size:0.65rem; color:#444; text-transform:uppercase; letter-spacing:0.12em; margin-top:0.4rem; }
        .rc-flag { font-size:2.5rem; margin-top:1.5rem; }
        .rc-bar { height:3px; margin-top:1.5rem; opacity:0.3; }

        /* Race info strip */
        .info-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:2px; }
        .istat { background:var(--bg1); padding:1.25rem 1.5rem; }
        .istat-lbl { font-size:0.6rem; color:#444; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:0.4rem; }
        .istat-val { font-family:'Barlow Condensed',sans-serif; font-size:1.2rem; font-weight:700; color:#888; line-height:1; }
        .istat-sub { font-size:0.65rem; color:#444; letter-spacing:0.08em; text-transform:uppercase; margin-top:0.2rem; }

        /* States */
        .state-s { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center; gap:1rem; }
        .state-ico { font-size:3rem; }
        .state-t { font-family:'Barlow Condensed',sans-serif; font-size:1.1rem; font-weight:700; letter-spacing:0.22em; color:#252525; text-transform:uppercase; }
        .state-sub2 { font-size:0.7rem; color:#1e1e1e; letter-spacing:0.1em; }
        .loading-s { display:flex; align-items:center; justify-content:center; min-height:60vh; font-family:'Barlow Condensed',sans-serif; font-size:0.65rem; letter-spacing:0.35em; color:#1a1a1a; text-transform:uppercase; animation:pulse 1.2s infinite; }
        .err-s { background:rgba(232,0,13,0.05); border-bottom:1px solid rgba(232,0,13,0.12); padding:0.85rem 2rem; font-size:0.78rem; color:var(--red); }
        .checker { height:8px; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23fff'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23fff'/%3E%3Crect x='8' width='8' height='8' fill='%23000'/%3E%3Crect y='8' width='8' height='8' fill='%23000'/%3E%3C/svg%3E"); background-size:8px 8px; opacity:0.06; margin-top:2px; }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fade { animation:fadeUp 0.38s ease both; }
        select option { background:#111; }
      `}</style>

      <div className="app">

        {/* HEADER */}
        <div className="hdr">
          <div className="hdr-logo">F1</div>
          <div className="hdr-mid">
            <div className="hdr-app">Podium Predictor</div>
            {race && <div className="hdr-race">{race.flag} {race.name}</div>}
          </div>
          <div className="hdr-right">
            {data && (
              <div className="hdr-status" style={{ color:statusColor, borderColor:statusColor+"44", background:statusBg }}>
                <div className="hdr-dot" style={{ background:statusColor, animation: data.status==="pre_race"?"pulse 1.5s infinite":"none" }} />
                {statusLabel}
              </div>
            )}
          </div>
        </div>

        {/* HERO */}
        <div className="hero">
          <div className="hero-flag">{race?.flag}</div>
          <div className="hero-info">
            <div className="hero-round">Round {String(round).padStart(2,"0")} · 2026 FIA Formula One World Championship</div>
            <div className="hero-name">{race?.name}</div>
            <div className="hero-circuit">{race?.circuit} · {race?.location}</div>
            <div className="hero-badge">
              <span style={{ width:5,height:5,borderRadius:"50%",background:race?.type==="street"?"var(--red)":"#444",display:"inline-block" }}/>
              {race?.type==="street" ? "Street Circuit" : "Permanent Circuit"}
            </div>
          </div>
          <div className="hero-sel">
            <div className="sel-wrap">
              <select className="race-sel" value={round} onChange={e=>setRound(Number(e.target.value))}>
                {ROUNDS_2026.map(r=>(
                  <option key={r.round} value={r.round}>R{String(r.round).padStart(2,"0")} — {r.name}</option>
                ))}
              </select>
              <div className="sel-arr">▼</div>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        {loading && <div className="loading-s">Loading race data...</div>}
        {error && <div className="err-s">{error}</div>}

        {/* PRE-QUALI */}
        {!loading && data?.status==="pre_quali" && (
          <div className="state-s fade">
            <div className="state-ico">⏱</div>
            <div className="state-t">Qualifying not yet started</div>
            <div className="state-sub2">Predictions will appear after the qualifying session</div>
          </div>
        )}

        {/* PRE-RACE */}
        {!loading && data?.status==="pre_race" && sorted.length>0 && (
          <div className="fade">
            <div className="podium-wrap">
              <div className="sh">
                <div className="sh-bar"/><div className="sh-lbl">Predicted Podium</div><div className="sh-line"/><div className="sh-sub">ML · GradientBoostingClassifier · v4.0</div>
              </div>
              <div className="podium-grid">
                {top3.map((d,i)=>{
                  const drv=gd(d.FullName);
                  const pct=d.PodiumProbability*100;
                  const rel=(pct/(maxProb*100))*100;
                  return (
                    <div className="pc" key={d.FullName} style={{ borderTopColor:drv.color, animationDelay:`${i*0.07}s` }}
                      onMouseEnter={()=>setHovered(d.FullName)} onMouseLeave={()=>setHovered(null)}>
                      <div className="pc-bgnum">0{i+1}</div>
                      <div className="pc-top">
                        <div className="pc-plabel">P{i+1} Position</div>
                        <div className="pc-short" style={{color:drv.color}}>{drv.short}</div>
                      </div>
                      <div className="pc-fn">{fn(d.FullName)}</div>
                      <div className="pc-ln" style={{color:drv.color}}>{ln(d.FullName)}</div>
                      <div className="pc-team">{drv.team}</div>
                      <div className="pc-prob">
                        <div className="pc-pnum" style={{color:drv.color}}>{pct.toFixed(1)}</div>
                        <div className="pc-plbl">% podium<br/>probability</div>
                      </div>
                      <div className="pc-bar"><div className="pc-fill" style={{width:`${rel}%`,background:drv.color}}/></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid-wrap">
              <div className="sh">
                <div className="sh-bar"/><div className="sh-lbl">Full Grid · Podium Probability</div><div className="sh-line"/><div className="sh-sub">{sorted.length} drivers</div>
              </div>
              <table className="gtbl">
                <tbody>
                  {sorted.map((d,i)=>{
                    const drv=gd(d.FullName);
                    const pct=d.PodiumProbability*100;
                    const rel=(pct/(maxProb*100))*100;
                    const cls=pct>55?"t":pct>30?"h":pct>12?"m":"";
                    return (
                      <tr className={`gr ${hovered===d.FullName?"hl":""}`} key={d.FullName}
                        onMouseEnter={()=>setHovered(d.FullName)} onMouseLeave={()=>setHovered(null)}>
                        <td className="td-i">{i+1}</td>
                        <td className="td-stripe"><div className="td-stripe-bar" style={{background:drv.color}}/></td>
                        <td className="td-code" style={{color:drv.color}}>{drv.short}</td>
                        <td className="td-drv">
                          <span className="fn2">{fn(d.FullName)}</span>
                          <span className="ln2">{ln(d.FullName)}</span>
                        </td>
                        <td className="td-team2">{drv.team}</td>
                        <td className="td-num2">#{drv.number}</td>
                        <td className="td-barcol"><div className="bt"><div className="bf" style={{width:`${rel}%`,background:drv.color}}/></div></td>
                        <td className={`td-pct ${cls}`}>{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* POST-RACE */}
        {!loading && data?.status==="post_race" && raceResults.length>0 && (
          <div className="postrace-wrap fade">
            <div className="sh">
              <div className="sh-bar"/><div className="sh-lbl">Race Podium</div><div className="sh-line"/><div className="sh-sub">Official Results · {race?.name}</div>
            </div>

            {/* Big 3 podium cards */}
            <div className="podium3">
              {raceResults.map((r,i)=>{
                const drv=gd(r.FullName);
                const medalColor=MEDALS[r.RacePosition-1];
                return (
                  <div className="rc" key={r.FullName} style={{ borderTopColor:medalColor }}>
                    <div className="rc-bgnum">{drv.short}</div>
                    <div className="rc-medal" style={{color:medalColor}}>{MEDAL_LABELS[r.RacePosition-1]}</div>
                    <div className="rc-pos" style={{color:medalColor}}>P{r.RacePosition}</div>
                    <div className="rc-short" style={{color:drv.color}}>{drv.short}</div>
                    <div className="rc-fn2">{fn(r.FullName)}</div>
                    <div className="rc-ln2" style={{color:drv.color}}>{ln(r.FullName)}</div>
                    <div className="rc-team2">{drv.team}</div>
                    <div className="rc-flag">{race?.flag}</div>
                    <div className="rc-bar" style={{background:drv.color}}/>
                  </div>
                );
              })}
            </div>

            {/* Info strip */}
            <div className="info-strip" style={{marginTop:"2px"}}>
              <div className="istat">
                <div className="istat-lbl">Grand Prix</div>
                <div className="istat-val" style={{fontSize:"0.88rem",fontFamily:"'Titillium Web',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em"}}>{race?.name}</div>
              </div>
              <div className="istat">
                <div className="istat-lbl">Circuit</div>
                <div className="istat-val" style={{fontSize:"0.82rem",fontFamily:"'Titillium Web',sans-serif",fontWeight:600}}>{race?.circuit}</div>
                <div className="istat-sub">{race?.location}</div>
              </div>
              <div className="istat">
                <div className="istat-lbl">Round</div>
                <div className="istat-val">{String(round).padStart(2,"0")} / 22</div>
                <div className="istat-sub">2026 Season</div>
              </div>
              <div className="istat">
                <div className="istat-lbl">Circuit Type</div>
                <div className="istat-val" style={{color:race?.type==="street"?"var(--red)":"#666"}}>{race?.type==="street"?"Street":"Permanent"}</div>
              </div>
            </div>

            {/* Winner highlight */}
            {raceResults[0] && (()=>{
              const w=raceResults[0]; const drv=gd(w.FullName);
              return (
                <div style={{ marginTop:"2px", background:"var(--bg1)", padding:"2rem 2rem", borderTop:`3px solid ${drv.color}`, borderLeft:`1px solid ${drv.color}22`, display:"flex", alignItems:"center", gap:"2rem", position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", right:"-1rem", top:"50%", transform:"translateY(-50%)", fontFamily:"'Barlow Condensed',sans-serif", fontSize:"14rem", fontWeight:900, color:"rgba(255,255,255,0.015)", lineHeight:1, pointerEvents:"none", letterSpacing:"-0.05em" }}>{drv.short}</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"0.65rem", fontWeight:700, letterSpacing:"0.22em", color:MEDALS[0], textTransform:"uppercase" }}>Race Winner</div>
                  <div style={{ width:1, height:40, background:"var(--border)", flexShrink:0 }}/>
                  <div>
                    <div style={{ fontSize:"0.65rem", color:"#555", textTransform:"uppercase", letterSpacing:"0.14em" }}>{fn(w.FullName)}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"2.8rem", fontWeight:900, color:drv.color, letterSpacing:"0.03em", textTransform:"uppercase", lineHeight:0.9 }}>{ln(w.FullName)}</div>
                  </div>
                  <div style={{ width:1, height:40, background:"var(--border)", flexShrink:0 }}/>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"0.62rem", color:"#555", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:"0.2rem" }}>Constructor</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"1.2rem", fontWeight:700, color:"#aaa", letterSpacing:"0.06em", textTransform:"uppercase" }}>{drv.team}</div>
                  </div>
                  <div style={{ width:1, height:40, background:"var(--border)", flexShrink:0 }}/>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"0.62rem", color:"#555", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:"0.2rem" }}>Car Number</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"2rem", fontWeight:900, color:drv.color }}>#{drv.number}</div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="checker"/>
      </div>
    </>
  );
}