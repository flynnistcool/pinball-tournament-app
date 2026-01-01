import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locationId = String(url.searchParams.get("locationId") ?? "");
  if (!locationId) return NextResponse.json({ error: "locationId fehlt" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("location_machines")
    .select("id, name, active, sort_order, icon_emoji")
    .eq("location_id", locationId)
    .order("sort_order")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ machines: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const locationId = String(body.locationId ?? "");
  const machines = Array.isArray(body.machines) ? body.machines : [];
  if (!locationId) return NextResponse.json({ error: "locationId fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  // Replace list for simplicity
  const { error: delErr } = await sb.from("location_machines").delete().eq("location_id", locationId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (machines.length) {
    const rows = machines.map((m: any, idx: number) => ({
      location_id: locationId,
      name: String(m.name ?? "").trim(),
      active: m.active !== false,
      sort_order: Number.isFinite(m.sort_order) ? Number(m.sort_order) : idx,
      icon_emoji: m.icon_emoji ? String(m.icon_emoji).trim() : null,
    })).filter((x:any)=>x.name);
    if (rows.length) {
      const { error: insErr } = await sb.from("location_machines").insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
