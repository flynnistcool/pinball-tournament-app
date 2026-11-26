// Offene Matches eines Turniers finden (z. B. Warnung vor "Turnier beenden").
// Offen = Match ist nicht als fertig markiert UND mindestens ein Spieler hat noch keinen Platz.

export type OpenMatchInfo = {
  matchId: string;
  roundNumber: number | null;
  machineName: string | null;
  playerIds: string[];
};

type AnyRow = Record<string, unknown>;

const DONE_STATUS = new Set(["finished", "complete", "completed", "done"]);

export function findOpenMatches(data: {
  rounds?: AnyRow[] | null;
  matches?: AnyRow[] | null;
  match_players?: AnyRow[] | null;
  machines?: AnyRow[] | null;
} | null | undefined): OpenMatchInfo[] {
  if (!data) return [];
  const roundNo = new Map<string, number | null>();
  for (const r of data.rounds ?? []) {
    const n = Number(r?.number);
    roundNo.set(String(r?.id ?? ""), Number.isFinite(n) ? n : null);
  }
  const machineName = new Map<string, string>();
  for (const m of data.machines ?? []) machineName.set(String(m?.id ?? ""), String(m?.name ?? ""));

  const mpsByMatch = new Map<string, AnyRow[]>();
  for (const mp of data.match_players ?? []) {
    const mid = String(mp?.match_id ?? "");
    const list = mpsByMatch.get(mid) ?? [];
    list.push(mp);
    mpsByMatch.set(mid, list);
  }

  const out: OpenMatchInfo[] = [];
  for (const m of data.matches ?? []) {
    const mid = String(m?.id ?? "");
    const status = String(m?.status ?? "").toLowerCase();
    if (DONE_STATUS.has(status)) continue;
    const mps = mpsByMatch.get(mid) ?? [];
    if (!mps.length) continue;
    if (!mps.some((mp) => mp?.position == null)) continue;
    out.push({
      matchId: mid,
      roundNumber: roundNo.get(String(m?.round_id ?? "")) ?? null,
      machineName: machineName.get(String(m?.machine_id ?? "")) || null,
      playerIds: mps.map((mp) => String(mp?.player_id ?? "")),
    });
  }
  out.sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));
  return out;
}
