// Punkte-Regeln NUR für Anzeigen (ℹ️ Punktesystem, Matchpunkte am Match, TV-Fußzeile).
//
// ⚠️ Bewusst eigene Datei statt lib/points.ts (die wird von vielen Server-Routen geteilt
// und soll vorerst unverändert bleiben). Die Regeln hier müssen übereinstimmen mit:
// - lib/points.ts → matchPoints, SUPER_FINAL_TP_BONUS
// - app/api/tournaments/finish → tournamentPointsForRank
// - lib/finals.ts → getStartPointsForSeed (Superfinale-Vorpunkte), target_points 4
// Bei Änderungen der Punkteregeln alle Stellen anpassen.

export const SUPER_FINAL_TP_BONUS_DISPLAY = 2;
export const SUPER_FINAL_START_POINTS = [3, 2, 1, 0];
export const SUPER_FINAL_TARGET = 4;

/** Matchpunkte für einen Platz (wie lib/points.ts → matchPoints). */
export function matchPointsForDisplay(position: number, nPlayers: number, format?: string | null): number {
  if (nPlayers <= 1) return 0;
  if (format === "rotation" && nPlayers >= 5) {
    if (position === 1) return nPlayers;
    return Math.max(0, nPlayers - position);
  }
  if (nPlayers === 2) return position === 1 ? 2 : 0;
  if (nPlayers === 3) return position === 1 ? 3 : position === 2 ? 1 : 0;
  return position === 1 ? 4 : position === 2 ? 2 : position === 3 ? 1 : 0;
}

/**
 * Matchpunkte-Schema des Turniers (z. B. [4, 2, 1, 0]).
 * - Rotation: alle Turnierspieler spielen gemeinsam → N = Teilnehmerzahl
 * - DYP: 2 Teams, Match mit 4 Spielern → Sieger/Verlierer
 * - sonst: Spieler pro Maschine
 */
export function matchPointsScheme(
  format: string | null | undefined,
  matchSize: number | null | undefined,
  nTournamentPlayers: number
): number[] {
  const f = String(format ?? "");
  if (f === "dyp_round_robin") return [1, 2].map((p) => matchPointsForDisplay(p, 4, f));
  const n = f === "rotation" ? Math.max(2, nTournamentPlayers) : Math.max(2, Number(matchSize ?? 0) || 4);
  return Array.from({ length: n }, (_, i) => matchPointsForDisplay(i + 1, n, f));
}

/** Turnierpunkte je Endplatz 1..N (wie finish → tournamentPointsForRank). */
export function tournamentPointsScheme(nPlayers: number): number[] {
  const n = Math.max(0, Number.isFinite(nPlayers) ? nPlayers : 0);
  return Array.from({ length: n }, (_, i) => {
    const rank = i + 1;
    if (rank === 1) return n + 2;
    if (rank === 2) return n;
    return Math.max(0, n - (rank - 1));
  });
}
