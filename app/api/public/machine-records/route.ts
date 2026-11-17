// Bisherige Flipper-Rekorde für den Highscore-Jubel am Infobildschirm (/s/<code>/tv).
// GET /api/public/machine-records?code=ABC123
// Rekorde = bester Score je Flipper-NAME an der Location des Turniers, aus allen anderen
// BEENDETEN Turnieren dort (ohne Timeplay/DYP), dazu der Highscore der letzten 30 Tage
// und persönliche Bestwerte der Turnierspieler.
// enabled=false, wenn das Turnier keine Location hat oder selbst Timeplay/DYP ist.
// Rechnung: lib/feedContextServer.ts (gemeinsam mit dem Server-Ticker)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { loadMachineRecords } from "@/lib/feedContextServer";

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

    const { data: t, error: tErr } = await sb
      .from("tournaments")
      .select("id, location_id, format")
      .eq("code", code)
      .maybeSingle();
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);

    const r = await loadMachineRecords(sb, {
      id: String(t.id),
      location_id: t.location_id ? String(t.location_id) : null,
      format: t.format ?? null,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: unknown) {
    console.error("machine-records crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
