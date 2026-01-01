import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();

    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });

    const sb = supabaseAdmin();

    // Sicherheits-Check: Location wird in Turnieren verwendet?
    const { data: used, error: usedErr } = await sb
      .from("tournaments")
      .select("id")
      .eq("location_id", id)
      .limit(1);

    if (usedErr) return NextResponse.json({ error: usedErr.message }, { status: 500 });
    if ((used ?? []).length > 0) {
      return NextResponse.json(
        { error: "Location wird in einem Turnier verwendet und kann nicht gelöscht werden." },
        { status: 400 }
      );
    }

    // 1) Zuordnungen löschen (location_machines)
    const { error: lmErr } = await sb.from("location_machines").delete().eq("location_id", id);
    if (lmErr) return NextResponse.json({ error: lmErr.message }, { status: 500 });

    // 2) Location löschen
    const { error: locErr } = await sb.from("locations").delete().eq("id", id);
    if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}