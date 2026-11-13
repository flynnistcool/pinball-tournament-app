// 📝 Verlauf in match_players.entry_log schreiben (nur Server).
// Fehler werden bewusst ignoriert: fehlt die Spalte (SQL noch nicht ausgeführt) oder klappt es mal
// nicht, darf das eigentliche Speichern von Score/Platz davon NIE betroffen sein.

import type { supabaseAdmin } from "@/lib/supabaseServer";
import { appendEntryLog, type EntrySrc } from "@/lib/entryLog";

type Sb = ReturnType<typeof supabaseAdmin>;

/** Wer speichert? Aus dem Request-Body (Handy-Route setzt es), sonst "Admin". */
export function entryAuthor(body: Record<string, unknown>): { by: string; src: EntrySrc } {
  const src: EntrySrc = body.entered_src === "phone" ? "phone" : "admin";
  const by = String(body.entered_by ?? "").trim().slice(0, 80) || (src === "phone" ? "Handy" : "Admin");
  return { by, src };
}

export async function recordEntryChange(
  sb: Sb,
  matchId: string,
  playerId: string,
  change: { by: string; src: EntrySrc; field: "score" | "pos"; from: unknown; to: unknown }
): Promise<void> {
  try {
    const { data, error } = await sb
      .from("match_players")
      .select("entry_log")
      .eq("match_id", matchId)
      .eq("player_id", playerId)
      .maybeSingle();
    if (error) return;
    const next = appendEntryLog((data as { entry_log?: unknown } | null)?.entry_log, change);
    if (!next) return;
    await sb.from("match_players").update({ entry_log: next }).eq("match_id", matchId).eq("player_id", playerId);
  } catch {
    /* Verlauf ist nur Zusatz – ignorieren */
  }
}
