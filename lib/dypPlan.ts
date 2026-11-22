// 🤝 DYP (2 gegen 2): Wer spielt diese Runde wo? – reine Logik (app/api/rounds/create nutzt sie).
//
// Ziel: so viele echte 2-gegen-2-Matches (4 Menschen) wie möglich. Die übrigen 1–3 Spieler:
//   Rest 1 → setzt aus (allein geht kein Match)
//   Rest 2 → Rest-Match 1 gegen 1:  (A + Ghost) gegen (B + Ghost)   – braucht 2 Ghosts
//   Rest 3 → Rest-Match 2 gegen 1:  (A + B) gegen (C + Ghost)        – braucht 1 Ghost
// Ghosts = Platzhalter-Profile (profiles.exclude_from_stats) – sie spielen NUR im Rest-Match mit.
// Fehlen Ghosts, setzen die Rest-Spieler aus (Hinweis, wie viele Ghosts fehlen).
// Punkte bleiben wie bei jedem DYP-Match (Sieg 4 / Niederlage 2, kein Bonus fürs Alleinspielen).
//
// Gerecht: ins Rest-Match (bzw. Aussetzen) kommt, wer das bisher am SELTENSTEN hatte;
// allein (2 gegen 1) spielt, wer bisher am seltensten allein spielen musste. Gleichstand → Zufall.

export type DypHistoryMatch = { round: number; players: { id: string; team: number | null }[] };

export type DypCounts = {
  /** wie oft im Rest-Match oder ausgesetzt */
  rest: Record<string, number>;
  /** wie oft allein (Ghost als Partner) */
  solo: Record<string, number>;
};

/** Zähler aus den bisherigen Runden (nur echte Spieler) */
export function dypCounts(history: DypHistoryMatch[], humanIds: readonly string[], ghostIds: ReadonlySet<string>): DypCounts {
  const rest: Record<string, number> = {};
  const solo: Record<string, number> = {};
  for (const h of humanIds) {
    rest[h] = 0;
    solo[h] = 0;
  }
  const rounds = new Map<number, DypHistoryMatch[]>();
  for (const m of history) {
    const list = rounds.get(m.round) ?? [];
    list.push(m);
    rounds.set(m.round, list);
  }
  for (const list of Array.from(rounds.values())) {
    const inRound = new Set<string>();
    for (const m of list) {
      const hasGhost = m.players.some((p) => ghostIds.has(p.id));
      for (const p of m.players) {
        inRound.add(p.id);
        if (ghostIds.has(p.id) || !(p.id in rest)) continue;
        if (hasGhost) {
          rest[p.id]++;
          const partnerGhost = m.players.some((q) => q.id !== p.id && q.team != null && q.team === p.team && ghostIds.has(q.id));
          if (partnerGhost) solo[p.id]++;
        }
      }
    }
    // in dieser Runde gar nicht gespielt = ausgesetzt (zählt wie Rest)
    for (const h of humanIds) if (!inRound.has(h)) rest[h]++;
  }
  return { rest, solo };
}

export type DypPlan = {
  /** echte Spieler für die vollen 2-gegen-2-Matches (Anzahl durch 4 teilbar) */
  full: string[];
  /** Rest-Match: Team 1 und Team 2 (je 2 IDs, inkl. Ghosts) */
  rest: { team1: [string, string]; team2: [string, string]; kind: "1v1" | "2v1" } | null;
  /** echte Spieler, die aussetzen */
  sitOut: string[];
  /** fehlende Ghosts (0 = alles gut) */
  missingGhosts: number;
};

function byFewest(ids: string[], count: Record<string, number>, rnd: () => number): string[] {
  return ids
    .map((id) => ({ id, c: count[id] ?? 0, r: rnd() }))
    .sort((a, b) => a.c - b.c || a.r - b.r)
    .map((x) => x.id);
}

export function planDypRound(
  humanIds: readonly string[],
  ghostIds: readonly string[],
  counts: DypCounts,
  rnd: () => number = Math.random
): DypPlan {
  const humans = humanIds.slice();
  const r = humans.length % 4;
  if (r === 0) return { full: humans, rest: null, sitOut: [], missingGhosts: 0 };

  const chosen = byFewest(humans, counts.rest, rnd).slice(0, r);
  const full = humans.filter((h) => !chosen.includes(h));
  const need = r === 2 ? 2 : r === 3 ? 1 : 0;

  if (r === 1 || ghostIds.length < need) {
    return { full, rest: null, sitOut: chosen, missingGhosts: Math.max(0, need - ghostIds.length) };
  }
  if (r === 2) {
    const [a, b] = chosen;
    return { full, rest: { team1: [a, ghostIds[0]], team2: [b, ghostIds[1]], kind: "1v1" }, sitOut: [], missingGhosts: 0 };
  }
  // r === 3: wer am seltensten allein spielen musste, spielt allein
  const soloId = byFewest(chosen, counts.solo, rnd)[0];
  const pair = chosen.filter((x) => x !== soloId) as [string, string];
  return { full, rest: { team1: [pair[0], pair[1]], team2: [soloId, ghostIds[0]], kind: "2v1" }, sitOut: [], missingGhosts: 0 };
}

/** Meldung für alle: wie wurde die Runde verteilt? */
export function dypPlanText(
  plan: DypPlan,
  roundNo: number,
  fullMatches: number,
  nameOf: (id: string) => string,
  counts: DypCounts,
  ghostIds: ReadonlySet<string>
): string {
  const parts: string[] = [`Runde ${roundNo}: ${fullMatches}× 2 gegen 2`];
  if (plan.rest) {
    const humansOf = (t: [string, string]) => t.filter((x) => !ghostIds.has(x)).map(nameOf).join(" & ");
    parts.push(
      plan.rest.kind === "1v1"
        ? `Rest-Match 1 gegen 1: ${humansOf(plan.rest.team1)} – ${humansOf(plan.rest.team2)} (je mit Ghost)`
        : `Rest-Match 2 gegen 1: ${humansOf(plan.rest.team1)} – ${humansOf(plan.rest.team2)} (spielt allein, mit Ghost)`
    );
  }
  if (plan.sitOut.length) parts.push(`setzt aus: ${plan.sitOut.map(nameOf).join(", ")}`);
  if (plan.missingGhosts > 0) {
    parts.push(`💡 Mit ${plan.missingGhosts} Ghost${plan.missingGhosts > 1 ? "s" : ""} (Platzhalter) müsste niemand aussetzen`);
  }
  const already = Object.entries(counts.rest)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${nameOf(id)} ${n}×`);
  if (already.length) parts.push(`bisher Rest-Match/ausgesetzt: ${already.join(", ")}`);
  return parts.join(" · ");
}
