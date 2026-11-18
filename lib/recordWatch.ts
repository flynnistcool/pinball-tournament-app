// 🏆 Highscore-Jubel am TV – reine Logik (keine Datenbank, kein React).
//
// Rekord = bester Score eines Flippers an der Location (Zuordnung über Flipper-NAME wie in
// lib/machineStats.ts), über alle BEENDETEN Turniere der Location – Timeplay und DYP zählen nicht.
// 30-Tage-Highscore = dasselbe, aber nur Turniere der letzten 30 Tage.
// Persönlicher Rekord = bester eigener Score des Spielers (Profil) auf diesem Flipper dort.
// Das laufende Turnier kommt live dazu (siehe evaluateEntry).

import { machineKey } from "@/lib/machineStats";

export { machineKey };

/** at = Datum des Turniers, in dem der Score aufgestellt wurde (ISO, optional) */
export type PriorRecord = { score: number; holder: string | null; machineName: string | null; at?: string | null };
export type PriorRecords = {
  /** machineKey → bisheriger Rekord */
  records: Record<string, PriorRecord>;
  /** machineKey → bester Score der letzten 30 Tage */
  monthly: Record<string, PriorRecord>;
  /** `${profileId}|${machineKey}` → bisheriger persönlicher Bestwert */
  personal: Record<string, number>;
  /** `${profileId}|${machineKey}` → woher der persönliche Bestwert stammt (für den Mouseover) */
  personalInfo?: Record<string, PersonalRecordInfo>;
  /** `${profileId}|${machineKey}` → Durchschnittsscore + Anzahl Spiele (gleiche Basis wie der Bestwert) */
  personalAvg?: Record<string, { avg: number; n: number }>;
  /** `${profileId}|${machineKey}` → alle bisherigen Scores (älteste zuerst) – für den Verlauf beim Aufklappen */
  personalHistory?: Record<string, PersonalHistoryEntry[]>;
  /** 🤖/🚫 Profile im laufenden Turnier, die keine Allzeit-/30-Tage-Rekorde halten dürfen (Bots, Platzhalter) */
  excludedProfiles?: string[];
  /** 🎰 `${profileId}|${machineKey}`: an dieser Location schon gespielt – alle anderen Turniere dort, jedes Format */
  played?: string[];
};

/** Herkunft eines persönlichen Bestwerts: Turnierdatum, Turniername, Format */
export type PersonalRecordInfo = { at: string | null; tournament: string | null; format: string | null };

/** ein bisheriger Score eines Spielers auf einem Flipper */
export type PersonalHistoryEntry = PersonalRecordInfo & { score: number };

export const personalKey = (profileId: string, mKey: string) => `${profileId}|${mKey}`;

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Bisherige Rekorde aus den Zeilen anderer (beendeter) Turniere bauen. */
export function buildPriorRecords(input: {
  machines: { id: string; name: string | null; tournament_id?: string | null }[];
  matches: { id: string; machine_id: string | null }[];
  matchPlayers: { match_id: string; player_id: string; score: number | string | null }[];
  players: { id: string; name: string | null; profile_id: string | null }[];
  /** nur für diese Profile persönliche Bestwerte liefern (Spieler im aktuellen Turnier) */
  personalFor: readonly string[];
  /** Turniere der letzten 30 Tage (für den 30-Tage-Highscore) */
  recentTournamentIds?: readonly string[];
  /** Turnier-ID → Datum (für "aufgestellt am") */
  tournamentDates?: Readonly<Record<string, string | null>>;
  /** Turnier-ID → Name + Format (für "aufgestellt in") */
  tournamentInfo?: Readonly<Record<string, { name: string | null; format: string | null }>>;
  /** nur diese Turniere zählen für den Durchschnitt (gleiches Punkteniveau); fehlt = alle */
  avgTournamentIds?: readonly string[];
}): PriorRecords {
  const avgOk = input.avgTournamentIds ? new Set(input.avgTournamentIds.map(String)) : null;
  const machineById = new Map(input.machines.map((m) => [String(m.id), m]));
  const machineIdByMatch = new Map(input.matches.map((m) => [String(m.id), m.machine_id ? String(m.machine_id) : null]));
  const playerById = new Map(input.players.map((p) => [String(p.id), p]));
  const wanted = new Set(input.personalFor.map(String));
  const recent = new Set((input.recentTournamentIds ?? []).map(String));

  const records: Record<string, PriorRecord> = {};
  const monthly: Record<string, PriorRecord> = {};
  const personal: Record<string, number> = {};
  const personalInfo: Record<string, PersonalRecordInfo> = {};
  const personalSum: Record<string, { sum: number; n: number }> = {};
  const personalHistory: Record<string, PersonalHistoryEntry[]> = {};

  for (const mp of input.matchPlayers) {
    const score = toScore(mp.score);
    if (score == null) continue;
    const machineId = machineIdByMatch.get(String(mp.match_id));
    const machine = machineId ? machineById.get(machineId) : undefined;
    const key = machineKey(machine?.name);
    if (!key) continue;
    const player = playerById.get(String(mp.player_id));

    const cur = records[key];
    const rec: PriorRecord = {
      score,
      holder: player?.name ?? null,
      machineName: machine?.name?.trim() ?? null,
      at: machine?.tournament_id ? input.tournamentDates?.[String(machine.tournament_id)] ?? null : null,
    };
    if (!cur || score > cur.score) records[key] = rec;
    if (machine?.tournament_id && recent.has(String(machine.tournament_id))) {
      const m = monthly[key];
      if (!m || score > m.score) monthly[key] = rec;
    }

    const pid = player?.profile_id ? String(player.profile_id) : null;
    if (pid && wanted.has(pid)) {
      const pk = personalKey(pid, key);
      const tid = machine?.tournament_id ? String(machine.tournament_id) : null;
      const info: PersonalRecordInfo = {
        at: tid ? input.tournamentDates?.[tid] ?? null : null,
        tournament: tid ? input.tournamentInfo?.[tid]?.name ?? null : null,
        format: tid ? input.tournamentInfo?.[tid]?.format ?? null : null,
      };
      if (!avgOk || (tid && avgOk.has(tid))) {
        const acc = personalSum[pk] ?? (personalSum[pk] = { sum: 0, n: 0 });
        acc.sum += score;
        acc.n += 1;
      }
      (personalHistory[pk] ?? (personalHistory[pk] = [])).push({ score, ...info });
      const prev = personalInfo[pk];
      if (!(pk in personal) || score > personal[pk]) {
        personal[pk] = score;
        personalInfo[pk] = info;
      } else if (score === personal[pk] && info.at && (!prev?.at || info.at < prev.at)) {
        personalInfo[pk] = info; // gleich hoch → der erste (älteste) zählt
      }
    }
  }
  const personalAvg: Record<string, { avg: number; n: number }> = {};
  for (const [pk, a] of Object.entries(personalSum)) personalAvg[pk] = { avg: Math.round(a.sum / a.n), n: a.n };
  for (const list of Object.values(personalHistory)) {
    list.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
  }
  return { records, monthly, personal, personalInfo, personalAvg, personalHistory };
}

