// ⚔️ Gegner-Bilanz (Stammgegner, Ebenbürtig, Erzfeind, Lieblingsgegner, Siegesserie) – reine Rechnung (ohne DB).
//
// Gezählt werden direkte Vergleiche ("Duelle") in Matches mit Plätzen: Wer im selben Match den
// besseren Platz hat, gewinnt das Duell. In einem 4er-Match hat man also 3 Duelle,
// bei Round the Pinball zählt jeder Flipper (= eigenes Match) als Duell.
// Alle Formate zählen – außer DYP (Team-Sonderform, wird komplett weggelassen).
// Nicht gezählt: Bots und Platzhalter, Matches ohne Platz.

/** ab so vielen Duellen zählt ein Gegner für Stammgegner/Ebenbürtig/Erzfeind/Lieblingsgegner */
export const RIVAL_MIN_DUELS = 10;
/** ab so vielen Siegen am Stück erscheint eine Siegesserie */
export const RIVAL_MIN_STREAK = 3;
/** Plätze je Kategorie */
export const RIVAL_TOP_N = 3;

const hasTeam = (t: unknown) => t !== null && t !== undefined && t !== "";

export type RivalRow = {
  match_id: string;
  profile_id: string | null;
  position: number | null;
  team?: unknown;
  /** Format der Runde (rounds.format) */
  format: string | null;
  /** Zeitpunkt des Matches (für die Reihenfolge / Siegesserien) */
  at?: string | null;
  /** Turnier des Matches (für "Serie über X Turniere") */
  tournamentId?: string | null;
};

export type RivalStat = {
  profileId: string;
  duels: number;
  wins: number;
  losses: number;
  draws: number;
  /** Siegquote in % (Unentschieden zählen halb) */
  winrate: number;
  /** längste Serie gewonnener Duelle am Stück */
  bestStreak: number;
  /** wann die längste Serie war (erstes/letztes Match) und über wie viele Turniere */
  streakFrom: string | null;
  streakTo: string | null;
  streakTournaments: number;
  /** laufende Serie: so viele Duelle zuletzt am Stück gewonnen (0 = letztes Duell nicht gewonnen) */
  currentStreak: number;
};

export type RivalKind = "frequent" | "even" | "nemesis" | "favorite" | "streak";

export type RivalsResult = Record<RivalKind, RivalStat[]> & {
  /** Gegner mit mind. RIVAL_MIN_DUELS Duellen */
  qualified: number;
};

/** Duell-Bilanz gegen jeden Gegner (Matches in zeitlicher Reihenfolge) */
export function computeRivalStats(
  myProfileId: string,
  rows: readonly RivalRow[],
  excludedProfileIds: ReadonlySet<string> = new Set()
): RivalStat[] {
  const byMatch = new Map<string, RivalRow[]>();
  for (const r of rows) {
    const list = byMatch.get(r.match_id) ?? [];
    list.push(r);
    byMatch.set(r.match_id, list);
  }

  // älteste Matches zuerst (für Serien); ohne Datum nach Match-ID (stabil)
  const groups = Array.from(byMatch.entries()).sort(([ida, la], [idb, lb]) => {
    const a = String(la[0]?.at ?? "");
    const b = String(lb[0]?.at ?? "");
    return a.localeCompare(b) || ida.localeCompare(idb);
  });

  type Acc = {
    wins: number;
    losses: number;
    draws: number;
    run: number;
    runFrom: string | null;
    runTids: Set<string>;
    best: number;
    bestFrom: string | null;
    bestTo: string | null;
    bestTids: number;
  };
  const stats = new Map<string, Acc>();
  for (const [, list] of groups) {
    // 🚫 DYP (Teams) zählt nicht – am Format oder an gesetzten Teams erkennbar
    if (String(list[0]?.format ?? "") === "dyp_round_robin" || list.some((r) => hasTeam(r.team))) continue;
    const me = list.find((r) => r.profile_id === myProfileId);
    if (!me || typeof me.position !== "number") continue;

    for (const o of list) {
      const pid = o.profile_id;
      if (!pid || pid === myProfileId || excludedProfileIds.has(pid)) continue;
      if (typeof o.position !== "number") continue;
      const s: Acc = stats.get(pid) ?? {
        wins: 0,
        losses: 0,
        draws: 0,
        run: 0,
        runFrom: null,
        runTids: new Set<string>(),
        best: 0,
        bestFrom: null,
        bestTo: null,
        bestTids: 0,
      };
      if (me.position < o.position) {
        s.wins += 1;
        if (s.run === 0) {
          s.runFrom = me.at ?? null;
          s.runTids = new Set<string>();
        }
        s.run += 1;
        if (me.tournamentId) s.runTids.add(String(me.tournamentId));
        if (s.run > s.best) {
          s.best = s.run;
          s.bestFrom = s.runFrom;
          s.bestTo = me.at ?? null;
          s.bestTids = s.runTids.size;
        }
      } else {
        if (me.position > o.position) s.losses += 1;
        else s.draws += 1;
        s.run = 0; // Niederlage oder Gleichstand beendet die Serie
      }
      stats.set(pid, s);
    }
  }

  const out: RivalStat[] = [];
  stats.forEach((s, profileId) => {
    const duels = s.wins + s.losses + s.draws;
    out.push({
      profileId,
      duels,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      winrate: duels ? ((s.wins + s.draws / 2) / duels) * 100 : 0,
      bestStreak: s.best,
      streakFrom: s.bestFrom,
      streakTo: s.bestTo,
      streakTournaments: s.bestTids,
      currentStreak: s.run,
    });
  });
  return out;
}

