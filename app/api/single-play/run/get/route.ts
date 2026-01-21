export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", "no-store");

  try {
    const url = new URL(req.url);
    const runId = String(url.searchParams.get("runId") ?? "").trim();
    const profileId = String(url.searchParams.get("profileId") ?? "").trim();

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

    // 1) Run laden (Security: muss zum profileId gehören)
    const { data: run, error: runErr } = await sb
      .from("single_play_runs")
      .select(
        `
          id,
          profile_id,
          status,
          machine_id,
          total_score,
          started_at,
          finished_at,
          run_detail,
          machine:location_machines (
            id,
            name,
            icon_emoji
          )
        `
      )
      .eq("id", runId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (runErr) {
      return NextResponse.json(
        { error: runErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!run) {
      return NextResponse.json(
        { error: "Run nicht gefunden (oder gehört nicht zu diesem Profil)" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) Ball-Events laden
    const { data: events, error: evErr } = await sb
      .from("single_play_ball_events")
      .select(
        `
          id,
          run_id,
          ball_no,
          ball_score,
          drain_zone,
          drain_detail,
          save_action,
          save_action_detail,
          created_at
        `
      )
      .eq("run_id", runId)
      .order("ball_no", { ascending: true });

    if (evErr) {
      return NextResponse.json(
        { error: evErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, run, events: events ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
