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
    const totalScoreRaw = body?.totalScore;
    const runDetail = String(body.runDetail ?? "").trim();

    if (!runId) return noStoreJson({ error: "runId fehlt" }, { status: 400 });

    const totalScore = Number(totalScoreRaw);
    if (!Number.isFinite(totalScore) || totalScore <= 0) {
      return noStoreJson({ error: "totalScore ungueltig" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("single_play_runs")
      .update({
        status: "finished",
        total_score: Math.trunc(totalScore),
        finished_at: new Date().toISOString(),
        run_detail: runDetail || null,
      })
      .eq("id", runId)
      .select(
        "id, profile_id, machine_id, status, started_at, finished_at, total_score, notes, machine:location_machines(id,name,icon_emoji)"
      )
      .single();

    if (error) {
      console.error("single-play finish error:", error);
      return noStoreJson({ error: error.message }, { status: 500 });
    }

    return noStoreJson({ ok: true, run: data });
  } catch (e: any) {
    console.error("single-play finish fatal:", e);
    return noStoreJson({ error: "Serverfehler" }, { status: 500 });
  }
}
