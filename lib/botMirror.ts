// 👻 Ghost-Bot + ⚡ Form-Bot: würfeln aus den EIGENEN Scores eines Spielers am Flipper (Location).
// Reine Logik, keine Datenbank (Daten: lib/botMirrorData.ts). Mit dem Nutzer abgestimmt 2026-11-27:
//
// 👻 Ghost-Bot – spielt wie ein bestimmter Spieler:
//   alle seine Scores am Flipper; gleiches Format, wenn es mind. GHOST_MIN_SCORES gibt, sonst gleiches
//   Punkteniveau (mit/ohne Extraball). Bereich = seine mittleren Scores (rangeLowPct … rangeHighPct),
//   darin würfeln + Ausreißer wie bei den festen Bots. Weniger als GHOST_MIN_SCORES → Ersatz über Elo.
//
// ⚡ Form-Bot – folgt der aktuellen Form eines Spielers:
//   seine LETZTEN 2 Scores am Flipper (auch von heute; das laufende Match selbst nicht), gleiches Format,
//   sonst gleiches Punkteniveau. Durchschnitt, darum gleichmäßig ±formSpreadPct (Standard 5 %).
//   Kein Ausreißer-Deckel (Nutzer: ein Wahnsinnsspiel IST Form). 1 Score → dieser; 0 → Ersatz über Elo.

import type { ScoreLevel } from "@/lib/botRules";
import { DEFAULT_PLAY_MINUTES, timeFactor } from "@/lib/playMinutes";
import {
  roundScore,
  rollInRange,
  weightedPercentile,
  type BotCalc,
  type BotMirrorInfo,
  type BotSettings,
} from "@/lib/botScore";

export const GHOST_MIN_SCORES = 3;
export const FORM_LAST_N = 2;

export type MirrorKind = "ghost" | "form";

/** ein Score des Spielers an diesem Flipper (Location) – vom Server geladen */
export type MirrorSample = {
  score: number;
  format: string | null;
  extraball: boolean;
  /** Sortierschlüssel "Zeitpunkt" (Turnierdatum) */
  at: string | null;
  /** Rundennummer im Turnier (Reihenfolge am selben Tag) */
  round: number | null;
  tournamentName: string;
  /** aus dem laufenden Turnier */
  current: boolean;
  /** als falsch markiert (match_players.stats_ignored) */
  scoreIgnored?: boolean;
  /** ⏱️ Spielzeit des Turniers (RtP: seine Minuten, sonst 10) */
  playMinutes?: number | null;
};

