// @ts-nocheck
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const resBase = NextResponse.json({ ok: true });
  resBase.headers.set("Cache-Control", "no-store");

  try {
    const body = await req.json().catch(() => ({}));
    const runId = String(body.runId ?? "").trim();
    const profileId = String(body.profileId ?? "").trim();

    if (!runId) {
      return NextResponse.json(
        { error: "runId fehlt" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!profileId) {
      return NextResponse.json(
        { error: "profileId fehlt" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ WICHTIG: supabaseAdmin ist bei dir eine Funktion -> muss aufgerufen werden
    const sb = supabaseAdmin();

    // (Optional aber empfohlen) Sicherheits-Check:
    // Nur löschen, wenn Run zu diesem Profil gehört UND in_progress ist.
    const { data: runRow, error: runErr } = await sb
      .from("single_play_runs")
      .select("id, profile_id, status")
      .eq("id", runId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (runErr) {
      return NextResponse.json(
        { error: runErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!runRow) {
      return NextResponse.json(
        { error: "Run nicht gefunden (oder gehört nicht zu diesem Profil)" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (runRow.status !== "in_progress") {
      return NextResponse.json(
        { error: "Nur aktive Runs (in_progress) können gelöscht werden." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ 1) Child-Tabelle löschen (Ball Events)
    const { error: delEventsErr } = await sb
      .from("single_play_ball_events")
      .delete()
      .eq("run_id", runId);

    if (delEventsErr) {
      return NextResponse.json(
        { error: delEventsErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ 2) Parent löschen (Run)
    const { error: delRunErr } = await sb
      .from("single_play_runs")
      .delete()
      .eq("id", runId)
      .eq("profile_id", profileId);

    if (delRunErr) {
      return NextResponse.json(
        { error: delRunErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