/**
 * Top N je Kategorie:
 * - frequent (🤝 Stammgegner): meiste Duelle
 * - even (⚖️ Ebenbürtig): Bilanz am nächsten an 50 %
 * - nemesis (😈 Erzfeind): schlechteste Bilanz (< 50 %)
 * - favorite (😎 Lieblingsgegner): beste Bilanz (> 50 %)
 *   … jeweils ab minDuels Duellen
 * - streak (🔥 Siegesserie): längste Serie gewonnener Duelle am Stück (ab minStreak)
 */
export function pickRivals(
  stats: readonly RivalStat[],
  minDuels: number = RIVAL_MIN_DUELS,
  topN: number = RIVAL_TOP_N,
  minStreak: number = RIVAL_MIN_STREAK
): RivalsResult {
  const q = stats.filter((s) => s.duels >= minDuels);
  const top = (list: RivalStat[]) => list.slice(0, topN);
  return {
    frequent: top([...q].sort((a, b) => b.duels - a.duels || b.wins - a.wins)),
    even: top([...q].sort((a, b) => Math.abs(a.winrate - 50) - Math.abs(b.winrate - 50) || b.duels - a.duels)),
    nemesis: top(
      q.filter((s) => s.winrate < 50).sort((a, b) => a.winrate - b.winrate || b.losses - a.losses || b.duels - a.duels)
    ),
    favorite: top(
      q.filter((s) => s.winrate > 50).sort((a, b) => b.winrate - a.winrate || b.wins - a.wins || b.duels - a.duels)
    ),
    streak: top(
      stats.filter((s) => s.bestStreak >= minStreak).sort((a, b) => b.bestStreak - a.bestStreak || b.duels - a.duels)
    ),
    qualified: q.length,
  };
}

// 🔍 Duell-Protokoll gegen EINEN Gegner (zum Nachprüfen): alle gemeinsamen Matches in zeitlicher
// Reihenfolge – auch die, die NICHT gezählt wurden, mit Grund.
export type DuelLogEntry = {
  matchId: string;
  at: string | null;
  tournamentId: string | null;
  format: string | null;
  myPos: number | null;
  oppPos: number | null;
  /** W = gewonnen, L = verloren, D = gleich, null = nicht gezählt */
  result: "W" | "L" | "D" | null;
  /** Grund, warum nicht gezählt */
  skipped: string | null;
  /** laufende Siegesserie NACH diesem Duell */
  run: number;
};

