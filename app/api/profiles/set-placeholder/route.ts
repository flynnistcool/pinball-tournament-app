// 🚫 Profil als Platzhalter/Testprofil markieren (oder zurücknehmen) – ändert NUR dieses Feld.
// POST { id, excludeFromStats: boolean } -> { ok: true, exclude_from_stats }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id fehlt" }, { status: 400 });
  if (typeof body?.excludeFromStats !== "boolean") {
    return NextResponse.json({ ok: false, error: "excludeFromStats (true/false) fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .update({ exclude_from_stats: body.excludeFromStats })
    .eq("id", id)
    .select("id, exclude_from_stats")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Profil nicht gefunden" }, { status: 404 });

  return NextResponse.json({ ok: true, exclude_from_stats: data.exclude_from_stats === true });
}