/** Ein Score im laufenden Turnier (Match + Spieler). */
export type LiveEntry = {
  key: string; // `${matchId}|${playerId}`
  machineKey: string;
  machineName: string | null;
  profileId: string | null;
  playerName: string;
  score: number;
};

export type Celebration =
  | {
      kind: "record";
      entry: LiveEntry;
      previous: { score: number; holder: string | null };
    }
  | {
      kind: "month";
      entry: LiveEntry;
      previous: { score: number; holder: string | null };
    }
  | {
      kind: "personal";
      entry: LiveEntry;
      previous: number;
    };

/**
 * Prüft einen (stabil eingetragenen) Score gegen die bisherigen Rekorde UND die anderen
 * Scores im laufenden Turnier.
 * - Rekord nur, wenn es an der Location schon einen Score auf dem Flipper gab (sonst wäre
 *   jeder erste Score ein „Rekord“).
 * - Persönlich nur, wenn der Spieler den Flipper dort schon gespielt hat.
 * - 30-Tage-Highscore: wie Rekord, aber nur gegen die letzten 30 Tage.
 * - Es gibt nur eine Einblendung: Rekord vor Monat vor persönlich.
 */
export function evaluateEntry(entry: LiveEntry, prior: PriorRecords, liveEntries: readonly LiveEntry[]): Celebration | null {
  // 🤖/🚫 Bots und Platzhalter: kein Jubel, und sie zählen auch nicht als "bisheriger Rekord"
  const excluded = new Set(prior.excludedProfiles ?? []);
  if (entry.profileId && excluded.has(entry.profileId)) return null;
  const others = liveEntries.filter(
    (e) => e.key !== entry.key && e.machineKey === entry.machineKey && !(e.profileId && excluded.has(e.profileId))
  );

  const priorRec = prior.records[entry.machineKey];
  if (priorRec) {
    let prev: { score: number; holder: string | null } = { score: priorRec.score, holder: priorRec.holder };
    for (const o of others) if (o.score > prev.score) prev = { score: o.score, holder: o.playerName };
    if (entry.score > prev.score) return { kind: "record", entry, previous: prev };
  }

  const priorMonth = prior.monthly?.[entry.machineKey];
  if (priorMonth) {
    let prev: { score: number; holder: string | null } = { score: priorMonth.score, holder: priorMonth.holder };
    for (const o of others) if (o.score > prev.score) prev = { score: o.score, holder: o.playerName };
    if (entry.score > prev.score) return { kind: "month", entry, previous: prev };
  }

  if (entry.profileId) {
    const pk = personalKey(entry.profileId, entry.machineKey);
    if (pk in prior.personal) {
      let prev = prior.personal[pk];
      for (const o of others) if (o.profileId === entry.profileId && o.score > prev) prev = o.score;
      if (entry.score > prev) return { kind: "personal", entry, previous: prev };
    }
  }
  return null;
}

/** Live-Scores des laufenden Turniers aus den Daten der TV-Seite. */
export function liveEntriesFrom(data: {
  machines?: { id: string; name: string | null }[];
  matches?: { id: string; machine_id: string | null }[];
  match_players?: { match_id: string; player_id: string; score: number | string | null }[];
  players?: { id: string; name: string | null; profile_id?: string | null }[];
}): LiveEntry[] {
  const machineById = new Map((data.machines ?? []).map((m) => [String(m.id), m]));
  const machineIdByMatch = new Map((data.matches ?? []).map((m) => [String(m.id), m.machine_id ? String(m.machine_id) : null]));
  const playerById = new Map((data.players ?? []).map((p) => [String(p.id), p]));
  const out: LiveEntry[] = [];
  for (const mp of data.match_players ?? []) {
    const score = toScore(mp.score);
    if (score == null) continue;
    const machineId = machineIdByMatch.get(String(mp.match_id));
    const machine = machineId ? machineById.get(machineId) : undefined;
    const key = machineKey(machine?.name);
    if (!key) continue;
    const player = playerById.get(String(mp.player_id));
    out.push({
      key: `${mp.match_id}|${mp.player_id}`,
      machineKey: key,
      machineName: machine?.name?.trim() ?? null,
      profileId: player?.profile_id ? String(player.profile_id) : null,
      playerName: String(player?.name ?? "?"),
      score,
    });
  }
  return out;
}
