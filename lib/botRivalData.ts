// 🥊 Rivalen-Bot: alle direkten Duelle zwischen einem Spieler und seinem Rivalen laden (nur Server).
// Duell = Match, in dem beide ein Ergebnis (Platz oder Score) haben – alle Turniere, alle Locations,
// auch das laufende Turnier ("zählt sofort"). Rechnung: lib/botRival.ts

import { fetchAllIn } from "@/lib/supabaseChunks";
import { duelOutcome, type RivalDuel } from "@/lib/botRival";
import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export async function loadRivalDuels(
  sb: Sb,
  opts: { ownerProfileId: string; rivalProfileId: string; currentTournamentId?: string | null }
): Promise<{ duels: RivalDuel[]; error: string | null }> {
  const { data: pl, error: plErr } = await sb
    .from("players")
    .select("id, profile_id, tournament_id")
    .in("profile_id", [opts.ownerProfileId, opts.rivalProfileId]);
  if (plErr) return { duels: [], error: `Spieler laden fehlgeschlagen: ${plErr.message}` };

  const ownerPlayers = new Set<string>();
  const rivalPlayers = new Set<string>();
  const ownerT = new Set<string>();
  const rivalT = new Set<string>();
  for (const p of (pl ?? []) as { id: string; profile_id: string; tournament_id: string }[]) {
    if (String(p.profile_id) === String(opts.ownerProfileId)) {
      ownerPlayers.add(String(p.id));
      ownerT.add(String(p.tournament_id));
    } else {
      rivalPlayers.add(String(p.id));
      rivalT.add(String(p.tournament_id));
    }
  }
  const common = Array.from(ownerT).filter((t) => rivalT.has(t));
  if (!common.length) return { duels: [], error: null };

  const tr = await fetchAllIn<{ id: string; name: string | null; created_at: string | null }>(common, (chunk) =>
    sb.from("tournaments").select("id, name, created_at").in("id", chunk).order("id")
  );
  if (tr.error) return { duels: [], error: `Turniere laden fehlgeschlagen: ${tr.error.message}` };
  const tById = new Map(tr.data.map((t) => [String(t.id), t]));

  const mp = await fetchAllIn<{ match_id: string; player_id: string; position: number | null; score: number | string | null }>(
    [...Array.from(ownerPlayers), ...Array.from(rivalPlayers)],
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, position, score")
        .in("player_id", chunk)
        .order("match_id")
        .order("player_id")
  );
  if (mp.error) return { duels: [], error: `Ergebnisse laden fehlgeschlagen: ${mp.error.message}` };

  const byMatch = new Map<string, { owner?: { position: number | null; score: number | null }; rival?: { position: number | null; score: number | null } }>();
  for (const r of mp.data) {
    const v = { position: r.position ?? null, score: r.score != null && r.score !== "" ? Number(r.score) : null };
    const e = byMatch.get(String(r.match_id)) ?? {};
    if (ownerPlayers.has(String(r.player_id))) e.owner = v;
    else if (rivalPlayers.has(String(r.player_id))) e.rival = v;
    byMatch.set(String(r.match_id), e);
  }
  const both = Array.from(byMatch.entries()).filter(([, e]) => e.owner && e.rival);
  if (!both.length) return { duels: [], error: null };

  const ma = await fetchAllIn<{ id: string; round_id: string | null; machine_id: string | null }>(
    both.map(([id]) => id),
    (chunk) => sb.from("matches").select("id, round_id, machine_id").in("id", chunk).order("id")
  );
  if (ma.error) return { duels: [], error: `Matches laden fehlgeschlagen: ${ma.error.message}` };
  const rd = await fetchAllIn<{ id: string; number: number | null; tournament_id: string }>(
    Array.from(new Set(ma.data.map((m) => String(m.round_id ?? "")).filter(Boolean))),
    (chunk) => sb.from("rounds").select("id, number, tournament_id").in("id", chunk).order("id")
  );
  if (rd.error) return { duels: [], error: `Runden laden fehlgeschlagen: ${rd.error.message}` };
  const mc = await fetchAllIn<{ id: string; name: string | null }>(
    Array.from(new Set(ma.data.map((m) => String(m.machine_id ?? "")).filter(Boolean))),
    (chunk) => sb.from("machines").select("id, name").in("id", chunk).order("id")
  );
  if (mc.error) return { duels: [], error: `Flipper laden fehlgeschlagen: ${mc.error.message}` };
  const roundById = new Map(rd.data.map((r) => [String(r.id), r]));
  const machineName = new Map(mc.data.map((m) => [String(m.id), m.name]));
  const matchById = new Map(ma.data.map((m) => [String(m.id), m]));

  const duels: RivalDuel[] = [];
  for (const [matchId, e] of both) {
    const won = duelOutcome(e.owner!, e.rival!);
    if (won == null) continue;
    const m = matchById.get(matchId);
    const r = m?.round_id ? roundById.get(String(m.round_id)) : undefined;
    const t = r ? tById.get(String(r.tournament_id)) : undefined;
    if (!t) continue;
    duels.push({
      at: t.created_at ?? null,
      round: r?.number ?? null,
      tournament: String(t.name ?? "Turnier"),
      machine: m?.machine_id ? machineName.get(String(m.machine_id)) ?? null : null,
      ownerWon: won,
      current: String(t.id) === String(opts.currentTournamentId ?? ""),
    });
  }
  return { duels, error: null };
}
