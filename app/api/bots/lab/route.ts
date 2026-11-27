// 🔬 Bot-Labor (nur Admin – Login über middleware.ts): Rohdaten für die Probe-Rechnung.
// GET /api/bots/lab?locationId=...&machine=Jaws
//  -> { ok: true, samples, bots: [{ id, name, rating }] }
// Gerechnet wird im Browser mit derselben Funktion wie beim echten Spielen (lib/botScore.ts),
// damit man die Stellschrauben ausprobieren kann, ohne etwas zu speichern.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { loadBotSamples } from "@/lib/botData";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const locationId = String(url.searchParams.get("locationId") ?? "").trim();
    const machine = String(url.searchParams.get("machine") ?? "").trim();

    const sb = supabaseAdmin();
    const { data: bots, error: bErr } = await sb
      .from("profiles")
      .select("id, name, rating, bot_kind, bot_owner_profile_id")
      .eq("is_bot", true)
      .order("rating");
    if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
    // 👻/⚡ Name des Spielers, dem ein Ghost-/Form-Bot folgt
    const ownerIds = Array.from(
      new Set((bots ?? []).map((b: { bot_owner_profile_id: string | null }) => b.bot_owner_profile_id).filter(Boolean) as string[])
    );
    if (ownerIds.length) {
      const { data: owners } = await sb.from("profiles").select("id, name").in("id", ownerIds);
      const nameOf = new Map((owners ?? []).map((o: { id: string; name: string | null }) => [String(o.id), String(o.name ?? "?")]));
      for (const b of (bots ?? []) as { bot_owner_profile_id: string | null; owner_name?: string | null }[]) {
        if (b.bot_owner_profile_id) b.owner_name = nameOf.get(String(b.bot_owner_profile_id)) ?? null;
      }
    }

    if (!locationId || !machine) {
      return NextResponse.json({ ok: true, samples: [], bots: bots ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const { samples, error } = await loadBotSamples(sb, { locationId, machineName: machine });
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

    return NextResponse.json({ ok: true, samples, bots: bots ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("bots/lab crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
