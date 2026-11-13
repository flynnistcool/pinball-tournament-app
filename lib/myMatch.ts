// 📱 Handy-Seite eines Spielers: "Mein aktuelles Match", automatische Plätze, Live-Leaderboard.
// Reine Logik, keine Datenbank (Daten kommen aus /api/public/tournament).

import { matchPoints, computeProvisionalRotationPoints } from "@/lib/points";
import { rotationActiveMap } from "@/lib/rotationTurn";

export type MmPlayer = { id: string; name: string | null; active?: boolean | null; profile_id?: string | null };
export type MmMachine = { id: string; name: string | null; icon_emoji?: string | null };
export type MmRound = {
  id: string;
  number: number | null;
  status?: string | null;
  format?: string | null;
  elo_enabled?: boolean | null;
};
export type MmMatch = { id: string; round_id: string; machine_id: string | null; status?: string | null };
export type MmMatchPlayer = {
  match_id: string;
  player_id: string;
  position: number | null;
  start_position?: number | null;
  score: number | string | null;
};
export type MmData = {
  tournament: { format?: string | null; status?: string | null; name?: string | null };
  players: MmPlayer[];
  machines: MmMachine[];
  rounds: MmRound[];
  matches: MmMatch[];
  match_players: MmMatchPlayer[];
  /** Profil-Optik + aktuelle Elo (aus /api/public/tournament) */
  profiles?: { id: string; icon?: string | null; color?: string | null; rating?: number | null }[];
  /** Elo beim Turnierstart */
  start_ratings?: { profile_id: string; rating_before: number | null }[];
};

/**
 * Was darf das Handy in welchem Format?
 * - "own":  nur den EIGENEN Score (Round the Pinball)
 * - "full": Scores und/oder Plätze aller Spieler im Match (Matchplay, Swiss, Round Robin)
 * - "score": Scores aller Spieler im Match, Plätze automatisch (Elimination)
 * - "none": nur anschauen (DYP, Timeplay – kommt später)
 */
export type EntryMode = "own" | "full" | "score" | "none";

export function entryMode(format: string | null | undefined): EntryMode {
  const f = String(format ?? "").toLowerCase();
  if (f === "rotation") return "own";
  if (f === "elimination") return "score";
  if (f === "matchplay" || f === "swiss" || f === "round_robin") return "full";
  return "none";
}

export function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function hasPos(mp: MmMatchPlayer): boolean {
  return mp.position != null && Number(mp.position) > 0;
}

export type MyMatchInfo = {
  match: MmMatch;
  round: MmRound | null;
  machine: MmMachine | null;
  /** Spieler im Match in Startreihenfolge */
  players: MmMatchPlayer[];
  /** true = für diesen Spieler erledigt (Rotation: eigener Score da; sonst: alle Plätze vergeben) */
  done: boolean;
  /** Rotation: wer gerade an diesem Flipper spielt (Wellen-Regel, lib/rotationTurn.ts) */
  activePlayerId: string | null;
};

