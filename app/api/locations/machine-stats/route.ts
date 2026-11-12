// Admin (Login über middleware.ts), nur lesend:
// Statistik pro Flipper einer Location (Locations-Tab).
//
// GET /api/locations/machine-stats?locationId=...
// -> { ok: true, stats: { [locationMachineId]: MachineStat } }
//
// Zuordnung Turnier-Flipper → Location-Flipper über tournaments.location_id + Flipper-Name
// (siehe lib/machineStats.ts).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import {
  computeMachineStats,
  type MsLocationMachine,
  type MsMachine,
  type MsMatch,
  type MsMatchPlayer,
  type MsPlayer,
  type MsProfile,
  type MsTournament,
} from "@/lib/machineStats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const locationId = String(new URL(req.url).searchParams.get("locationId") ?? "").trim();
  if (!locationId) return json({ ok: false, error: "locationId fehlt" }, 400);

  const sb = supabaseAdmin();

  // 1) Flipper der Location
  const { data: lms, error: lmErr } = await sb
    .from("location_machines")
    .select("id, name")
    .eq("location_id", locationId);
  if (lmErr) return json({ ok: false, error: lmErr.message }, 500);
  const locationMachines = (lms ?? []) as MsLocationMachine[];
  const lmIds = locationMachines.map((x) => x.id);

  // 2) BEENDETE Turniere an dieser Location (laufende Turniere zählen nicht)
  const tRes = await fetchAllIn<MsTournament>([locationId], (chunk) =>
    sb
      .from("tournaments")
      .select("id, created_at, name, category")
      .in("location_id", chunk)
      .eq("status", "finished")
      .order("id") as any
  );
  if (tRes.error) return json({ ok: false, error: tRes.error.message }, 500);
  const tournamentIds = tRes.data.map((t) => t.id);

  // 3) Turnier-Flipper → Matches → Spieler-Ergebnisse
  const mRes = await fetchAllIn<MsMachine>(tournamentIds, (chunk) =>
    sb.from("machines").select("id, name, tournament_id").in("tournament_id", chunk).order("id") as any
  );
  if (mRes.error) return json({ ok: false, error: mRes.error.message }, 500);

  const matchRes = await fetchAllIn<MsMatch>(mRes.data.map((m) => m.id), (chunk) =>
    sb.from("matches").select("id, machine_id").in("machine_id", chunk).order("id") as any
  );
  if (matchRes.error) return json({ ok: false, error: matchRes.error.message }, 500);

  const mpRes = await fetchAllIn<MsMatchPlayer>(matchRes.data.map((m) => m.id), (chunk) =>
    sb
      .from("match_players")
      .select("match_id, player_id, position, score")
      .in("match_id", chunk)
      .order("match_id")
      .order("player_id") as any
  );
  if (mpRes.error) return json({ ok: false, error: mpRes.error.message }, 500);

  const pRes = await fetchAllIn<MsPlayer>(mpRes.data.map((x) => x.player_id), (chunk) =>
    sb.from("players").select("id, name, profile_id").in("id", chunk).order("id") as any
  );
  if (pRes.error) return json({ ok: false, error: pRes.error.message }, 500);

  const profIds = pRes.data.map((p) => String(p.profile_id ?? "")).filter(Boolean);
  const profRes = await fetchAllIn<MsProfile>(profIds, (chunk) =>
    sb.from("profiles").select("id, name, icon, color").in("id", chunk).order("id") as any
  );
  if (profRes.error) return json({ ok: false, error: profRes.error.message }, 500);

  // 4) Tasks + Single-Play-Läufe (per ID am Location-Flipper)
  const taskRes = await fetchAllIn<{ location_machine_id: string; active: boolean | null; title: string | null; difficulty: string | null }>(lmIds, (chunk) =>
    sb.from("machine_tasks").select("id, location_machine_id, active, title, difficulty").in("location_machine_id", chunk).order("id") as any
  );
  if (taskRes.error) return json({ ok: false, error: taskRes.error.message }, 500);

  const runRes = await fetchAllIn<{ machine_id: string | null; status: string | null }>(lmIds, (chunk) =>
    sb.from("single_play_runs").select("id, machine_id, status").in("machine_id", chunk).order("id") as any
  );
  if (runRes.error) return json({ ok: false, error: runRes.error.message }, 500);

  const stats = computeMachineStats({
    locationMachines,
    tournaments: tRes.data,
    machines: mRes.data,
    matches: matchRes.data,
    matchPlayers: mpRes.data,
    players: pRes.data,
    profiles: profRes.data,
    tasks: taskRes.data,
    singlePlayRuns: runRes.data,
  });

  return json({ ok: true, stats });
}
