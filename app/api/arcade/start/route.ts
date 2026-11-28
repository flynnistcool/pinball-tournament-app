// 🕹️ Arcade-Lauf starten: legt ein normales Turnier an (Matchplay, 2 Spieler je Match) mit
// arcade_mode / arcade_lives / arcade_stages (Bot-Profile in Reihenfolge) / arcade_profile_id.
// POST { profileId, mode, locationId } -> { ok: true, code } | { ok: false, error }
// Die Stufen (Runden) legt danach /api/arcade/next einzeln an.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sha256, randomCode } from "@/lib/crypto";
import { arcadeModeDef } from "@/lib/arcade";
import { ensureArcadeBots } from "@/lib/arcadeServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const profileId = String(body?.profileId ?? "").trim();
    const locationId = String(body?.locationId ?? "").trim();
    const def = arcadeModeDef(String(body?.mode ?? ""));
    if (!profileId) return fail("Spieler fehlt", 400);
    if (!locationId) return fail("Location fehlt – die Bots brauchen die Scores einer Location", 400);
    if (!def) return fail("Unbekannter Arcade-Modus", 400);

    const sb = supabaseAdmin();
    const { data: prof, error: pErr } = await sb.from("profiles").select("id, name, is_bot").eq("id", profileId).maybeSingle();
    if (pErr) return fail(pErr.message, 500);
    if (!prof) return fail("Spieler nicht gefunden", 404);
    if ((prof as { is_bot?: boolean }).is_bot) return fail("Ein Bot kann keinen Arcade-Lauf spielen", 400);

    // 🤖 Gegner sicherstellen (fehlende einmal anlegen)
    const bots = await ensureArcadeBots(sb, def.stages);
    if (bots.error) return fail(bots.error, 500);
    const stages = def.stages.map((s) => bots.ids[s.key]);

    const { data: t, error: tErr } = await sb
      .from("tournaments")
      .insert({
        code: randomCode(6),
        name: `🕹️ ${def.label} · ${String((prof as { name?: string }).name ?? "?")}`,
        admin_pin_hash: sha256("0000"),
        category: "🕹️ Arcade",
        match_size: 2,
        format: "matchplay",
        location_id: locationId,
        extraball: false,
        arcade_mode: def.mode,
        arcade_lives: def.lives,
        arcade_stages: stages,
        arcade_profile_id: profileId,
      })
      .select("id, code")
      .single();
    if (tErr || !t) return fail(`Arcade-Lauf anlegen fehlgeschlagen (supabase_arcade.sql ausgeführt?): ${tErr?.message ?? "?"}`, 500);
    const tid = String((t as { id: string }).id);

    // 🕹️ Flipper der Location kopieren (nur Flipper, wie bei normalen Turnieren)
    let lm: { name: string | null; active: boolean | null; icon_emoji: string | null; is_pinball?: boolean | null }[] = [];
    const withFlag = await sb
      .from("location_machines")
      .select("name, active, icon_emoji, is_pinball")
      .eq("location_id", locationId)
      .order("sort_order");
    if (!withFlag.error) lm = (withFlag.data ?? []) as typeof lm;
    else {
      const plain = await sb.from("location_machines").select("name, active, icon_emoji").eq("location_id", locationId).order("sort_order");
      lm = (plain.data ?? []) as typeof lm;
    }
    const ms = lm.filter((m) => m.is_pinball !== false);
    if (!ms.length) return fail("An dieser Location gibt es keine Flipper", 400);
    const { error: mErr } = await sb
      .from("machines")
      .insert(ms.map((m) => ({ tournament_id: tid, name: m.name, active: m.active, icon_emoji: m.icon_emoji ?? null })));
    if (mErr) return fail(`Flipper kopieren fehlgeschlagen: ${mErr.message}`, 500);

    // 👤 Spieler
    const { error: plErr } = await sb
      .from("players")
      .insert({ tournament_id: tid, name: String((prof as { name?: string }).name ?? "?"), profile_id: profileId });
    if (plErr) return fail(`Spieler hinzufügen fehlgeschlagen: ${plErr.message}`, 500);

    return NextResponse.json({ ok: true, code: String((t as { code: string }).code) });
  } catch (e: unknown) {
    console.error("arcade/start crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
