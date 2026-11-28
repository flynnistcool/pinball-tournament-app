// 🤖 Vorschau: was würde der Bot in diesem Match würfeln? (nur Admin – Login über middleware.ts)
// GET /api/bots/preview?code=…&matchId=…&playerId=…
//  -> { ok: true, range, settings, kind }  – gleiche Rechnung wie "Bot spielt" (lib/botRollServer.ts),
//     speichert NICHTS. Daraus zeigt die Oberfläche "typisch / schlecht (10 %) / gut (90 %)".

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { computeBotCalcForMatch } from "@/lib/botRollServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
    const matchId = String(url.searchParams.get("matchId") ?? "").trim();
    const playerId = String(url.searchParams.get("playerId") ?? "").trim();
    if (!code || !matchId || !playerId) {
      return NextResponse.json({ ok: false, error: "Code, matchId oder playerId fehlt" }, { status: 400 });
    }
    const res = await computeBotCalcForMatch(supabaseAdmin(), { code, matchId, playerId, preview: true });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status, headers: { "Cache-Control": "no-store" } });
    const c = res.calc;
    return NextResponse.json(
      {
        ok: true,
        range: c.range,
        settings: { outlierChance: c.settings.outlierChance, outlierMax: c.settings.outlierMax },
        machine: c.machine,
        specialist: c.specialist ? { isFavorite: c.specialist.isFavorite, isFlop: c.specialist.isFlop ?? false } : null,
        fallback: c.mirror?.fallback ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    console.error("bots/preview crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
