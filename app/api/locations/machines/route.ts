import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locationId = String(url.searchParams.get("locationId") ?? "");
  if (!locationId) return noStoreJson({ error: "locationId fehlt" }, 400);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("location_machines")
    .select("id, name, active, sort_order, icon_emoji")
    .eq("location_id", locationId)
    .order("sort_order")
    .order("created_at");

  if (error) return noStoreJson({ error: error.message }, 500);
  return noStoreJson({ machines: data ?? [] });
}

/**
 * Speichert die Maschinenliste einer Location, ohne bestehende IDs zu zerstören.
 * Das ist wichtig, weil z.B. machine_tasks.location_machine_id auf location_machines.id zeigt.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const locationId = String(body.locationId ?? "");
  const machines = Array.isArray(body.machines) ? body.machines : [];
  if (!locationId) return noStoreJson({ error: "locationId fehlt" }, 400);

  const sb = supabaseAdmin();

  // 1) existierende IDs laden
  const { data: existing, error: exErr } = await sb
    .from("location_machines")
    .select("id")
    .eq("location_id", locationId);

  if (exErr) return noStoreJson({ error: exErr.message }, 500);

  const existingIds = new Set((existing ?? []).map((r: any) => String(r.id)));

  // 2) Incoming normalisieren
  const normalized = machines
    .map((m: any, idx: number) => {
      const idRaw = m?.id ?? null;
      const id = idRaw ? String(idRaw) : null;

      return {
        id,
        location_id: locationId,
        name: String(m?.name ?? "").trim(),
        active: m?.active !== false,
        sort_order: Number.isFinite(m?.sort_order) ? Number(m.sort_order) : idx,
        icon_emoji: m?.icon_emoji ? String(m.icon_emoji).trim() : null,
      };
    })
    .filter((x: any) => x.name);

  const toUpsert = normalized.filter((m: any) => m.id); // bestehende + ggf. editierte
  const toInsert = normalized.filter((m: any) => !m.id); // neue

  const incomingIds = new Set(toUpsert.map((m: any) => String(m.id)));
  const toDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));

  // 3) Update/Upsert bestehender
  if (toUpsert.length) {
    const { error: upErr } = await sb
      .from("location_machines")
      .upsert(toUpsert, { onConflict: "id" });

    if (upErr) return noStoreJson({ error: upErr.message }, 500);
  }

  // 4) Insert neuer
  if (toInsert.length) {
    const insertRows = toInsert.map((r: any) => {
      const { id, ...rest } = r;
      return rest;
    });

    const { error: insErr } = await sb.from("location_machines").insert(insertRows);
    if (insErr) return noStoreJson({ error: insErr.message }, 500);
  }

  // 5) Entfernte löschen
  if (toDelete.length) {
    const { error: delErr } = await sb.from("location_machines").delete().in("id", toDelete);
    if (delErr) return noStoreJson({ error: delErr.message }, 500);
  }

  return noStoreJson({ ok: true });
}
