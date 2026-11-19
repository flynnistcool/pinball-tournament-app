// ⚡ Besondere Match-Momente – reine Logik, keine Datenbank.
//
// - 🧊 Favoritensturz: der ★ Favorit (Siegchance vor dem Match, lib/favorite.ts) verliert gegen einen Spieler mit
//   höchstens 30 % Siegchance (lib/chanceSnapshots.ts UPSET_MAX_CHANCE); Round the Pinball: rotationUpsets
//   (UPSET_MIN_ELO = alte Elo-Regel, nicht mehr verwendet)
//   (Elo zu Turnierbeginn = linke Zahl im Leaderboard "1412 → 1541" – ändert sich während des Turniers nicht)
// - 📸 Fotofinish: Sieger-Score höchstens PHOTO_MAX_GAP (2 %) über dem Zweitbesten
// - 💣 Kantersieg: Sieger-Score mindestens BLOWOUT_FACTOR (3×) so hoch wie der Zweitbeste
// - 🔄 Revanche: der Sieger hatte das letzte direkte Duell IM SELBEN TURNIER gegen diesen Gegner verloren
//   (nur Matchplay & Co.; über alle Turniere wäre es bei 1 gegen 1 fast jedes zweite Match)
//
// "Fertig" heißt: Matchplay & Co. – alle Spieler des Matches haben einen Platz;
// Round the Pinball – alle Spieler am Flipper haben einen Score (der Flipper ist durch).
// Nicht bei DYP (Teams) und Timeplay (Zeiten statt Scores; nur der Favoritensturz zählt dort).

export const UPSET_MIN_ELO = 150;
export const PHOTO_MAX_GAP = 0.02;
export const BLOWOUT_FACTOR = 3;

export type MomentMode = "none" | "positions" | "scores";

export function momentMode(format: string | null | undefined): MomentMode {
  const f = String(format ?? "").toLowerCase();
  if (f === "dyp_round_robin" || f === "dyp") return "none";
  if (f === "rotation") return "scores";
  return "positions";
}

import { UPSET_MAX_CHANCE, type ChanceSnapshot } from "@/lib/chanceSnapshots";

type MData = {
  tournament?: { format?: string | null } | null;
  rounds?: { id: string; number?: number | null }[];
  machines?: { id: string; name?: string | null }[];
  matches?: { id: string; machine_id?: string | null; round_id?: string | null }[];
  match_players?: {
    match_id: string;
    player_id: string;
    position?: number | null;
    score?: number | string | null;
  }[];
};

const entered = (v: unknown) => v != null && v !== "" && Number.isFinite(Number(v));
const num = (v: unknown) => (entered(v) ? Number(v) : null);

function byMatch(data: MData) {
  const map = new Map<string, NonNullable<MData["match_players"]>>();
  for (const mp of data.match_players ?? []) {
    const k = String(mp.match_id);
    const list = map.get(k);
    if (list) list.push(mp);
    else map.set(k, [mp]);
  }
  return map;
}

/** Matches, die gerade "fertig" sind (siehe oben) */
export function completedMatchIds(data: MData, mode: MomentMode): string[] {
  if (mode === "none") return [];
  const mps = byMatch(data);
  const out: string[] = [];
  for (const m of data.matches ?? []) {
    const list = mps.get(String(m.id)) ?? [];
    if (list.length < 2) continue;
    const done =
      mode === "positions" ? list.every((x) => Number(x.position) > 0) : list.every((x) => entered(x.score));
    if (done) out.push(String(m.id));
  }
  return out;
}

export type MatchMoment =
  | { kind: "upset"; matchId: string; winnerId: string; loserId: string; winnerChance: number; loserChance: number; machine: string | null }
  | { kind: "photo"; matchId: string; winnerId: string; loserId: string; winnerScore: number; loserScore: number; gapPct: number; machine: string | null }
  | { kind: "blowout"; matchId: string; winnerId: string; loserId: string; winnerScore: number; loserScore: number; factor: number; machine: string | null }
  | { kind: "revenge"; matchId: string; winnerId: string; loserId: string; prevRound: number | null; machine: string | null };

/** Besondere Momente eines fertigen Matches.
 *  🧊 Favoritensturz nur mit eingefrorenen Siegchancen VOR dem Match (lib/chanceSnapshots.ts) –
 *  ohne Snapshot (z. B. Server-Ticker) gibt es keinen Favoritensturz. eloStart wird nicht mehr genutzt. */
