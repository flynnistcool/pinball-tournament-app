export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const profileId = String(url.searchParams.get("profileId") ?? "").trim();
    const machineIdRaw = String(url.searchParams.get("machineId") ?? "").trim();
    const machineId = machineIdRaw && machineIdRaw !== "all" ? machineIdRaw : "";

    // range: "10" | "20" | "50" | "all" (default: 50)
    const rangeRaw = String(url.searchParams.get("range") ?? "50").trim().toLowerCase();
    const limitRuns =
      rangeRaw === "10" ? 10 :
      rangeRaw === "20" ? 20 :
      rangeRaw === "50" ? 50 :
      null; // "all" => no limit

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId fehlt" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sb = supabaseAdmin();

    // 1) Runs holen (optional nach Maschine) – range=10/20/50/all
    let runsQ = sb
      .from("single_play_runs")
      .select("id, machine_id, total_score, finished_at, run_detail")
      .eq("profile_id", profileId)
      .in("status", ["finished", "abandoned"]) // nimm in_progress nur wenn du willst
      .order("finished_at", { ascending: false });

    if (machineId) runsQ = runsQ.eq("machine_id", machineId);
    if (limitRuns) runsQ = runsQ.limit(limitRuns);

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
        { ok: true, runs: [], events: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) alle Ball-Events dieser Runs holen
    const { data: events, error: evErr } = await sb
      .from("single_play_ball_events")
      .select("id, run_id, ball_no, ball_score, drain_zone, drain_detail, save_action, save_action_detail, created_at")
      .in("run_id", runIds)
      .order("created_at", { ascending: true });

    if (evErr) {
      return NextResponse.json(
        { error: evErr.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, runs: runs ?? [], events: events ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
