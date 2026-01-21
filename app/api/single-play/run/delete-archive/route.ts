export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";


export async function POST(req: Request) {
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

    const sb = supabaseAdmin();

    // Run holen und sicherstellen: gehört zum Profil
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

    // ✅ Archiv-Delete: nur finished/abandoned löschen (aktive Runs nicht über Archiv)
    if (runRow.status === "in_progress") {
      return NextResponse.json(
        { error: "Aktive Runs bitte oben über 'Aktiver Run' löschen." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1) Ball-Events löschen
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

    // 2) Run löschen
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
