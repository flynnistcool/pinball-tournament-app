// 📈 Score-Bilanz eines Spielers in einem Turnier: jeder eigene Score im Vergleich zu seinem
// persönlichen Ø und Bestwert auf diesem Flipper (aus früheren Turnieren an der Location).
// Reine Funktion, keine Datenbank. Vergleichswerte kommen aus /api/public/machine-records
// (mit cutoff=start: nur Turniere, die VOR diesem Turnier angelegt wurden).

import { machineKey, personalKey } from "@/lib/recordWatch";

export type BalanceRow = {
  matchId: string;
  roundNumber: number | null;
  machineName: string;
  icon: string | null;
  score: number;
  /** persönlicher Ø vor diesem Turnier (null = keiner) */
  avg: number | null;
  avgN: number;
  /** persönlicher Bestwert vor diesem Turnier (null = keiner) */
  best: number | null;
  /** Score liegt über dem bisherigen Bestwert */
  newBest: boolean;
  /** Abweichung vom Ø in Prozent (z. B. +18), null ohne Ø */
  vsAvgPct: number | null;
};

export type BalanceSummary = {
  played: number;
  withAvg: number;
  aboveAvg: number;
  newBests: number;
  /** mittlere Abweichung vom Ø in Prozent (nur Scores mit Ø) */
  meanPct: number | null;
};

type Input = {
  playerId: string;
  players: readonly { id: string; profile_id?: string | null }[];
  machines: readonly { id: string; name: string | null; icon_emoji?: string | null }[];
  rounds: readonly { id: string; number: number | null }[];
  matches: readonly { id: string; round_id: string; machine_id: string | null }[];
  match_players: readonly { match_id: string; player_id: string; score: number | string | null }[];
  personal: Record<string, number>;
  personalAvg: Record<string, { avg: number; n: number }>;
};

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function computeScoreBalance(inp: Input): { rows: BalanceRow[]; summary: BalanceSummary } {
  const me = inp.players.find((p) => String(p.id) === String(inp.playerId));
  const profileId = me?.profile_id ? String(me.profile_id) : null;
  const matchById = new Map(inp.matches.map((m) => [String(m.id), m]));
  const roundById = new Map(inp.rounds.map((r) => [String(r.id), r]));
  const machineById = new Map(inp.machines.map((m) => [String(m.id), m]));

  const rows: BalanceRow[] = [];
  for (const mp of inp.match_players) {
    if (String(mp.player_id) !== String(inp.playerId)) continue;
    const score = toScore(mp.score);
    if (score == null) continue;
    const match = matchById.get(String(mp.match_id));
    if (!match) continue;
    const machine = match.machine_id ? machineById.get(String(match.machine_id)) : undefined;
    const name = String(machine?.name ?? "").trim();
    if (!name) continue;
    const pk = profileId ? personalKey(profileId, machineKey(name)) : "";
    const best = pk && pk in inp.personal ? inp.personal[pk] : null;
    const a = pk ? inp.personalAvg[pk] : undefined;
    const avg = a && a.n > 0 ? a.avg : null;
    rows.push({
      matchId: String(mp.match_id),
      roundNumber: roundById.get(String(match.round_id))?.number ?? null,
      machineName: name,
      icon: machine?.icon_emoji ?? null,
      score,
      avg,
      avgN: a?.n ?? 0,
      best,
      newBest: best != null && score > best,
      vsAvgPct: avg != null && avg > 0 ? Math.round((score / avg - 1) * 100) : null,
    });
  }
  // neueste Runde oben
  rows.sort((x, y) => (y.roundNumber ?? 0) - (x.roundNumber ?? 0));

  const withAvg = rows.filter((r) => r.vsAvgPct != null);
  const summary: BalanceSummary = {
    played: rows.length,
    withAvg: withAvg.length,
    aboveAvg: withAvg.filter((r) => (r.avg ?? 0) < r.score).length,
    newBests: rows.filter((r) => r.newBest).length,
    meanPct: withAvg.length
      ? Math.round(withAvg.reduce((s, r) => s + (r.vsAvgPct as number), 0) / withAvg.length)
      : null,
  };
  return { rows, summary };
}
