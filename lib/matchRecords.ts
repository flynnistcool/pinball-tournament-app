// Highscore-Zeile im Match-Kopf (Admin): bester Score + bester Score der letzten 30 Tage
// für einen Flipper. Reine Logik, keine Datenbank.
//
// Grundlage: die bisherigen Rekorde aus /api/public/machine-records (beendete Turniere an
// der Location, ohne Timeplay/DYP) + die Scores des laufenden Turniers (zählen bei beiden mit,
// weil das laufende Turnier immer in den letzten 30 Tagen liegt).

import { machineKey, personalKey, type LiveEntry, type PriorRecords } from "@/lib/recordWatch";

/** at = Datum (ISO), an dem der Score aufgestellt wurde; null = unbekannt */
export type ShownRecord = { score: number; holder: string | null; at?: string | null };

export function recordsForMachine(
  machineName: string | null | undefined,
  prior: Pick<PriorRecords, "records" | "monthly" | "excludedProfiles">,
  live: readonly LiveEntry[]
): { best: ShownRecord | null; month: ShownRecord | null } {
  const key = machineKey(machineName);
  if (!key) return { best: null, month: null };
  // 🤖/🚫 Bots + Platzhalter halten nie Allzeit-/30-Tage-Rekorde
  const excluded = new Set(prior.excludedProfiles ?? []);

  let liveBest: ShownRecord | null = null;
  for (const e of live) {
    if (e.machineKey !== key) continue;
    if (e.profileId && excluded.has(e.profileId)) continue;
    // im laufenden Turnier aufgestellt → heute
    if (!liveBest || e.score > liveBest.score) liveBest = { score: e.score, holder: e.playerName, at: new Date().toISOString() };
  }

  const pick = (p: { score: number; holder: string | null; at?: string | null } | undefined): ShownRecord | null => {
    const fromPrior = p ? { score: p.score, holder: p.holder, at: p.at ?? null } : null;
    if (!fromPrior) return liveBest;
    if (!liveBest) return fromPrior;
    return liveBest.score > fromPrior.score ? liveBest : fromPrior;
  };

  return { best: pick(prior.records[key]), month: pick(prior.monthly?.[key]) };
}

/**
 * 🎰 Flipper-Premiere: Spieler hat diesen Flipper an dieser Location noch NIE gespielt – in keinem anderen
 * Turnier dort (egal welches Format) und in keinem ANDEREN Match dieses Turniers.
 */
export function isPremiere(
  profileId: string | null | undefined,
  machineName: string | null | undefined,
  personal: Record<string, number>,
  live: readonly LiveEntry[],
  matchId: string | null | undefined,
  /** an dieser Location schon gespielt (alle anderen Turniere dort, jedes Format) */
  played?: ReadonlySet<string> | readonly string[]
): boolean {
  const key = machineKey(machineName);
  if (!profileId || !key) return false;
  const pk = personalKey(String(profileId), key);
  if (pk in personal) return false;
  if (played && (Array.isArray(played) ? played.includes(pk) : (played as ReadonlySet<string>).has(pk))) return false;
  const own = matchId ? `${matchId}|` : null;
  return !live.some((e) => e.machineKey === key && e.profileId === String(profileId) && !(own && e.key.startsWith(own)));
}

/**
 * Persönlicher Highscore eines Spielers (Profil) auf einem Flipper:
 * - before: bester Score aus früheren, beendeten Turnieren an der Location (null = nie gespielt)
 * - today: bester eigener Score im laufenden Turnier auf diesem Flipper (null = noch keiner)
 */
export function personalForMachine(
  profileId: string | null | undefined,
  machineName: string | null | undefined,
  personal: Record<string, number>,
  live: readonly LiveEntry[]
): { before: number | null; today: number | null } {
  const key = machineKey(machineName);
  if (!profileId || !key) return { before: null, today: null };
  const pk = personalKey(String(profileId), key);
  const before = pk in personal ? personal[pk] : null;
  let today: number | null = null;
  for (const e of live) {
    if (e.machineKey !== key || e.profileId !== String(profileId)) continue;
    if (today == null || e.score > today) today = e.score;
  }
  return { before, today };
}
