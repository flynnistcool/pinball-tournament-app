// @ts-nocheck
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const profileId = String(url.searchParams.get("profileId") ?? "").trim();
    const machineId = String(url.searchParams.get("machineId") ?? "").trim();

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId fehlt" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sb = supabaseAdmin();

    // 1) Letzte 50 Runs holen (finished/abandoned) – optional nach Maschine filtern
    let runsQ = sb
      .from("single_play_runs")
      .select("id, machine_id, finished_at, status")
      .eq("profile_id", profileId)
      .in("status", ["finished", "abandoned"])
      .order("finished_at", { ascending: false })
      .limit(50);

    if (machineId) runsQ = runsQ.eq("machine_id", machineId);

    const { data: runs, error: runsErr } = await runsQ;

    if (runsErr) {
      return NextResponse.json(
        { error: runsErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const runIds = (runs ?? []).map((r) => r.id).filter(Boolean);

    if (runIds.length === 0) {
      return NextResponse.json(
        { ok: true, runIds: [], events: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) Alle Ball-Events zu diesen Runs holen
    const { data: events, error: evErr } = await sb
      .from("single_play_ball_events")
      .select(
        "id, run_id, ball_no, ball_score, drain_zone, drain_detail, save_action, save_action_detail, created_at"
      )
      .in("run_id", runIds)
      .order("created_at", { ascending: true });

    if (evErr) {
      return NextResponse.json(
        { error: evErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, runIds, events: events ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
