export const DRIVERS = {
  // Mercedes
  "George Russell":    { team: "Mercedes", color: "#00D2BE", short: "RUS", number: 63 },
  "Kimi Antonelli":    { team: "Mercedes", color: "#00D2BE", short: "ANT", number: 12 },

  // Ferrari
  "Lewis Hamilton":    { team: "Ferrari", color: "#DC0000", short: "HAM", number: 44 },
  "Charles Leclerc":   { team: "Ferrari", color: "#DC0000", short: "LEC", number: 16 },

  // Red Bull
  "Max Verstappen":    { team: "Red Bull", color: "#3671C6", short: "VER", number: 1 },
  "Isack Hadjar":      { team: "Red Bull", color: "#3671C6", short: "HAD", number: 6 },

  // McLaren
  "Lando Norris":      { team: "McLaren", color: "#FF8000", short: "NOR", number: 4 },
  "Oscar Piastri":     { team: "McLaren", color: "#FF8000", short: "PIA", number: 81 },

  // Aston Martin
  "Fernando Alonso":   { team: "Aston Martin", color: "#358C75", short: "ALO", number: 14 },
  "Lance Stroll":      { team: "Aston Martin", color: "#358C75", short: "STR", number: 18 },

  // Alpine
  "Pierre Gasly":      { team: "Alpine", color: "#0093CC", short: "GAS", number: 10 },

  // Williams
  "Carlos Sainz":      { team: "Williams", color: "#005AFF", short: "SAI", number: 55 },
  "Alexander Albon":   { team: "Williams", color: "#005AFF", short: "ALB", number: 23 },

  // Racing Bulls
  "Liam Lawson":       { team: "Racing Bulls", color: "#6692FF", short: "LAW", number: 30 },
  "Arvid Lindblad":    { team: "Racing Bulls", color: "#6692FF", short: "LIN", number: 41 },

  // Haas
  "Esteban Ocon":      { team: "Haas", color: "#B6BABD", short: "OCO", number: 31 },
  "Oliver Bearman":    { team: "Haas", color: "#B6BABD", short: "BEA", number: 87 },

  // Audi (Sauber)
  "Nico Hulkenberg":   { team: "Audi", color: "#52E252", short: "HUL", number: 27 },
  "Gabriel Bortoleto": { team: "Audi", color: "#52E252", short: "BOR", number: 5 },

  // Cadillac
  "Sergio Perez":      { team: "Cadillac", color: "#C8A600", short: "PER", number: 11 },
  "Valtteri Bottas":   { team: "Cadillac", color: "#C8A600", short: "BOT", number: 77 },
};

export const MEDALS = ["#F5C518", "#A8A9AD", "#CD7F32"];
export const MEDAL_LABELS = ["WINNER", "2ND PLACE", "3RD PLACE"];
// export const API_BASE = "https://api.aakashvijeta.me";

// testing
export const API_BASE = "http://127.0.0.1:8000";

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