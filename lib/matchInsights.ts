// 📊 Zusatz-Infos zu einem Match für die Handy-Seite (wie im Admin-Match-Kopf) – reine Logik.
// Daten kommen aus /api/public/tournament (MmData).
//
// - Turnier-Winrate: Siege (Platz 1) / Matches mit Platz in DIESEM Turnier (wie /api/stats)
// - topIds: wer hat den besten Wert (grün / Favorit)

import type { MmData } from "@/lib/myMatch";

export type WinrateInfo = { played: number; wins: number; winrate: number | null };

export function tournamentWinrates(data: MmData): Record<string, WinrateInfo> {
  const out: Record<string, WinrateInfo> = {};
  for (const mp of data.match_players ?? []) {
    if (mp.position == null) continue;
    const pid = String(mp.player_id);
    const r = (out[pid] ||= { played: 0, wins: 0, winrate: null });
    r.played += 1;
    if (Number(mp.position) === 1) r.wins += 1;
  }
  for (const r of Object.values(out)) {
    r.winrate = r.played > 0 ? Math.round((r.wins / r.played) * 1000) / 10 : null;
  }
  return out;
}

/**
 * Wer hat den höchsten Wert? (für grüne Hervorhebung, wie im Admin: auch wenn nur einer einen Wert hat).
 * Liefert die Menge der Spieler-IDs mit dem Maximum.
 */
export function topIds(values: Record<string, number | null | undefined>): Set<string> {
  const nums = Object.entries(values).filter(([, v]) => typeof v === "number" && Number.isFinite(v)) as [
    string,
    number,
  ][];
  if (nums.length < 1) return new Set();
  const max = Math.max(...nums.map(([, v]) => v));
  return new Set(nums.filter(([, v]) => v === max).map(([k]) => k));
}