export function duelLog(myProfileId: string, opponentId: string, rows: readonly RivalRow[]): DuelLogEntry[] {
  const byMatch = new Map<string, RivalRow[]>();
  for (const r of rows) {
    const list = byMatch.get(r.match_id) ?? [];
    list.push(r);
    byMatch.set(r.match_id, list);
  }
  const groups = Array.from(byMatch.entries()).sort(([ida, la], [idb, lb]) => {
    const a = String(la[0]?.at ?? "");
    const b = String(lb[0]?.at ?? "");
    return a.localeCompare(b) || ida.localeCompare(idb);
  });

  const out: DuelLogEntry[] = [];
  let run = 0;
  for (const [matchId, list] of groups) {
    const me = list.find((r) => r.profile_id === myProfileId);
    const o = list.find((r) => r.profile_id === opponentId);
    if (!me || !o) continue;
    const base = {
      matchId,
      at: me.at ?? null,
      tournamentId: me.tournamentId ?? null,
      format: me.format ?? null,
      myPos: typeof me.position === "number" ? me.position : null,
      oppPos: typeof o.position === "number" ? o.position : null,
    };
    let skipped: string | null = null;
    if (String(me.format ?? "") === "dyp_round_robin" || list.some((r) => hasTeam(r.team))) skipped = "DYP / Team";
    else if (base.myPos == null) skipped = "du ohne Platz";
    else if (base.oppPos == null) skipped = "Gegner ohne Platz";
    if (skipped) {
      out.push({ ...base, result: null, skipped, run });
      continue;
    }
    const result: "W" | "L" | "D" =
      (base.myPos as number) < (base.oppPos as number) ? "W" : (base.myPos as number) > (base.oppPos as number) ? "L" : "D";
    run = result === "W" ? run + 1 : 0;
    out.push({ ...base, result, skipped: null, run });
  }
  return out;
}

/** Duell-Stand eines Paars an einem Flipper (x/y = players.id wie bei PairState) */
export type PairMachineStat = { xWins: number; yWins: number; duels: number };

/**
 * ⚔️ Duell-Bilanz je Paar UND Flipper (nur Zeilen mit machineKey – der Aufrufer setzt ihn nur für
 * Matches an der Location des Turniers). Gleiche Regeln wie computeRivalStats: besserer Platz gewinnt,
 * DYP/Teams zählen nicht, ausgeschlossene Profile (Bots/Platzhalter) zählen nicht.
 * Ergebnis: pairKey("x|y", x < y) → machineKey → Stand; zusätzlich "machineKey@format" = nur dieses Format
 */
export function pairMachineStats(
  rows: readonly (RivalRow & { machineKey?: string | null })[],
  players: readonly { playerId: string; profileId: string }[],
  excludedProfileIds: ReadonlySet<string> = new Set()
): Record<string, Record<string, PairMachineStat>> {
  const playerOfProfile = new Map(players.map((p) => [p.profileId, p.playerId]));
  const byMatch = new Map<string, (RivalRow & { machineKey?: string | null })[]>();
  for (const r of rows) {
    if (!r.machineKey) continue;
    const list = byMatch.get(r.match_id) ?? [];
    list.push(r);
    byMatch.set(r.match_id, list);
  }
  const out: Record<string, Record<string, PairMachineStat>> = {};
  byMatch.forEach((list) => {
    if (String(list[0]?.format ?? "") === "dyp_round_robin" || list.some((r) => hasTeam(r.team))) return;
    const mk = String(list[0].machineKey);
    const mkF = `${mk}@${String(list[0].format ?? "").toLowerCase()}`;
    const ins = list.filter(
      (r) => r.profile_id && typeof r.position === "number" && playerOfProfile.has(r.profile_id) && !excludedProfileIds.has(r.profile_id)
    );
    for (let i = 0; i < ins.length; i++) {
      for (let j = i + 1; j < ins.length; j++) {
        const a = playerOfProfile.get(ins[i].profile_id as string)!;
        const b = playerOfProfile.get(ins[j].profile_id as string)!;
        if (a === b) continue;
        const [x, y, px, py] = a < b ? [a, b, ins[i].position!, ins[j].position!] : [b, a, ins[j].position!, ins[i].position!];
        const key = `${x}|${y}`;
        const byM = out[key] ?? (out[key] = {});
        for (const k of [mk, mkF]) {
          const s = byM[k] ?? (byM[k] = { xWins: 0, yWins: 0, duels: 0 });
          s.duels += 1;
          if (px < py) s.xWins += 1;
          else if (py < px) s.yWins += 1;
        }
      }
    }
  });
  return out;
}
