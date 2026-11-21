// 📟 Server: Turnier für die Flipper-Displays merken (app_settings, Liste – neuestes vorne).
// Genutzt von /api/display-tournament (Admin-iPad: Öffnen, Timer-Start, Score, Knopf) und
// /api/public/me/save (Score am Handy). Fehler werden nur gemeldet – Displays sind Zusatz.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DISPLAY_PIN_MAX, displayPinList, displayTournamentKey } from "@/lib/flipperDisplay";

export type PinResult = { ok: true; skipped?: string } | { ok: false; error: string; status: number };

/**
 * 📟 Alle Displays zurücksetzen: gemerkte Turniere aller Locations leeren (Eintrag bleibt mit leerer Liste,
 * damit die Displays nicht "raten", sondern ihren Allzeit-Highscore zeigen – bis wieder ein Turnier gemeldet wird).
 */
export async function resetDisplayPins(sb: SupabaseClient): Promise<PinResult> {
  const { data, error } = await sb.from("app_settings").select("key").like("key", "display_tournament%");
  if (error) return { ok: false, error: error.message, status: 500 };
  const at = new Date().toISOString();
  const keys = Array.from(new Set([displayTournamentKey(null), ...((data ?? []) as { key: string }[]).map((r) => r.key)]));
  const rows = keys.map((key) => ({ key, value: { code: null, at, list: [], resetAt: at }, updated_at: at }));
  const { error: upErr } = await sb.from("app_settings").upsert(rows, { onConflict: "key" });
  if (upErr) return { ok: false, error: `Zurücksetzen fehlgeschlagen: ${upErr.message}`, status: 500 };
  return { ok: true };
}

export async function pinDisplayTournament(sb: SupabaseClient, codeRaw: string): Promise<PinResult> {
  const code = String(codeRaw ?? "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Code fehlt", status: 400 };

  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, code, status, location_id")
    .eq("code", code)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message, status: 500 };
  if (!t) return { ok: false, error: "Turnier nicht gefunden", status: 404 };
  // Beendete Turniere (Archiv ansehen) nicht merken
  if ((t as { status: string | null }).status === "finished") return { ok: true, skipped: "beendet" };

  const at = new Date().toISOString();
  const loc = (t as { location_id: string | null }).location_id;
  const keys = [displayTournamentKey(null), ...(loc ? [displayTournamentKey(String(loc))] : [])];
  const { data: existing } = await sb.from("app_settings").select("key, value").in("key", keys);
  const rows = keys.map((key) => {
    const old = (existing ?? []).find((r: { key: string }) => r.key === key) as { value?: unknown } | undefined;
    const list = [{ code, at }, ...displayPinList(old?.value).filter((p) => p.code !== code)].slice(0, DISPLAY_PIN_MAX);
    return { key, value: { code, at, list }, updated_at: at };
  });
  const { error } = await sb.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: `Speichern fehlgeschlagen: ${error.message}`, status: 500 };
  return { ok: true };
}
