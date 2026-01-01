import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { computeFinalRanking, FinalState } from "@/lib/finals";

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

  const { data: finals } = await sb
    .from("finales")
    .select("id, target_points, status")
    .eq("tournament_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!finals || finals.length === 0) {
    // Kein Super-Finale gestartet
    return NextResponse.json({ exists: false });
  }

  const final = finals[0];

  const { data: fps } = await sb
    .from("final_players")
    .select("player_id, seed, start_points, points, players(name)")
    .eq("final_id", final.id)
    .order("seed", { ascending: true });

  const players =
    (fps ?? []).map((fp: any) => ({
      playerId: fp.player_id,
      name: fp.players?.name ?? "",
      seed: fp.seed,
      startPoints: fp.start_points,
      points: fp.points,
    })) ?? [];

  const state: FinalState = {
    players,
    targetPoints: final.target_points,
    championId: null, // setzen wir gleich
    finished: final.status === "finished",
  };

  // Champion bestimmen, falls fertig
  const maybeChampion = players.find(
    (p) => p.points >= final.target_points
  );
  if (maybeChampion) {
    state.championId = maybeChampion.playerId;
  }

  const ranking = state.finished ? computeFinalRanking(state) : null;

  return NextResponse.json({
    exists: true,
    final_id: final.id,
    status: final.status,
    target_points: final.target_points,
    players,
    ranking,
  });
}
