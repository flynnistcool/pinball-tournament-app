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
    const limit = Number(url.searchParams.get("limit") ?? 20);

    if (!profileId) return noStoreJson({ error: "profileId fehlt" }, { status: 400 });

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("single_play_runs")
      .select(
        "id, profile_id, machine_id, status, started_at, finished_at, total_score, run_detail, notes, machine:location_machines(id,name,icon_emoji)"
      )
      .eq("profile_id", profileId)
      .eq("status", "finished")
      .order("finished_at", { ascending: false })
      .limit(Number.isFinite(limit) ? Math.max(1, Math.min(50, limit)) : 20);

    if (error) {
      console.error("single-play list error:", error);
      return noStoreJson({ error: error.message }, { status: 500 });
    }

    return noStoreJson({ runs: data ?? [] });
  } catch (e: any) {
    console.error("single-play list fatal:", e);
    return noStoreJson({ error: "Serverfehler" }, { status: 500 });
  }
}
