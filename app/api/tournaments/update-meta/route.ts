// Admin (Login über middleware.ts): NUR Name, Kategorie und 🎱 Extraball-Schalter eines Turniers ändern.
// Gedacht für beendete Turniere (falscher Name / falsche Serie). Alle anderen Felder
// werden bewusst ignoriert – Ergebnisse, Elo, Turnierpunkte usw. bleiben unverändert.
//
// Name/Kategorie stehen nur in tournaments.name / tournaments.category; alle anderen
// Tabellen verweisen per tournament_id -> eine Änderung wirkt überall automatisch.
//
// POST { code, name, category, extraball? } -> { ok: true, tournament: { code, name, category, extraball } }
// extraball wird nur geändert, wenn es als true/false mitgeschickt wird.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { extraballForced } from "@/lib/botRules";

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

  // 🎱 Extraball nur ändern, wenn mitgeschickt; bei Round the Pinball / Timeplay immer an
  let extraballUpdate: { extraball: boolean } | null = null;
  if (typeof body?.extraball === "boolean") {
    const { data: tf } = await sb.from("tournaments").select("format").eq("code", code).maybeSingle();
    extraballUpdate = { extraball: extraballForced((tf as any)?.format) ? true : body.extraball };
  }

  const { data, error } = await sb
    .from("tournaments")
    // ⚠️ nur diese Spalten – nichts anderes
    .update({
      name,
      category: category || null,
      ...(extraballUpdate ?? {}),
    })
    .eq("code", code)
    .select("code, name, category, extraball")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404 });

  return NextResponse.json({ ok: true, tournament: data }, { headers: { "Cache-Control": "no-store" } });
}
