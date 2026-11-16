// 🔔 Mitteilungs-Einstellungen speichern – nur Admin (POST außerhalb /api/public → middleware.ts prüft Admin).
// POST { settings } → { ok, settings, updatedAt }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { NOTIFICATION_SETTINGS_KEY, normalizeNotificationSettings } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.settings || typeof body.settings !== "object") {
    return NextResponse.json({ ok: false, error: "settings fehlt" }, { status: 400 });
  }
  const settings = normalizeNotificationSettings(body.settings);
  const updatedAt = new Date().toISOString();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("app_settings")
    .upsert({ key: NOTIFICATION_SETTINGS_KEY, value: settings, updated_at: updatedAt }, { onConflict: "key" });
  if (error) {
    return NextResponse.json({ ok: false, error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, settings, updatedAt }, { headers: { "Cache-Control": "no-store" } });
}
