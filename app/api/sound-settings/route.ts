// 🔊 Sound- & Timer-Einstellungen (global) – Tabelle app_settings, key "sound_settings".
// GET  → { ok, settings, defaults, saved, updatedAt }        (alle Eingeloggten; GET ist für Zuschauer erlaubt)
// POST { settings } → { ok, settings, updatedAt }            (nur Admin – middleware.ts)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { DEFAULT_SOUND_SETTINGS, SOUND_SETTINGS_KEY, normalizeSoundSettings } from "@/lib/soundSettings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", SOUND_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) {
    // noch nichts gespeichert (oder Tabelle fehlt) → Standardwerte = bisheriges Verhalten
    return NextResponse.json(
      { ok: true, settings: DEFAULT_SOUND_SETTINGS, defaults: DEFAULT_SOUND_SETTINGS, saved: false, updatedAt: null },
      { headers: NO_STORE }
    );
  }
  return NextResponse.json(
    {
      ok: true,
      settings: normalizeSoundSettings((data as any).value),
      defaults: DEFAULT_SOUND_SETTINGS,
      saved: true,
      updatedAt: (data as any).updated_at ?? null,
    },
    { headers: NO_STORE }
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.settings || typeof body.settings !== "object") {
    return NextResponse.json({ ok: false, error: "settings fehlt" }, { status: 400 });
  }
  const settings = normalizeSoundSettings(body.settings);
  const updatedAt = new Date().toISOString();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("app_settings")
    .upsert({ key: SOUND_SETTINGS_KEY, value: settings, updated_at: updatedAt }, { onConflict: "key" });
  if (error) {
    return NextResponse.json({ ok: false, error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, settings, updatedAt }, { headers: NO_STORE });
}
