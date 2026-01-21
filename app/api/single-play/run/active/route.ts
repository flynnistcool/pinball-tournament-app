// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: any, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const profileId = String(url.searchParams.get("profileId") ?? "").trim();
    if (!profileId) return noStoreJson({ error: "profileId fehlt" }, { status: 400 });

    const sb = supabaseAdmin();

    const { data: run, error: runErr } = await sb
      .from("single_play_runs")
      .select(
        "id, profile_id, machine_id, status, started_at, finished_at, total_score, notes, machine:location_machines(id,name,icon_emoji)"
      )
      .eq("profile_id", profileId)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runErr) {
      console.error("single-play active run error:", runErr);
      return noStoreJson({ error: runErr.message }, { status: 500 });
    }

    if (!run?.id) {
      return noStoreJson({ run: null, events: [] });
    }

    const { data: events, error: evErr } = await sb
      .from("single_play_ball_events")
      .select("id, run_id, ball_no, ball_score, drain_zone, drain_detail, save_action, save_action_detail, created_at")
      .eq("run_id", run.id)
      .order("ball_no", { ascending: true });

    if (evErr) {
      console.error("single-play active events error:", evErr);
      return noStoreJson({ error: evErr.message }, { status: 500 });
    }

    return noStoreJson({ run, events: events ?? [] });
  } catch (e: any) {
    console.error("single-play active fatal:", e);
    return noStoreJson({ error: "Serverfehler" }, { status: 500 });
  }
}
