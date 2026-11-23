// 🎱 DYP: Gewicht der Flipper-Gruppe bei der Geräteverteilung (lib/dypMachinePick.ts) setzen.
// POST { code, weight } -> { ok: true, weight }
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { clampPinballWeight } from "@/lib/dypMachinePick";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "Code fehlt" }, { status: 400 });
  const weight = clampPinballWeight(body?.weight);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tournaments")
    .update({ dyp_pinball_weight: weight })
    .eq("code", code)
    .select("code")
    .maybeSingle();

  if (error) {
    const hint = /dyp_pinball_weight/i.test(error.message)
      ? " – bitte zuerst supabase_dyp_pinball_weight.sql im Supabase SQL-Editor ausführen"
      : "";
    return NextResponse.json({ ok: false, error: error.message + hint }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ok: true, weight }, { headers: { "Cache-Control": "no-store" } });
}
