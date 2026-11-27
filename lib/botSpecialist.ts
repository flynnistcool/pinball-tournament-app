// 🟠 Specialist-Bot: hat in jedem Turnier 1–2 Lieblingsflipper (Nutzer 2026-11-28).
// - Gewählt aus den AKTIVEN Flippern des Turniers, fest fürs ganze Turnier ("ausgewürfelt" aus Bot + Turnier,
//   gleich auf allen Geräten). Mehr als 4 aktive Flipper → specialistFavs (Standard 2), sonst 1.
// - An einem Lieblingsflipper würfelt er mit Elo + specialistBonus (Standard +250), sonst normal.
// - Der Admin kann den Flipper eines Matches umstellen, damit der Bot an seinem Liebling spielt.
// Reine Funktion (Server + Admin rechnen dasselbe).

import { machineKey } from "@/lib/machineStats";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Lieblingsflipper (Namen, wie im Turnier geschrieben) */
export function specialistFavorites(
  botProfileId: string,
  tournamentId: string,
  machines: readonly { name: string | null; active?: boolean | null }[],
  favCount: number
): string[] {
  const byKey = new Map<string, string>();
  for (const m of machines) {
    if (m.active === false) continue;
    const k = machineKey(m.name);
    if (k && !byKey.has(k)) byKey.set(k, String(m.name ?? "").trim());
  }
  const keys = Array.from(byKey.keys());
  if (!keys.length) return [];
  const n = Math.max(1, Math.min(keys.length > 4 ? Math.round(favCount) : 1, keys.length));
  return keys
    .sort((a, b) => hash(`${botProfileId}|${tournamentId}|${a}`) - hash(`${botProfileId}|${tournamentId}|${b}`))
    .slice(0, n)
    .map((k) => byKey.get(k) as string);
}

export function isSpecialistFavorite(favorites: readonly string[], machineName: string | null | undefined): boolean {
  const k = machineKey(machineName);
  return !!k && favorites.some((f) => machineKey(f) === k);
}

/**
 * 🎭 Charakter-Bot: je Turnier Lieblingsflipper (stärker) UND Angstflipper (schwächer), aus den aktiven
 * Flippern, fest fürs ganze Turnier, nie derselbe Flipper in beiden Listen (Nutzer 2026-11-28).
 * Mehr als 6 aktive Flipper → favCount / flopCount (Standard 2 / 2) · 4–6 → 1 / 1 · bis 3 → 1 / 0.
 */
export function characterMachines(
  botProfileId: string,
  tournamentId: string,
  machines: readonly { name: string | null; active?: boolean | null }[],
  favCount: number,
  flopCount: number
): { favorites: string[]; flops: string[] } {
  const byKey = new Map<string, string>();
  for (const m of machines) {
    if (m.active === false) continue;
    const k = machineKey(m.name);
    if (k && !byKey.has(k)) byKey.set(k, String(m.name ?? "").trim());
  }
  const keys = Array.from(byKey.keys()).sort(
    (a, b) => hash(`${botProfileId}|${tournamentId}|${a}`) - hash(`${botProfileId}|${tournamentId}|${b}`)
  );
  const n = keys.length;
  if (!n) return { favorites: [], flops: [] };
  let fav = n > 6 ? Math.round(favCount) : 1;
  let flop = n > 6 ? Math.round(flopCount) : n >= 4 ? 1 : 0;
  fav = Math.max(0, Math.min(fav, n));
  flop = Math.max(0, Math.min(flop, n - fav));
  return {
    favorites: keys.slice(0, fav).map((k) => byKey.get(k) as string),
    // Angstflipper vom anderen Ende der Rangfolge → nie dieselben wie die Lieblinge
    flops: flop ? keys.slice(n - flop).map((k) => byKey.get(k) as string) : [],
  };
}
