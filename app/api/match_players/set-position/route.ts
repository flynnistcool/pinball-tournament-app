import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // akzeptiere snake_case UND camelCase
  const code = String(body.code ?? "").trim().toUpperCase();

  const matchId = String(body.match_id ?? body.matchId ?? "").trim();
  const playerId = String(body.player_id ?? body.playerId ?? "").trim();

  const positionRaw = body.position;
  const position =
    positionRaw === null || positionRaw === "" || typeof positionRaw === "undefined"
      ? null
      : Number(positionRaw);

  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "match_id fehlt" }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: "player_id fehlt" }, { status: 400 });

  if (position !== null && (!Number.isFinite(position) || position < 1 || position > 8)) {
    return NextResponse.json({ error: "Ungültige Position" }, { status: 400 });
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
    return NextResponse.json({ error: "Match nicht gefunden (oder gehört nicht zum Turnier)" }, { status: 404 });
  }

  // Update match_players
  const { data: updated, error: uErr } = await sb
    .from("match_players")
    .update({ position })
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .select("match_id, player_id, position")
    .single();

  if (uErr) return NextResponse.json({ error: uErr.message ?? "Update fehlgeschlagen" }, { status: 500 });

  
  // Nach jeder Positions-Änderung: Match/Runde automatisch fertigstellen
  const { data: mp } = await sb
    .from("match_players")
    .select("position")
    .eq("match_id", matchId);

  const allSet = (mp ?? []).length > 0 && (mp ?? []).every((r: any) => r.position != null);

  // Match-Status setzen
  await sb.from("matches").update({ status: allSet ? "finished" : "open" }).eq("id", matchId);

  // Runde-Status setzen, wenn alle Matches finished sind
  if (m.round_id) {
    const { data: roundMatches } = await sb.from("matches").select("status").eq("round_id", m.round_id);
    const roundFinished = roundMatches?.every((rm: any) => rm.status === "finished") ?? false;
    await sb.from("rounds").update({ status: roundFinished ? "finished" : "open" }).eq("id", m.round_id);
  }

return NextResponse.json({ ok: true, row: updated });
}