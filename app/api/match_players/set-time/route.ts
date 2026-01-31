import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim().toUpperCase();
  const matchId = String(body.match_id ?? body.matchId ?? "").trim();
  const playerId = String(body.player_id ?? body.playerId ?? "").trim();

  const timeRaw = body.time_ms ?? body.timeMs ?? body.time;
  const time_ms =
    timeRaw === null || timeRaw === "" || typeof timeRaw === "undefined"
      ? null
      : Number(timeRaw);

  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "match_id fehlt" }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: "player_id fehlt" }, { status: 400 });

  if (time_ms !== null && (!Number.isFinite(time_ms) || time_ms < 0)) {
    return NextResponse.json({ error: "Ungültige Zeit" }, { status: 400 });
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
  const { error: uErr } = await sb
    .from("match_players")
    .update({ time_ms })
    .eq("match_id", matchId)
    .eq("player_id", playerId);

  if (uErr) {
    return NextResponse.json(
      { error: uErr.message ?? "Update fehlgeschlagen" },
      { status: 500 }
    );
  }

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
