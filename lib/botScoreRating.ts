// 🤖 Einstufung eines Bot-Scores: "War das für IHN ein gutes Spiel?"
// Maßstab ist die eigene Würfel-Verteilung des Bots an diesem Flipper (aus seinem Rechenzettel):
// mit (1 − Ausreißer-Chance) gleichmäßig im Bereich [low, high], sonst je zur Hälfte ein Ausreißer
// bis "outlierMax" unter low bzw. über high (gleichmäßig). Daraus lässt sich exakt ausrechnen, wie viele
// seiner Würfe schlechter wären – passend zu "schlecht (10 %) / typisch / gut (90 %)" im Bot-Labor.
// Stufe = Rang in dieser Verteilung; im Text zusätzlich der Abstand zum typischen Score in Prozent.
// Reine Funktionen, keine Datenbank.

export type BotRollShape = {
  low: number;
  high: number;
  /** Anteil Ausreißer insgesamt (0..1), je zur Hälfte nach unten/oben */
  outlierChance: number;
  /** maximale Ausreißer-Stärke (0.1 = bis 10 % unter low / über high) */
  outlierMax: number;
};

export type BotTier = "top" | "good" | "typical" | "weak" | "bad";

export type BotScoreRating = {
  tier: BotTier;
  emoji: string;
  /** kurze Bezeichnung, z. B. "gutes Spiel" */
  label: string;
  /** so viel Prozent seiner eigenen Würfe wären schlechter (0..100) */
  rank: number;
  /** typischer Score (Median seiner Würfe) */
  typical: number;
  /** Abstand zum typischen Score in Prozent (gerundet, z. B. +15 / −27) */
  diffPct: number;
  /** seine Grenzen wie im Bot-Labor: 10 % bzw. 90 % seiner Würfe liegen darunter */
  bad: number;
  good: number;
};

/** Anteil seiner Würfe unter "score" (0..1) */
export function botRollCdf(score: number, s: BotRollShape): number {
  const oc = Math.min(1, Math.max(0, s.outlierChance));
  const half = oc / 2;
  const inner = 1 - oc;
  const lowMin = s.low * (1 - s.outlierMax);
  const highMax = s.high * (1 + s.outlierMax);
  if (score <= lowMin) return 0;
  if (score < s.low) return s.low > lowMin ? (half * (score - lowMin)) / (s.low - lowMin) : half;
  if (score <= s.high) return s.high > s.low ? half + (inner * (score - s.low)) / (s.high - s.low) : half + inner / 2;
  if (score < highMax) return highMax > s.high ? half + inner + (half * (score - s.high)) / (highMax - s.high) : 1;
  return 1;
}

/** Score, unter dem der Anteil p (0..1) seiner Würfe liegt */
export function botRollQuantile(p: number, s: BotRollShape): number {
  const q = Math.min(1, Math.max(0, p));
  const oc = Math.min(1, Math.max(0, s.outlierChance));
  const half = oc / 2;
  const inner = 1 - oc;
  const lowMin = s.low * (1 - s.outlierMax);
  const highMax = s.high * (1 + s.outlierMax);
  if (half > 0 && q < half) return lowMin + (q / half) * (s.low - lowMin);
  if (inner > 0 && q <= half + inner) return s.low + ((q - half) / inner) * (s.high - s.low);
  if (half > 0) return s.high + ((q - half - inner) / half) * (highMax - s.high);
  return s.high;
}

const TIERS: { tier: BotTier; min: number; emoji: string; label: string }[] = [
  { tier: "top", min: 90, emoji: "🤩", label: "Sahnetag" },
  { tier: "good", min: 70, emoji: "👍", label: "gutes Spiel" },
  { tier: "typical", min: 30, emoji: "😐", label: "typisch für ihn" },
  { tier: "weak", min: 10, emoji: "👎", label: "schwaches Spiel" },
  { tier: "bad", min: -1, emoji: "😖", label: "rabenschwarzer Tag" },
];

/** Einstufung; null, wenn der Rechenzettel keinen Bereich hat */
export function rateBotScore(
  calc: { ok?: boolean; range?: { low: number; high: number } | null; settings?: { outlierChance?: number; outlierMax?: number } | null } | null | undefined,
  score: number | null | undefined
): BotScoreRating | null {
  if (!calc?.ok || !calc.range || score == null || !Number.isFinite(score) || score <= 0) return null;
  const shape: BotRollShape = {
    low: Number(calc.range.low),
    high: Number(calc.range.high),
    outlierChance: Number(calc.settings?.outlierChance ?? 0),
    outlierMax: Number(calc.settings?.outlierMax ?? 0),
  };
  if (!Number.isFinite(shape.low) || !Number.isFinite(shape.high) || shape.high <= 0) return null;
  const rank = Math.round(botRollCdf(score, shape) * 1000) / 10;
  const typical = Math.round(botRollQuantile(0.5, shape));
  const t = TIERS.find((x) => rank >= x.min) ?? TIERS[TIERS.length - 1];
  return {
    tier: t.tier,
    emoji: t.emoji,
    label: t.label,
    rank,
    typical,
    diffPct: typical > 0 ? Math.round((score / typical - 1) * 100) : 0,
    bad: Math.round(botRollQuantile(0.1, shape)),
    good: Math.round(botRollQuantile(0.9, shape)),
  };
}

/** Text-Varianten je Stufe ({name} = Bot-Name) – z. B. für Ticker/Ansagen */
export const BOT_RATING_TEXTS: Record<BotTier, string[]> = {
  top: [
    "Sahnetag für {name}!",
    "{name} ist heiß gelaufen!",
    "Da hat die KI alles rausgeholt!",
    "{name} im Turbo-Modus!",
  ],
  good: ["Starkes Spiel von {name}.", "{name} hat gut aufgelegt.", "Ordentlich abgeliefert, {name}!"],
  typical: ["Ganz normales Spiel für {name}.", "{name} liefert Standardkost.", "Business as usual bei {name}."],
  weak: ["Kein guter Lauf für {name}.", "{name} schwächelt etwas.", "Da war bei {name} mehr drin."],
  bad: [
    "Rabenschwarzer Tag für {name}!",
    "{name} hat einen Kurzschluss!",
    "Bei {name} ist der Akku leer.",
    "{name} braucht wohl ein Update.",
  ],
};

/** eine Variante (stabil je Schlüssel, z. B. Match-ID – damit der Text beim Neuladen nicht springt) */
export function botRatingText(tier: BotTier, name: string, key: string): string {
  const list = BOT_RATING_TEXTS[tier];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length].replace(/\{name\}/g, name);
}

/** Abstand zum typischen Score als Text, z. B. "15 % über typisch" */
export function botDiffText(diffPct: number): string {
  if (Math.abs(diffPct) < 1) return "genau typisch";
  return `${Math.abs(diffPct)} % ${diffPct > 0 ? "über" : "unter"} typisch`;
}
