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

  const { data, error } = await sb.from("machines").insert({ tournament_id: t.id, name }).select("id, name, active, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ machine: data });
}
