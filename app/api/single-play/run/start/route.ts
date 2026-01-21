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
    const profileId = String(body?.profileId ?? "").trim();
    const locationId = body?.locationId ? String(body.locationId) : null;
    const machineId = body?.machineId ? String(body.machineId) : null;

    if (!profileId) return noStoreJson({ error: "profileId fehlt" }, { status: 400 });
    if (!machineId) return noStoreJson({ error: "machineId fehlt" }, { status: 400 });

    const sb = supabaseAdmin();

    // Wenn bereits ein aktiver Run existiert, gib ihn zurück (kein doppelter in_progress Run)
    const { data: existing, error: exErr } = await sb
      .from("single_play_runs")
      .select(
        "id, profile_id, machine_id, status, started_at, finished_at, total_score, notes, machine:location_machines(id,name,icon_emoji)"
      )
      .eq("profile_id", profileId)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exErr) {
      console.error("single-play start existing error:", exErr);
      // nicht hard fail: wir versuchen trotzdem zu insert
    }

    if (existing?.id) {
      return noStoreJson({ run: existing });
    }

    const { data: ins, error: insErr } = await sb
      .from("single_play_runs")
      .insert({
        profile_id: profileId,
        machine_id: machineId,
        status: "in_progress",
      })
      .select(
        "id, profile_id, machine_id, status, started_at, finished_at, total_score, notes, machine:location_machines(id,name,icon_emoji)"
      )
      .single();

    if (insErr) {
      console.error("single-play start insert error:", insErr);
      return noStoreJson({ error: insErr.message }, { status: 500 });
    }

    return noStoreJson({ run: ins });
  } catch (e: any) {
    console.error("single-play start fatal:", e);
    return noStoreJson({ error: "Serverfehler" }, { status: 500 });
  }
}
