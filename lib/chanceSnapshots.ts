// 🧊 Eingefrorene Siegchancen VOR einem Match (für den Favoritensturz).
//
// Die Siegchance (lib/favorite.ts) ändert sich durch das Ergebnis selbst (Turnier-Winrate, Elo nach der Runde …).
// Deshalb merkt sich jedes Gerät die Chancen, solange ein Match noch unberührt ist (keine Plätze/Scores),
// und der Favoritensturz vergleicht später mit genau diesem Stand – dem, was vor dem Spiel auf dem Bildschirm stand.
// Speicher: im Speicher + localStorage je Turnier (übersteht Neuladen). Nur Browser; auf dem Server leer.

export type ChanceSnapshot = {
  /** ★ Favorit (players.id) oder null */
  favoriteKey: string | null;
  /** Siegchance je players.id (0..1) */
  chances: Record<string, number>;
  at: number;
};

const mem = new Map<string, Record<string, ChanceSnapshot>>();
const KEY = (code: string) => `pb_chanceSnap_${String(code).toUpperCase()}`;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function load(code: string): Record<string, ChanceSnapshot> {
  const c = String(code).toUpperCase();
  const hit = mem.get(c);
  if (hit) return hit;
  let v: Record<string, ChanceSnapshot> = {};
  try {
    if (typeof window !== "undefined") v = JSON.parse(window.localStorage.getItem(KEY(c)) ?? "{}") ?? {};
  } catch {
    v = {};
  }
  mem.set(c, v);
  return v;
}

function persist(code: string) {
  const c = String(code).toUpperCase();
  try {
    const all = mem.get(c) ?? {};
    const now = Date.now();
    for (const [k, s] of Object.entries(all)) if (now - (s?.at ?? 0) > MAX_AGE_MS) delete all[k];
    if (typeof window !== "undefined") window.localStorage.setItem(KEY(c), JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Stand eines noch unberührten Matches merken (überschreibt den alten Stand, solange das Match unberührt ist) */
export function saveChanceSnapshot(code: string, matchId: string, snap: Omit<ChanceSnapshot, "at">) {
  if (!code || !matchId) return;
  const all = load(code);
  const prev = all[matchId];
  const same =
    prev &&
    prev.favoriteKey === snap.favoriteKey &&
    Object.keys(snap.chances).length === Object.keys(prev.chances).length &&
    Object.entries(snap.chances).every(([k, v]) => Math.abs((prev.chances[k] ?? -1) - v) < 0.001);
  if (same) return; // nichts geändert → nicht ständig schreiben
  all[matchId] = { ...snap, at: Date.now() };
  persist(code);
}

export function getChanceSnapshot(code: string, matchId: string): ChanceSnapshot | null {
  if (!code || !matchId) return null;
  return load(code)[matchId] ?? null;
}

/** Favoritensturz: Sieger hatte vor dem Match höchstens so viel Siegchance */
export const UPSET_MAX_CHANCE = 0.3;
