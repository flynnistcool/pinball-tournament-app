// 📣 Live-Ticker: eine Meldung ausblenden (oder wieder einblenden) – nur Admin (POST außerhalb /api/public → middleware.ts).
// POST { code, id, hidden?: boolean = true } → { ok: true, hidden }
//
// Nicht löschen, sondern in data.hidden vermerken: Die Zeile (und ihre event_key) bleibt bestehen, damit weder der
// Server-Ticker (/api/public/feed/sync) noch die Admin-Seite die Meldung als "fehlt" erkennt und neu anlegt.
// GET /api/public/feed lässt ausgeblendete Meldungen weg.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim().toUpperCase();
  const id = Number(body?.id);
  const hidden = body?.hidden !== false;
  if (!code) return fail("code fehlt", 400);
  if (!Number.isFinite(id) || id <= 0) return fail("id fehlt", 400);

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
  if (!t) return fail("Turnier nicht gefunden", 404);

  const { data: row, error: rErr } = await sb
    .from("tournament_feed")
    .select("id, data")
    .eq("tournament_id", t.id)
    .eq("id", id)
    .maybeSingle();
  if (rErr) return fail(`Meldung laden fehlgeschlagen: ${rErr.message}`, 500);
  if (!row) return fail("Meldung nicht gefunden", 404);

  const old = (row as { data?: unknown }).data;
  const data = { ...(old && typeof old === "object" && !Array.isArray(old) ? (old as Record<string, unknown>) : {}), hidden };
  const { error: uErr } = await sb.from("tournament_feed").update({ data }).eq("tournament_id", t.id).eq("id", id);
  if (uErr) return fail(`Ausblenden fehlgeschlagen: ${uErr.message}`, 500);
  return NextResponse.json({ ok: true, hidden });
}
