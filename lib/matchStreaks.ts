// 📊 Form & Gesamt-Serien eines Spielers (reine Rechnung, ohne DB) – für die Überblick-Karte.
//
// Ein Match gilt als SIEG, wenn kein (menschlicher) Gegner einen besseren Platz hat
// (geteilter 1. Platz = Sieg), sonst als NIEDERLAGE. Teamkollegen (DYP: gleiches Team) sind keine Gegner.
// Nicht gezählt: Matches ohne eigenen Platz und Matches ganz ohne menschlichen Gegner (nur Bots/Platzhalter).

import type { RivalRow } from "@/lib/rivals";

export type StreakInfo = {
  /** Anzahl Matches am Stück */
  length: number;
  /** erstes / letztes Match der Serie */
  from: string | null;
  to: string | null;
  /** über wie viele Turniere */
  tournaments: number;
};

export type OverallForm = {
  /** gezählte Matches */
  matches: number;
  /** letzte Matches, älteste zuerst: true = Sieg */
  form: boolean[];
  longestWin: StreakInfo | null;
  longestLoss: StreakInfo | null;
  /** laufende Serie (positiv = Siege, negativ = Niederlagen, 0 = keine Matches) */
  current: number;
};

const hasTeam = (t: unknown) => t !== null && t !== undefined && t !== "";

export function computeOverallForm(
  myProfileId: string,
  rows: readonly RivalRow[],
  excludedProfileIds: ReadonlySet<string> = new Set(),
  formLength = 10
): OverallForm {
  const byMatch = new Map<string, RivalRow[]>();
  for (const r of rows) {
    const list = byMatch.get(r.match_id) ?? [];
    list.push(r);
    byMatch.set(r.match_id, list);
  }
  // älteste Matches zuerst; ohne Datum nach Match-ID (stabil)
  const groups = Array.from(byMatch.entries()).sort(([ida, la], [idb, lb]) => {
    const a = String(la[0]?.at ?? "");
    const b = String(lb[0]?.at ?? "");
    return a.localeCompare(b) || ida.localeCompare(idb);
  });

  const results: { win: boolean; at: string | null; tid: string | null }[] = [];
  for (const [, list] of groups) {
    const me = list.find((r) => r.profile_id === myProfileId);
    if (!me || typeof me.position !== "number") continue;
    const myTeam = hasTeam(me.team) ? String(me.team) : null;
    const opponents = list.filter(
      (o) =>
        o !== me &&
        !!o.profile_id &&
        o.profile_id !== myProfileId &&
        !excludedProfileIds.has(o.profile_id) &&
        typeof o.position === "number" &&
        !(myTeam !== null && hasTeam(o.team) && String(o.team) === myTeam)
    );
    if (!opponents.length) continue;
    const win = !opponents.some((o) => (o.position as number) < (me.position as number));
    results.push({ win, at: me.at ?? null, tid: me.tournamentId ? String(me.tournamentId) : null });
  }

  const longest = (wantWin: boolean): StreakInfo | null => {
    let best: StreakInfo | null = null;
    let i = 0;
    while (i < results.length) {
      if (results[i].win !== wantWin) {
        i++;
        continue;
      }
      let j = i;
      const tids = new Set<string>();
      while (j < results.length && results[j].win === wantWin) {
        if (results[j].tid) tids.add(results[j].tid as string);
        j++;
      }
      const len = j - i;
      if (!best || len > best.length) {
        best = { length: len, from: results[i].at, to: results[j - 1].at, tournaments: tids.size };
      }
      i = j;
    }
    return best;
  };

  let current = 0;
  if (results.length) {
    const lastWin = results[results.length - 1].win;
    for (let k = results.length - 1; k >= 0 && results[k].win === lastWin; k--) current++;
    if (!lastWin) current = -current;
  }

  return {
    matches: results.length,
    form: results.slice(-formLength).map((r) => r.win),
    longestWin: longest(true),
    longestLoss: longest(false),
    current,
  };
}
