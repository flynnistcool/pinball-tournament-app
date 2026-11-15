// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllRows } from "@/lib/supabaseChunks";

// Sorgt dafür, dass Next diese Route NICHT vor-rendered/cached
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const sb = supabaseAdmin();

  // 🔹 1) Profile laden (unverändert)
  const { data: profiles, error } = await sb
    .from("profiles")
    .select("id, name, rating, matches_played, provisional_matches, color, icon, info, is_bot, bot_kind, exclude_from_stats")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 🔹 2) Turnierpunkte aus tournament_results laden
  //    (>1000 Zeilen: seitenweise laden, sonst fehlen still Turniere)
  const { data: trRows, error: trError } = await fetchAllRows(() =>
    sb
      .from("tournament_results")
      .select("tournament_points, players!inner(profile_id)")
      .order("tournament_id")
      .order("player_id")
  );

  if (trError) {
    return NextResponse.json({ error: trError.message }, { status: 500 });
  }

  // 🔹 3) Turnierpunkte pro Profil aufsummieren
  const pointsByProfile: Record<string, number> = {};

  for (const row of (trRows ?? []) as any[]) {
    const profileId = row?.players?.profile_id as string | undefined;
    if (!profileId) continue;

    const tp = Number(row.tournament_points ?? 0);
    pointsByProfile[profileId] =
      (pointsByProfile[profileId] ?? 0) + tp;
  }

  // 🔹 4) Profile um total_tournament_points erweitern
  const enrichedProfiles = (profiles ?? []).map((p: any) => ({
    ...p,
    total_tournament_points: pointsByProfile[p.id] ?? 0,
  }));

  return NextResponse.json(
    { profiles: enrichedProfiles },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
