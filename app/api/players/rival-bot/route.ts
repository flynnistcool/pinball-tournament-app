// 🥊 Rivalen-Bot eines Spielers: Bilanz + aktuelle Stärke (für die Spieler-Überblickskarte).
// GET /api/players/rival-bot?profileId=...
//  -> { ok: true, rivals: [{ botId, name, start, strength, wins, losses }] }  (leer = kein Rivale)
// Stärke wie beim Würfeln: aus allen Duellen nachgerechnet (lib/botRival.ts), Stellschrauben aus dem Bot-Labor.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { loadBotSettings } from "@/lib/botSettingsServer";
import { rivalStrength } from "@/lib/botRival";
import { loadRivalDuels } from "@/lib/botRivalData";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  try {
    const profileId = String(new URL(req.url).searchParams.get("profileId") ?? "").trim();
    if (!profileId) return fail("profileId fehlt", 400);
    const sb = supabaseAdmin();

    const { data: bots, error } = await sb
      .from("profiles")
      .select("id, name, rating, bot_strength")
      .eq("is_bot", true)
      .eq("bot_kind", "rival")
      .eq("bot_owner_profile_id", profileId);
    if (error) return fail(error.message, 500);
    if (!bots?.length) return NextResponse.json({ ok: true, rivals: [] }, { headers: { "Cache-Control": "no-store" } });

    const { settings } = await loadBotSettings(sb);
    const rivals = [];
    for (const b of bots as { id: string; name: string | null; rating: number | null; bot_strength: number | null }[]) {
      const d = await loadRivalDuels(sb, { ownerProfileId: profileId, rivalProfileId: String(b.id) });
      if (d.error) return fail(d.error, 500);
      const rs = rivalStrength(Number(b.bot_strength ?? b.rating ?? 1500), d.duels, settings);
      rivals.push({ botId: String(b.id), name: String(b.name ?? "Rivale"), start: rs.start, strength: rs.strength, wins: rs.wins, losses: rs.losses });
    }
    return NextResponse.json({ ok: true, rivals }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("players/rival-bot crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
