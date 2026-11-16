// 📣 Live-Ticker: Ereignisse eintragen – nur Admin (POST außerhalb /api/public → middleware.ts prüft Admin).
// POST { code, items: FeedItemInput[] } → { ok, added }
// Doppelte Ereignisse (gleiche event_key) werden ignoriert.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { cleanFeedItem, type FeedItemInput } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim().toUpperCase();
  const items = ((Array.isArray(body?.items) ? body.items : []) as unknown[])
    .map(cleanFeedItem)
    .filter((x): x is FeedItemInput => !!x)
    .slice(0, 20);
  if (!code) return fail("code fehlt", 400);
  if (!items.length) return NextResponse.json({ ok: true, added: 0 });

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
  if (!t) return fail("Turnier nicht gefunden", 404);

  const baseRows = items.map((it) => ({
    tournament_id: t.id,
    event_key: it.key,
    kind: it.kind,
    icon: it.icon,
    title: it.title,
    body: it.body,
  }));
  // mit beteiligten Spielern + Zusatzangaben (supabase_tournament_feed_v2.sql)
  const fullRows = baseRows.map((r, i) => ({ ...r, player_ids: items[i].players ?? [], data: items[i].data ?? null }));
  let { error } = await sb
    .from("tournament_feed")
    .upsert(fullRows, { onConflict: "tournament_id,event_key", ignoreDuplicates: true });
  if (error && /player_ids|data/i.test(error.message)) {
    // Ergänzung noch nicht ausgeführt → ohne die neuen Spalten speichern
    ({ error } = await sb
      .from("tournament_feed")
      .upsert(baseRows, { onConflict: "tournament_id,event_key", ignoreDuplicates: true }));
  }
  const rows = baseRows;
  if (error) {
    const hint = /tournament_feed/i.test(error.message) ? " – bitte supabase_tournament_feed.sql ausführen" : "";
    return fail(`Ticker speichern fehlgeschlagen: ${error.message}${hint}`, 500);
  }
  return NextResponse.json({ ok: true, added: rows.length });
}
