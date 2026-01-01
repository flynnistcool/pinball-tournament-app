import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  const playerId = String(body.playerId ?? "").trim();
  if (!code || !playerId) return NextResponse.json({ error: "Fehlende Daten" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb.from("tournaments").select("id").eq("code", code).single();
  if (!t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  const { data: p } = await sb.from("players").select("active").eq("id", playerId).single();
  const next = !(p?.active ?? true);
  const { error } = await sb.from("players").update({ active: next }).eq("id", playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, active: next });
}
