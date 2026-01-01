// lib/finals.ts

export type FinalPlayer = {
  playerId: string;
  name: string;
  seed: number;        // 1 = bester aus Leaderboard
  startPoints: number; // 3/2/1/0
  points: number;      // wird im Finale hochgezählt
};

export type FinalState = {
  players: FinalPlayer[];
  targetPoints: number;   // z.B. 4
  championId: string | null;
  finished: boolean;
};

/**
 * Startpunkte nach Seed:
 * Seed 1 -> 3, Seed 2 -> 2, Seed 3 -> 1, Seed 4 -> 0
 */
export function getStartPointsForSeed(seed: number): number {
  const pts = 4 - seed;
  return pts > 0 ? pts : 0;
}

/**
 * Final-Ranking berechnen.
 * Champion ist der, der targetPoints erreicht hat (championId).
 * Rest: sortiert nach Punkten, dann nach Seed.
 */
export function computeFinalRanking(state: FinalState): {
  playerId: string;
  name: string;
  seed: number;
  points: number;
  rank: number;
}[] {
  const { players, championId, targetPoints } = state;

  // Falls noch kein Champion: einfach nach Punkten + Seed sortieren
  if (!championId) {
    return players
      .slice()
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.seed - b.seed;
      })
      .map((p, index) => ({
        playerId: p.playerId,
        name: p.name,
        seed: p.seed,
        points: p.points,
        rank: index + 1,
      }));
  }

  const champion = players.find((p) => p.playerId === championId)!;

  const others = players
    .filter((p) => p.playerId !== championId)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.seed - b.seed;
    });

  const ranking = [
    {
      playerId: champion.playerId,
      name: champion.name,
      seed: champion.seed,
      points: champion.points,
      rank: 1,
    },
  ];

  others.forEach((p, index) => {
    ranking.push({
      playerId: p.playerId,
      name: p.name,
      seed: p.seed,
      points: p.points,
      rank: index + 2,
    });
  });

  return ranking;
}
