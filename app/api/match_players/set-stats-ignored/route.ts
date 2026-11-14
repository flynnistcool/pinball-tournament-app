// 🚫 Einzelnen Score als falsch markieren (Admin – Login über middleware.ts).
// Der Score bleibt im Turnier unverändert (Ergebnis, Plätze, Punkte) – er zählt nur nicht mehr
// als Grundlage für KI-Bots (und später Statistiken).
// POST { matchId, playerId, ignored: boolean } -> { ok: true, ignored } | { ok: false, error }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const matchId = String(body?.matchId ?? "").trim();
  const playerId = String(body?.playerId ?? "").trim();
  if (!matchId || !playerId) {
    return NextResponse.json({ ok: false, error: "matchId oder playerId fehlt" }, { status: 400 });
  }
  if (typeof body?.ignored !== "boolean") {
    return NextResponse.json({ ok: false, error: "ignored (true/false) fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("match_players")
    .update({ stats_ignored: body.ignored })
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .select("stats_ignored")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Eintrag nicht gefunden" }, { status: 404 });

  return NextResponse.json({ ok: true, ignored: data.stats_ignored === true }, { headers: { "Cache-Control": "no-store" } });
}
