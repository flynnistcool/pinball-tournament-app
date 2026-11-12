// Admin (Login über middleware.ts): NUR Name und Kategorie eines Turniers ändern.
// Gedacht für beendete Turniere (falscher Name / falsche Serie). Alle anderen Felder
// werden bewusst ignoriert – Ergebnisse, Elo, Turnierpunkte usw. bleiben unverändert.
//
// Name/Kategorie stehen nur in tournaments.name / tournaments.category; alle anderen
// Tabellen verweisen per tournament_id -> eine Änderung wirkt überall automatisch.
//
// POST { code, name, category } -> { ok: true, tournament: { code, name, category } }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_LEN = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim().toUpperCase();
  const name = String(body?.name ?? "").trim().replace(/\s+/g, " ");
  const category = String(body?.category ?? "").trim().replace(/\s+/g, " ");

  if (!code) return NextResponse.json({ ok: false, error: "Code fehlt" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Name darf nicht leer sein" }, { status: 400 });
  if (name.length > MAX_LEN || category.length > MAX_LEN) {
    return NextResponse.json({ ok: false, error: `Maximal ${MAX_LEN} Zeichen` }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tournaments")
    // ⚠️ nur diese zwei Spalten – nichts anderes
    .update({ name, category: category || null })
    .eq("code", code)
    .select("code, name, category")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404 });

  return NextResponse.json({ ok: true, tournament: data }, { headers: { "Cache-Control": "no-store" } });
}
