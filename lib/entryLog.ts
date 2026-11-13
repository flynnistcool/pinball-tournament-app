// 📝 Verlauf "wer hat Score/Platz gespeichert" (Spalte match_players.entry_log, jsonb) – reine Logik.
//
// Pro Spieler und Match eine Liste der letzten Änderungen (max. ENTRY_LOG_MAX):
//   { at, by: "Flo - sportyflo" | "Admin", src: "phone" | "admin", score?: [alt, neu], pos?: [alt, neu] }
// Mehrere Änderungen derselben Person kurz hintereinander (MERGE_MS) werden zu einem Eintrag
// zusammengefasst (z. B. Score + automatisch gesetzter Platz = ein Eintrag).

export type EntrySrc = "phone" | "admin";
export type EntryPair = [number | null, number | null];
export type EntryLogItem = { at: string; by: string; src: EntrySrc; score?: EntryPair; pos?: EntryPair };

export const ENTRY_LOG_MAX = 10;
export const MERGE_MS = 60_000;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pair(v: unknown): EntryPair | undefined {
  return Array.isArray(v) && v.length === 2 ? [num(v[0]), num(v[1])] : undefined;
}

/** Spalteninhalt sicher lesen (unbekanntes/kaputtes → leere Liste) */
export function parseEntryLog(v: unknown): EntryLogItem[] {
  if (!Array.isArray(v)) return [];
  const out: EntryLogItem[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const at = String(o.at ?? "");
    if (!at || Number.isNaN(Date.parse(at))) continue;
    const item: EntryLogItem = { at, by: String(o.by ?? "?"), src: o.src === "phone" ? "phone" : "admin" };
    const s = pair(o.score);
    const p = pair(o.pos);
    if (s) item.score = s;
    if (p) item.pos = p;
    if (item.score || item.pos) out.push(item);
  }
  return out;
}

/**
 * Eine Änderung anhängen. null = nichts zu tun (Wert unverändert).
 * Gleiche Person + gleiche Quelle innerhalb MERGE_MS → in den letzten Eintrag einarbeiten
 * (dabei bleibt der ursprüngliche alte Wert erhalten; wieder auf alt zurück = Feld fällt weg).
 */
export function appendEntryLog(
  current: unknown,
  change: { by: string; src: EntrySrc; field: "score" | "pos"; from: unknown; to: unknown; at?: Date }
): EntryLogItem[] | null {
  const from = num(change.from);
  const to = num(change.to);
  if (from === to) return null;
  const at = change.at ?? new Date();
  const log = parseEntryLog(current);
  const last = log[log.length - 1];

  if (last && last.by === change.by && last.src === change.src && at.getTime() - Date.parse(last.at) < MERGE_MS) {
    const merged: EntryLogItem = { ...last };
    const orig = last[change.field]?.[0];
    const start = orig !== undefined ? orig : from;
    if (start === to) delete merged[change.field];
    else merged[change.field] = [start, to];
    const rest = log.slice(0, -1);
    return (merged.score || merged.pos ? [...rest, merged] : rest).slice(-ENTRY_LOG_MAX);
  }

  const item: EntryLogItem = { at: at.toISOString(), by: change.by, src: change.src, [change.field]: [from, to] };
  return [...log, item].slice(-ENTRY_LOG_MAX);
}
