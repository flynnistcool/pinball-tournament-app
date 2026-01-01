type UUID = string;

export type Player = { id: UUID; name: string; points?: number };
export type Machine = { id: UUID; name: string; active: boolean };
export type Match = { players: UUID[]; machineId?: UUID | null };

export function roundRobinPairs(playerIds: UUID[]): UUID[][] {
  // Circle method for even/odd.
  const ids = [...playerIds];
  if (ids.length < 2) return [];
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push("BYE");
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const schedule: UUID[][] = [];

  let arr = [...ids];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") schedule.push([a as UUID, b as UUID]);
    }
    // rotate: keep first fixed
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr = [fixed, ...rest];
  }
  return schedule;
}

export function chunkIntoGroups<T>(items: T[], groupSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += groupSize) out.push(items.slice(i, i + groupSize));
  return out;
}

export type PlayedCounts = Record<string, Record<string, number>>; // played[playerId][machineId] = count

export function pickMachineForPlayers(
  playerIds: UUID[],
  machines: Machine[],
  played: PlayedCounts,
  reservedMachineIds: Set<UUID>
): UUID | null {
  const candidates = machines.filter(m => m.active && !reservedMachineIds.has(m.id));
  if (candidates.length === 0) return null;

  const scored = candidates.map(m => {
    const counts = playerIds.map(pid => (played[pid]?.[m.id] ?? 0));
    const newOk = counts.every(c => c === 0);
    const sumRep = counts.reduce((a,b) => a + b, 0);
    const maxRep = Math.max(...counts);
    return { id: m.id, newOk, sumRep, maxRep };
  });

  scored.sort((a,b) => {
    if (a.newOk !== b.newOk) return a.newOk ? -1 : 1;
    if (a.sumRep !== b.sumRep) return a.sumRep - b.sumRep;
    if (a.maxRep !== b.maxRep) return a.maxRep - b.maxRep;
    // tie-breaker random-ish but deterministic enough:
    return a.id.localeCompare(b.id);
  });

  return scored[0]?.id ?? null;
}

export function assignMachinesToMatches(
  matches: Match[],
  machines: Machine[],
  played: PlayedCounts
): { matches: Match[]; warnings: string[] } {
  const reserved = new Set<UUID>();
  const warnings: string[] = [];
  const out = matches.map(m => ({ ...m }));

  for (let i = 0; i < out.length; i++) {
    const pick = pickMachineForPlayers(out[i].players, machines, played, reserved);
    if (!pick) {
      warnings.push("Nicht genug aktive Maschinen verfügbar – mindestens ein Match hat keine Maschine bekommen.");
      out[i].machineId = null;
      continue;
    }
    out[i].machineId = pick;
    reserved.add(pick);
  }
  // If some matches got null machine (not enough machines), we allow reuse as a fallback
  // (still tries to minimize repeats).
  for (let i = 0; i < out.length; i++) {
    if (out[i].machineId) continue;
    const pick = pickMachineForPlayers(out[i].players, machines, played, new Set<UUID>()); // allow reuse
    out[i].machineId = pick;
    if (pick) warnings.push("Maschine musste in derselben Runde mehrfach genutzt werden (zu wenige Geräte).");
  }
  return { matches: out, warnings };
}
