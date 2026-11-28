// 🤖 KI-Bot würfelt seinen Score für ein Match.
// POST { code, matchId, playerId }
//  -> { ok: true, score, calc }   (calc = Rechenzettel, wird an match_players.bot_calc gespeichert)
//  -> { ok: false, error, calc? }
// Der Score selbst wird danach von der Oberfläche ganz normal über /api/match_players/set-score
// gespeichert (gleicher Weg wie eine Eingabe von Hand → Plätze, Rekorde usw. wie gewohnt).
// Rechnung: lib/botRollServer.ts (gemeinsam mit der Vorschau /api/bots/preview)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { computeBotCalcForMatch } from "@/lib/botRollServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fail(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    const matchId = String(body?.matchId ?? body?.match_id ?? "").trim();
    const playerId = String(body?.playerId ?? body?.player_id ?? "").trim();
    if (!code || !matchId || !playerId) return fail("Code, matchId oder playerId fehlt", 400);

    const sb = supabaseAdmin();
    const res = await computeBotCalcForMatch(sb, { code, matchId, playerId });
    if (!res.ok) return fail(res.error, res.status, res.calc ? { calc: res.calc } : {});
    const calc = res.calc;

    // 🧾 Rechenzettel speichern (Score speichert danach die Oberfläche über set-score)
    const { error: uErr } = await sb
      .from("match_players")
      .update({ bot_calc: calc })
      .eq("match_id", matchId)
      .eq("player_id", playerId);
    if (uErr) return fail(`Rechenzettel speichern fehlgeschlagen: ${uErr.message}`, 500);

    return NextResponse.json({ ok: true, score: calc.score, calc }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("bots/roll crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
