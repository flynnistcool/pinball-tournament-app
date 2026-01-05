import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const sp = url.searchParams;

  const profileId = (sp.get("profileId") || "").trim();
  const playerName = (sp.get("name") || "").trim();

  const category = (sp.get("category") || "").trim();
  const search = (sp.get("search") || "").trim();
  const from = (sp.get("from") || "").trim();
  const to = (sp.get("to") || "").trim();

  if (!profileId && !playerName) {
    return NextResponse.json(
      { error: "Missing profileId or name" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  // 1) Player IDs ermitteln
  let playerIds: string[] = [];

  if (profileId) {
    const { data: players, error } = await sb
      .from("players")
      .select("id")
      .eq("profile_id", profileId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    playerIds = (players ?? []).map((p) => p.id);
  }

  // Fallback: wenn kein profileId oder kein Spieler dazu gefunden -> name nutzen
  // (Achtung: name-match ist weniger stabil, aber ok als Backup)
  const useNameFallback = playerIds.length === 0 && !!playerName;

  // 2) Query: tournament_results + tournaments!inner
  let q = sb
    .from("tournament_results")
    .select(
      `
      tournament_id,
      player_id,
      player_name,
      final_rank,
      super_final_rank,
      tournament_points,
      tournaments!inner(
        id,
        code,
        category,
        name,
        status,
        created_at
      )
    `
    )
    .eq("tournaments.status", "finished");

  // Spielerfilter
  if (useNameFallback) {
    q = q.eq("player_name", playerName);
  } else {
    q = q.in("player_id", playerIds);
  }

  // Filter wie im Leaderboard
  if (category) q = q.ilike("tournaments.category", `%${category}%`);
  if (search) q = q.ilike("tournaments.name", `%${search}%`);
  if (from) q = q.gte("tournaments.created_at", `${from}T00:00:00`);
  if (to) q = q.lte("tournaments.created_at", `${to}T23:59:59`);

  const { data, error } = await q;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const rows = (data ?? []).map((r: any) => ({
    tournament_id: r.tournament_id,
    tournament_code: r.tournaments?.code ?? null,
    tournament_name: r.tournaments?.name ?? null,
    tournament_category: r.tournaments?.category ?? null,
    created_at: r.tournaments?.created_at ?? null,
    final_rank: r.final_rank ?? null,
    tournament_points: r.tournament_points ?? 0,
  }));

  // Sortierung: Punkte desc, bei Gleichstand neuestes zuerst
  rows.sort((a: any, b: any) => {
    if ((b.tournament_points ?? 0) !== (a.tournament_points ?? 0)) {
      return (b.tournament_points ?? 0) - (a.tournament_points ?? 0);
    }
    const ad = a.created_at ? Date.parse(a.created_at) : 0;
    const bd = b.created_at ? Date.parse(b.created_at) : 0;
    return bd - ad;
  });

  return NextResponse.json(
    { rows },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