/** Matches des Spielers nach Rundennummer; aktuelles = erstes nicht erledigtes */
export function findMyMatch(
  data: MmData,
  playerId: string
): {
  current: MyMatchInfo | null;
  last: MyMatchInfo | null;
  count: number;
  /** Rotation: gerade nirgends dran → nächster Flipper + wie viele Spieler noch davor */
  waiting: { info: MyMatchInfo; ahead: number } | null;
  /** Rotation: an diesen Flippern ist der Spieler AUSSERDEM schon dran (danach) */
  alsoActive: MyMatchInfo[];
} {
  const isRotation = String(data.tournament?.format ?? "").toLowerCase() === "rotation";
  const roundById = new Map(data.rounds.map((r) => [String(r.id), r]));
  const machineById = new Map(data.machines.map((m) => [String(m.id), m]));
  const byMatch = new Map<string, MmMatchPlayer[]>();
  for (const mp of data.match_players) {
    const k = String(mp.match_id);
    const list = byMatch.get(k);
    if (list) list.push(mp);
    else byMatch.set(k, [mp]);
  }
  const order = new Map(data.matches.map((m, i) => [String(m.id), i]));
  const activeByMatch = isRotation
    ? rotationActiveMap(
        data.matches.map((m) => String(m.id)),
        data.match_players
      )
    : {};
  const mine = data.matches
    .filter((m) => (byMatch.get(String(m.id)) ?? []).some((mp) => String(mp.player_id) === String(playerId)))
    .sort(
      (a, b) =>
        Number(roundById.get(String(a.round_id))?.number ?? 0) - Number(roundById.get(String(b.round_id))?.number ?? 0) ||
        (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0)
    );

  const info = (m: MmMatch): MyMatchInfo => {
    const players = (byMatch.get(String(m.id)) ?? [])
      .slice()
      .sort((x, y) => Number(x.start_position ?? 999) - Number(y.start_position ?? 999));
    const me = players.find((mp) => String(mp.player_id) === String(playerId));
    const done = isRotation
      ? toScore(me?.score) != null
      : players.length > 0 && players.every(hasPos);
    return {
      match: m,
      round: roundById.get(String(m.round_id)) ?? null,
      machine: m.machine_id ? machineById.get(String(m.machine_id)) ?? null : null,
      players,
      done,
      activePlayerId: isRotation ? activeByMatch[String(m.id)] ?? null : null,
    };
  };

  const all = mine.map(info);
  const finished = all.filter((x) => x.done);
  const last = finished.length ? finished[finished.length - 1] : null;

  if (isRotation) {
    // nur der Flipper, an dem der Spieler GERADE dran ist (blau im Admin-Bereich).
    // Ist er an mehreren dran (Vorgänger woanders schon fertig), zuerst der, an dem am wenigsten
    // Spieler vor ihm standen – dort ist er schon am längsten dran (meist steht er gerade dort).
    const before = (x: MyMatchInfo) => x.players.findIndex((mp) => String(mp.player_id) === String(playerId));
    const actives = all
      .filter((x) => !x.done && x.activePlayerId === String(playerId))
      .sort((a, b) => before(a) - before(b));
    const current = actives[0] ?? null;
    const alsoActive = actives.slice(1);
    let waiting: { info: MyMatchInfo; ahead: number } | null = null;
    if (!current) {
      for (const x of all) {
        if (x.done) continue;
        const open = x.players.filter((mp) => toScore(mp.score) == null).map((mp) => String(mp.player_id));
        const ahead = open.indexOf(String(playerId));
        if (ahead < 0) continue;
        if (!waiting || ahead < waiting.ahead) waiting = { info: x, ahead };
      }
    }
    return { current, last, count: all.length, waiting, alsoActive };
  }

  const current = all.find((x) => !x.done) ?? null;
  return { current, last, count: all.length, waiting: null, alsoActive: [] };
}

/**
 * Plätze aus Scores – genau wie der Admin-Bereich (autoAssignPositionsByScore):
 * - normal: höchster Score = Platz 1 … ; bei Gleichstand: "tie" (nichts setzen)
 * - Elimination: niedrigster Score = Platz 2, alle anderen Platz 1; Gleichstand ganz unten: "tie"
 * - null: noch nicht alle Scores da (oder < 2 Spieler)
 */
export function positionsFromScores(
  rows: { player_id: string; score: number | null }[],
  elimination: boolean
): Record<string, number> | "tie" | null {
  if (rows.length < 2 || rows.some((r) => r.score == null)) return null;
  const scored = rows.map((r) => ({ pid: String(r.player_id), s: Number(r.score) }));
  const out: Record<string, number> = {};
  if (elimination) {
    const min = Math.min(...scored.map((x) => x.s));
    const losers = scored.filter((x) => x.s === min);
    if (losers.length !== 1) return "tie";
    for (const x of scored) out[x.pid] = x.pid === losers[0].pid ? 2 : 1;
    return out;
  }
  if (new Set(scored.map((x) => x.s)).size !== scored.length) return "tie";
  scored.sort((a, b) => b.s - a.s);
  scored.forEach((x, i) => (out[x.pid] = i + 1));
  return out;
}

/**
 * Elimination: erwartete Spielerzahl in Runde N (wie im Admin-Bereich):
 * Start = erste Runde mit Spielern; pro Runde einer weniger, mindestens 2.
 */
export function eliminationExpected(data: Pick<MmData, "rounds" | "matches" | "match_players">, roundNumber: number): number | null {
  const sorted = data.rounds.slice().sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0));
  for (const r of sorted) {
    const ids = new Set(data.matches.filter((m) => String(m.round_id) === String(r.id)).map((m) => String(m.id)));
    const uniq = new Set(
      data.match_players.filter((mp) => ids.has(String(mp.match_id)) && mp.player_id).map((mp) => String(mp.player_id))
    );
    if (uniq.size > 0) {
      const start = Number(r.number ?? 0) || 0;
      if (!start || roundNumber <= 0) return null;
      return Math.max(2, uniq.size - (roundNumber - start));
    }
  }
  return null;
}

