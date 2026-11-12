// 🎖️ Matchsieg-Meilensteine (reine Logik, keine Datenbank).
// Gezählt werden alle Matchsiege eines Spielers (Profil) = Platz 1 in einem Match,
// über alle Turniere und Formate (wie die Siegquote auf den Spielerkarten).
// Bei geteiltem Platz 1 zählt der Sieg für beide.

/** Stufen: 1, 10, 25, 50, 100, 250, 500, danach jede volle 1.000 */
export function isWinMilestone(n: number): boolean {
  if (!Number.isInteger(n) || n < 1) return false;
  if ([1, 10, 25, 50, 100, 250, 500].includes(n)) return true;
  return n >= 1000 && n % 1000 === 0;
}

/** Je höher, desto feierlicher: 🎉 → 🎖️ → 🏅 → 👑 */
export function milestoneIcon(n: number): string {
  if (n >= 1000) return "👑";
  if (n >= 100) return "🏅";
  if (n >= 10) return "🎖️";
  return "🎉";
}

export function milestoneTitle(n: number): string {
  return n === 1 ? "Erster Matchsieg!" : `${n.toLocaleString("de-DE")}. Matchsieg!`;
}

/** Ein Matchsieg im laufenden Turnier (Platz 1 eines Spielers in einem Match). */
export type LiveWin = { key: string; profileId: string; playerName: string };

export function liveWinsFrom(data: {
  match_players?: { match_id: string; player_id: string; position?: number | null }[];
  players?: { id: string; name: string | null; profile_id?: string | null }[];
}): LiveWin[] {
  const playerById = new Map((data.players ?? []).map((p) => [String(p.id), p]));
  const out: LiveWin[] = [];
  for (const mp of data.match_players ?? []) {
    if (Number(mp.position) !== 1) continue;
    const p = playerById.get(String(mp.player_id));
    if (!p?.profile_id) continue; // ohne Profil keine Gesamtzählung möglich
    out.push({ key: `${mp.match_id}|${mp.player_id}`, profileId: String(p.profile_id), playerName: String(p.name ?? "?") });
  }
  return out;
}
