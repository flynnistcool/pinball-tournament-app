// 🔥 Serien im laufenden Turnier ("on fire") – reine Logik, keine Datenbank.
//
// Zwei Arten, je nach Format:
// - "wins" (Matchplay, Swiss, Round Robin, DYP, Elimination …):
//   Sieg = Platz 1 in einem FERTIGEN Match (alle Spieler des Matches haben einen Platz).
//   Serie = Siege in Folge, vom zuletzt fertigen Match des Spielers rückwärts gezählt.
//   Noch laufende Matches unterbrechen die Serie nicht. Bei DYP zählt der Teamsieg für beide.
//   🔥 ab 3.
// - "leads" (Round the Pinball / rotation): Plätze gibt es dort erst am Ende, deshalb live nach
//   SCORES: Anzahl Flipper, an denen der Spieler AKTUELL den besten (oder gleich besten) Score hat –
//   egal in welcher Reihenfolge. Wird er überboten, sinkt die Zahl wieder.
//   🔥 ab 2 (mehr Mitspieler pro Flipper → Vorne-Sein ist seltener).
// Reihenfolge jeweils nach Rundennummer (bei gleicher Runde: Match-Reihenfolge der Daten).
// 🔥🔥 ab 5.

export type StreakMode = "none" | "wins" | "leads";

export const STREAK_HOT = 5;

export function streakMode(format: string | null | undefined): StreakMode {
  const f = String(format ?? "");
  if (f === "timeplay") return "none";
  if (f === "rotation") return "leads";
  return "wins";
}

/** Ab welcher Serie 🔥 angezeigt und gemeldet wird */
export function streakMin(mode: StreakMode): number {
  return mode === "leads" ? 2 : 3;
}

/** Text für die Serie, z. B. "3 Siege in Folge" */
export function streakText(mode: StreakMode, n: number): string {
  return mode === "leads" ? `hält ${n} Turnier-Highscores` : `${n} Siege in Folge`;
}

type StreakData = {
  rounds?: { id: string; number?: number | null }[];
  matches?: { id: string; round_id: string }[];
  match_players?: {
    match_id: string;
    player_id: string;
    position?: number | null;
    score?: number | string | null;
  }[];
};

function prepare(data: StreakData) {
  const roundNo = new Map((data.rounds ?? []).map((r) => [String(r.id), Number(r.number ?? 0)]));
  const order = new Map<string, number>();
  (data.matches ?? []).forEach((m, i) => order.set(String(m.id), i));
  const byMatch = new Map<string, NonNullable<StreakData["match_players"]>>();
  for (const mp of data.match_players ?? []) {
    const k = String(mp.match_id);
    const list = byMatch.get(k);
    if (list) list.push(mp);
    else byMatch.set(k, [mp]);
  }
  const sorted = (data.matches ?? [])
    .slice()
    .sort(
      (a, b) =>
        (roundNo.get(String(a.round_id)) ?? 0) - (roundNo.get(String(b.round_id)) ?? 0) ||
        (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0)
    );
  return { sorted, byMatch };
}

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Siege in Folge (Platz 1 in fertigen Matches) */
export function computeWinStreaks(data: StreakData): Record<string, number> {
  const { sorted, byMatch } = prepare(data);
  const streak: Record<string, number> = {};
  for (const m of sorted) {
    const mps = byMatch.get(String(m.id)) ?? [];
    if (!mps.length || !mps.every((x) => Number(x.position) > 0)) continue; // noch nicht fertig
    for (const mp of mps) {
      const pid = String(mp.player_id);
      streak[pid] = Number(mp.position) === 1 ? (streak[pid] ?? 0) + 1 : 0;
    }
  }
  return streak;
}

/** Round the Pinball: an wie vielen Flippern aktuell vorne (live nach Scores, Reihenfolge egal) */
export function computeLeadStreaks(data: StreakData): Record<string, number> {
  const { sorted, byMatch } = prepare(data);
  const leads: Record<string, number> = {};
  for (const m of sorted) {
    const scored = (byMatch.get(String(m.id)) ?? [])
      .map((mp) => ({ pid: String(mp.player_id), s: toScore(mp.score) }))
      .filter((x): x is { pid: string; s: number } => x.s != null);
    if (!scored.length) continue;
    const best = Math.max(...scored.map((x) => x.s));
    for (const x of scored) if (x.s === best) leads[x.pid] = (leads[x.pid] ?? 0) + 1;
  }
  return leads;
}

export function computeStreaks(data: StreakData, mode: StreakMode): Record<string, number> {
  if (mode === "leads") return computeLeadStreaks(data);
  if (mode === "wins") return computeWinStreaks(data);
  return {};
}

/** Anzeige neben dem Namen: null (keine Serie), "🔥" ab Mindestwert, "🔥🔥" ab 5 */
export function streakFire(n: number | null | undefined, min = 3): string | null {
  const v = Number(n ?? 0);
  if (v >= STREAK_HOT && v >= min) return "🔥🔥";
  if (v >= min) return "🔥";
  return null;
}
