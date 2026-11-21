// 📟 Welches Turnier sollen die Flipper-Displays zeigen? (app_settings, je Location + allgemein)
// POST { code } → { ok: true, code }    (Admin-iPad beim Öffnen eines laufenden Turniers / Timer-Start /
//   Score gespeichert / Knopf "📟 An Displays"; nur Admin – middleware.ts). Gemerkt wird eine Liste, neuestes vorne.
// Gelesen von /api/public/display. Beendete Turniere werden nicht gemerkt (Archiv ansehen ändert nichts).
// Logik: lib/displayPinServer.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pinDisplayTournament } from "@/lib/displayPinServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.code ?? "").trim().toUpperCase();
  const r = await pinDisplayTournament(supabaseAdmin(), code);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, code, ...(r.skipped ? { skipped: r.skipped } : {}) }, { headers: NO_STORE });
}
