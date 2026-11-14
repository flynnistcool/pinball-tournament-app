import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { humanTournamentResults, loadStatsExclusions } from "@/lib/statsExclusions";

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

  // 🛡️ Statistik-Schutz: 🤖 Training-Turniere raus, Plätze nur unter Menschen (wie in der Rangliste)
  const tIds = Array.from(new Set((data ?? []).map((r: any) => String(r.tournament_id))));
  const keep = new Map<string, number | null>(); // `${tournament_id}|${player_id}` → Platz unter Menschen
  if (tIds.length) {
    const ex = await loadStatsExclusions(sb);
    const { data: allRes } = await sb
      .from("tournament_results")
      .select("tournament_id, player_id, final_rank")
      .in("tournament_id", tIds);
    const allPlayerIds = Array.from(new Set((allRes ?? []).map((r: any) => String(r.player_id))));
    const { data: pl } = allPlayerIds.length
      ? await sb.from("players").select("id, profile_id").in("id", allPlayerIds)
      : { data: [] as any[] };
    const prof = new Map((pl ?? []).map((x: any) => [String(x.id), x.profile_id ? String(x.profile_id) : null]));
    for (const r of humanTournamentResults((allRes ?? []) as any[], ex, (pid) => prof.get(pid) ?? null)) {
      keep.set(`${r.tournament_id}|${r.player_id}`, r.final_rank ?? null);
    }
  }

  // Bot-/Platzhalter-Profil selbst: eigene Ergebnisse unverändert zeigen (echter Platz)
  const exSelf = profileId ? await loadStatsExclusions(sb) : null;
  const showRaw = !!(profileId && exSelf && exSelf.excludedProfileIds.has(String(profileId)));
  const rows = (data ?? []).filter((r: any) => showRaw || keep.has(`${r.tournament_id}|${r.player_id}`)).map((r: any) => ({
    tournament_id: r.tournament_id,
    tournament_code: r.tournaments?.code ?? null,
    tournament_name: r.tournaments?.name ?? null,
    tournament_category: r.tournaments?.category ?? null,
    created_at: r.tournaments?.created_at ?? null,
    final_rank: showRaw ? r.final_rank ?? null : keep.get(`${r.tournament_id}|${r.player_id}`) ?? r.final_rank ?? null,
    tournament_points: r.tournament_points ?? 0,
    super_final_rank: r.super_final_rank ?? null, // für Aufschlüsselung "6 TP + 2 🔥"
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
