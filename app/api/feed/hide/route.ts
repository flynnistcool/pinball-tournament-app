// 📣 Live-Ticker: eine Meldung ausblenden (oder wieder einblenden) – nur Admin (POST außerhalb /api/public → middleware.ts).
// POST { code, id, hidden?: boolean = true } → { ok: true, hidden }
// POST { code, keyPrefix, exceptKey?, hidden? } → { ok: true, hidden, count }
//   🛡️ z. B. Flipper eines Matches geändert: alle Meldungen, deren event_key mit keyPrefix beginnt
//   (außer exceptKey), ausblenden – die alte Ankündigung nennt sonst den falschen Flipper.
//
// Nicht löschen, sondern in data.hidden vermerken: Die Zeile (und ihre event_key) bleibt bestehen, damit weder der
// Server-Ticker (/api/public/feed/sync) noch die Admin-Seite die Meldung als "fehlt" erkennt und neu anlegt.
// GET /api/public/feed lässt ausgeblendete Meldungen weg.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

type FeedRow = { id: number; event_key?: string | null; data?: unknown };

const withHidden = (old: unknown, hidden: boolean) => ({
  ...(old && typeof old === "object" && !Array.isArray(old) ? (old as Record<string, unknown>) : {}),
  hidden,
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim().toUpperCase();
  const id = Number(body?.id);
  const keyPrefix = typeof body?.keyPrefix === "string" ? body.keyPrefix : "";
  const exceptKey = typeof body?.exceptKey === "string" ? body.exceptKey : null;
  const hidden = body?.hidden !== false;
  if (!code) return fail("code fehlt", 400);
  const byPrefix = keyPrefix.length >= 8; // zu kurze Präfixe wären zu grob
  if (!byPrefix && (!Number.isFinite(id) || id <= 0)) return fail("id fehlt", 400);

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
  if (!t) return fail("Turnier nicht gefunden", 404);

  if (byPrefix) {
    // event_key per Präfix (LIKE-Sonderzeichen entschärfen)
    const pattern = keyPrefix.replace(/[\\%_]/g, (c: string) => "\\" + c) + "%";
    const { data: rows, error: rErr } = await sb
      .from("tournament_feed")
      .select("id, event_key, data")
      .eq("tournament_id", t.id)
      .like("event_key", pattern);
    if (rErr) return fail(`Meldungen laden fehlgeschlagen: ${rErr.message}`, 500);
    let count = 0;
    for (const row of (rows ?? []) as FeedRow[]) {
      if (exceptKey && row.event_key === exceptKey) continue;
      const { error: uErr } = await sb
        .from("tournament_feed")
        .update({ data: withHidden(row.data, hidden) })
        .eq("tournament_id", t.id)
        .eq("id", row.id);
      if (uErr) return fail(`Ausblenden fehlgeschlagen: ${uErr.message}`, 500);
      count++;
    }
    return NextResponse.json({ ok: true, hidden, count });
  }

  const { data: row, error: rErr } = await sb
    .from("tournament_feed")
    .select("id, data")
    .eq("tournament_id", t.id)
    .eq("id", id)
    .maybeSingle();
  if (rErr) return fail(`Meldung laden fehlgeschlagen: ${rErr.message}`, 500);
  if (!row) return fail("Meldung nicht gefunden", 404);

  const { error: uErr } = await sb
    .from("tournament_feed")
    .update({ data: withHidden((row as FeedRow).data, hidden) })
    .eq("tournament_id", t.id)
    .eq("id", id);
  if (uErr) return fail(`Ausblenden fehlgeschlagen: ${uErr.message}`, 500);
  return NextResponse.json({ ok: true, hidden });
}
