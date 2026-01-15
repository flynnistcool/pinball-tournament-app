import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // akzeptiere snake_case UND camelCase
  const code = String(body.code ?? "").trim().toUpperCase();

  const matchId = String(body.match_id ?? body.matchId ?? "").trim();
  const playerId = String(body.player_id ?? body.playerId ?? "").trim();

  const scoreRaw = body.score;
  const score =
    scoreRaw === null || scoreRaw === "" || typeof scoreRaw === "undefined"
      ? null
      : Number(scoreRaw);

  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "match_id fehlt" }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: "player_id fehlt" }, { status: 400 });

  if (score !== null && (!Number.isFinite(score) || score < 0)) {
    return NextResponse.json({ error: "Ungültige Punkte" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Turnier anhand Code holen
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id")
    .eq("code", code)
    .single();

  if (tErr || !t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // Match muss zu diesem Turnier gehören (via rounds)
  const { data: m, error: mErr } = await sb
    .from("matches")
    .select("id, round_id, rounds!inner(tournament_id)")
    .eq("id", matchId)
    .eq("rounds.tournament_id", t.id)
    .single();

  if (mErr || !m) {
    return NextResponse.json(
      { error: "Match nicht gefunden (oder gehört nicht zum Turnier)" },
      { status: 404 }
    );
  }

  // Update match_players
  const { data: updated, error: uErr } = await sb
    .from("match_players")
    .update({ score })
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .select("match_id, player_id, score")
    .single();

  if (uErr) return NextResponse.json({ error: uErr.message ?? "Update fehlgeschlagen" }, { status: 500 });

  return NextResponse.json({ ok: true, row: updated });
}
