// 🧾 Rechenzettel eines Bot-Scores lesen (nur Admin – Login über middleware.ts).
// GET /api/bots/calc?matchId=...&playerId=...  -> { ok: true, calc } | { ok: false, error }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = String(url.searchParams.get("matchId") ?? "").trim();
  const playerId = String(url.searchParams.get("playerId") ?? "").trim();
  if (!matchId || !playerId) {
    return NextResponse.json({ ok: false, error: "matchId oder playerId fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("match_players")
    .select("bot_calc")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data?.bot_calc) {
    return NextResponse.json({ ok: false, error: "Kein Rechenzettel vorhanden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, calc: data.bot_calc }, { headers: { "Cache-Control": "no-store" } });
}
