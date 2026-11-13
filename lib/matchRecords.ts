// Highscore-Zeile im Match-Kopf (Admin): bester Score + bester Score der letzten 30 Tage
// für einen Flipper. Reine Logik, keine Datenbank.
//
// Grundlage: die bisherigen Rekorde aus /api/public/machine-records (beendete Turniere an
// der Location, ohne Timeplay/DYP) + die Scores des laufenden Turniers (zählen bei beiden mit,
// weil das laufende Turnier immer in den letzten 30 Tagen liegt).

import { machineKey, personalKey, type LiveEntry, type PriorRecords } from "@/lib/recordWatch";

export type ShownRecord = { score: number; holder: string | null };

export function recordsForMachine(
  machineName: string | null | undefined,
  prior: Pick<PriorRecords, "records" | "monthly">,
  live: readonly LiveEntry[]
): { best: ShownRecord | null; month: ShownRecord | null } {
  const key = machineKey(machineName);
  if (!key) return { best: null, month: null };

  let liveBest: ShownRecord | null = null;
  for (const e of live) {
    if (e.machineKey !== key) continue;
    if (!liveBest || e.score > liveBest.score) liveBest = { score: e.score, holder: e.playerName };
  }

  const pick = (p: { score: number; holder: string | null } | undefined): ShownRecord | null => {
    const fromPrior = p ? { score: p.score, holder: p.holder } : null;
    if (!fromPrior) return liveBest;
    if (!liveBest) return fromPrior;
    return liveBest.score > fromPrior.score ? liveBest : fromPrior;
  };

  return { best: pick(prior.records[key]), month: pick(prior.monthly?.[key]) };
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
