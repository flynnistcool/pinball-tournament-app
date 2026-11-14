// 🤖 KI-Bots: Score-Rechnung (reine Logik – keine Datenbank, testbar, auch fürs spätere Bot-Labor).
//
// Idee (mit dem Nutzer abgestimmt, 2026-11-14):
// 1. Datenbasis: echte Scores an DIESEM Flipper (Name) in DIESER Location aus beendeten Turnieren.
//    Raus: Bots, DYP/Timeplay, Scores ohne bekannte Elo.
// 2. Punkteniveau: zuerst gleiches Niveau (normal / hoch = Extraball) – erst gleicher Modus (wenn genug),
//    dann alle Modi; reicht das nicht, kommen Scores des anderen Niveaus umgerechnet dazu (÷/× 1,25).
// 3. Elo-Nachbarn: Scores von Spielern mit ähnlicher Elo (zu Turnierbeginn) – Fenster ±50 → ±100 → ±200.
//    Gewicht nach Elo-Sicherheit damals: K16 voll, K24 halb, K32 (neu) nur wenn sonst zu wenig.
//    Nähere Elo zählt stärker.
// 4. Keine passenden Nachbarn (z. B. 2500er): die nächstgelegenen Spieler nehmen und je 100 Elo
//    Unterschied 10 % auf- bzw. abschlagen.
// 5. Bereich = mittlere 80 % der Scores; darin zufällig würfeln. Mit 10 % Chance ein Ausreißer
//    bis 15 % unter/über dem Bereich. Der Highscore spielt keine Rolle.

import type { ScoreLevel } from "@/lib/botRules";

export type BotSettings = {
  eloWindows: number[];
  minScores: number;
  minSameMode: number;
  rangeLowPct: number;
  rangeHighPct: number;
  outlierChance: number;
  outlierMax: number;
  extrapolatePer100: number;
  levelFactor: number;
  kWeights: { k16: number; k24: number; k32: number };
  minTotal: number;
  dataOutlierIqr: number;
};

// Werte vom Nutzer im Bot-Labor abgestimmt (2026-11-14)
export const BOT_SETTINGS: BotSettings = {
  /** Elo-Fenster nacheinander (± Elo) */
  eloWindows: [25, 50, 100],
  /** so viele Scores braucht ein Fenster mindestens */
  minScores: 5,
  /** gleicher Modus wird bevorzugt, wenn mindestens so viele Scores da sind */
  minSameMode: 20,
  /** Bereich: mittlere 70 % → 15. bis 85. Perzentil */
  rangeLowPct: 15,
  rangeHighPct: 85,
  /** Ausreißer-Chance und maximale Stärke */
  outlierChance: 0.15,
  outlierMax: 0.1,
  /** ohne passende Daten: Auf-/Abschlag je 100 Elo Unterschied */
  extrapolatePer100: 0.15,
  /** Umrechnung zwischen Punkteniveaus (hoch = normal × 1,25) */
  levelFactor: 1.25,
  /** Gewicht nach Elo-Sicherheit damals */
  kWeights: { k16: 1, k24: 0.25, k32: 0.15 },
  /** weniger Scores insgesamt → kein Bot-Score (lieber von Hand eintragen) */
  minTotal: 3,
  /** Wahnsinns-/Pechspiele in den Daten aussortieren (Abstand in Quartilsabständen, log. Skala) */
  dataOutlierIqr: 1.5,
};
export type KStatus = "k16" | "k24" | "k32";

/** ein echter, früherer Score (vom Server geladen) */
export type BotRawSample = {
  score: number;
  /** Elo des Spielers zu Beginn jenes Turniers (null = unbekannt) */
  elo: number | null;
  provisionalBefore: number | null;
  matchesBefore: number | null;
  isBot: boolean;
  format: string | null;
  extraball: boolean;
  playerName: string;
  tournamentName: string;
  date: string | null;
  /** 🚫 Profil ist Platzhalter/Testprofil (profiles.exclude_from_stats) */
  placeholder?: boolean;
  /** 🚫 einzelner Score als falsch markiert (match_players.stats_ignored) */
  scoreIgnored?: boolean;
  /** zum Markieren im Bot-Labor */
  matchId?: string;
  playerId?: string;
};

