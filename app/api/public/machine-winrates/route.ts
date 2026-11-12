// Öffentlich (nur lesend) – für den Infobildschirm /s/CODE/tv.
// Flipper-Winrate je Spieler (Profil) und Flipper-NAME an der Location des Turniers,
// über alle Turniere dieser Location. Gleiche Logik wie /api/winrates/machine-location
// (dort Admin-only), aber der Client übergibt nur den Turniercode.
//
// GET /api/public/machine-winrates?code=ABC123
// -> { rows: [{ profileId, machineName, matchesPlayed, wins, winrate }] }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

type Row = {
  position: number | null;
  players: { profile_id: string | null } | null;
  matches: { machines: { name: string | null } | null } | null;
};

export async function GET(req: Request) {
  const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return noStoreJson({ error: "Code fehlt", rows: [] }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, location_id")
    .eq("code", code)
    .maybeSingle();
  if (tErr) return noStoreJson({ error: tErr.message, rows: [] }, { status: 500 });
  if (!t) return noStoreJson({ error: "Turnier nicht gefunden", rows: [] }, { status: 404 });
  if (!t.location_id) return noStoreJson({ rows: [] }); // ohne Location keine Flipper-Winrate

  const [{ data: players, error: pErr }, { data: machines, error: mErr }, { data: tourneys, error: lErr }] =
    await Promise.all([
      sb.from("players").select("profile_id").eq("tournament_id", t.id),
      sb.from("machines").select("name").eq("tournament_id", t.id),
      sb.from("tournaments").select("id").eq("location_id", t.location_id),
    ]);
  const firstErr = pErr ?? mErr ?? lErr;
  if (firstErr) return noStoreJson({ error: firstErr.message, rows: [] }, { status: 500 });

  const profileIds = Array.from(
    new Set((players ?? []).map((p) => String(p.profile_id ?? "")).filter(Boolean))
  );
  const machineNames = Array.from(
    new Set((machines ?? []).map((m) => String(m.name ?? "").trim()).filter(Boolean))
  );
  const tournamentIds = (tourneys ?? []).map((x) => String(x.id)).filter(Boolean);
  if (!profileIds.length || !machineNames.length || !tournamentIds.length) {
    return noStoreJson({ rows: [] });
  }

  // In Paketen über die Turniere der Location laden (lange URLs / 1000-Zeilen-Limit vermeiden)
  const { data, error } = await fetchAllIn<Row>(tournamentIds, (chunk) =>
    sb
      .from("match_players")
      .select(
        `
        position,
        players!inner(profile_id),
        matches!inner(
          machine_id,
          machines!inner(name),
          rounds!inner(tournament_id)
        )
      `
      )
      .in("players.profile_id", profileIds)
      // nach Flipper-NAME gruppieren (wie Admin), damit neu angelegte Maschinen gleichen Namens zählen
      .in("matches.machines.name", machineNames)
      .in("matches.rounds.tournament_id", chunk)
      .not("position", "is", null)
      .order("match_id")
      .order("player_id") as any
  );
  if (error) return noStoreJson({ error: error.message, rows: [] }, { status: 500 });

  const acc: Record<string, { profileId: string; machineName: string; matchesPlayed: number; wins: number }> = {};
  for (const row of data) {
    const profileId = String(row?.players?.profile_id ?? "");
    const machineName = String(row?.matches?.machines?.name ?? "");
    if (!profileId || !machineName) continue;
    const key = `${profileId}__${machineName}`;
    acc[key] ||= { profileId, machineName, matchesPlayed: 0, wins: 0 };
    acc[key].matchesPlayed += 1;
    if (Number(row.position) === 1) acc[key].wins += 1;
  }

  const rows = Object.values(acc).map((r) => ({
    ...r,
    winrate: r.matchesPlayed > 0 ? Math.round((r.wins / r.matchesPlayed) * 1000) / 10 : null,
  }));
  return noStoreJson({ rows });
}
