// 🎰 Flipper-Premiere – reine Logik (Geräte + Server-Ticker rechnen gleich).
//
// Premiere = das erste Spiel eines Profils an einem Flipper (Name) an dieser Location:
// - nicht in früheren Turnieren dort (personal / played aus /api/public/machine-records, jedes Format)
// - nicht schon früher in DIESEM Turnier (frühere Runde bzw. früherer Durchgang)
//
// Wann wird angekündigt? ("aktiv")
// - Matchplay & Co.: sobald die Runde mit dem Match erzeugt ist
// - Round the Pinball: sobald der Durchgang beginnt, in dem der Spieler an diesem Flipper dran ist
//
// Ergebnis (🌟 Premieren-Sieg): Sieger des Matches (Platz 1) bzw. bei Round the Pinball bester Score am
// Flipper, sobald alle dort gespielt haben – nur wenn sein Spiel dort eine Premiere war.

import { machineKey, personalKey } from "@/lib/recordWatch";
import { rotationBlocksFrom, rotationProgress, rotationWaveMap } from "@/lib/rotationTurn";

export type PremiereSlot = {
  matchId: string;
  playerId: string;
  profileId: string;
  machineName: string;
  /** schon anzukündigen (Runde erzeugt bzw. Durchgang begonnen) */
  active: boolean;
};

type PData = {
  tournament?: { format?: string | null } | null;
  players?: { id: string; name?: string | null; profile_id?: string | null }[];
  machines?: { id: string; name?: string | null }[];
  rounds?: { id: string; number?: number | null }[];
  matches?: { id: string; round_id?: string | null; machine_id?: string | null }[];
  match_players?: {
    match_id: string;
    player_id: string;
    start_position?: number | null;
    score?: number | string | null;
    position?: number | null;
  }[];
};

type PPrior = { personal: Record<string, number>; played?: string[]; excludedProfiles?: string[] };

/** Alle Premieren des Turniers (je Profil + Flipper höchstens eine: die erste) */
export function premiereSlots(data: PData, prior: PPrior): PremiereSlot[] {
  const matches = data.matches ?? [];
  const mps = data.match_players ?? [];
  if (!matches.length || !mps.length) return [];
  const rotation = String(data.tournament?.format ?? "") === "rotation";
  const profOf = new Map((data.players ?? []).map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));
  const machineName = new Map((data.machines ?? []).map((m) => [String(m.id), m.name ?? null]));
  const machineOfMatch = new Map(matches.map((m) => [String(m.id), String(m.machine_id ?? "")]));
  const played = new Set(prior.played ?? []);
  const excluded = new Set(prior.excludedProfiles ?? []);

  // Reihenfolge der Spiele: Runde/Match-Reihenfolge bzw. Durchgang
  const roundNo = new Map((data.rounds ?? []).map((r) => [String(r.id), Number(r.number ?? 0)]));
  const matchIdx = new Map(matches.map((m, i) => [String(m.id), i]));
  let waveOf: Map<string, number> | null = null;
  let curWave = Infinity;
  if (rotation) {
    const ids = matches.map((m) => String(m.id));
    const blocks = rotationBlocksFrom(data.rounds as any, matches as any);
    waveOf = rotationWaveMap(ids, mps, undefined, blocks);
    const prog = rotationProgress(ids, mps, undefined, blocks);
    curWave = prog.done ? Infinity : prog.current;
  }
  const order = (mp: { match_id: string; player_id: string }) => {
    if (waveOf) return waveOf.get(`${mp.match_id}|${mp.player_id}`) ?? 9999;
    const m = matches.find((x) => String(x.id) === String(mp.match_id));
    return (roundNo.get(String(m?.round_id ?? "")) ?? 0) * 10000 + (matchIdx.get(String(mp.match_id)) ?? 0);
  };

  const sorted = mps.slice().sort((a, b) => order(a) - order(b));
  const seen = new Set<string>();
  const out: PremiereSlot[] = [];
  for (const mp of sorted) {
    const pid = String(mp.player_id);
    const prof = profOf.get(pid);
    if (!prof) continue;
    const mName = machineName.get(machineOfMatch.get(String(mp.match_id)) ?? "") ?? null;
    const mk = machineKey(mName);
    if (!mk) continue;
    const pk = personalKey(prof, mk);
    if (seen.has(pk)) continue;
    seen.add(pk);
    if (pk in prior.personal || played.has(pk) || excluded.has(prof)) continue;
    const active = waveOf ? (waveOf.get(`${mp.match_id}|${pid}`) ?? 9999) <= curWave : true;
    out.push({ matchId: String(mp.match_id), playerId: pid, profileId: prof, machineName: mName ?? "?", active });
  }
  return out;
}

/** Schlüssel "matchId|playerId" für schnelle Abfragen */
export const slotKey = (matchId: string, playerId: string) => `${matchId}|${playerId}`;
