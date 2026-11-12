// Admin (Login über middleware.ts): alle Kategorien, die es aktuell wirklich gibt.
// Quelle: tournaments.category über ALLE Turniere (nicht nur die neuesten 100),
// Schreibweisen-Varianten (Groß/Klein, Leerzeichen) werden zusammengefasst.
//
// GET -> { categories: [{ name, count, finished, lastUsed }] }  (zuletzt genutzte zuerst)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE = 1000;

export async function GET() {
  const sb = supabaseAdmin();

  // seitenweise laden (Supabase liefert max. 1000 Zeilen pro Abfrage)
  const all: { category: string | null; status: string | null; created_at: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("tournaments")
      .select("category, status, created_at")
      .not("category", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const byKey = new Map<string, { name: string; count: number; finished: number; lastUsed: string | null }>();
  for (const t of all) {
    const name = String(t.category ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = byKey.get(key);
    if (!cur) {
      // neueste Schreibweise gewinnt (Liste ist nach Datum absteigend sortiert)
      byKey.set(key, { name, count: 1, finished: t.status === "finished" ? 1 : 0, lastUsed: t.created_at });
    } else {
      cur.count += 1;
      if (t.status === "finished") cur.finished += 1;
    }
  }

  const categories = Array.from(byKey.values()).sort((a, b) =>
    String(b.lastUsed ?? "").localeCompare(String(a.lastUsed ?? ""))
  );

  return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
}
