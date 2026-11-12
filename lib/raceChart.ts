// Daten für den "Rennen"-Graphen (📈 Verlauf) im Infobildschirm:
// alle Spieler starten bei 0, jede Runde kommen ihre Rundenpunkte dazu (kumuliert).
//
// - Rotation ("Round the Pinball"): fehlende Plätze werden – wie im Leaderboard "vorl." –
//   virtuell nach Score vergeben (gleicher Score = gleicher Platz, ohne Score = 0).
//   Solche Runden gelten als "vorläufig" (im Graphen gestrichelt).
// - Alle anderen Modi: nur echte, gespeicherte Plätze zählen. Runden, in denen noch
//   Plätze fehlen, gelten ebenfalls als "vorläufig".
//
// Reine Funktion, speichert nichts.

import { matchPoints } from "@/lib/points";

type RRound = { id: string; number: number | null; format?: string | null };
type RMatch = { id: string; round_id: string };
type RMatchPlayer = {
  match_id: string;
  player_id: string;
  position: number | null;
  score: number | string | null;
};

export type RaceRound = {
  /** Rundennummer */
  no: number;
  /** noch nicht alle Plätze fest → gestrichelt */
  provisional: boolean;
};

export type RaceData = {
  rounds: RaceRound[];
  /** playerId -> kumulierte Punkte, Index 0 = Start (0), Index i = nach Runde i */
  cumulative: Record<string, number[]>;
  maxValue: number;
};

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildRaceData(
  playerIds: string[],
  rounds: RRound[],
  matches: RMatch[],
  matchPlayers: RMatchPlayer[],
  isRotation: boolean
): RaceData {
  const mpsByMatch: Record<string, RMatchPlayer[]> = {};
  for (const mp of matchPlayers ?? []) (mpsByMatch[mp.match_id] ||= []).push(mp);

  const sortedRounds = [...(rounds ?? [])]
    .filter((r) => Number(r.number) > 0)
    .sort((a, b) => Number(a.number) - Number(b.number));

  const outRounds: RaceRound[] = [];
  const perRound: Record<string, number>[] = [];

  for (const r of sortedRounds) {
    const ms = (matches ?? []).filter((m) => m.round_id === r.id);
    const pts: Record<string, number> = {};
    let anyData = false;
    let complete = ms.length > 0;

    for (const m of ms) {
      const list = mpsByMatch[m.id] ?? [];
      const n = list.length;
      if (n === 0) continue;
      if (!list.every((x) => x.position != null)) complete = false;

      // virtueller Platz nach Score (nur Rotation)
      const virtualPlace: Record<string, number> = {};
      if (isRotation) {
        const scored = list
          .map((mp) => ({ mp, s: toScore(mp.score) }))
          .filter((x): x is { mp: RMatchPlayer; s: number } => x.s != null)
          .sort((a, b) => b.s - a.s);
        let place = 0;
        let prev: number | null = null;
        scored.forEach((x, i) => {
          if (prev === null || x.s < prev) place = i + 1;
          prev = x.s;
          virtualPlace[x.mp.player_id] = place;
        });
      }

      for (const mp of list) {
        let p = 0;
        if (mp.position != null) {
          p = matchPoints(mp.position, n, r.format ?? (isRotation ? "rotation" : null));
          anyData = true;
        } else if (isRotation && virtualPlace[mp.player_id] != null) {
          p = matchPoints(virtualPlace[mp.player_id], n, "rotation");
          anyData = true;
        }
        pts[mp.player_id] = (pts[mp.player_id] ?? 0) + p;
      }
    }

    // Runden ohne irgendein Ergebnis weglassen (noch nicht gestartet)
    if (!anyData) continue;
    outRounds.push({ no: Number(r.number), provisional: !complete });
    perRound.push(pts);
  }

  const cumulative: Record<string, number[]> = {};
  let maxValue = 0;
  for (const pid of playerIds) {
    const arr = [0];
    let sum = 0;
    for (const pts of perRound) {
      sum += pts[pid] ?? 0;
      arr.push(sum);
    }
    cumulative[pid] = arr;
    if (sum > maxValue) maxValue = sum;
  }

  return { rounds: outRounds, cumulative, maxValue };
}
