// 👻/⚡ Daten für Ghost- und Form-Bot laden (nur Server): alle Scores EINES Spielers (Profil) an einem
// Flipper (Name) in einer Location – aus beendeten Turnieren UND dem laufenden Turnier (Form von heute).
// Das Match, in dem der Bot gerade spielt, zählt nicht mit. Rechnung: lib/botMirror.ts

import { fetchAllIn } from "@/lib/supabaseChunks";
import { machineKey } from "@/lib/machineStats";
import type { MirrorSample } from "@/lib/botMirror";
import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export async function loadOwnerMachineScores(
  sb: Sb,
  opts: {
    ownerProfileId: string;
    locationId: string;
    machineName: string;
    currentTournamentId: string;
    /** das Match, in dem der Bot gerade würfelt (zählt nicht) */
    excludeMatchId?: string | null;
  }
): Promise<{ samples: MirrorSample[]; error: string | null }> {
  const key = machineKey(opts.machineName);

  // 1) alle Turnier-Einträge des Spielers
  const { data: pl, error: plErr } = await sb
    .from("players")
    .select("id, tournament_id")
    .eq("profile_id", opts.ownerProfileId);
  if (plErr) return { samples: [], error: `Spieler laden fehlgeschlagen: ${plErr.message}` };
  const playerIds = new Set((pl ?? []).map((p: { id: string }) => String(p.id)));
  const tIdsAll = Array.from(new Set((pl ?? []).map((p: { tournament_id: string }) => String(p.tournament_id))));
  if (!tIdsAll.length) return { samples: [], error: null };

  // 2) davon: Turniere an dieser Location – beendet oder das laufende
  const tr = await fetchAllIn<{
    id: string;
    name: string | null;
    format: string | null;
    extraball: boolean | null;
    created_at: string | null;
    status: string | null;
    location_id: string | null;
  }>(tIdsAll, (chunk) =>
    sb.from("tournaments").select("id, name, format, extraball, created_at, status, location_id").in("id", chunk).order("id")
  );
  if (tr.error) return { samples: [], error: `Turniere laden fehlgeschlagen: ${tr.error.message}` };
  const tours = tr.data.filter(
    (t) =>
      String(t.location_id ?? "") === String(opts.locationId) &&
      (t.status === "finished" || String(t.id) === String(opts.currentTournamentId))
  );
  const tById = new Map(tours.map((t) => [String(t.id), t]));
  if (!tById.size) return { samples: [], error: null };

  // 3) Flipper gleichen Namens in diesen Turnieren
  const mc = await fetchAllIn<{ id: string; name: string | null; tournament_id: string }>(Array.from(tById.keys()), (chunk) =>
    sb.from("machines").select("id, name, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (mc.error) return { samples: [], error: `Flipper laden fehlgeschlagen: ${mc.error.message}` };
  const machines = mc.data.filter((m) => machineKey(m.name) === key);
  const tournamentOfMachine = new Map(machines.map((m) => [String(m.id), String(m.tournament_id)]));
  if (!machines.length) return { samples: [], error: null };

  // 4) Matches an diesen Flippern (+ Rundennummer für die Reihenfolge)
  const ma = await fetchAllIn<{ id: string; machine_id: string; round_id: string | null }>(
    machines.map((m) => String(m.id)),
    (chunk) => sb.from("matches").select("id, machine_id, round_id").in("machine_id", chunk).order("id")
  );
  if (ma.error) return { samples: [], error: `Matches laden fehlgeschlagen: ${ma.error.message}` };
  const matches = ma.data.filter((m) => String(m.id) !== String(opts.excludeMatchId ?? ""));
  if (!matches.length) return { samples: [], error: null };
  const rd = await fetchAllIn<{ id: string; number: number | null }>(
    Array.from(new Set(matches.map((m) => String(m.round_id ?? "")).filter(Boolean))),
    (chunk) => sb.from("rounds").select("id, number").in("id", chunk).order("id")
  );
  if (rd.error) return { samples: [], error: `Runden laden fehlgeschlagen: ${rd.error.message}` };
  const roundNo = new Map(rd.data.map((r) => [String(r.id), r.number ?? null]));
  const matchById = new Map(matches.map((m) => [String(m.id), m]));

  // 5) seine Scores in diesen Matches
  const mp = await fetchAllIn<{ match_id: string; player_id: string; score: number | string | null; stats_ignored: boolean | null }>(
    matches.map((m) => String(m.id)),
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

  const samples: MirrorSample[] = [];
  for (const r of mp.data) {
    if (!playerIds.has(String(r.player_id))) continue;
    const score = Number(r.score);
    if (!(score > 0)) continue;
    const m = matchById.get(String(r.match_id));
    if (!m) continue;
    const t = tById.get(tournamentOfMachine.get(String(m.machine_id)) ?? "");
    if (!t) continue;
    samples.push({
      score,
      format: t.format ?? null,
      extraball: t.extraball === true,
      at: t.created_at ?? null,
      round: m.round_id ? roundNo.get(String(m.round_id)) ?? null : null,
      tournamentName: String(t.name ?? "Turnier"),
      current: String(t.id) === String(opts.currentTournamentId),
      scoreIgnored: r.stats_ignored === true,
    });
  }
  return { samples, error: null };
}
