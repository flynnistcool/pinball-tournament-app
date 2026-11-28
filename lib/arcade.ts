// 🕹️ Arcade-Modus: Schwierigkeitsgrade, Gegner je Stufe und der Stand eines Laufs (reine Logik).
// Ein Lauf ist ein normales Turnier (Matchplay, 2 Spieler je Match): jede Runde = 1 Duell Spieler vs. Bot.
// Gewonnen → nächste Stufe. Verloren → ein Leben weniger, derselbe Gegner nochmal. Keine Leben mehr → Game Over.
// Abgestimmt mit dem Nutzer am 2026-11-28 (klassische Arcade-Namen, feste Gegner, Freischalten in Schritt 2).

export type ArcadeMode =
  | "easy"
  | "normal"
  | "hard"
  | "expert"
  | "insane"
  | "classic_rush"
  | "monster_rush"
  | "mirror"
  | "random";

/** Gegner einer Stufe. classic = vorhandener Bot (per Name gesucht, sonst angelegt); sonst automatisch angelegt (arcade_key) */
export type ArcadeStageSpec = {
  /** profiles.arcade_key für automatisch angelegte Bots, z. B. "pro:1600" */
  key: string;
  name: string;
  /** Bot-Art (profiles.bot_kind) */
  kind: "fixed" | "pro" | "gambler" | "specialist" | "character" | "champion";
  elo: number;
  /** klassischer Bot (Robo-Rookie …): vorhandenes Profil mit diesem Namen nehmen */
  classic?: boolean;
};

export type ArcadeModeDef = {
  mode: ArcadeMode;
  icon: string;
  label: string;
  /** kurze Beschreibung */
  hint: string;
  lives: number;
  stages: ArcadeStageSpec[];
  /** in der Rangliste (Schritt 2) */
  ranked: boolean;
  /** Gegner werden erst beim Start zusammengestellt (Monster-Rush, Spiegel, Zufall) – stages ist dann leer */
  dynamic?: boolean;
  /** 🔒 erst spielbar, wenn dieser Modus geschafft ist */
  unlockAfter?: ArcadeMode;
};

// —— Gegner (einmal definiert, in mehreren Modi wiederverwendet) ——
const C = {
  rookie: { key: "classic:robo-rookie", name: "Robo-Rookie", kind: "fixed", elo: 1300, classic: true },
  bernd: { key: "classic:blech-bernd", name: "Blech-Bernd", kind: "fixed", elo: 1500, classic: true },
  tilt: { key: "classic:turbo-tilt", name: "Turbo-Tilt", kind: "fixed", elo: 1700, classic: true },
  max: { key: "classic:multiball-max", name: "Multiball-Max", kind: "fixed", elo: 2000, classic: true },
  terminator: { key: "classic:terminator", name: "Terminator", kind: "fixed", elo: 2500, classic: true },
} satisfies Record<string, ArcadeStageSpec>;

const A = {
  f1100: { key: "fixed:1100", name: "Flipper-Fritz", kind: "fixed", elo: 1100 },
  f1200: { key: "fixed:1200", name: "Kugel-Kurt", kind: "fixed", elo: 1200 },
  f1400: { key: "fixed:1400", name: "Tilt-Toni", kind: "fixed", elo: 1400 },
  f1600: { key: "fixed:1600", name: "Bumper-Bob", kind: "fixed", elo: 1600 },
  f1900: { key: "fixed:1900", name: "Rampen-Ronny", kind: "fixed", elo: 1900 },
  f2100: { key: "fixed:2100", name: "Orbit-Olga", kind: "fixed", elo: 2100 },
  p1600: { key: "pro:1600", name: "Pro Petra", kind: "pro", elo: 1600 },
  p2100: { key: "pro:2100", name: "Pro Pablo", kind: "pro", elo: 2100 },
  p2200: { key: "pro:2200", name: "Pro Paula", kind: "pro", elo: 2200 },
  p2300: { key: "pro:2300", name: "Pro Pete", kind: "pro", elo: 2300 },
  g1900: { key: "gambler:1900", name: "Glücks-Gabi", kind: "gambler", elo: 1900 },
  g2200: { key: "gambler:2200", name: "Zocker-Zora", kind: "gambler", elo: 2200 },
  g2300: { key: "gambler:2300", name: "Risiko-Rudi", kind: "gambler", elo: 2300 },
  s1800: { key: "specialist:1800", name: "Spezi-Sam", kind: "specialist", elo: 1800 },
  s2400: { key: "specialist:2400", name: "Spezi-Sophie", kind: "specialist", elo: 2400 },
  c1800: { key: "character:1800", name: "Launen-Lou", kind: "character", elo: 1800 },
  c2100: { key: "character:2100", name: "Diva-Dora", kind: "character", elo: 2100 },
  c2400: { key: "character:2400", name: "Kauz-Karl", kind: "character", elo: 2400 },
  champ: { key: "champion", name: "Der Champion", kind: "champion", elo: 2400 },
} satisfies Record<string, ArcadeStageSpec>;

