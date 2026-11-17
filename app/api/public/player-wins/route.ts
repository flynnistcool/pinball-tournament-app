// Bisherige Matchsiege der Spieler eines Turniers (für die Matchsieg-Meilensteine).
// GET /api/public/player-wins?code=ABC123
// wins[profileId] = Anzahl Matches mit Platz 1 in ALLEN ANDEREN Turnieren (alle Formate).
// Die Siege im laufenden Turnier zählt die Seite selbst live dazu.
// Rechnung: lib/feedContextServer.ts (gemeinsam mit dem Server-Ticker)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { loadPriorWins } from "@/lib/feedContextServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  try {
    const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
    if (!code) return fail("Code fehlt", 400);
    const sb = supabaseAdmin();

    const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);

    const { wins, excluded } = await loadPriorWins(sb, String(t.id));
    return NextResponse.json({ ok: true, wins, excluded });
  } catch (e: unknown) {
    console.error("player-wins crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
