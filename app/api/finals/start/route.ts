import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getStartPointsForSeed } from "@/lib/finals";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: t } = await sb
    .from("tournaments")
    .select("id")
    .eq("code", code)
    .single();

  if (!t) {
    return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });
  }

  // Spieler + Match-Resultate holen für Seed-Berechnung
  const { data: players } = await sb
    .from("players")
    .select("id, name, active")
    .eq("tournament_id", t.id)
    .order("created_at");

  if (!players || players.length === 0) {
    return NextResponse.json({ error: "Keine Spieler im Turnier" }, { status: 400 });
  }

  // 🤖 Mit KI-Bots im Turnier gibt es kein Super-Finale
  {
    const { data: pl } = await sb.from("players").select("profile_id").eq("tournament_id", t.id);
    const profileIds = Array.from(new Set((pl ?? []).map((x: any) => x.profile_id).filter(Boolean)));
    const { data: botProfiles } = profileIds.length
      ? await sb.from("profiles").select("id").in("id", profileIds).eq("is_bot", true).limit(1)
      : { data: [] as any[] };
    if (botProfiles && botProfiles.length > 0) {
      return NextResponse.json(
        { ok: false, error: "🤖 Mit KI-Bots im Turnier gibt es kein Super-Finale." },
        { status: 400 }
      );
    }
  }

  const { data: rows } = await sb
    .from("match_players")
    .select(
      "player_id, position, matches!inner(rounds!inner(tournament_id))"
    )
    .eq("matches.rounds.tournament_id", t.id);

  const points: Record<string, number> = {};
  for (const p of players) points[p.id] = 0;

  for (const r of (rows ?? []) as any[]) {
    const pid = r.player_id as string;
    const pos = r.position as number | null;
    if (!pid || pos == null) continue;

    // simple mapping: 1->4, 2->2, 3->1, 4->0
    const map4: Record<number, number> = { 1: 4, 2: 2, 3: 1, 4: 0 };
    points[pid] = (points[pid] ?? 0) + (map4[pos] ?? 0);
  }

  const standings = (players ?? [])
    .filter((p: any) => p.active)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      points: points[p.id] ?? 0,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  // Competition-Ranking (1,1,1,4 ...) basierend auf Turnierpunkten.
  // Dadurch bekommen Spieler mit gleichem Turnierstand dieselben Startpunkte.
  const competitionRankByPlayerId: Record<string, number> = {};
  let currentRank = 1;
  let prevPoints: number | null = null;
  for (let i = 0; i < standings.length; i++) {
    const p = standings[i];
    const pts = Number(p.points ?? 0);
    if (prevPoints !== null && pts < prevPoints) {
      // Bei weniger Punkten: Rank springt auf die echte Position (Competition Ranking)
      currentRank = i + 1;
    }
    competitionRankByPlayerId[p.id] = currentRank;
    prevPoints = pts;
  }

  if (standings.length < 2) {
    return NextResponse.json(
      { error: "Zu wenige aktive Spieler für ein Super-Finale" },
      { status: 400 }
    );
  }

  const finalists = standings.slice(0, 4);

  // Prüfen, ob es schon ein Finale gibt
  const { data: existing } = await sb
    .from("finales")
    .select("id, status")
    .eq("tournament_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length && existing[0].status === "open") {
    return NextResponse.json({
      error: "Es läuft bereits ein Super-Finale",
    }, { status: 400 });
  }

  // Finale anlegen
  const { data: final, error: fErr } = await sb
    .from("finales")
    .insert({
      tournament_id: t.id,
      target_points: 4,
      status: "open",
    })
    .select("id, target_points")
    .single();

  if (fErr || !final) {
    return NextResponse.json(
      { error: fErr?.message ?? "Finale konnte nicht angelegt werden" },
      { status: 500 }
    );
  }

  // Finalspieler anlegen
  const finalPlayers = finalists.map((row, index) => {
    // Seed + Startpunkte nach Competition-Ranking (bei Tie gleiche Seed/Startpunkte)
    const seed = competitionRankByPlayerId[row.id] ?? index + 1;
    const startPoints = getStartPointsForSeed(seed);
    return {
      final_id: final.id,
      player_id: row.id,
      seed,
      start_points: startPoints,
      points: startPoints,
    };
  });

  const { error: fpErr } = await sb.from("final_players").insert(finalPlayers);
  if (fpErr) {
    return NextResponse.json(
      { error: fpErr.message ?? "Finalspieler konnten nicht angelegt werden" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    final_id: final.id,
    target_points: final.target_points,
    finalists: finalPlayers,
  });
}
