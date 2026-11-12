import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: t, error: tErr } = await sb
    .from("tournaments")
    // Hinweis: season_year und best_of existieren in der Live-DB nicht -> nicht abfragen
    .select("id, code, name, created_at, category, match_size, format, location_id, locations(name), status")
    .eq("code", code)
    .single();

  // Echten DB-Fehler melden statt pauschal "nicht gefunden" (erleichtert Fehlersuche)
  if (tErr && tErr.code !== "PGRST116") {
    return NextResponse.json({ error: `Turnier laden fehlgeschlagen: ${tErr.message}` }, { status: 500 });
  }
  if (!t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // Load core entities first
  const [{ data: players, error: pErr }, { data: machines, error: mErr }, { data: rounds, error: rErr }] =
    await Promise.all([
      sb.from("players").select("id, name, active, profile_id").eq("tournament_id", t.id).order("created_at"),
      sb.from("machines").select("id, name, active, icon_emoji").eq("tournament_id", t.id).order("created_at"),
      sb.from("rounds").select("id, format, number, status, elo_enabled").eq("tournament_id", t.id).order("format").order("number"),
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
      .select("match_id, player_id, position, start_position, score") // score: für Infobildschirm (/s/CODE/tv)
      .in("match_id", matchIds)
      .order("start_position", { ascending: true })
  : { data: [], error: null as any };

  if (mpErr) return NextResponse.json({ error: `MatchPlayers load failed: ${mpErr.message}` }, { status: 500 });

  // Profil-Optik (Emoji + Farbe) für Infobildschirm – optional, Fehler hier sind nicht kritisch
  const profileIds = Array.from(
    new Set((players ?? []).map((p: any) => p.profile_id).filter(Boolean))
  ) as string[];
  const { data: profiles } = profileIds.length
    ? await sb.from("profiles").select("id, icon, color, rating").in("id", profileIds)
    : { data: [] as any[] };

  // Elo-Stand vor dem Turnier (Sicherung beim Turnierstart) – für Infobildschirm
  const { data: startRatings } = await sb
    .from("tournament_ratings")
    .select("profile_id, rating_before")
    .eq("tournament_id", t.id);

  // Superfinale (falls gestartet) – für das Superfinale-Podest im Infobildschirm
  let final: {
    status: string | null;
    target_points: number | null;
    players: { player_id: string; seed: number; start_points: number; points: number }[];
  } | null = null;
  const { data: finales } = await sb
    .from("finales")
    .select("id, status, target_points")
    .eq("tournament_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (finales && finales.length > 0) {
    const f: any = finales[0];
    const { data: fps } = await sb
      .from("final_players")
      .select("player_id, seed, start_points, points")
      .eq("final_id", f.id)
      .order("seed", { ascending: true });
    final = {
      status: f.status ?? null,
      target_points: f.target_points ?? null,
      players: (fps ?? []) as any[],
    };
  }

  return NextResponse.json({
    tournament: t,
    final,
    profiles: profiles ?? [],
    start_ratings: startRatings ?? [],
    players: players ?? [],
    machines: machines ?? [],
    rounds: rounds ?? [],
    matches: matches ?? [],
    match_players: matchPlayers ?? [],
  });
}