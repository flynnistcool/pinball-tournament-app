// Rundenfortschritt ("Hauptrunden") für Matchplay / Swiss / Round Robin / DYP.
//
// ⚠️ 1:1-Kopie der Logik aus app/t/page.tsx (calcRoundsPerCycle + MatchplayProgressStack),
//    damit Infobildschirm und Admin-Seitenleiste exakt dasselbe anzeigen.
//    Bei Änderungen an der Admin-Logik bitte hier mitziehen (oder Admin auf diese Datei umstellen).

export const MAIN_ROUND_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#64748b",
  "#06b6d4",
  "#14b8a6",
  "#db2777",
];

/** Kombinatorik "n über k" */
export function nCk(n: number, k: number): number {
  n = Math.max(0, Math.floor(Number(n) || 0));
  k = Math.max(0, Math.floor(Number(k) || 0));
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= k; i++) res = (res * (n - k + i)) / i;
  return Math.round(res);
}

/**
 * Runden pro Hauptrunde:
 * - 1vs1: alle Paarungen (jeder gegen jeden) einmal
 * - DYP: alle Team-Aufteilungen einmal
 * - 3er/4er: alle k-Kombinationen einmal
 */
export function calcRoundsPerCycle(
  format: string | null | undefined,
  matchSizeRaw: number | null | undefined,
  playersCount: number
): number | null {
  const n = Number(playersCount) || 0;
  const matchSize = Math.max(2, Number(matchSizeRaw ?? 2) || 2);
  const matchesPerRound = Math.max(1, Math.floor(n / matchSize));
  const formatRaw = String(format ?? "").toLowerCase();
  const isDyp = formatRaw.includes("dyp");

  if (matchSize === 2) {
    const totalPairings = (n * (n - 1)) / 2;
    if (!Number.isFinite(totalPairings) || totalPairings <= 0) return null;
    return Math.max(1, Math.ceil(totalPairings / matchesPerRound));
  }

  if (isDyp && matchSize >= 4 && matchSize % 2 === 0) {
    const teamSize = matchSize / 2;
    const partitionsInMatch = (nCk(matchSize, teamSize) * nCk(matchSize - teamSize, teamSize)) / 2;
    const totalCombos = nCk(n, matchSize) * partitionsInMatch;
    if (!Number.isFinite(totalCombos) || totalCombos <= 0) return null;
    return Math.max(1, Math.ceil(totalCombos / matchesPerRound));
  }

  const totalCombos = nCk(n, matchSize);
  if (!Number.isFinite(totalCombos) || totalCombos <= 0) return null;
  return Math.max(1, Math.ceil(totalCombos / matchesPerRound));
}

export type MainRoundBar = { label: string; done: number; total: number; pct: number; color: string };

/** Fortschrittsbalken je Hauptrunde (nur Hauptrunden, in denen es schon Runden gibt). */
export function mainRoundBars(
  rounds: { number: number | null; status: string | null }[],
  roundsPerCycle: number | null
): MainRoundBar[] {
  if (!roundsPerCycle) return [];
  const sorted = rounds
    .map((r) => ({ no: Number(r.number) || 0, status: String(r.status ?? "").toLowerCase() }))
    .filter((r) => r.no > 0)
    .sort((a, b) => a.no - b.no);
  const maxNo = sorted.length ? sorted[sorted.length - 1].no : 0;
  const cycles = Math.max(1, Math.ceil(maxNo / roundsPerCycle));

  const bars: MainRoundBar[] = [];
  for (let i = 0; i < cycles; i++) {
    const startNo = i * roundsPerCycle + 1;
    const endNo = (i + 1) * roundsPerCycle;
    const inBlock = sorted.filter((r) => r.no >= startNo && r.no <= endNo);
    if (inBlock.length === 0) continue;
    const done = inBlock.filter((r) => r.status === "finished").length;
    bars.push({
      label: `Hauptrunde ${i + 1}`,
      done,
      total: roundsPerCycle,
      pct: Math.round((done / roundsPerCycle) * 100),
      color: MAIN_ROUND_COLORS[i % MAIN_ROUND_COLORS.length],
    });
  }
  return bars;
}
