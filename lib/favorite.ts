// ★ Favorit eines laufenden Matches (Admin + TV, gleiche Regel) – reine Logik.
//
// 1) Winrates: Turnier-Winrate und Flipper-Winrate geben je einen "Punkt" – aber nur, wenn der
//    Bestwert > 0 % ist UND genau ein Spieler ihn hat (0 % gegen 0 %, 0 % gegen "nie gespielt"
//    oder Gleichstand zählen nicht). Favorit = eindeutig die meisten Punkte.
// 2) Sonst Elo: höchste Elo mit mindestens FAVORITE_MIN_ELO_LEAD Vorsprung auf den Zweitbesten.
//    Platzhalter (Testprofile) zählen dabei nicht; Bots schon (ihre feste Elo ist aussagekräftig).

export const FAVORITE_MIN_ELO_LEAD = 50;

export type FavoriteCandidate = {
  key: string;
  /** Turnier-Winrate in % (null = keine) */
  t: number | null;
  /** Flipper-Winrate in % (null = noch nie an diesem Flipper) */
  m: number | null;
  /** aktuelle Elo (null = unbekannt) */
  elo: number | null;
  /** Platzhalter/Testprofil → nie Favorit über die Elo */
  placeholder?: boolean;
};

export type FavoriteResult = { key: string; reason: "winrate" } | { key: string; reason: "elo"; lead: number };

function uniqueBest(cands: FavoriteCandidate[], pick: (c: FavoriteCandidate) => number | null): string | null {
  const vals = cands.map((c) => ({ key: c.key, v: pick(c) })).filter((x): x is { key: string; v: number } => x.v != null);
  if (!vals.length) return null;
  const max = Math.max(...vals.map((x) => x.v));
  if (!(max > 0)) return null;
  const top = vals.filter((x) => x.v === max);
  return top.length === 1 ? top[0].key : null;
}

export function pickFavorite(
  cands: readonly FavoriteCandidate[],
  minEloLead: number = FAVORITE_MIN_ELO_LEAD
): FavoriteResult | null {
  const list = [...cands];
  if (list.length < 2) return null;

  // 1) Winrates
  const points = new Map<string, number>();
  for (const k of [uniqueBest(list, (c) => c.t), uniqueBest(list, (c) => c.m)]) {
    if (k) points.set(k, (points.get(k) ?? 0) + 1);
  }
  if (points.size) {
    const max = Math.max(...Array.from(points.values()));
    const top = Array.from(points.entries()).filter(([, n]) => n === max);
    if (top.length === 1) return { key: top[0][0], reason: "winrate" };
  }

  // 2) Elo (mit Mindestvorsprung)
  const elos = list
    .filter((c) => !c.placeholder && c.elo != null && Number.isFinite(c.elo))
    .map((c) => ({ key: c.key, elo: c.elo as number }))
    .sort((a, b) => b.elo - a.elo);
  if (elos.length < 2) return null;
  const lead = elos[0].elo - elos[1].elo;
  if (lead >= minEloLead) return { key: elos[0].key, reason: "elo", lead: Math.round(lead) };
  return null;
}

export function favoriteTitle(r: FavoriteResult): string {
  return r.reason === "winrate"
    ? "Favorit – beste Winrates in diesem Match"
    : `Favorit – höchste Elo (+${r.lead} vor dem Nächsten)`;
}