export type LiveRow = {
  id: string;
  name: string;
  place: number;
  real: number;
  extra: number;
  total: number;
  icon: string | null;
  color: string | null;
  eloStart: number | null;
  eloNow: number | null;
  /** Punkte pro Runde (für die kleinen Balken) */
  history: { round: number; points: number }[];
};

/**
 * Live-Leaderboard – gleiche Rechnung wie der Infobildschirm (/s/[code]/tv):
 * echte Punkte je gesetztem Platz + (nur Round the Pinball) vorläufige Punkte nach Score.
 */
export function liveLeaderboard(data: MmData): { rows: LiveRow[]; roundPointsMax: number; eloOn: boolean } {
  const isRotation = String(data.tournament?.format ?? "").toLowerCase() === "rotation";
  const roundById = new Map(data.rounds.map((r) => [String(r.id), r]));
  const byMatch = new Map<string, MmMatchPlayer[]>();
  for (const mp of data.match_players) {
    const k = String(mp.match_id);
    const list = byMatch.get(k);
    if (list) list.push(mp);
    else byMatch.set(k, [mp]);
  }
  const real: Record<string, number> = {};
  for (const m of data.matches) {
    const list = byMatch.get(String(m.id)) ?? [];
    const fmt = roundById.get(String(m.round_id))?.format ?? null;
    for (const mp of list) {
      if (mp.position == null) continue;
      real[mp.player_id] = (real[mp.player_id] ?? 0) + matchPoints(Number(mp.position), list.length, fmt);
    }
  }
  const extra = isRotation ? computeProvisionalRotationPoints(data.matches, data.match_players) : {};

  // Punkte pro Runde (wie Infobildschirm/Admin-Leaderboard)
  const history: Record<string, { round: number; points: number }[]> = {};
  let roundPointsMax = 0;
  const sortedRounds = data.rounds.slice().sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0));
  for (const r of sortedRounds) {
    const perPlayer: Record<string, number> = {};
    for (const m of data.matches.filter((x) => String(x.round_id) === String(r.id))) {
      const list = byMatch.get(String(m.id)) ?? [];
      for (const mp of list) {
        if (mp.position == null) continue;
        perPlayer[mp.player_id] = (perPlayer[mp.player_id] ?? 0) + matchPoints(Number(mp.position), list.length, r.format ?? null);
      }
    }
    for (const [pid, pts] of Object.entries(perPlayer)) {
      (history[pid] ||= []).push({ round: Number(r.number) || 0, points: pts });
      if (pts > roundPointsMax) roundPointsMax = pts;
    }
  }

  const profById = new Map((data.profiles ?? []).map((p) => [String(p.id), p]));
  const startElo = new Map<string, number>();
  for (const sr of data.start_ratings ?? []) {
    const v = Number(sr.rating_before);
    if (sr.profile_id && sr.rating_before != null && Number.isFinite(v)) startElo.set(String(sr.profile_id), v);
  }
  const eloOn = data.rounds.length === 0 || data.rounds.some((r) => r.elo_enabled !== false);

  const rows: LiveRow[] = data.players.map((p) => {
    const r = real[p.id] ?? 0;
    const e = extra[p.id] ?? 0;
    const prof = p.profile_id ? profById.get(String(p.profile_id)) : undefined;
    const now = prof?.rating != null && Number.isFinite(Number(prof.rating)) ? Number(prof.rating) : null;
    return {
      id: String(p.id),
      name: String(p.name ?? "?"),
      place: 0,
      real: r,
      extra: e,
      total: r + e,
      icon: (prof?.icon ?? "").trim() || null,
      color: prof?.color ?? null,
      eloStart: p.profile_id ? startElo.get(String(p.profile_id)) ?? null : null,
      eloNow: now,
      history: history[p.id] ?? [],
    };
  });
  rows.sort((a, b) => b.total - a.total || b.real - a.real || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.place = prev && prev.total === r.total ? prev.place : i + 1;
  });
  return { rows, roundPointsMax, eloOn };
}
