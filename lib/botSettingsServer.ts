// ⚙️ Stellschrauben der KI-Bots aus der Datenbank (Tabelle app_settings, key 'bot_settings').
// Fehlt die Tabelle oder der Eintrag → eingebaute Standardwerte (BOT_SETTINGS).

import { BOT_SETTINGS, normalizeBotSettings, type BotSettings } from "@/lib/botScore";
import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export const BOT_SETTINGS_KEY = "bot_settings";

export async function loadBotSettings(
  sb: Sb
): Promise<{ settings: BotSettings; saved: boolean; updatedAt: string | null; tableMissing: boolean }> {
  const { data, error } = await sb
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", BOT_SETTINGS_KEY)
    .maybeSingle();
  if (error) {
    // z. B. Tabelle noch nicht angelegt → Standardwerte
    return { settings: normalizeBotSettings(BOT_SETTINGS), saved: false, updatedAt: null, tableMissing: true };
  }
  if (!data) return { settings: normalizeBotSettings(BOT_SETTINGS), saved: false, updatedAt: null, tableMissing: false };
  return {
    settings: normalizeBotSettings((data as any).value),
    saved: true,
    updatedAt: (data as any).updated_at ?? null,
    tableMissing: false,
  };
}
