import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

function matchPointsFor(position: number, nPlayers: number) {
  // Linear: 1st gets N, 2nd N-1, ... last gets 1
  if (!nPlayers || nPlayers <= 1) return 0;
  if (!position || position < 1) return 0;
  return Math.max(1, nPlayers - position + 1);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(5, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
  const category = String(url.searchParams.get("category") ?? "all").toLowerCase(); // all|normal|league
  const yearRaw = url.searchParams.get("year");
  const year = yearRaw ? Number(yearRaw) : null;
  const q = String(url.searchParams.get("q") ?? "").trim();

  const sb = supabaseAdmin();

  let tq = sb
    .from("tournaments")
    .select("id, code, name, created_at, category, season_year, location_id, locations(name)")
    .order("created_at", { ascending: false });

  if (category === "normal" || category === "league") tq = tq.eq("category", category);
  if (year && Number.isFinite(year)) tq = tq.eq("season_year", year);
  if (q) tq = tq.ilike("name", `%${q}%`);

  const { data: tournaments, error: tErr } = await tq.limit(limit);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const tids = (tournaments ?? []).map((t: any) => t.id);
  if (!tids.length) return NextResponse.json({ tournaments: [], leaderboard: [] });

  // Overall leaderboard across filtered tournaments (match results)
  const { data: mps, error } = await sb
    .from("match_players")
    .select("position, matches!inner(id), players!inner(name, profile_id, tournament_id)")
    .in("players.tournament_id", tids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // match sizes
  const matchToCount: Record<string, number> = {};
  for (const row of (mps ?? []) as any[]) {
    const mid = row.matches.id as string;
    matchToCount[mid] = (matchToCount[mid] ?? 0) + 1;
  }

  type Agg = { key: string; name: string; profileId: string | null; points: number; matches: number; wins: number; tournaments: Set<string> };
  const agg: Record<string, Agg> = {};
  for (const row of (mps ?? []) as any[]) {
    if (row.position == null) continue;
    const pname = row.players?.name as string;
    const profileId = row.players?.profile_id as string | null;
    const key = profileId ?? `name:${pname}`;
    const tId = row.players?.tournament_id as string;

    const a = agg[key] ?? { key, name: pname, profileId: profileId ?? null, points: 0, matches: 0, wins: 0, tournaments: new Set() };
    a.matches += 1;
    if (row.position === 1) a.wins += 1;
    a.points += matchPointsFor(row.position, matchToCount[row.matches.id] ?? 0);
    if (tId) a.tournaments.add(tId);
    agg[key] = a;
  }

  const leaderboard = Object.values(agg)
    .map(a => ({
      key: a.key,
      name: a.name,
      profileId: a.profileId,
      points: a.points,
      matches: a.matches,
      wins: a.wins,
      winrate: a.matches ? Math.round((a.wins / a.matches) * 1000) / 10 : 0,
      tournamentsPlayed: a.tournaments.size,
    }))
    .sort((a:any,b:any)=> (b.points-a.points) || (b.wins-a.wins) || a.name.localeCompare(b.name))
    .slice(0, 50);

  return NextResponse.json({ tournaments: tournaments ?? [], leaderboard });
}