export const ARCADE_MODES: ArcadeModeDef[] = [
  {
    mode: "easy",
    icon: "🟢",
    label: "Easy",
    hint: "Zum Reinkommen – 5 Stufen, 3 Leben",
    lives: 3,
    ranked: true,
    stages: [A.f1100, A.f1200, C.rookie, A.f1400, C.bernd],
  },
  {
    mode: "normal",
    icon: "🟡",
    label: "Normal",
    hint: "5 Stufen, 3 Leben",
    lives: 3,
    ranked: true,
    unlockAfter: "easy",
    stages: [A.f1400, C.bernd, A.p1600, C.tilt, A.c1800],
  },
  {
    mode: "hard",
    icon: "🟠",
    label: "Hard",
    hint: "6 Stufen, 2 Leben",
    lives: 2,
    ranked: true,
    unlockAfter: "normal",
    stages: [A.f1600, C.tilt, A.s1800, A.g1900, C.max, A.p2100],
  },
  {
    mode: "expert",
    icon: "🔴",
    label: "Expert",
    hint: "6 Stufen, 2 Leben – Endboss 👑 Champion",
    lives: 2,
    ranked: true,
    unlockAfter: "hard",
    stages: [A.f1900, C.max, A.c2100, A.g2200, A.p2300, A.champ],
  },
  {
    mode: "insane",
    icon: "☠️",
    label: "Insane",
    hint: "7 Stufen, 1 Leben – Endboss 🤖 Terminator",
    lives: 1,
    ranked: true,
    unlockAfter: "expert",
    stages: [A.f2100, A.p2200, A.g2300, A.s2400, A.c2400, A.champ, C.terminator],
  },
  {
    mode: "classic_rush",
    icon: "💀",
    label: "Klassik-Rush",
    hint: "Die 5 klassischen Bots, 1 Leben",
    lives: 1,
    ranked: true,
    unlockAfter: "normal",
    stages: [C.rookie, C.bernd, C.tilt, C.max, C.terminator],
  },
  {
    mode: "monster_rush",
    icon: "☠️",
    label: "Monster-Rush",
    hint: "Alle deine Bots mit fester Elo, 👑 Champion + 🤖 Terminator am Ende, 1 Leben",
    lives: 1,
    ranked: true,
    dynamic: true,
    unlockAfter: "expert",
    stages: [],
  },
  {
    mode: "mirror",
    icon: "🪞",
    label: "Spiegel",
    hint: "Gegen dich selbst: Form → Ghost → Rivale → Ghost des Besten, 2 Leben (ohne Rangliste)",
    lives: 2,
    ranked: false,
    dynamic: true,
    stages: [],
  },
  {
    mode: "random",
    icon: "🎲",
    label: "Zufall",
    hint: "5 zufällige Bots (1300–2100), 2 Leben (ohne Rangliste)",
    lives: 2,
    ranked: false,
    dynamic: true,
    stages: [],
  },
];

/** Freischalten: Modus offen, wenn er keine Voraussetzung hat oder die Voraussetzung geschafft ist */
export function arcadeUnlocked(def: ArcadeModeDef, cleared: ReadonlySet<string>): boolean {
  return !def.unlockAfter || cleared.has(def.unlockAfter);
}

