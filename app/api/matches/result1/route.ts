import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type Body = {
  code: string;
  matchId: string;
  // entweder EIN Spieler-Update...
  playerId?: string;
  position?: number | null;
  // ...oder alle auf einmal
  positions?: Record<string, number | null>;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const code = String(body.code ?? "").trim().toUpperCase();
  const matchId = String(body.matchId ?? "").trim();

  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "matchId fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  // Turnier prüfen
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id")
    .eq("code", code)
    .single();

  if (tErr || !t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // Match + Round prüfen (nur Matches des Turniers)
  const { data: m, error: mErr } = await sb
    .from("matches")
    .select("id, round_id, status, rounds!inner(id, tournament_id)")
    .eq("id", matchId)
    .single();

  if (mErr || !m) return NextResponse.json({ error: "Match nicht gefunden" }, { status: 404 });
  // @ts-ignore
  if (m.rounds.tournament_id !== t.id) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  // Updates normalisieren
  const updates: Array<{ player_id: string; position: number | null }> = [];
  if (body.positions && typeof body.positions === "object") {
    for (const [player_id, position] of Object.entries(body.positions)) {
      updates.push({ player_id, position: position == null ? null : Number(position) });
    }
  } else if (body.playerId) {
    updates.push({
      player_id: String(body.playerId),
      position: body.position == null ? null : Number(body.position),
    });
  } else {
    return NextResponse.json({ error: "positions oder playerId fehlt" }, { status: 400 });
  }

  // Speichern (einzeln, damit es simpel bleibt)
  for (const u of updates) {
    const { error: upErr } = await sb
      .from("match_players")
      .update({ position: u.position })
      .eq("match_id", matchId)
      .eq("player_id", u.player_id);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Wenn ALLE Positionen gesetzt -> Match auf "done" setzen, sonst "open"
  const { data: mp } = await sb
    .from("match_players")
    .select("position")
    .eq("match_id", matchId);

  // Alle Matches der Runde prüfen
  const { data: roundMatches } = await sb
    .from("matches")
    .select("status")
    .eq("round_id", match.round_id)

  const roundFinished =
    roundMatches?.every((m) => m.status === "finished") ?? false

  await sb
    .from("rounds")
    .update({ status: roundFinished ? "finished" : "open" })
    .eq("id", match.round_id)



  const allSet = (mp ?? []).length > 0 && (mp ?? []).every((r: any) => r.position != null);

 await sb
  .from("matches")
  .update({ status: allSet ? "finished" : "open" })
  .eq("id", matchId)


  return NextResponse.json({ ok: true, allSet });
}