export type BotCalcSample = {
  player: string;
  elo: number;
  k: KStatus;
  score: number;
  /** Score nach Umrechnung / Aufschlag */
  used: number;
  converted: boolean;
  weight: number;
  tournament: string;
  date: string | null;
  format: string | null;
};

export type BotCalc = {
  version: 1;
  ok: boolean;
  error?: string;
  bot: { name: string; elo: number };
  machine: string;
  location: string | null;
  tournament: { format: string; extraball: boolean; level: ScoreLevel };
  settings: BotSettings;
  data: {
    found: number;
    removedBots: number;
    removedPlaceholder?: number;
    removedIgnored?: number;
    removedFormat: number;
    removedNoElo: number;
    usable: number;
    sameLevel: number;
    sameLevelSameMode: number;
    otherLevel: number;
  };
  /** welcher Datentopf genommen wurde */
  pool: { key: "sameMode" | "sameLevel" | "mixed"; label: string; count: number };
  /** Versuche mit den Elo-Fenstern */
  windows: { window: number; count: number; ok: boolean; withK32: boolean }[];
  /** gewähltes Fenster (null = Auf-/Abschlag) */
  window: number | null;
  extrapolation: null | { refElo: number; diff: number; factor: number };
  kCounts: { k16: number; k24: number; k32: number; k32Used: boolean };
  samples: BotCalcSample[];
  /** aussortierte Ausreißer in den Daten (einzelne Wahnsinns- oder Pechspiele) */
  dataOutliers: { player: string; elo: number; score: number; used: number }[];
  range: { low: number; high: number; median: number } | null;
  roll: null | { kind: "normal" | "outlier_low" | "outlier_high"; pct: number };
  score: number | null;
  at: string;
};

export function kStatus(provisionalBefore: number | null, matchesBefore: number | null): KStatus {
  if ((provisionalBefore ?? 0) > 0) return "k32";
  if ((matchesBefore ?? 0) < 30) return "k24";
  return "k16";
}

/** gewichtetes Perzentil (p 0–100) */
export function weightedPercentile(items: { v: number; w: number }[], p: number): number {
  const xs = items.filter((x) => x.w > 0 && Number.isFinite(x.v)).sort((a, b) => a.v - b.v);
  if (!xs.length) return NaN;
  if (xs.length === 1) return xs[0].v;
  const total = xs.reduce((s, x) => s + x.w, 0);
  // Mittelpunkte der Gewichte als Stützstellen (wie "lineare Interpolation" beim normalen Perzentil)
  let acc = 0;
  const pts = xs.map((x) => {
    const mid = (acc + x.w / 2) / total;
    acc += x.w;
    return { v: x.v, q: mid };
  });
  const q = Math.min(1, Math.max(0, p / 100));
  if (q <= pts[0].q) return pts[0].v;
  if (q >= pts[pts.length - 1].q) return pts[pts.length - 1].v;
  for (let i = 1; i < pts.length; i++) {
    if (q <= pts[i].q) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (q - a.q) / (b.q - a.q || 1);
      return a.v + t * (b.v - a.v);
    }
  }
  return pts[pts.length - 1].v;
}

const roundScore = (n: number) => Math.max(10, Math.round(n / 10) * 10);

type Prepared = {
  raw: BotRawSample;
  elo: number;
  k: KStatus;
  level: ScoreLevel;
  sameMode: boolean;
  used: number;
  converted: boolean;
};

