// 🎱 DYP: Geräte nach Gewichtung verteilen – reine Logik (testbar).
// Jedes Nicht-Flipper-Gerät (Kicker, Arcade, Switch …) ist eine eigene Gruppe mit Gewicht 1,
// ALLE Flipper zusammen sind eine Gruppe mit einstellbarem Gewicht (Standard 3).
// Beispiel Kicker / Arcade / Switch / Flipper = 1-1-1-3.
// Pro Match wird die Gruppe gewählt, die gemessen an ihrem Gewicht am weitesten zurückliegt;
// innerhalb der Flipper der am seltensten gespielte (Abwechslung über alle Flipper).
// Geräte, die in dieser Runde schon vergeben sind, werden nicht doppelt belegt (solange es geht).

export const DYP_PINBALL_WEIGHT_DEFAULT = 3;

export type DypMachine = { id: string; isPinball: boolean };

export function clampPinballWeight(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DYP_PINBALL_WEIGHT_DEFAULT;
  return Math.min(10, Math.max(0, n));
}

/**
 * @param machines     erlaubte Geräte des Turniers
 * @param usedCount    bisherige Matches je Gerät in diesem Turnier (inkl. bereits geplanter dieser Runde)
 * @param usedInRound  in dieser Runde schon vergebene Geräte
 * @param pinballWeight Gewicht der Flipper-Gruppe (0 = Flipper nur, wenn sonst nichts frei ist)
 * @param playerUse    optional: wie oft die Spieler dieses Matches das Gerät schon hatten (Gleichstand-Brecher)
 */
export function pickDypMachine(
  machines: DypMachine[],
  usedCount: Record<string, number>,
  usedInRound: Set<string>,
  pinballWeight: number,
  playerUse: (id: string) => number = () => 0,
  rnd: () => number = Math.random
): DypMachine | null {
  if (!machines.length) return null;

  const pins = machines.filter((m) => m.isPinball);
  const others = machines.filter((m) => !m.isPinball);
  // Nur Flipper oder nur Nicht-Flipper → keine Gewichtung nötig
  if (!pins.length || !others.length) return leastUsed(machines, usedCount, usedInRound, playerUse, rnd);

  type Group = { members: DypMachine[]; weight: number };
  const groups: Group[] = others.map((m) => ({ members: [m], weight: 1 }));
  groups.push({ members: pins, weight: Math.max(0, pinballWeight) });

  const plays = (g: Group) => g.members.reduce((s, m) => s + (usedCount[m.id] ?? 0), 0);
  const hasFree = (g: Group) => g.members.some((m) => !usedInRound.has(m.id));

  let pool = groups.filter((g) => g.weight > 0 && hasFree(g));
  if (!pool.length) pool = groups.filter(hasFree);
  if (!pool.length) pool = groups; // alles belegt → doppelt vergeben wie bisher

  // Rückstand = Anteil, den die Gruppe hätte, minus tatsächliche Spiele → größter Rückstand gewinnt
  const totalW = pool.reduce((s, g) => s + g.weight, 0) || 1;
  const totalPlays = pool.reduce((s, g) => s + plays(g), 0);
  const score = (g: Group) => (g.weight / totalW) * (totalPlays + 1) - plays(g);
  let best = -Infinity;
  let bestGroups: Group[] = [];
  for (const g of pool) {
    const s = score(g);
    if (s > best + 1e-9) {
      best = s;
      bestGroups = [g];
    } else if (Math.abs(s - best) <= 1e-9) bestGroups.push(g);
  }
  const g = bestGroups[Math.floor(rnd() * bestGroups.length)];
  return leastUsed(g.members, usedCount, usedInRound, playerUse, rnd);
}

function leastUsed(
  list: DypMachine[],
  usedCount: Record<string, number>,
  usedInRound: Set<string>,
  playerUse: (id: string) => number,
  rnd: () => number
): DypMachine | null {
  if (!list.length) return null;
  const fresh = list.filter((m) => !usedInRound.has(m.id));
  const pool = fresh.length ? fresh : list;
  const key = (m: DypMachine) => (usedCount[m.id] ?? 0) * 1000 + playerUse(m.id);
  const min = Math.min(...pool.map(key));
  const best = pool.filter((m) => key(m) === min);
  return best[Math.floor(rnd() * best.length)];
}
