// 📝 Verlauf "wer hat gespeichert" für alle Matches eines Turniers (nur Admin).
// GET /api/match_players/entry-log?code=ABC123 → { ok, logs: { "<matchId>|<playerId>": EntryLogItem[] } }
// Fehlt die Spalte entry_log noch (SQL nicht ausgeführt) → { ok: true, logs: {}, missing: true }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { parseEntryLog, type EntryLogItem } from "@/lib/entryLog";

export const dynamic = "force-dynamic";
// Datenbank-Antworten NIE zwischenspeichern (sonst liefert Next.js alte Stände aus)
export const revalidate = 0;
export const fetchCache = "force-no-store";

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return fail("Code fehlt", 400);
  const sb = supabaseAdmin();

  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return fail(tErr.message, 500);
  if (!t) return fail("Turnier nicht gefunden", 404);

  const { data: rounds, error: rErr } = await sb.from("rounds").select("id").eq("tournament_id", t.id);
  if (rErr) return fail(rErr.message, 500);
  const roundIds = (rounds ?? []).map((r: { id: string }) => String(r.id));
  if (!roundIds.length) return NextResponse.json({ ok: true, logs: {} });

  const mRes = await fetchAllIn<{ id: string }>(roundIds, (chunk) =>
    sb.from("matches").select("id").in("round_id", chunk).order("id")
  );
  if (mRes.error) return fail(mRes.error.message, 500);
  const matchIds = mRes.data.map((m) => String(m.id));
  if (!matchIds.length) return NextResponse.json({ ok: true, logs: {} });

  // alle Zeilen holen und hier filtern (ein Filter "entry_log is not null" in der Abfrage lieferte nichts)
  const lRes = await fetchAllIn<{ match_id: string; player_id: string; entry_log: unknown }>(matchIds, (chunk) =>
    sb
      .from("match_players")
      .select("match_id, player_id, entry_log")
      .in("match_id", chunk)
      .order("match_id")
      .order("player_id")
  );
  if (lRes.error) {
    // Spalte gibt es (noch) nicht → einfach nichts anzeigen
    if (/entry_log/i.test(lRes.error.message)) return NextResponse.json({ ok: true, logs: {}, missing: true });
    return fail(lRes.error.message, 500);
  }

  const logs: Record<string, EntryLogItem[]> = {};
  for (const row of lRes.data) {
    const items = parseEntryLog(row.entry_log);
    if (items.length) logs[`${row.match_id}|${row.player_id}`] = items;
  }
  return NextResponse.json({ ok: true, logs });
}
