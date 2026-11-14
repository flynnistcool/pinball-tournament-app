// ⚙️ Stellschrauben der KI-Bots lesen/speichern (nur Admin – Login über middleware.ts).
// GET  -> { ok: true, settings, defaults, saved, updatedAt, tableMissing }
// POST { settings } -> { ok: true, settings, updatedAt } | { ok: false, error }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { BOT_SETTINGS, normalizeBotSettings } from "@/lib/botScore";
import { BOT_SETTINGS_KEY, loadBotSettings } from "@/lib/botSettingsServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const sb = supabaseAdmin();
  const r = await loadBotSettings(sb);
  return NextResponse.json({ ok: true, ...r, defaults: BOT_SETTINGS }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.settings || typeof body.settings !== "object") {
    return NextResponse.json({ ok: false, error: "settings fehlt" }, { status: 400 });
  }
  const settings = normalizeBotSettings(body.settings);
  const updatedAt = new Date().toISOString();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("app_settings")
    .upsert({ key: BOT_SETTINGS_KEY, value: settings, updated_at: updatedAt }, { onConflict: "key" });
  if (error) {
    return NextResponse.json(
      { ok: false, error: `Speichern fehlgeschlagen (Tabelle app_settings angelegt?): ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, settings, updatedAt }, { headers: NO_STORE });
}
