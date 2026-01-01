import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, code, name, created_at, category, season_year, best_of, match_size, location_id, locations(name), status")
    .eq("code", code)
    .single();

  if (tErr || !t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // Load core entities first
  const [{ data: players, error: pErr }, { data: machines, error: mErr }, { data: rounds, error: rErr }] =
    await Promise.all([
      sb.from("players").select("id, name, active, profile_id").eq("tournament_id", t.id).order("created_at"),
      sb.from("machines").select("id, name, active").eq("tournament_id", t.id).order("created_at"),
      sb.from("rounds").select("id, format, number, status").eq("tournament_id", t.id).order("format").order("number"),
    ]);

  if (pErr) return NextResponse.json({ error: `Players load failed: ${pErr.message}` }, { status: 500 });
  if (mErr) return NextResponse.json({ error: `Machines load failed: ${mErr.message}` }, { status: 500 });
  if (rErr) return NextResponse.json({ error: `Rounds load failed: ${rErr.message}` }, { status: 500 });

  const roundIds = (rounds ?? []).map((r: any) => r.id);

  // Load matches for those rounds
  const { data: matches, error: matchErr } = roundIds.length
    ? await sb
        .from("matches")
        .select("id, round_id, machine_id, status, series_id, game_number, created_at")
        .in("round_id", roundIds)
        .order("created_at")
    : { data: [], error: null as any };

  if (matchErr) return NextResponse.json({ error: `Matches load failed: ${matchErr.message}` }, { status: 500 });

  // Load match_players for those matches
  const matchIds = (matches ?? []).map((m: any) => m.id);

const { data: matchPlayers, error: mpErr } = matchIds.length
  ? await sb
      .from("match_players")
      .select("match_id, player_id, position, start_position")
      .in("match_id", matchIds)
      .order("start_position", { ascending: true })
  : { data: [], error: null as any };

  if (mpErr) return NextResponse.json({ error: `MatchPlayers load failed: ${mpErr.message}` }, { status: 500 });

  return NextResponse.json({
    tournament: t,
    players: players ?? [],
    machines: machines ?? [],
    rounds: rounds ?? [],
    matches: matches ?? [],
    match_players: matchPlayers ?? [],
  });
}