/** neueste zuerst: Turnierdatum, dann Rundennummer */
export function sortNewestFirst(list: readonly MirrorSample[]): MirrorSample[] {
  return [...list].sort(
    (a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")) || (b.round ?? 0) - (a.round ?? 0)
  );
}

export type MirrorResult =
  | { ok: true; calc: BotCalc }
  /** zu wenig eigene Scores → Aufrufer rechnet mit der Elo des Spielers (computeBotScore) und hängt info an */
  | { ok: false; info: BotMirrorInfo };

export function computeMirrorBotScore(input: {
  kind: MirrorKind;
  botName: string;
  owner: { name: string; elo: number | null };
  machine: string;
  location: string | null;
  format: string;
  extraball: boolean;
  level: ScoreLevel;
  levelOf: (format: string | null, extraball: boolean) => ScoreLevel | null;
  samples: readonly MirrorSample[];
  settings: BotSettings;
  rng?: () => number;
  now?: Date;
  /** ⏱️ Spielzeit des laufenden Turniers – Scores mit anderer Zeit werden umgerechnet */
  minutes?: number | null;
}): MirrorResult {
  const S = input.settings;
  const rng = input.rng ?? Math.random;
  const fmt = String(input.format ?? "").toLowerCase();
  const target = Number(input.minutes ?? DEFAULT_PLAY_MINUTES);
  const levelName =
    (input.level === "high" ? "mit Extraball" : "normales Punkteniveau") + (target !== DEFAULT_PLAY_MINUTES ? `, ${target} min` : "");

  // gleiches Punkteniveau, nicht als falsch markiert; ⏱️ andere Spielzeit → auf die Zeit des Turniers umgerechnet
  const valid = sortNewestFirst(
    input.samples.filter((s) => Number(s.score) > 0 && !s.scoreIgnored && input.levelOf(s.format, s.extraball) === input.level)
  ).map((s) => {
    const from = Number(s.playMinutes ?? DEFAULT_PLAY_MINUTES);
    return { ...s, orig: Number(s.score), score: Number(s.score) * timeFactor(from, target, S.timeExponent), minutes: from };
  });
  const need = input.kind === "ghost" ? GHOST_MIN_SCORES : FORM_LAST_N;
  const sameMode = valid.filter((s) => String(s.format ?? "").toLowerCase() === fmt);
  const sameModeSameTime = sameMode.filter((s) => s.minutes === target);
  // Reihenfolge: gleiches Format + gleiche Zeit → gleiches Format (umgerechnet) → alle Formate
  const pool =
    sameModeSameTime.length >= need ? sameModeSameTime : sameMode.length >= need ? sameMode : valid;
  const poolLabel =
    pool === sameModeSameTime
      ? `gleiches Format („${fmt}“), ${levelName}`
      : pool === sameMode
      ? `gleiches Format („${fmt}“), ${levelName}, andere Spielzeiten umgerechnet`
      : `alle Formate, ${levelName}${valid.some((s) => s.minutes !== target) ? ", andere Spielzeiten umgerechnet" : ""}`;
  const taken = input.kind === "form" ? pool.slice(0, FORM_LAST_N) : pool;

  const info: BotMirrorInfo = {
    kind: input.kind,
    owner: input.owner.name,
    ownerElo: input.owner.elo != null ? Math.round(input.owner.elo) : null,
    found: input.samples.length,
    poolLabel,
    used: taken.slice(0, 80).map((s) => ({
      score: Math.round(s.score),
      at: s.at,
      tournament: s.tournamentName,
      format: s.format,
      current: s.current,
      ...(s.minutes !== target ? { orig: Math.round(s.orig), minutes: s.minutes } : {}),
    })),
    fallback: null,
  };

  if (input.kind === "ghost" && taken.length < GHOST_MIN_SCORES) {
    info.fallback =
      taken.length === 0
        ? `${input.owner.name} hat „${input.machine}“ hier noch nie gespielt (${levelName}).`
        : `Nur ${taken.length} Score${taken.length === 1 ? "" : "s"} von ${input.owner.name} an „${input.machine}“ – mindestens ${GHOST_MIN_SCORES} nötig.`;
    return { ok: false, info };
  }
  if (input.kind === "form" && taken.length === 0) {
    info.fallback = `${input.owner.name} hat „${input.machine}“ hier noch nie gespielt (${levelName}).`;
    return { ok: false, info };
  }

  const calc: BotCalc = {
    version: 1,
    ok: false,
    bot: { name: input.botName, elo: input.owner.elo != null ? Math.round(input.owner.elo) : 0 },
    machine: input.machine,
    location: input.location,
    tournament: { format: fmt, extraball: input.extraball, level: input.level, minutes: target },
    settings: S,
    data: {
      found: input.samples.length,
      removedBots: 0,
      removedFormat: 0,
      removedNoElo: 0,
      usable: valid.length,
      sameLevel: valid.length,
      sameLevelSameMode: sameMode.length,
      otherLevel: 0,
    },
    pool: { key: pool === valid ? "sameLevel" : "sameMode", label: poolLabel, count: pool.length },
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
    mirror: info,
  };

  if (input.kind === "ghost") {
    const items = taken.map((s) => ({ v: Number(s.score), w: 1 }));
    const low = weightedPercentile(items, S.rangeLowPct);
    const high = Math.max(low, weightedPercentile(items, S.rangeHighPct));
    const median = weightedPercentile(items, 50);
    calc.range = { low: Math.round(low), high: Math.round(high), median: Math.round(median) };
    const r = rollInRange(low, high, S, rng);
    calc.roll = r.roll;
    calc.score = roundScore(r.score);
  } else {
    const avg = taken.reduce((sum, s) => sum + Number(s.score), 0) / taken.length;
    const sp = Math.max(0, S.formSpreadPct);
    const low = avg * (1 - sp);
    const high = avg * (1 + sp);
    info.avg = Math.round(avg);
    info.spreadPct = sp;
    calc.range = { low: Math.round(low), high: Math.round(high), median: Math.round(avg) };
    // ohne Ausreißer – für die Einstufung (lib/botScoreRating) steht das so auch im Rechenzettel
    calc.settings = { ...S, outlierChance: 0, outlierMax: 0 };
    const t = rng();
    calc.roll = { kind: "normal", pct: Math.round(t * 1000) / 10 };
    calc.score = roundScore(low + t * (high - low));
  }
  calc.ok = true;
  return { ok: true, calc };
}
