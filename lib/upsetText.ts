// 🧊 Favoritensturz-Text zerlegen (für Ticker + Handy-Karte).
// Text kommt aus lib/matchMoments.ts momentText:
//   "Janos (Siegchance 23 %) schlägt Favorit Marco (77 %) an 🦖 Godzilla Premium!"
// Aus dem Text gelesen → klappt auch für ältere Meldungen und die vom Admin-Gerät (ohne Zusatzdaten).

export type UpsetParts = {
  winner: string;
  loser: string;
  /** Siegchancen in % (ganze Zahlen) oder null */
  winnerPct: number | null;
  loserPct: number | null;
  /** Flipper (ggf. mit Icon davor) oder null */
  machine: string | null;
};

const UPSET_RE = /^(.+?)( \(Siegchance [^)]*\) schlägt Favorit )(.+?)( \([^)]*\).*)$/s;

export function parseUpsetBody(body: string): UpsetParts | null {
  const m = String(body ?? "").match(UPSET_RE);
  if (!m) return null;
  const pct = (s: string) => {
    const v = s.match(/(\d+)\s*%/)?.[1];
    return v != null ? Number(v) : null;
  };
  return {
    winner: m[1],
    loser: m[3],
    winnerPct: pct(m[2]),
    loserPct: pct(m[4]),
    machine: m[4].match(/ an (.+?)!?\s*$/)?.[1]?.trim() || null,
  };
}
