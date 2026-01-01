import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { computeFinalRanking, FinalState } from "@/lib/finals";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  const winnerPlayerId = String(body.winnerPlayerId ?? "").trim();
  if (!code || !winnerPlayerId) {
    return NextResponse.json(
      { error: "Code oder Gewinner fehlt" },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();

  // 👉 Turnier mit Elo-Flag laden
  const { data: t } = await sb
    .from("tournaments")
    .select("id, superfinal_elo_enabled")
    .eq("code", code)
    .single();

  if (!t) {
    return NextResponse.json(
      { error: "Turnier nicht gefunden" },
      { status: 404 }
    );
  }

  const { data: finals } = await sb
    .from("finales")
    .select("id, target_points, status")
    .eq("tournament_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!finals || finals.length === 0) {
    return NextResponse.json(
      { error: "Kein Super-Finale gestartet" },
      { status: 400 }
    );
  }

  const final = finals[0];
  if (final.status === "finished") {
    return NextResponse.json(
      { error: "Finale ist bereits beendet" },
      { status: 400 }
    );
  }

  const { data: players } = await sb
    .from("final_players")
    .select("id, player_id, seed, start_points, points")
    .eq("final_id", final.id);

  if (!players || players.length === 0) {
    return NextResponse.json(
      { error: "Keine Finalspieler gefunden" },
      { status: 400 }
    );
  }

  // Punkte erhöhen
  const updated = players.map((p: any) =>
    p.player_id === winnerPlayerId ? { ...p, points: p.points + 1 } : p
  );

  // Spielnummer bestimmen (für Log)
  const { data: games } = await sb
    .from("final_games")
    .select("game_number")
    .eq("final_id", final.id)
    .order("game_number", { ascending: false })
    .limit(1);

  const nextGameNumber = (games?.[0]?.game_number ?? 0) + 1;

  // Finalspiel protokollieren
  await sb.from("final_games").insert({
    final_id: final.id,
    game_number: nextGameNumber,
    winner_player_id: winnerPlayerId,
  });

  // ⭐ Elo-Bonus: Nur wenn im Turnier erlaubt
  if (t.superfinal_elo_enabled) {
    const { data: winnerPlayer } = await sb
      .from("players")
      .select("profile_id")
      .eq("id", winnerPlayerId)
      .single();

    if (winnerPlayer?.profile_id) {
      const { data: winnerProfile } = await sb
        .from("profiles")
        .select("rating")
        .eq("id", winnerPlayer.profile_id)
        .single();

      if (winnerProfile?.rating != null) {
        await sb
          .from("profiles")
          .update({ rating: Number(winnerProfile.rating) + 8 })
          .eq("id", winnerPlayer.profile_id);
      }
    }
  }

  // Punkte in DB updaten
  for (const p of updated) {
    await sb
      .from("final_players")
      .update({ points: p.points })
      .eq("id", p.id);
  }

  // Hat jemand target_points erreicht?
  const champion = updated.find(
    (p: any) => p.points >= final.target_points
  );

  // Noch kein Champion -> Finale läuft weiter
  if (!champion) {
    return NextResponse.json({ ok: true, finished: false });
  }

  // Finale beenden, Ranking berechnen & speichern
  const state: FinalState = {
    players: updated.map((p: any) => ({
      playerId: p.player_id,
      name: "",
      seed: p.seed,
      startPoints: p.start_points,
      points: p.points,
    })),
    targetPoints: final.target_points,
    championId: champion.player_id,
    finished: true,
  };

  const ranking = computeFinalRanking(state);

  for (const r of ranking) {
    await sb
      .from("final_players")
      .update({ rank: r.rank })
      .eq("final_id", final.id)
      .eq("player_id", r.playerId);
  }

  // Turnier automatisch als beendet markieren
  await sb
    .from("tournaments")
    .update({ status: "finished" })
    .eq("id", t.id);

  await sb
    .from("finales")
    .update({ status: "finished" })
    .eq("id", final.id);

  return NextResponse.json({
    ok: true,
    finished: true,
    champion_player_id: champion.player_id,
    ranking,
  });
}
