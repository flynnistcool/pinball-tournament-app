// 📊 Score-Form: Wie war ein Score im Vergleich zum eigenen Schnitt auf diesem Flipper? – reine Logik.
//
// Grundlage = Durchschnitt der bisherigen Scores des Spielers auf diesem Flipper an dieser Location
// (beendete Turniere, gleiches Punkteniveau wie das laufende Turnier – lib/botRules.ts scoreLevel:
// "normal" = Round the Pinball + ohne Extraball, "hoch" = mit Extraball). Ab SCORE_FORM_MIN_GAMES Spiel(en);
// bei genau 1 früheren Spiel heißt es "bisheriger Score" statt "eigener Schnitt".
// Die Stufen (Abstand zum Schnitt in %) und Sprüche stehen hier zentral – leicht anzupassen.

import type { FeedItemInput } from "@/lib/feed";

export type ScoreTier = "ultra" | "mega" | "stark" | "solide" | "ausbaufaehig" | "streich";

/** erst ab so vielen früheren Spielen gibt es einen Vergleich */
export const SCORE_FORM_MIN_GAMES = 1;

/** von oben nach unten: erste Stufe, deren Untergrenze erreicht ist (Untergrenze = Score/Schnitt − 1) */
export const SCORE_FORM_TIERS: readonly { tier: ScoreTier; min: number; icon: string; label: string; end: "!" | "." }[] = [
  { tier: "ultra", min: 1.0, icon: "🚀", label: "Ultra", end: "!" },
  { tier: "mega", min: 0.5, icon: "🔥", label: "Mega", end: "!" },
  { tier: "stark", min: 0.2, icon: "💪", label: "Stark", end: "!" },
  { tier: "solide", min: -0.2, icon: "😌", label: "Solide", end: "." },
  { tier: "ausbaufaehig", min: -0.5, icon: "😬", label: "Ausbaufähig", end: "." },
  { tier: "streich", min: -Infinity, icon: "🙈", label: "Streichergebnis", end: "." },
];

/** Sprüche je Stufe – pro Score fest ausgewählt (ändert sich beim Neuladen nicht) */
export const SCORE_FORM_PHRASES: Record<ScoreTier, readonly string[]> = {
  ultra: [
    "Der Flipper verneigt sich.",
    "Das war nicht von dieser Welt.",
    "Bitte einrahmen – so was sieht man selten.",
    "Hat das jemand gefilmt?!",
    "Die Highscore-Tafel zittert schon.",
  ],
  mega: [
    "Da glühen die Flipperfinger!",
    "Was für ein Lauf!",
    "Heute läuft's einfach.",
    "Die Kugel gehorcht aufs Wort.",
    "Das war eine Ansage!",
  ],
  stark: [
    "Richtig gut gespielt!",
    "Das kann sich sehen lassen.",
    "Starke Vorstellung!",
    "Sauber nach oben geschraubt.",
    "So darf's weitergehen.",
  ],
  solide: [
    "Grundsolide.",
    "Genau im Soll.",
    "Verlässlich wie immer.",
    "Keine Überraschung, keine Panik.",
    "Wie aus dem eigenen Lehrbuch.",
  ],
  ausbaufaehig: [
    "Da geht noch was.",
    "Die Outlanes waren heute hungrig.",
    "Der Flipper hat heute ein bisschen dagegengehalten.",
    "Luft nach oben ist reichlich da.",
    "Nächstes Mal mit mehr Gefühl in den Fingern.",
  ],
  streich: [
    "Oh no … zu viel getiltet?",
    "Oh no … lag's am Wetter?",
    "Der Flipper hatte heute wohl schlechte Laune.",
    "Abhaken – das war die Aufwärmrunde.",
    "Kopf hoch, die nächste Kugel wird besser.",
    "Oh no … waren die Finger noch kalt?",
  ],
};

const fmt = (n: number) => Math.round(n).toLocaleString("de-DE");

/** fester "Zufall" aus einem Text (FNV-1a) */
function pick<T>(list: readonly T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return list[(h >>> 0) % list.length];
}

export type ScoreForm = {
  tier: ScoreTier;
  icon: string;
  label: string;
  /** "40.000 unter dem eigenen Schnitt (−1 %)" */
  compare: string;
  phrase: string;
  /** ganzer Satz für Ticker/Karte */
  line: string;
};

/** Stufe + Text. null = kein Vergleich möglich (zu wenige Spiele / kein Schnitt). */
export function scoreForm(score: number, avg: number | null | undefined, n: number, seed: string): ScoreForm | null {
  if (!(score > 0) || !avg || !(avg > 0) || n < SCORE_FORM_MIN_GAMES) return null;
  const rel = score / avg - 1;
  const t = SCORE_FORM_TIERS.find((x) => rel >= x.min) ?? SCORE_FORM_TIERS[SCORE_FORM_TIERS.length - 1];
  const pct = Math.round(Math.abs(rel) * 100);
  // nur 1 früheres Spiel: ehrlich "bisheriger Score" statt "Schnitt"
  const one = n === 1;
  let compare: string;
  if (score >= 2 * avg) {
    compare = `${(score / avg).toLocaleString("de-DE", { maximumFractionDigits: 1 })}× ${one ? "der bisherige Score" : "der eigene Schnitt"}`;
  } else if (pct < 3) {
    compare = one ? "fast genau der bisherige Score" : "fast genau der eigene Schnitt";
  } else {
    const diff = Math.abs(score - avg);
    compare = `${fmt(diff)} ${rel >= 0 ? "über" : "unter"} ${one ? "dem bisherigen Score" : "dem eigenen Schnitt"} (${rel >= 0 ? "+" : "−"}${pct} %)`;
  }
  const phrase = pick(SCORE_FORM_PHRASES[t.tier], seed);
  return {
    tier: t.tier,
    icon: t.icon,
    label: t.label,
    compare,
    phrase,
    line: `${compare} – ${t.icon} ${t.label}${t.end} ${phrase}`,
  };
}

/** Beschriftung des Punkteniveaus für Mouseover/Erklärungen */
export function levelText(level: string | null | undefined): string {
  return level === "high" ? "mit Extraball" : "ohne Extraball / Round the Pinball";
}

export { fmt as fmtFormScore };

/** 📰 Ticker-Eintrag "Score-Form" (Turnier-Shortnews) */
export function scoreFormFeedItem(input: {
  /** `${matchId}|${playerId}` */
  entryKey: string;
  playerName: string;
  machineName: string;
  machineIcon?: string | null;
  score: number;
  avg: number;
  n: number;
  form: ScoreForm;
}): FeedItemInput {
  const [, playerId] = input.entryKey.split("|");
  return {
    key: `scoreForm|${input.entryKey}|${input.score}`,
    kind: "scoreForm",
    icon: input.form.icon,
    title: `${input.playerName} · ${input.machineIcon ? `${input.machineIcon} ` : ""}${input.machineName}: ${fmt(input.score)}`,
    body: input.form.line,
    players: playerId ? [playerId] : [],
    data: {
      player: input.playerName,
      machine: input.machineName,
      machineIcon: input.machineIcon ?? null,
      score: input.score,
      avg: Math.round(input.avg),
      n: input.n,
      tier: input.form.tier,
      line: input.form.line,
    },
  };
}
