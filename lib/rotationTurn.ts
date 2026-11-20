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
  /** nachgelegte Runden: erster Durchgang des aktuellen Blocks (1 = erster Block) */
  blockStart?: number;
  /** nachgelegte Runden: letzter Durchgang je Block, fortlaufend gezählt (ein Block → [total]) */
  ends?: number[];
};

// ── 🧱 Blöcke: Round the Pinball kann nachträglich weitere Flipper-Runden bekommen ─────────────────
// Ein Block = alle Runden, die zusammen erzeugt wurden (gleiches rounds.created_at, da in EINEM insert).
// Durchgänge werden über alle Blöcke weitergezählt (Block 1: 1–2, Block 2: 3–12 …).
// Ohne Block-Angabe (oder nur ein Block) rechnet alles genau wie vorher.

/** matchId → Block-Kennung (sortierbar, z. B. created_at der Runde) */
export type RotationBlocks = Record<string, string>;

/** Blöcke aus Turnierdaten: Runden mit gleichem created_at gehören zusammen. undefined = nur ein Block. */
export function rotationBlocksFrom(
  rounds: readonly { id: string | number; created_at?: string | null }[] | null | undefined,
  matches: readonly { id: string | number; round_id?: string | number | null }[] | null | undefined
): RotationBlocks | undefined {
  const createdOf = new Map<string, string>();
  for (const r of rounds ?? []) {
    if (r?.created_at) createdOf.set(String(r.id), String(r.created_at));
  }
  if (new Set(Array.from(createdOf.values())).size < 2) return undefined;
  const out: RotationBlocks = {};
  for (const m of matches ?? []) {
    const c = createdOf.get(String(m.round_id ?? ""));
    if (c) out[String(m.id)] = c;
  }
  return out;
}

/** Match-IDs je Block, in Reihenfolge der Blöcke (Matches ohne Block-Angabe zählen zum ersten Block) */
function splitBlocks(matchIds: readonly string[], blocks?: RotationBlocks): string[][] {
  if (!blocks) return [matchIds.slice()];
  const keys = Array.from(new Set(matchIds.map((id) => blocks[String(id)] ?? ""))).sort();
  if (keys.length < 2) return [matchIds.slice()];
  return keys.map((k) => matchIds.filter((id) => (blocks[String(id)] ?? "") === k));
}

/** Letzter Durchgang des Blocks, zu dem Durchgang `wave` gehört (für Kennungen wie "rotWave|3|12") */
export function rotationBlockEnd(progress: RotationProgress | null | undefined, wave: number): number {
  const ends = progress?.ends;
  if (!ends || !ends.length) return progress?.total ?? wave;
  return ends.find((e) => wave <= e) ?? ends[ends.length - 1];
}

/**
 * Durchgang-Zähler: Ein Durchgang = eine Vergabe der blauen Felder (eine Welle).
 * Je Stufe gibt es so viele Durchgänge, wie ein Spieler dort höchstens Flipper hat.
 * Mit `blocks` (nachgelegte Runden): je Block getrennt rechnen und fortlaufend weiterzählen.
 */
export function rotationProgress(
  matchIds: readonly string[],
  players: readonly TurnPlayer[],
  orderOverride?: Record<string, readonly string[] | undefined>,
  blocks?: RotationBlocks
): RotationProgress {
  const parts = splitBlocks(matchIds, blocks);
  if (parts.length < 2) return singleProgress(matchIds, players, orderOverride);
  const ends: number[] = [];
  let offset = 0;
  let found: RotationProgress | null = null;
  for (const ids of parts) {
    const set = new Set(ids.map(String));
    const p = singleProgress(ids, players.filter((x) => set.has(String(x.match_id))), orderOverride);
    if (!found && !p.done && p.total > 0) {
      found = { current: offset + p.current, total: 0, done: false, blockStart: offset + 1 };
    }
    offset += p.total;
    ends.push(offset);
  }
  if (found) return { ...found, total: offset, ends };
  const lastStart = ends.length > 1 ? ends[ends.length - 2] + 1 : 1;
  return { current: offset, total: offset, done: offset > 0, blockStart: lastStart, ends };
}

function singleProgress(
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

/**
 * Durchgang je Eintrag: "matchId|playerId" → Durchgang (1-basiert), gleiche Zählung wie rotationProgress.
 * (für den Rückblick "Durchgang 3 / 4 geschafft")
 */
export function rotationWaveMap(
  matchIds: readonly string[],
  players: readonly TurnPlayer[],
  orderOverride?: Record<string, readonly string[] | undefined>,
  blocks?: RotationBlocks
): Map<string, number> {
  const parts = splitBlocks(matchIds, blocks);
  if (parts.length < 2) return singleWaveMap(matchIds, players, orderOverride, 0).map;
  const out = new Map<string, number>();
  let offset = 0;
  for (const ids of parts) {
    const set = new Set(ids.map(String));
    const r = singleWaveMap(ids, players.filter((x) => set.has(String(x.match_id))), orderOverride, offset);
    r.map.forEach((v, k) => out.set(k, v));
    offset = r.end;
  }
  return out;
}

function singleWaveMap(
  matchIds: readonly string[],
  players: readonly TurnPlayer[],
  orderOverride: Record<string, readonly string[] | undefined> | undefined,
  start: number
): { map: Map<string, number>; end: number } {
  const ordered = orderedByMatch(matchIds, players, orderOverride);
  let maxLen = 0;
  for (const list of Array.from(ordered.values())) maxLen = Math.max(maxLen, list.length);
  const out = new Map<string, number>();
  let offset = start;
  for (let level = 0; level < maxLen; level++) {
    const { machinesOf } = machinesAtLevel(ordered, level);
    let w = 0;
    for (const [pid, arr] of Array.from(machinesOf.entries())) {
      arr.forEach((mid, i) => out.set(mid + "|" + pid, offset + i + 1));
      w = Math.max(w, arr.length);
    }
    offset += w;
  }
  return { map: out, end: offset };
}
