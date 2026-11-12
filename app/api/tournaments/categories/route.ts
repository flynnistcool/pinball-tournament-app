// Admin (Login über middleware.ts): alle Kategorien und Turniernamen, die es aktuell wirklich gibt.
// Quelle: tournaments.category / tournaments.name über ALLE Turniere (nicht nur die neuesten 100),
// Schreibweisen-Varianten (Groß/Klein, Leerzeichen) werden zusammengefasst.
//
// GET -> { categories: [{ name, count, finished, lastUsed }],
//          names:      [{ name, count, finished, lastUsed }] }  (häufigste zuerst)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE = 1000;

type Row = { name: string | null; category: string | null; status: string | null; created_at: string | null };
type Info = { name: string; count: number; finished: number; lastUsed: string | null };

/** Werte zusammenfassen (Groß/Klein + Leerzeichen egal), neueste Schreibweise gewinnt. */
function collect(rows: Row[], pick: (r: Row) => string | null): Info[] {
  const byKey = new Map<string, Info>();
  for (const t of rows) {
    const name = String(pick(t) ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = byKey.get(key);
    if (!cur) {
      // Liste ist nach Datum absteigend sortiert → erste Schreibweise = neueste
      byKey.set(key, { name, count: 1, finished: t.status === "finished" ? 1 : 0, lastUsed: t.created_at });
    } else {
      cur.count += 1;
      if (t.status === "finished") cur.finished += 1;
    }
  }
  // häufigste zuerst, bei Gleichstand die zuletzt genutzte
  return Array.from(byKey.values()).sort(
    (a, b) => b.count - a.count || String(b.lastUsed ?? "").localeCompare(String(a.lastUsed ?? ""))
  );
}

export async function GET() {
  const sb = supabaseAdmin();

  // seitenweise laden (Supabase liefert max. 1000 Zeilen pro Abfrage)
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("tournaments")
      .select("name, category, status, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  return NextResponse.json(
    { categories: collect(all, (r) => r.category), names: collect(all, (r) => r.name) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
