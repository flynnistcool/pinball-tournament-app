// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// POST
// {
//   profileIds: string[],
//   machineNames: string[],
//   locationId: string
// }
//
// Returns { rows: [{ profileId, machineName, locationId, matchesPlayed, wins, winrate }] }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const profileIds = Array.isArray(body.profileIds) ? body.profileIds.map(String) : [];
  const machineNames = Array.isArray(body.machineNames)
    ? body.machineNames.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];
  const locationId = String(body.locationId ?? "");

  if (!locationId || profileIds.length === 0 || machineNames.length === 0) {
    return noStoreJson({ rows: [] });
  }

  const sb = supabaseAdmin();

  // Find all tournaments at this location (avoid deep nested filters)
  const { data: tourneys, error: tErr } = await sb
    .from("tournaments")
    .select("id")
    .eq("location_id", locationId);

  if (tErr) {
    return noStoreJson({ error: tErr.message, rows: [] }, { status: 500 });
  }

  const tournamentIds = (tourneys ?? []).map((t: any) => String(t.id)).filter(Boolean);
  if (tournamentIds.length === 0) {
    return noStoreJson({ rows: [] });
  }

  const { data, error } = await sb
    .from("match_players")
    .select(
      `
      position,
      players!inner(profile_id),
      matches!inner(
        machine_id,
        machines!inner(name),
        status,
        rounds!inner(tournament_id)
      )
    `
    )
    .in("players.profile_id", profileIds)
    // IMPORTANT: group by *machine name* (like the player statistics page).
    // This avoids "new machine_id" resets when you recreate machines but keep the same name.
    .in("matches.machines.name", machineNames)
    // Don't rely on match status. We only count rows with a position anyway.
    .in("matches.rounds.tournament_id", tournamentIds)
    .not("position", "is", null);

  if (error) {
    return noStoreJson({ error: error.message, rows: [] }, { status: 500 });
  }

  const acc: Record<
    string,
    { profileId: string; machineName: string; locationId: string; matchesPlayed: number; wins: number }
  > = {};

  for (const row of data ?? []) {
    const profileId = row?.players?.profile_id ? String(row.players.profile_id) : "";
    const machineName = row?.matches?.machines?.name ? String(row.matches.machines.name) : "";
    if (!profileId || !machineName) continue;

    const key = `${profileId}__${machineName}__${locationId}`;
    if (!acc[key]) acc[key] = { profileId, machineName, locationId, matchesPlayed: 0, wins: 0 };
    acc[key].matchesPlayed += 1;
    if (Number(row.position) === 1) acc[key].wins += 1;
  }

  const rows = Object.values(acc).map((r) => ({
    ...r,
    winrate: r.matchesPlayed > 0 ? Math.round((r.wins / r.matchesPlayed) * 1000) / 10 : null,
  }));

  return noStoreJson({ rows });
}