export function momentsForMatch(
  data: MData,
  matchId: string,
  mode: MomentMode,
  _eloStart: Record<string, number | null | undefined>,
  opts: { snapshot?: ChanceSnapshot | null } = {}
): MatchMoment[] {
  if (mode === "none") return [];
  const list = byMatch(data).get(matchId) ?? [];
  if (list.length < 2) return [];
  const m = (data.matches ?? []).find((x) => String(x.id) === matchId);
  const machine = (data.machines ?? []).find((x) => String(x.id) === String(m?.machine_id ?? ""))?.name ?? null;
  const out: MatchMoment[] = [];
  const timeplay = String(data.tournament?.format ?? "").toLowerCase() === "timeplay";

  // Reihenfolge: Platz (Matchplay & Co.) bzw. Score (Round the Pinball)
  const ranked =
    mode === "positions"
      ? list.slice().sort((a, b) => Number(a.position) - Number(b.position))
      : list
          .filter((x) => num(x.score) != null)
          .slice()
          .sort((a, b) => (num(b.score) ?? 0) - (num(a.score) ?? 0));
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second) return out;
  // Gleichstand an der Spitze → kein klarer Sieger
  if (mode === "positions" ? Number(second.position) === Number(first.position) : num(second.score) === num(first.score)) {
    return out;
  }
  const winnerId = String(first.player_id);

  // 🧊 Favoritensturz (Matchplay & Co.): der ★ Favorit (vor dem Match) verliert gegen einen Sieger mit
  // höchstens UPSET_MAX_CHANCE Siegchance. Round the Pinball: eigene Regel (rotationUpsets).
  const snap = opts.snapshot;
  if (mode === "positions" && snap?.favoriteKey) {
    const fav = String(snap.favoriteKey);
    const wc = snap.chances[winnerId];
    if (fav !== winnerId && list.some((x) => String(x.player_id) === fav) && wc != null && wc <= UPSET_MAX_CHANCE) {
      out.push({ kind: "upset", matchId, winnerId, loserId: fav, winnerChance: wc, loserChance: snap.chances[fav] ?? 0, machine });
    }
  }

  // 🔄 Revanche: letztes direktes Duell im Turnier (vor diesem Match) gegen einen der Geschlagenen verloren
  if (mode === "positions") {
    const roundNo = new Map((data.rounds ?? []).map((r) => [String(r.id), Number(r.number ?? 0)]));
    const order = new Map((data.matches ?? []).map((x, i) => [String(x.id), i]));
    const thisNo = roundNo.get(String(m?.round_id ?? "")) ?? 0;
    const thisIdx = order.get(matchId) ?? 0;
    const all = byMatch(data);
    for (const l of ranked.slice(1)) {
      const loserId = String(l.player_id);
      let prev: { no: number; idx: number; winnerAhead: boolean } | null = null;
      for (const pm of data.matches ?? []) {
        const pid = String(pm.id);
        if (pid === matchId) continue;
        const no = roundNo.get(String(pm.round_id ?? "")) ?? 0;
        const idx = order.get(pid) ?? 0;
        if (no > thisNo || (no === thisNo && idx >= thisIdx)) continue; // nur frühere Matches
        const pl = all.get(pid) ?? [];
        if (!pl.every((x) => Number(x.position) > 0)) continue;
        const w = pl.find((x) => String(x.player_id) === winnerId);
        const o = pl.find((x) => String(x.player_id) === loserId);
        if (!w || !o || Number(w.position) === Number(o.position)) continue;
        if (!prev || no > prev.no || (no === prev.no && idx > prev.idx))
          prev = { no, idx, winnerAhead: Number(w.position) < Number(o.position) };
      }
      if (prev && !prev.winnerAhead) {
        out.push({ kind: "revenge", matchId, winnerId, loserId, prevRound: prev.no || null, machine });
        break; // eine Revanche je Match reicht
      }
    }
  }

  // 📸 / 💣 nach Scores (nicht bei Timeplay – dort sind die Scores nur 100/99/…)
  if (!timeplay) {
    const s1 = num(first.score);
    const s2 = num(second.score);
    if (s1 != null && s2 != null && s1 > 0 && s2 > 0 && s1 > s2) {
      const gap = (s1 - s2) / s1;
      if (gap <= PHOTO_MAX_GAP) {
        out.push({
          kind: "photo",
          matchId,
          winnerId,
          loserId: String(second.player_id),
          winnerScore: s1,
          loserScore: s2,
          gapPct: Math.round(gap * 1000) / 10,
          machine,
        });
      } else if (s1 >= BLOWOUT_FACTOR * s2) {
        out.push({
          kind: "blowout",
          matchId,
          winnerId,
          loserId: String(second.player_id),
          winnerScore: s1,
          loserScore: s2,
          factor: Math.round((s1 / s2) * 10) / 10,
          machine,
        });
      }
    }
  }
  return out;
}

