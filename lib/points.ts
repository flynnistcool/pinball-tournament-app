// Gemeinsame Punkte-Logik pro Match.
// Genutzt von /api/stats (Live-Leaderboard), /api/tournaments/finish (Endberechnung)
// und dem vorläufigen Zwischenstand im Rotation-Modus ("Round the Pinball").

/**
 * Punkte für eine Platzierung in einem Match.
 *
 * - 2 Spieler: 2 / 0
 * - 3 Spieler: 3 / 1 / 0
 * - 4+ Spieler: 4 / 2 / 1 / 0 ...
 * - Rotation mit 5+ Spielern: Platz 1 = N, Platz k = N - k
 *   (z. B. 9 Spieler: 9, 7, 6, 5, 4, 3, 2, 1, 0)
 */
export function matchPoints(
  position: number,
  nPlayers: number,
  format?: string | null
): number {
  if (nPlayers <= 1) return 0;

  if (format === "rotation" && nPlayers >= 5) {
    if (position === 1) return nPlayers;
    return Math.max(0, nPlayers - position);
  }

  if (nPlayers === 2) return position === 1 ? 2 : 0;
  if (nPlayers === 3) return position === 1 ? 3 : position === 2 ? 1 : 0;
  // default 4+
  return position === 1 ? 4 : position === 2 ? 2 : position === 3 ? 1 : 0;
}

type ProvisionalMatch = { id: string };
type ProvisionalMatchPlayer = {
  match_id: string;
  player_id: string;
  position: number | null;
  score: number | string | null;
};

/**
 * Vorläufige (virtuelle) Punkte für noch nicht abgeschlossene Rotation-Matches.
 *
 * Für jedes Match, in dem noch nicht alle Plätze vergeben sind:
 * - Spieler mit eingetragenem Score werden nach Score sortiert virtuell platziert
 *   (gleicher Score = gleicher Platz).
 * - Punkte werden mit matchPoints(platz, alleSpielerImMatch, "rotation") vergeben.
 * - Spieler ohne Score bekommen 0.
 * - Spieler, deren Platz schon gespeichert ist, werden übersprungen
 *   (diese Punkte zählt /api/stats bereits).
 *
 * Abgeschlossene Matches (alle Plätze gesetzt) liefern hier nichts –
 * deren echte Punkte kommen aus /api/stats.
 *
 * Rückgabe: playerId -> vorläufige Zusatzpunkte. Speichert nichts.
 */
export function computeProvisionalRotationPoints(
  matches: ProvisionalMatch[],
  matchPlayers: ProvisionalMatchPlayer[]
): Record<string, number> {
  const result: Record<string, number> = {};

  const byMatch: Record<string, ProvisionalMatchPlayer[]> = {};
  for (const mp of matchPlayers ?? []) {
    if (!mp?.match_id) continue;
    (byMatch[mp.match_id] ||= []).push(mp);
  }

  for (const m of matches ?? []) {
    const mps = byMatch[m.id] ?? [];
    const n = mps.length;
    if (n === 0) continue;

    const allPlaced = mps.every((x) => x.position != null);
    if (allPlaced) continue;

    const scored = mps
      .filter((x) => x.score != null && x.score !== "" && Number.isFinite(Number(x.score)))
      .map((x) => ({ ...x, s: Number(x.score) }))
      .sort((a, b) => b.s - a.s);

    let place = 0;
    let prevScore: number | null = null;
    scored.forEach((x, i) => {
      if (prevScore === null || x.s < prevScore) place = i + 1;
      prevScore = x.s;
      if (x.position != null) return; // schon real gewertet
      result[x.player_id] = (result[x.player_id] ?? 0) + matchPoints(place, n, "rotation");
    });
  }

  return result;
}