export function computeBotScore(input: {
  botName: string;
  botElo: number;
  machine: string;
  location: string | null;
  format: string;
  extraball: boolean;
  /** Punkteniveau des laufenden Turniers (lib/botRules → scoreLevel) */
  level: ScoreLevel;
  /** Punkteniveau einer Daten-Zeile (lib/botRules → scoreLevel), null = nicht verwenden */
  levelOf: (format: string | null, extraball: boolean) => ScoreLevel | null;
  samples: BotRawSample[];
  rng?: () => number;
  settings?: BotSettings;
  now?: Date;
}): BotCalc {
  const S = input.settings ?? BOT_SETTINGS;
  const rng = input.rng ?? Math.random;
  const fmt = String(input.format ?? "").toLowerCase();

  const calc: BotCalc = {
    version: 1,
    ok: false,
    bot: { name: input.botName, elo: Math.round(input.botElo) },
    machine: input.machine,
    location: input.location,
    tournament: { format: fmt, extraball: input.extraball, level: input.level },
    settings: S,
    data: {
      found: input.samples.length,
      removedBots: 0,
      removedPlaceholder: 0,
      removedIgnored: 0,
      removedFormat: 0,
      removedNoElo: 0,
      usable: 0,
      sameLevel: 0,
      sameLevelSameMode: 0,
      otherLevel: 0,
    },
    pool: { key: "sameLevel", label: "", count: 0 },
    windows: [],
    window: null,
    extrapolation: null,
    kCounts: { k16: 0, k24: 0, k32: 0, k32Used: false },
    samples: [],
    dataOutliers: [],
    range: null,
    roll: null,
    score: null,
    at: (input.now ?? new Date()).toISOString(),
  };

  // 1) Datenbasis filtern
  const prepared: Prepared[] = [];
  for (const s of input.samples) {
    if (!(Number(s.score) > 0)) continue;
    if (s.isBot) {
      calc.data.removedBots++;
      continue;
    }
    if (s.placeholder) {
      calc.data.removedPlaceholder = (calc.data.removedPlaceholder ?? 0) + 1;
      continue;
    }
    if (s.scoreIgnored) {
      calc.data.removedIgnored = (calc.data.removedIgnored ?? 0) + 1;
      continue;
    }
    const lvl = input.levelOf(s.format, s.extraball);
    if (!lvl) {
      calc.data.removedFormat++;
      continue;
    }
    if (s.elo == null || !Number.isFinite(Number(s.elo))) {
      calc.data.removedNoElo++;
      continue;
    }
    const converted = lvl !== input.level;
    const factor = !converted ? 1 : input.level === "high" ? S.levelFactor : 1 / S.levelFactor;
    prepared.push({
      raw: s,
      elo: Number(s.elo),
      k: kStatus(s.provisionalBefore, s.matchesBefore),
      level: lvl,
      sameMode: String(s.format ?? "").toLowerCase() === fmt,
      used: Number(s.score) * factor,
      converted,
    });
  }
  calc.data.usable = prepared.length;
  const sameLevel = prepared.filter((p) => !p.converted);
  const sameMode = sameLevel.filter((p) => p.sameMode);
  calc.data.sameLevel = sameLevel.length;
  calc.data.sameLevelSameMode = sameMode.length;
  calc.data.otherLevel = prepared.length - sameLevel.length;

  if (prepared.length < S.minTotal) {
    calc.error = `Zu wenig Daten: nur ${prepared.length} verwendbare Scores an diesem Flipper (mindestens ${S.minTotal}). Bitte Score von Hand eintragen.`;
    return calc;
  }

  // 2) Datentöpfe in Reihenfolge
  const levelName = input.level === "high" ? "hohes Niveau (Extraball)" : "normales Niveau";
  const pools: { key: BotCalc["pool"]["key"]; label: string; items: Prepared[] }[] = [];
  if (sameMode.length >= S.minSameMode) {
    pools.push({ key: "sameMode", label: `nur Modus „${fmt}“, ${levelName}`, items: sameMode });
  }
  if (sameLevel.length) pools.push({ key: "sameLevel", label: `alle Modi, ${levelName}`, items: sameLevel });
  if (prepared.length > sameLevel.length) {
    pools.push({ key: "mixed", label: `alle Modi, ${levelName} + anderes Niveau umgerechnet`, items: prepared });
  }

  const kW = (k: KStatus, withK32: boolean) =>
    k === "k16" ? S.kWeights.k16 : k === "k24" ? S.kWeights.k24 : withK32 ? S.kWeights.k32 : 0;

  let chosen: { pool: (typeof pools)[number]; items: Prepared[]; window: number; withK32: boolean } | null = null;
  outer: for (const pool of pools) {
    for (const w of S.eloWindows) {
      const inWin = pool.items.filter((p) => Math.abs(p.elo - input.botElo) <= w);
      const without32 = inWin.filter((p) => p.k !== "k32");
      if (without32.length >= S.minScores) {
        calc.windows.push({ window: w, count: without32.length, ok: true, withK32: false });
        chosen = { pool, items: without32, window: w, withK32: false };
        break outer;
      }
      if (inWin.length >= S.minScores) {
        calc.windows.push({ window: w, count: inWin.length, ok: true, withK32: true });
        chosen = { pool, items: inWin, window: w, withK32: true };
        break outer;
      }
      calc.windows.push({ window: w, count: inWin.length, ok: false, withK32: false });
    }
  }

  let used: { p: Prepared; weight: number; value: number }[] = [];
  if (chosen) {
    const ch = chosen;
    calc.pool = { key: ch.pool.key, label: ch.pool.label, count: ch.pool.items.length };
    calc.window = ch.window;
    used = ch.items.map((p) => {
      const near = 1 - 0.5 * (Math.abs(p.elo - input.botElo) / (ch.window + 1)); // 1 … 0,5
      return { p, weight: kW(p.k, ch.withK32) * near, value: p.used };
    });
    calc.kCounts.k32Used = ch.withK32;
  } else {
    // 4) keine Nachbarn → nächstgelegene Spieler + Auf-/Abschlag je 100 Elo
    const pool = pools[pools.length - 1];
    calc.pool = { key: pool.key, label: pool.label, count: pool.items.length };
    const nearest = [...pool.items]
      .sort((a, b) => Math.abs(a.elo - input.botElo) - Math.abs(b.elo - input.botElo))
      .slice(0, Math.max(S.minScores, 1));
    const wsum = nearest.reduce((s, p) => s + kW(p.k, true), 0) || 1;
    const refElo = nearest.reduce((s, p) => s + p.elo * kW(p.k, true), 0) / wsum;
    const diff = input.botElo - refElo;
    const factor = Math.max(0.3, 1 + S.extrapolatePer100 * (diff / 100));
    calc.extrapolation = { refElo: Math.round(refElo), diff: Math.round(diff), factor: Math.round(factor * 1000) / 1000 };
    used = nearest.map((p) => ({ p, weight: kW(p.k, true), value: p.used * factor }));
    calc.kCounts.k32Used = nearest.some((p) => p.k === "k32");
  }

  for (const u of used) calc.kCounts[u.p.k]++;
  used = used.filter((u) => u.weight > 0);

  // Ausreißer in den Daten (z. B. ein 900-Mio-Wahnsinnsspiel unter lauter 100-Mio-Spielen) aussortieren.
  // Flipper-Scores streuen "multiplikativ" → auf logarithmischer Skala vergleichen.
  if (used.length >= 4) {
    // bewusst UNgewichtet (jeder Score eine Stimme) – sonst "schützt" ein hohes Gewicht den Ausreißer selbst
    const logs = used.map((u) => ({ v: Math.log(u.value), w: 1 }));
    const q1 = weightedPercentile(logs, 25);
    const q3 = weightedPercentile(logs, 75);
    const iqr = Math.max(q3 - q1, 0.15); // mind. ~15 % Spielraum, damit enge Daten nicht alles aussortieren
    const lo = q1 - S.dataOutlierIqr * iqr;
    const hi = q3 + S.dataOutlierIqr * iqr;
    const keep = used.filter((u) => {
      const l = Math.log(u.value);
      return l >= lo && l <= hi;
    });
    if (keep.length >= Math.min(3, used.length)) {
      calc.dataOutliers = used
        .filter((u) => !keep.includes(u))
        .map((u) => ({ player: u.p.raw.playerName, elo: Math.round(u.p.elo), score: Math.round(u.p.raw.score), used: Math.round(u.value) }));
      used = keep;
    }
  }

  calc.samples = used
    .slice()
    .sort((a, b) => b.weight - a.weight || b.value - a.value)
    .slice(0, 80)
    .map((u) => ({
      player: u.p.raw.playerName,
      elo: Math.round(u.p.elo),
      k: u.p.k,
      score: Math.round(u.p.raw.score),
      used: Math.round(u.value),
      converted: u.p.converted || !!calc.extrapolation,
      weight: Math.round(u.weight * 100) / 100,
      tournament: u.p.raw.tournamentName,
      date: u.p.raw.date,
      format: u.p.raw.format,
    }));

  // 5) Bereich + würfeln
  const items = used.map((u) => ({ v: u.value, w: u.weight }));
  const low = weightedPercentile(items, S.rangeLowPct);
  const high = Math.max(low, weightedPercentile(items, S.rangeHighPct));
  const median = weightedPercentile(items, 50);
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    calc.error = "Bereich konnte nicht berechnet werden.";
    return calc;
  }
  calc.range = { low: Math.round(low), high: Math.round(high), median: Math.round(median) };

  let score: number;
  if (rng() < S.outlierChance) {
    const up = rng() < 0.5;
    const pct = rng() * S.outlierMax;
    score = up ? high * (1 + pct) : low * (1 - pct);
    calc.roll = { kind: up ? "outlier_high" : "outlier_low", pct: Math.round(pct * 1000) / 10 };
  } else {
    const t = rng();
    score = low + t * (high - low);
    calc.roll = { kind: "normal", pct: Math.round(t * 1000) / 10 };
  }

  calc.score = roundScore(score);
  calc.ok = true;
  return calc;
}