// ── Texte (gemeinsam für Geräte + Server-Ticker) ─────────────────────────────

export const MOMENT_ICON = { upset: "🧊", photo: "📸", blowout: "💣", revenge: "🔄" } as const;
export const MOMENT_TITLE = { upset: "Favoritensturz", photo: "Fotofinish", blowout: "Kantersieg", revenge: "Revanche" } as const;

const fmtScore = (n: number) => n.toLocaleString("de-DE");

/** Zusatzangaben für die Handy-Karte */
export function momentData(m: MatchMoment): Record<string, unknown> {
  if (m.kind === "upset")
    return { winnerChance: Math.round(m.winnerChance * 100), loserChance: Math.round(m.loserChance * 100), machine: m.machine };
  if (m.kind === "photo") return { gapPct: m.gapPct, machine: m.machine };
  if (m.kind === "revenge") return { prevRound: m.prevRound, machine: m.machine };
  return { factor: m.factor, machine: m.machine };
}

/** Ticker-Text */
export function momentText(m: MatchMoment, winnerName: string, loserName: string): string {
  const at = m.machine ? ` an ${m.machine}` : "";
  if (m.kind === "upset")
    return `${winnerName} (Siegchance ${Math.round(m.winnerChance * 100)} %) schlägt Favorit ${loserName} (${Math.round(m.loserChance * 100)} %)${at}!`;
  if (m.kind === "photo")
    return `${winnerName} gewinnt${at} hauchdünn gegen ${loserName} – nur ${String(m.gapPct).replace(".", ",")} % Vorsprung (${fmtScore(m.winnerScore)} zu ${fmtScore(m.loserScore)})`;
  if (m.kind === "revenge")
    return `${winnerName} revanchiert sich${at} bei ${loserName}${m.prevRound ? ` – in Runde ${m.prevRound} hatte ${loserName} noch gewonnen` : ""}`;
  return `${winnerName} zerlegt${at} ${loserName} – ${String(m.factor).replace(".", ",")}× so viele Punkte (${fmtScore(m.winnerScore)} zu ${fmtScore(m.loserScore)})`;
}


/**
 * 🧊 Favoritensturz bei Round the Pinball (je Flipper), sobald ein Score stabil eingetragen ist:
 * - Favorit hat schon gespielt → wer ihn danach übertrifft (Siegchance ≤ UPSET_MAX_CHANCE), bekommt die Meldung
 * - Favorit trägt erst danach ein → JEDER, der ihn übertrifft (Siegchance ≤ UPSET_MAX_CHANCE), bekommt seine Meldung
 *   (schwächster zuerst)
 * scores: alle eingetragenen Scores an diesem Flipper (players.id → Score), newPid: wer gerade eingetragen hat.
 */
export function rotationUpsets(
  scores: Record<string, number>,
  newPid: string,
  snap: ChanceSnapshot | null | undefined
): { winnerId: string; loserId: string; winnerChance: number; loserChance: number }[] {
  if (!snap?.favoriteKey) return [];
  const fav = String(snap.favoriteKey);
  const favScore = scores[fav];
  if (favScore == null) return []; // Favorit hat noch nicht gespielt → (noch) keine Meldung
  const chance = (pid: string) => snap.chances[pid];
  const ok = (pid: string) => pid !== fav && scores[pid] != null && scores[pid] > favScore && chance(pid) != null && chance(pid) <= UPSET_MAX_CHANCE;
  if (newPid !== fav) {
    return ok(newPid) ? [{ winnerId: newPid, loserId: fav, winnerChance: chance(newPid), loserChance: chance(fav) ?? 0 }] : [];
  }
  return Object.keys(scores)
    .filter(ok)
    .sort((a, b) => chance(a) - chance(b))
    .map((pid) => ({ winnerId: pid, loserId: fav, winnerChance: chance(pid), loserChance: chance(fav) ?? 0 }));
}
