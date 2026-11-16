// 📣 Live-Ticker – gemeinsame Typen + Grenzen (Server und Browser).

export type FeedItemInput = {
  /** eindeutige Kennung (gleiche Kennung = gleiches Ereignis → wird nur einmal gespeichert) */
  key: string;
  /** Art = id aus lib/notifications.ts (record, month, streakBroken …) */
  kind: string;
  icon: string;
  title: string;
  body: string;
  /** beteiligte Spieler (players.id dieses Turniers) – für persönliche Handy-Einblendungen */
  players?: string[];
  /** Zusatzangaben für persönliche Texte (z. B. { player, machine, score, n }) */
  data?: Record<string, unknown> | null;
};

export type FeedItem = FeedItemInput & { id: number; at: string; players: string[] };

export const FEED_MAX_ITEMS = 40;

const cut = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/** Eingaben säubern (Längen begrenzen, Pflichtfelder prüfen) */
export function cleanFeedItem(raw: unknown): FeedItemInput | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const key = cut(r.key, 200).trim();
  const kind = cut(r.kind, 40).trim();
  if (!key || !kind) return null;
  const players = (Array.isArray(r.players) ? r.players : [])
    .map((p) => cut(p, 60).trim())
    .filter(Boolean)
    .slice(0, 10);
  let data: Record<string, unknown> | null = null;
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data)) {
    try {
      const json = JSON.stringify(r.data);
      if (json.length <= 2000) data = JSON.parse(json);
    } catch {
      data = null;
    }
  }
  return { key, kind, icon: cut(r.icon, 8), title: cut(r.title, 80), body: cut(r.body, 240), players, data };
}
