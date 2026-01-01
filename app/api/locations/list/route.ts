import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// (optional, aber hilft gegen "alte Daten" durch Caching)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const sb = supabaseAdmin();

  // 1) Locations holen
  const { data: locations, error: locErr } = await sb
    .from("locations")
    .select("id, name, created_at")
    .order("name");

  if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

  // 2) Alle Zuordnungen Location -> Machines holen (nur location_id reicht)
  const { data: links, error: linkErr } = await sb
    .from("location_machines")
    .select("location_id");

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  // 3) Zählen pro location_id
  const counts = new Map<string, number>();
  for (const row of links ?? []) {
    const id = String((row as any).location_id ?? "");
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  // 4) machine_count an jede Location dranhängen
  const out = (locations ?? []).map((l: any) => ({
    ...l,
    machine_count: counts.get(l.id) ?? 0,
  }));

  return NextResponse.json({ locations: out });
}