/**
 * Gespeicherte/eingegebene Stellschrauben prüfen und auf sinnvolle Grenzen bringen.
 * Fehlende oder kaputte Werte → eingebaute Standardwerte (BOT_SETTINGS).
 */
export function normalizeBotSettings(raw: unknown): BotSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const D = BOT_SETTINGS;
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const winsRaw = Array.isArray(r.eloWindows) ? r.eloWindows.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  const eloWindows = winsRaw.length
    ? winsRaw.map((n: number) => Math.min(1000, Math.round(n))).sort((a: number, b: number) => a - b)
    : [...D.eloWindows];
  let rangeLowPct = num(r.rangeLowPct, D.rangeLowPct, 0, 49);
  let rangeHighPct = num(r.rangeHighPct, D.rangeHighPct, 51, 100);
  if (rangeHighPct <= rangeLowPct) {
    rangeLowPct = D.rangeLowPct;
    rangeHighPct = D.rangeHighPct;
  }
  const kw = (r.kWeights && typeof r.kWeights === "object" ? r.kWeights : {}) as Record<string, unknown>;
  return {
    eloWindows,
    minScores: Math.round(num(r.minScores, D.minScores, 1, 100)),
    minSameMode: Math.round(num(r.minSameMode, D.minSameMode, 1, 1000)),
    rangeLowPct,
    rangeHighPct,
    outlierChance: num(r.outlierChance, D.outlierChance, 0, 1),
    outlierMax: num(r.outlierMax, D.outlierMax, 0, 2),
    extrapolatePer100: num(r.extrapolatePer100, D.extrapolatePer100, 0, 2),
    levelFactor: num(r.levelFactor, D.levelFactor, 1, 5),
    kWeights: {
      k16: num(kw.k16, D.kWeights.k16, 0, 1),
      k24: num(kw.k24, D.kWeights.k24, 0, 1),
      k32: num(kw.k32, D.kWeights.k32, 0, 1),
    },
    minTotal: Math.round(num(r.minTotal, D.minTotal, 1, 100)),
    dataOutlierIqr: num(r.dataOutlierIqr, D.dataOutlierIqr, 0.1, 10),
  };
}