/** Rangliste: bester Lauf je Spieler – mehr Stufen (Anteil) zuerst, dann mehr übrige Leben, dann früher */
export type ArcadeRun = {
  tournamentId: string;
  code: string;
  profileId: string;
  playerName: string;
  mode: string;
  stagesTotal: number;
  wins: number;
  livesStart: number;
  livesLeft: number;
  status: "playing" | "cleared" | "gameover";
  finished: boolean;
  at: string | null;
  format: string | null;
};

export function compareArcadeRuns(a: ArcadeRun, b: ArcadeRun): number {
  const pa = a.stagesTotal ? a.wins / a.stagesTotal : 0;
  const pb = b.stagesTotal ? b.wins / b.stagesTotal : 0;
  return pb - pa || b.livesLeft - a.livesLeft || String(a.at ?? "").localeCompare(String(b.at ?? ""));
}

export function arcadeModeDef(mode: string | null | undefined): ArcadeModeDef | null {
  return ARCADE_MODES.find((m) => m.mode === mode) ?? null;
}

/** alle Bots, die der Arcade-Modus braucht (ohne Doppelte) */
export function allArcadeStageSpecs(): ArcadeStageSpec[] {
  const seen = new Map<string, ArcadeStageSpec>();
  for (const m of ARCADE_MODES) for (const s of m.stages) if (!seen.has(s.key)) seen.set(s.key, s);
  return Array.from(seen.values());
}

// —— Stand eines Laufs ——

/** Ergebnis einer Runde aus Sicht des Spielers: true = gewonnen, false = verloren, null = noch offen */
export type ArcadeDuel = { roundNumber: number; won: boolean | null };

export type ArcadeState = {
  /** Index der aktuellen bzw. nächsten Stufe (0-basiert) = Anzahl Siege */
  stage: number;
  stagesTotal: number;
  wins: number;
  losses: number;
  livesStart: number;
  livesLeft: number;
  /** läuft gerade ein Duell (Ergebnis offen)? */
  open: boolean;
  status: "playing" | "cleared" | "gameover";
  /** Versuche je Stufe (Index = Stufe): verloren / gewonnen */
  attempts: { losses: number; won: boolean }[];
};

export function arcadeState(stagesTotal: number, livesStart: number, duels: readonly ArcadeDuel[]): ArcadeState {
  const sorted = [...duels].sort((a, b) => a.roundNumber - b.roundNumber);
  let wins = 0;
  let losses = 0;
  let open = false;
  const attempts = Array.from({ length: stagesTotal }, () => ({ losses: 0, won: false }));
  for (const d of sorted) {
    if (d.won == null) {
      open = true;
      continue;
    }
    if (wins >= stagesTotal || losses >= livesStart) continue; // nach dem Ende zählt nichts mehr
    if (d.won) {
      attempts[wins].won = true;
      wins++;
    } else {
      attempts[wins].losses++;
      losses++;
    }
  }
  const livesLeft = Math.max(0, livesStart - losses);
  const status = wins >= stagesTotal ? "cleared" : livesLeft <= 0 ? "gameover" : "playing";
  return {
    stage: Math.min(wins, Math.max(0, stagesTotal - 1)),
    stagesTotal,
    wins,
    losses,
    livesStart,
    livesLeft,
    open,
    status,
    attempts,
  };
}

/**
 * Hat der Spieler das Duell gewonnen? Zuerst nach Platz, sonst (noch keine Plätze) nach Score.
 * null = noch offen (nicht beide Ergebnisse da) bzw. Gleichstand.
 */
export function arcadeDuelWon(
  me: { position: number | null; score: number | null },
  bot: { position: number | null; score: number | null }
): boolean | null {
  if (me.position != null && bot.position != null && me.position !== bot.position) return me.position < bot.position;
  const a = me.score != null && me.score > 0 ? me.score : null;
  const b = bot.score != null && bot.score > 0 ? bot.score : null;
  if (a == null || b == null || a === b) return null;
  return a > b;
}

/** Symbol je Bot-Art (Turm, Startkarte) */
export function arcadeKindIcon(kind: string | null | undefined): string {
  switch (kind) {
    case "pro":
      return "🟣";
    case "gambler":
      return "🔴";
    case "specialist":
      return "🟠";
    case "character":
      return "🎭";
    case "champion":
      return "👑";
    default:
      return "🤖";
  }
}
