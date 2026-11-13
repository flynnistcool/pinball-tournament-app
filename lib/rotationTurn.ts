// 🔵 Round the Pinball: Wer ist an welchem Flipper GERADE dran? (reine Logik)
//
// Gespielt wird in WELLEN: Zuerst spielen an allen Flippern die Spieler auf Startposition 1.
// Erst wenn ALLE davon ihren Score haben, rücken alle Flipper gleichzeitig auf Position 2 weiter usw.
// So ist niemand an zwei Flippern gleichzeitig "dran".
//
// Welle = kleinste Position (über alle Flipper), an der noch jemand ohne Score steht.
// Aktiv an einem Flipper = der Spieler genau auf dieser Position, falls er noch keinen Score hat.
// Genutzt von Admin-Bereich (blauer Hintergrund), Infobildschirm und Handy-Seite.

export type TurnPlayer = {
  match_id: string;
  player_id: string;
  start_position?: number | null;
  score?: number | string | null;
};

function hasScore(v: unknown): boolean {
  return v != null && v !== "" && Number.isFinite(Number(v));
}

/**
 * @param matchIds  alle Flipper-Matches des Turniers (Rotation)
 * @param players   match_players dieser Matches
 * @param orderOverride optional: Reihenfolge je Match (Admin: gerade per Drag & Drop umsortiert)
 * @returns matchId → aktiver Spieler (oder null = an diesem Flipper gerade niemand)
 */
export function rotationActiveMap(
  matchIds: readonly string[],
  players: readonly TurnPlayer[],
  orderOverride?: Record<string, readonly string[] | undefined>
): Record<string, string | null> {
  const byMatch = new Map<string, TurnPlayer[]>();
  for (const mp of players) {
    const k = String(mp.match_id);
    const list = byMatch.get(k);
    if (list) list.push(mp);
    else byMatch.set(k, [mp]);
  }

  // Spieler je Match in Startreihenfolge
  const ordered = new Map<string, TurnPlayer[]>();
  for (const id of matchIds) {
    const list = byMatch.get(String(id)) ?? [];
    const override = orderOverride?.[String(id)];
    let sorted: TurnPlayer[];
    if (override && override.length) {
      const byPid = new Map(list.map((x) => [String(x.player_id), x]));
      sorted = override.map((pid) => byPid.get(String(pid))).filter((x): x is TurnPlayer => !!x);
    } else {
      sorted = list.slice().sort((a, b) => Number(a.start_position ?? 9999) - Number(b.start_position ?? 9999));
    }
    ordered.set(String(id), sorted);
  }

  // aktuelle Welle
  let wave = Infinity;
  for (const list of Array.from(ordered.values())) {
    const i = list.findIndex((x) => !hasScore(x.score));
    if (i >= 0 && i < wave) wave = i;
  }

  const out: Record<string, string | null> = {};
  for (const [id, list] of Array.from(ordered.entries())) {
    const p = Number.isFinite(wave) ? list[wave] : undefined;
    out[id] = p && !hasScore(p.score) ? String(p.player_id) : null;
  }
  return out;
}
