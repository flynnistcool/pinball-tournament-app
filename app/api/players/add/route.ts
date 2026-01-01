import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();

  if (!code || !name) return NextResponse.json({ error: "Fehlende Daten" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb.from("tournaments").select("id").eq("code", code).single();
  if (!t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  const { data: prof, error: pErr } = await sb.from("profiles").upsert({ name }, { onConflict: "name" }).select("id").single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: existing } = await sb.from("players").select("id").eq("tournament_id", t.id).eq("profile_id", prof.id).maybeSingle();
  if (existing) return NextResponse.json({ error: "Spieler ist bereits im Turnier" }, { status: 400 });

  const { data, error } = await sb.from("players").insert({ tournament_id: t.id, name, profile_id: prof.id }).select("id, name, active, created_at, profile_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ player: data });
}
