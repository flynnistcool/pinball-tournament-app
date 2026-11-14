// 🤖 KI-Bots: Daten für die Score-Rechnung aus der Datenbank laden (nur Server).
// Liefert alle früheren Scores an einem Flipper (Name) in einer Location – aus BEENDETEN Turnieren,
// mit der Elo jedes Spielers zu Beginn jenes Turniers (tournament_ratings).
// Gefiltert/gewichtet wird erst in lib/botScore.ts (dort steht dann auch, was aussortiert wurde).

import { fetchAllIn } from "@/lib/supabaseChunks";
import { machineKey } from "@/lib/machineStats";
import type { BotRawSample } from "@/lib/botScore";
import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export async function loadBotSamples(
  sb: Sb,
  opts: { locationId: string; machineName: string; excludeTournamentId?: string | null }
): Promise<{ samples: BotRawSample[]; error: string | null }> {
  const key = machineKey(opts.machineName);

  const { data: ts, error: tErr } = await sb
    .from("tournaments")
    .select("id, name, format, extraball, created_at")
    .eq("location_id", opts.locationId)
    .eq("status", "finished");
  if (tErr) return { samples: [], error: `Turniere laden fehlgeschlagen: ${tErr.message}` };

  const tours = (ts ?? []).filter((t: { id: string }) => String(t.id) !== String(opts.excludeTournamentId ?? ""));
  const tById = new Map(tours.map((t: any) => [String(t.id), t]));
  const tIds = Array.from(tById.keys());
  if (!tIds.length) return { samples: [], error: null };

  const ma = await fetchAllIn<{ id: string; name: string | null; tournament_id: string }>(tIds, (chunk) =>
    sb.from("machines").select("id, name, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (ma.error) return { samples: [], error: `Flipper laden fehlgeschlagen: ${ma.error.message}` };
  const machines = ma.data.filter((m) => machineKey(m.name) === key);
  const tByMachine = new Map(machines.map((m) => [String(m.id), String(m.tournament_id)]));
  if (!machines.length) return { samples: [], error: null };

  const mr = await fetchAllIn<{ id: string; machine_id: string }>(
    machines.map((m) => String(m.id)),
    (chunk) => sb.from("matches").select("id, machine_id").in("machine_id", chunk).order("id")
  );
  if (mr.error) return { samples: [], error: `Matches laden fehlgeschlagen: ${mr.error.message}` };
  const tByMatch = new Map(mr.data.map((m) => [String(m.id), tByMachine.get(String(m.machine_id)) ?? ""]));

  const mp = await fetchAllIn<{
    match_id: string;
    player_id: string;
    score: number | string | null;
    stats_ignored: boolean | null;
  }>(
    mr.data.map((m) => String(m.id)),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, score, stats_ignored")
        .in("match_id", chunk)
        .not("score", "is", null)
        .order("match_id")
        .order("player_id")
  );
  if (mp.error) return { samples: [], error: `Scores laden fehlgeschlagen: ${mp.error.message}` };

  const pl = await fetchAllIn<{ id: string; name: string | null; profile_id: string | null }>(
    Array.from(new Set(mp.data.map((r) => String(r.player_id)))),
    (chunk) => sb.from("players").select("id, name, profile_id").in("id", chunk).order("id")
  );
  if (pl.error) return { samples: [], error: `Spieler laden fehlgeschlagen: ${pl.error.message}` };
  const playerById = new Map(pl.data.map((p) => [String(p.id), p]));

  const profileIds = Array.from(new Set(pl.data.map((p) => p.profile_id).filter(Boolean).map(String)));
  const pr = await fetchAllIn<{ id: string; is_bot: boolean | null; exclude_from_stats: boolean | null }>(
    profileIds,
    (chunk) => sb.from("profiles").select("id, is_bot, exclude_from_stats").in("id", chunk).order("id")
  );
  if (pr.error) return { samples: [], error: `Profile laden fehlgeschlagen: ${pr.error.message}` };
  const botIds = new Set(pr.data.filter((p) => p.is_bot).map((p) => String(p.id)));
  const placeholderIds = new Set(pr.data.filter((p) => p.exclude_from_stats).map((p) => String(p.id)));

  const usedTournamentIds = Array.from(new Set(Array.from(tByMatch.values()).filter(Boolean)));
  const tr = await fetchAllIn<{
    tournament_id: string;
    profile_id: string;
    rating_before: number | null;
    provisional_before: number | null;
    matches_before: number | null;
  }>(usedTournamentIds, (chunk) =>
    sb
      .from("tournament_ratings")
      .select("tournament_id, profile_id, rating_before, provisional_before, matches_before")
      .in("tournament_id", chunk)
      .order("tournament_id")
      .order("profile_id")
  );
  if (tr.error) return { samples: [], error: `Elo-Startwerte laden fehlgeschlagen: ${tr.error.message}` };
  const ratingOf = new Map(tr.data.map((r) => [`${r.tournament_id}|${r.profile_id}`, r]));

  const samples: BotRawSample[] = [];
  for (const row of mp.data) {
    const score = Number(row.score);
    if (!Number.isFinite(score) || score <= 0) continue;
    const tid = tByMatch.get(String(row.match_id));
    const t: any = tid ? tById.get(tid) : null;
    if (!t) continue;
    const p = playerById.get(String(row.player_id));
    const profId = p?.profile_id ? String(p.profile_id) : null;
    const r = profId ? ratingOf.get(`${tid}|${profId}`) : undefined;
    samples.push({
      score,
      elo: r?.rating_before != null ? Number(r.rating_before) : null,
      provisionalBefore: r?.provisional_before != null ? Number(r.provisional_before) : null,
      matchesBefore: r?.matches_before != null ? Number(r.matches_before) : null,
      isBot: profId ? botIds.has(profId) : false,
      format: t.format ?? null,
      extraball: t.extraball === true,
      playerName: String(p?.name ?? "?"),
      tournamentName: String(t.name ?? "?"),
      date: t.created_at ?? null,
      placeholder: profId ? placeholderIds.has(profId) : false,
      scoreIgnored: row.stats_ignored === true,
      matchId: String(row.match_id),
      playerId: String(row.player_id),
    });
  }
  return { samples, error: null };
}
