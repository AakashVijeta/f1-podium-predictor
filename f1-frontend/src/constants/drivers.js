export const DRIVERS = {
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

export const MEDALS = ["#F5C518", "#A8A9AD", "#CD7F32"];
export const MEDAL_LABELS = ["WINNER", "2ND PLACE", "3RD PLACE"];
export const API_BASE = "https://api.aakashvijeta.me";

// Get driver info, fallback for unknowns
export const gd = (n) =>
  DRIVERS[n] || {
    team: "Unknown",
    color: "#555",
    short: n.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
    number: "?",
  };

// First name
export const fn = (n) => n.split(" ")[0];

// Last name (everything after first word)
export const ln = (n) => {
  const p = n.split(" ");
  return p.slice(1).join(" ") || p[0];
};
