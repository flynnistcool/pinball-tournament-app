// ⚡ Besondere Match-Momente – reine Logik, keine Datenbank.
//
// - 🧊 Favoritensturz: Matchsieger hat mindestens UPSET_MIN_ELO weniger Elo als ein geschlagener Gegner
//   (Elo zu Turnierbeginn = linke Zahl im Leaderboard "1412 → 1541" – ändert sich während des Turniers nicht)
// - 📸 Fotofinish: Sieger-Score höchstens PHOTO_MAX_GAP (2 %) über dem Zweitbesten
// - 💣 Kantersieg: Sieger-Score mindestens BLOWOUT_FACTOR (3×) so hoch wie der Zweitbeste
// - 🔄 Revanche: der Sieger hatte das letzte direkte Duell IM SELBEN TURNIER gegen diesen Gegner verloren
//   (nur Matchplay & Co.; über alle Turniere wäre es bei 1 gegen 1 fast jedes zweite Match)
//
// "Fertig" heißt: Matchplay & Co. – alle Spieler des Matches haben einen Platz;
// Round the Pinball – alle Spieler am Flipper haben einen Score (der Flipper ist durch).
// Nicht bei DYP (Teams) und Timeplay (Zeiten statt Scores; nur der Favoritensturz zählt dort).

export const UPSET_MIN_ELO = 200;
export const PHOTO_MAX_GAP = 0.02;
export const BLOWOUT_FACTOR = 3;

export type MomentMode = "none" | "positions" | "scores";

export function momentMode(format: string | null | undefined): MomentMode {
  const f = String(format ?? "").toLowerCase();
  if (f === "dyp_round_robin" || f === "dyp") return "none";
  if (f === "rotation") return "scores";
  return "positions";
}

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
  | { kind: "upset"; matchId: string; winnerId: string; loserId: string; winnerElo: number; loserElo: number; machine: string | null }
  | { kind: "photo"; matchId: string; winnerId: string; loserId: string; winnerScore: number; loserScore: number; gapPct: number; machine: string | null }
  | { kind: "blowout"; matchId: string; winnerId: string; loserId: string; winnerScore: number; loserScore: number; factor: number; machine: string | null }
  | { kind: "revenge"; matchId: string; winnerId: string; loserId: string; prevRound: number | null; machine: string | null };

/** Besondere Momente eines fertigen Matches (Elo je Spieler-ID: Turnierbeginn) */
export function momentsForMatch(
  data: MData,
  matchId: string,
  mode: MomentMode,
  eloStart: Record<string, number | null | undefined>
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

  // 🧊 Favoritensturz: stärkster geschlagener Gegner (nur Matchplay & Co.; bei Round the Pinball
  // spielt man nicht direkt gegeneinander)
  if (mode === "positions") {
    const we = eloStart[winnerId];
    if (we != null) {
      let best: { id: string; elo: number } | null = null;
      for (const x of ranked.slice(1)) {
        const e = eloStart[String(x.player_id)];
        if (e != null && (!best || e > best.elo)) best = { id: String(x.player_id), elo: e };
      }
      if (best && best.elo - we >= UPSET_MIN_ELO) {
        out.push({ kind: "upset", matchId, winnerId, loserId: best.id, winnerElo: we, loserElo: best.elo, machine });
      }
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
  if (m.kind === "upset") return { winnerElo: m.winnerElo, loserElo: m.loserElo, machine: m.machine };
  if (m.kind === "photo") return { gapPct: m.gapPct, machine: m.machine };
  if (m.kind === "revenge") return { prevRound: m.prevRound, machine: m.machine };
  return { factor: m.factor, machine: m.machine };
}

/** Ticker-Text */
export function momentText(m: MatchMoment, winnerName: string, loserName: string): string {
  const at = m.machine ? ` an ${m.machine}` : "";
  if (m.kind === "upset")
    return `${winnerName} (${m.winnerElo}) schlägt Favorit ${loserName} (${m.loserElo})${at} – ${m.loserElo - m.winnerElo} Elo Unterschied!`;
  if (m.kind === "photo")
    return `${winnerName} gewinnt${at} hauchdünn gegen ${loserName} – nur ${String(m.gapPct).replace(".", ",")} % Vorsprung (${fmtScore(m.winnerScore)} zu ${fmtScore(m.loserScore)})`;
  if (m.kind === "revenge")
    return `${winnerName} revanchiert sich${at} bei ${loserName}${m.prevRound ? ` – in Runde ${m.prevRound} hatte ${loserName} noch gewonnen` : ""}`;
  return `${winnerName} zerlegt${at} ${loserName} – ${String(m.factor).replace(".", ",")}× so viele Punkte (${fmtScore(m.winnerScore)} zu ${fmtScore(m.loserScore)})`;
}
