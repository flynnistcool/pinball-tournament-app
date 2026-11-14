// 🔵 Round the Pinball: Wer ist an welchem Flipper GERADE dran? (reine Logik)
//
// STUFEN: Zuerst werden an allen Flippern die Startpositionen 1 gespielt, danach alle
// Positionen 2 usw. (Stufe = kleinste Startposition, an der irgendwo noch ein Score fehlt).
//
// WELLEN innerhalb einer Stufe: Hat ein Spieler in der Stufe mehrere Flipper (mehr Flipper als
// Spieler), bekommt er pro Welle genau EINEN davon blau – zufällig ausgewählt. Die nächste Welle
// beginnt erst, wenn alle blauen Felder der Welle einen Score haben.
// So ist niemand an zwei Flippern gleichzeitig "dran".
//
// "Fester Zufall": Die Auswahl wird aus Match-ID + Spieler-ID berechnet (Hash). Dadurch zeigen
// Admin, Infobildschirm, Handy und Handy-Speichern immer dasselbe, und nach Neuladen springt nichts.
// Neues Turnier / neu erzeugte Runden = neue IDs = neue Reihenfolge.
//
// Hat jeder Spieler je Stufe höchstens einen Flipper (Flipper ≤ Spieler), ist das genau die
// frühere Wellen-Regel.
// Genutzt von Admin-Bereich (blauer Hintergrund), Infobildschirm, Handy-Seite und Handy-Speichern.

export type TurnPlayer = {
  match_id: string;
  player_id: string;
  start_position?: number | null;
  score?: number | string | null;
};

function hasScore(v: unknown): boolean {
  return v != null && v !== "" && Number.isFinite(Number(v));
}

/** FNV-1a (32 Bit) – fester "Zufall" aus einem Text */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function orderedByMatch(
  matchIds: readonly string[],
  players: readonly TurnPlayer[],
  orderOverride?: Record<string, readonly string[] | undefined>
): Map<string, TurnPlayer[]> {
  const byMatch = new Map<string, TurnPlayer[]>();
  for (const mp of players) {
    const k = String(mp.match_id);
    const list = byMatch.get(k);
    if (list) list.push(mp);
    else byMatch.set(k, [mp]);
  }
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
  return ordered;
}

type LevelPlan = {
  /** aktuelle Stufe (0-basiert), -1 = alles fertig */
  level: number;
  /** aktuelle Welle innerhalb der Stufe */
  wave: number;
  /** je Spieler: seine Flipper dieser Stufe in fester Zufallsreihenfolge */
  machinesOf: Map<string, string[]>;
  /** je Spieler: erledigte Flipper dieser Stufe */
  doneOf: Map<string, number>;
  isScored: (matchId: string, playerId: string) => boolean;
};

function machinesAtLevel(
  ordered: Map<string, TurnPlayer[]>,
  level: number
): { machinesOf: Map<string, string[]>; doneOf: Map<string, number> } {
  const machinesOf = new Map<string, string[]>();
  const doneOf = new Map<string, number>();
  for (const [id, list] of Array.from(ordered.entries())) {
    const p = list[level];
    if (!p) continue;
    const pid = String(p.player_id);
    const arr = machinesOf.get(pid);
    if (arr) arr.push(id);
    else machinesOf.set(pid, [id]);
    if (hasScore(p.score)) doneOf.set(pid, (doneOf.get(pid) ?? 0) + 1);
  }
  for (const [pid, arr] of Array.from(machinesOf.entries())) {
    arr.sort((a, b) => hash(a + "|" + pid) - hash(b + "|" + pid) || (a < b ? -1 : a > b ? 1 : 0));
  }
  return { machinesOf, doneOf };
}

