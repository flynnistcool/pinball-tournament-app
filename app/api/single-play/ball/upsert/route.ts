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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const runId = String(body?.runId ?? "").trim();
    const ballNoRaw = body?.ballNo;

    const ballNo = Number(ballNoRaw);
    if (!runId) return noStoreJson({ error: "runId fehlt" }, { status: 400 });
    if (!Number.isFinite(ballNo) || ballNo < 1) return noStoreJson({ error: "ballNo ungueltig" }, { status: 400 });

    const drainZone = body?.drainZone ? String(body.drainZone) : null;
    const drainDetail = body?.drainDetail ? String(body.drainDetail) : null;
    const saveAction = body?.saveAction ? String(body.saveAction) : null;
    const saveActionDetail = body?.saveActionDetail ? String(body.saveActionDetail) : null;
    const shouldHaveDoneDetail = body?.shouldHaveDoneDetail ? String(body.shouldHaveDoneDetail) : null;

    let ballScore: number | null = null;
    if (body?.ballScore != null && String(body.ballScore).trim() !== "") {
      const n = Number(String(body.ballScore).replace(/[^0-9]/g, ""));
      if (Number.isFinite(n) && n >= 0) ballScore = Math.trunc(n);
    }

    if (!drainZone) return noStoreJson({ error: "drainZone fehlt" }, { status: 400 });
    if (!saveAction) return noStoreJson({ error: "saveAction fehlt" }, { status: 400 });

    const sb = supabaseAdmin();

    const { error: upErr } = await sb
      .from("single_play_ball_events")
      .upsert(
        {
          run_id: runId,
          ball_no: Math.trunc(ballNo),
          ball_score: ballScore,
          drain_zone: drainZone,
          drain_detail: drainDetail,
          save_action: saveAction,
          save_action_detail: saveActionDetail,
          should_have_done_detail: shouldHaveDoneDetail,
        },
        { onConflict: "run_id,ball_no" }
      );

    if (upErr) {
      console.error("single-play ball upsert error:", upErr);
      return noStoreJson({ error: upErr.message }, { status: 500 });
    }

    const { data: events, error: evErr } = await sb
      .from("single_play_ball_events")
      .select("id, run_id, ball_no, ball_score, drain_zone, drain_detail, save_action, save_action_detail, should_have_done_detail, created_at")

      .eq("run_id", runId)
      .order("ball_no", { ascending: true });

    if (evErr) {
      console.error("single-play ball reload error:", evErr);
      return noStoreJson({ error: evErr.message }, { status: 500 });
    }

    return noStoreJson({ ok: true, events: events ?? [] });
  } catch (e: any) {
    console.error("single-play ball fatal:", e);
    return noStoreJson({ error: "Serverfehler" }, { status: 500 });
  }
}
