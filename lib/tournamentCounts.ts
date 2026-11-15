// 👤 Teilnehmer je Turnier, aufgeteilt in Spieler / Platzhalter / Bots – für Statistik-Tabellen.

import { fetchAllIn } from "@/lib/supabaseChunks";
import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export type TournamentCounts = { humans: number; placeholders: number; bots: number };

export async function loadTournamentPlayerCounts(
  sb: Sb,
  tournamentIds: readonly string[],
  ex: { botProfileIds: ReadonlySet<string>; placeholderProfileIds: ReadonlySet<string> }
): Promise<Map<string, TournamentCounts>> {
  const out = new Map<string, TournamentCounts>();
  const ids = Array.from(new Set(tournamentIds.map(String).filter(Boolean)));
  if (!ids.length) return out;
  const res = await fetchAllIn<{ id: string; tournament_id: string; profile_id: string | null }>(ids, (chunk) =>
    sb.from("players").select("id, tournament_id, profile_id").in("tournament_id", chunk).order("id")
  );
  for (const p of res.data) {
    const tid = String(p.tournament_id);
    const c = out.get(tid) ?? { humans: 0, placeholders: 0, bots: 0 };
    const prof = p.profile_id ? String(p.profile_id) : "";
    if (prof && ex.botProfileIds.has(prof)) c.bots++;
    else if (prof && ex.placeholderProfileIds.has(prof)) c.placeholders++;
    else c.humans++;
    out.set(tid, c);
  }
  return out;
}
