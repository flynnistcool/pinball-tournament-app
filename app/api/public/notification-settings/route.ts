// 🔔 Mitteilungs-Einstellungen lesen (öffentlich: TV + Handy brauchen sie ohne Login).
// GET → { ok, settings, saved, updatedAt }   (Speichern: POST /api/notification-settings, nur Admin)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import {
  NOTIFICATION_SETTINGS_KEY,
  defaultNotificationSettings,
  normalizeNotificationSettings,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", NOTIFICATION_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json(
      { ok: true, settings: defaultNotificationSettings(), saved: false, updatedAt: null },
      { headers: NO_STORE }
    );
  }
  return NextResponse.json(
    {
      ok: true,
      settings: normalizeNotificationSettings((data as any).value),
      saved: true,
      updatedAt: (data as any).updated_at ?? null,
    },
    { headers: NO_STORE }
  );
}