function currentLevelPlan(ordered: Map<string, TurnPlayer[]>): LevelPlan {
  const scored = new Set<string>();
  let level = Infinity;
  for (const [id, list] of Array.from(ordered.entries())) {
    list.forEach((x) => {
      if (hasScore(x.score)) scored.add(id + "|" + String(x.player_id));
    });
    const i = list.findIndex((x) => !hasScore(x.score));
    if (i >= 0) level = Math.min(level, i);
  }
  const isScored = (matchId: string, playerId: string) => scored.has(String(matchId) + "|" + String(playerId));
  if (!Number.isFinite(level)) return { level: -1, wave: 0, machinesOf: new Map(), doneOf: new Map(), isScored };

  const { machinesOf, doneOf } = machinesAtLevel(ordered, level);
  let wave = Infinity;
  for (const [pid, arr] of Array.from(machinesOf.entries())) {
    const d = doneOf.get(pid) ?? 0;
    if (d < arr.length) wave = Math.min(wave, d);
  }
  return { level, wave: Number.isFinite(wave) ? wave : 0, machinesOf, doneOf, isScored };
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
  const ordered = orderedByMatch(matchIds, players, orderOverride);
  const out: Record<string, string | null> = {};
  for (const id of Array.from(ordered.keys())) out[id] = null;

  const plan = currentLevelPlan(ordered);
  if (plan.level < 0) return out;
  for (const [pid, arr] of Array.from(plan.machinesOf.entries())) {
    const d = plan.doneOf.get(pid) ?? 0;
    if (d >= arr.length || d !== plan.wave) continue; // fertig in dieser Stufe oder schon voraus
    const next = arr.find((mid) => !plan.isScored(mid, pid));
    if (next) out[next] = pid;
  }
  return out;
}

/**
 * Handy (Warten): An welchem Flipper ist der Spieler als Nächstes dran?
 * Zuerst der nächste offene Flipper der aktuellen Stufe (in derselben Zufallsreihenfolge),
 * sonst der erste offene Flipper der nächsten Stufe, in der er noch etwas offen hat.
 */
export function rotationNextMatchFor(
  matchIds: readonly string[],
  players: readonly TurnPlayer[],
  playerId: string
): string | null {
  const ordered = orderedByMatch(matchIds, players);
  const plan = currentLevelPlan(ordered);
  if (plan.level < 0) return null;
  const pid = String(playerId);
  let maxLen = 0;
  for (const list of Array.from(ordered.values())) maxLen = Math.max(maxLen, list.length);
  for (let level = plan.level; level < maxLen; level++) {
    const arr = machinesAtLevel(ordered, level).machinesOf.get(pid) ?? [];
    const next = arr.find((mid) => !plan.isScored(mid, pid));
    if (next) return next;
  }
  return null;
}

export type RotationProgress = {
  /** aktueller Durchgang (1-basiert); bei fertig = total */
  current: number;
  total: number;
  done: boolean;
};

/**
 * Durchgang-Zähler: Ein Durchgang = eine Vergabe der blauen Felder (eine Welle).
 * Je Stufe gibt es so viele Durchgänge, wie ein Spieler dort höchstens Flipper hat.
 */
export function rotationProgress(
  matchIds: readonly string[],
  players: readonly TurnPlayer[],
  orderOverride?: Record<string, readonly string[] | undefined>
): RotationProgress {
  const ordered = orderedByMatch(matchIds, players, orderOverride);
  let maxLen = 0;
  for (const list of Array.from(ordered.values())) maxLen = Math.max(maxLen, list.length);
  const wavesAt: number[] = [];
  for (let level = 0; level < maxLen; level++) {
    let w = 0;
    for (const arr of Array.from(machinesAtLevel(ordered, level).machinesOf.values())) w = Math.max(w, arr.length);
    wavesAt.push(w);
  }
  const total = wavesAt.reduce((a, b) => a + b, 0);
  const plan = currentLevelPlan(ordered);
  if (plan.level < 0) return { current: total, total, done: total > 0 };
  const before = wavesAt.slice(0, plan.level).reduce((a, b) => a + b, 0);
  return { current: Math.min(total, before + plan.wave + 1), total, done: false };
}
