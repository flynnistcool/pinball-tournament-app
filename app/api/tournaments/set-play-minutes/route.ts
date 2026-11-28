// ⏱️ Spielzeit eines Round-the-Pinball-Turniers ändern – nur solange noch KEIN Score eingetragen ist.
// POST { code, minutes } -> { ok: true, minutes } | { ok: false, error }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { normalizePlayMinutes } from "@/lib/playMinutes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    const minutes = normalizePlayMinutes(body?.minutes);
    if (!code) return fail("Code fehlt", 400);
    if (minutes == null) return fail("Ungültige Spielzeit (1–60 Minuten)", 400);
    const sb = supabaseAdmin();

    const { data: t, error: tErr } = await sb.from("tournaments").select("id, format, status").eq("code", code).maybeSingle();
    if (tErr) return fail(tErr.message, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);
    if ((t as { format?: string }).format !== "rotation") return fail("Spielzeit gibt es nur bei Round the Pinball", 400);
    if ((t as { status?: string }).status === "finished") return fail("Das Turnier ist beendet", 400);

    // 🔒 gesperrt, sobald ein Score eingetragen ist
    const { data: rounds } = await sb.from("rounds").select("id").eq("tournament_id", (t as { id: string }).id);
    const roundIds = (rounds ?? []).map((r: { id: string }) => r.id);
    if (roundIds.length) {
      const { data: ms } = await sb.from("matches").select("id").in("round_id", roundIds);
      const matchIds = (ms ?? []).map((m: { id: string }) => m.id);
      if (matchIds.length) {
        const { count } = await sb
          .from("match_players")
          .select("match_id", { count: "exact", head: true })
          .in("match_id", matchIds)
          .not("score", "is", null);
        if ((count ?? 0) > 0) return fail("🔒 Die Spielzeit ist gesperrt – es gibt schon Scores in diesem Turnier", 409);
      }
    }

    const { error: uErr } = await sb.from("tournaments").update({ play_minutes: minutes }).eq("id", (t as { id: string }).id);
    if (uErr) return fail(`Speichern fehlgeschlagen (supabase_play_minutes.sql ausgeführt?): ${uErr.message}`, 500);
    return NextResponse.json({ ok: true, minutes });
  } catch (e: unknown) {
    console.error("set-play-minutes crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
