// 👑 Champion-Bot: spielt wie die Besten – würfelt im Spitzenfeld ALLER echten Scores am Flipper
// (Location), unabhängig von Elo (Nutzer 2026-11-28). Reine Logik, keine Datenbank.
// - Daten wie bei den festen Bots (lib/botData.ts): ohne Bots, Platzhalter, als falsch markierte Scores,
//   ohne Timeplay/DYP. Elo der Spieler spielt KEINE Rolle (auch Scores ohne bekannte Elo zählen).
// - Datentopf: gleicher Modus (ab minSameMode Scores) → gleiches Punkteniveau → anderes Niveau umgerechnet.
// - Bereich = Perzentile champion.rangeLowPct … rangeHighPct (Standard 85 … 97), darin würfeln +
//   seltene Ausreißer (champion.outlierChance / outlierMax). Unter CHAMPION_FEW Scores: Hinweis.

import type { ScoreLevel } from "@/lib/botRules";
import {
  roundScore,
  rollInRange,
  weightedPercentile,
  type BotCalc,
  type BotRawSample,
  type BotSettings,
} from "@/lib/botScore";

/** unter so vielen Scores ist "die Besten" wenig aussagekräftig → Hinweis im Rechenzettel */
export const CHAMPION_FEW = 10;

export function computeChampionScore(input: {
  botName: string;
  botElo: number;
  machine: string;
  location: string | null;
  format: string;
  extraball: boolean;
  level: ScoreLevel;
  levelOf: (format: string | null, extraball: boolean) => ScoreLevel | null;
  samples: readonly BotRawSample[];
  settings: BotSettings;
  rng?: () => number;
  now?: Date;
}): BotCalc {
  const S = input.settings;
  const C = S.champion;
  const rng = input.rng ?? Math.random;
  const fmt = String(input.format ?? "").toLowerCase();

  const calc: BotCalc = {
    version: 1,
    ok: false,
    bot: { name: input.botName, elo: Math.round(input.botElo) },
    machine: input.machine,
    location: input.location,
    tournament: { format: fmt, extraball: input.extraball, level: input.level },
    // Einstufung (lib/botScoreRating) + Rechenzettel lesen Bereich/Ausreißer aus settings
    settings: { ...S, ...C },
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

  type Prep = { raw: BotRawSample; used: number; converted: boolean; sameMode: boolean };
  const prepared: Prep[] = [];
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
    const converted = lvl !== input.level;
    const factor = !converted ? 1 : input.level === "high" ? S.levelFactor : 1 / S.levelFactor;
    prepared.push({
      raw: s,
      used: Number(s.score) * factor,
      converted,
      sameMode: String(s.format ?? "").toLowerCase() === fmt,
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

  const levelName = input.level === "high" ? "hohes Niveau (Extraball)" : "normales Niveau";
  let pool: Prep[];
  if (sameMode.length >= S.minSameMode) {
    pool = sameMode;
    calc.pool = { key: "sameMode", label: `nur Modus „${fmt}“, ${levelName}`, count: pool.length };
  } else if (sameLevel.length >= S.minTotal) {
    pool = sameLevel;
    calc.pool = { key: "sameLevel", label: `alle Modi, ${levelName}`, count: pool.length };
  } else {
    pool = prepared;
    calc.pool = { key: "mixed", label: `alle Modi, ${levelName} + anderes Niveau umgerechnet`, count: pool.length };
  }

  const items = pool.map((p) => ({ v: p.used, w: 1 }));
  const low = weightedPercentile(items, C.rangeLowPct);
  const high = Math.max(low, weightedPercentile(items, C.rangeHighPct));
  const median = weightedPercentile(items, 50);
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    calc.error = "Bereich konnte nicht berechnet werden.";
    return calc;
  }
  calc.range = { low: Math.round(low), high: Math.round(high), median: Math.round(median) };
  calc.champion = { poolCount: pool.length, few: pool.length < CHAMPION_FEW };

  // die besten Scores des Topfs (Rechenzettel): absteigend, bis 30
  calc.samples = [...pool]
    .sort((a, b) => b.used - a.used)
    .slice(0, 30)
    .map((p) => ({
      player: p.raw.playerName,
      elo: p.raw.elo != null ? Math.round(p.raw.elo) : 0,
      k: "k16" as const,
      score: Math.round(p.raw.score),
      used: Math.round(p.used),
      converted: p.converted,
      weight: 1,
      tournament: p.raw.tournamentName,
      date: p.raw.date,
      format: p.raw.format,
    }));

  const r = rollInRange(low, high, C, rng);
  calc.roll = r.roll;
  calc.score = roundScore(r.score);
  calc.ok = true;
  return calc;
}
