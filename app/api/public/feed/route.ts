// 📣 Live-Ticker lesen (öffentlich: TV + Handy ohne Login).
// GET ?code=XXXX → { ok, items: FeedItem[] (neueste zuerst), tableMissing? }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { FEED_MAX_ITEMS, type FeedItem } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "code fehlt" }, { status: 400, headers: NO_STORE });

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500, headers: NO_STORE });
  if (!t) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404, headers: NO_STORE });

  const query = (cols: string) =>
    sb
      .from("tournament_feed")
      .select(cols)
      .eq("tournament_id", t.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(FEED_MAX_ITEMS);
  // mit beteiligten Spielern + Zusatzangaben (supabase_tournament_feed_v2.sql); sonst ohne
  let { data, error } = await query("id, event_key, kind, icon, title, body, created_at, player_ids, data");
  if (error && /player_ids|data/i.test(error.message)) {
    ({ data, error } = await query("id, event_key, kind, icon, title, body, created_at"));
  }
  if (error) {
    // Tabelle noch nicht angelegt → leerer Ticker statt Fehler
    return NextResponse.json({ ok: true, items: [], tableMissing: true }, { headers: NO_STORE });
  }
  const items: FeedItem[] = (data ?? []).map((r: any) => ({
    id: Number(r.id),
    key: String(r.event_key),
    kind: String(r.kind),
    icon: String(r.icon ?? ""),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    at: String(r.created_at),
    players: Array.isArray(r.player_ids) ? r.player_ids.map(String) : [],
    data: r.data && typeof r.data === "object" ? r.data : null,
  }));
  return NextResponse.json({ ok: true, items }, { headers: NO_STORE });
}
