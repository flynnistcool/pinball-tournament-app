// Reine Hilfsfunktionen für die Startseiten-Kacheln (/api/home/summary).
// Keine Datenbankzugriffe – nur Auswertung bereits geladener Zeilen (testbar).

export type ResultRow = {
  player_name: string | null;
  final_rank: number | null;
  super_final_rank: number | null;
};

/**
 * Sieger eines beendeten Turniers aus tournament_results.
 * - Wurde ein Superfinale gespielt (irgendwer hat super_final_rank), zählt dessen Platz 1.
 * - Sonst Platz 1 der Endwertung (bei Gleichstand mehrere Namen).
 */
export function pickWinners(rows: readonly ResultRow[]): { names: string[]; viaSuperFinal: boolean } {
  const viaSuperFinal = rows.some((r) => r.super_final_rank != null);
  const winners = rows.filter((r) =>
    viaSuperFinal ? Number(r.super_final_rank) === 1 : Number(r.final_rank) === 1
  );
  const names = Array.from(
    new Set(winners.map((r) => String(r.player_name ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "de"));
  return { names, viaSuperFinal };
}

export type ScoreRow = { match_id: string; player_id: string; score: number | string | null };

/** Bester Score (größter Wert) – bei Gleichstand gewinnt der zuerst gefundene. */
export function pickTopScore<T extends ScoreRow>(rows: readonly T[]): (T & { score: number }) | null {
  let best: (T & { score: number }) | null = null;
  for (const r of rows) {
    if (r.score == null || r.score === "") continue;
    const s = Number(r.score);
    if (!Number.isFinite(s) || s <= 0) continue;
    if (!best || s > best.score) best = { ...r, score: s };
  }
  return best;
}

/** Höchste Rundennummer je Turnier (für „Runde 3“). */
export function currentRoundByTournament(
  rounds: readonly { tournament_id: string; number: number | null }[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rounds) {
    const n = Number(r.number);
    if (!Number.isFinite(n)) continue;
    const k = String(r.tournament_id);
    if (n > (out.get(k) ?? 0)) out.set(k, n);
  }
  return out;
}
