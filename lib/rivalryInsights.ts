// ⚔️ Gegner-Duell-Hinweise für laufende Matches (Admin, TV, Handy) – reine Logik.
//
// Pro Spielerpaar höchstens EIN Hinweis, in dieser Rangfolge:
//  1) 🔥 laufende Serie: einer hat die letzten ≥ 3 Duelle gegen den anderen gewonnen
//  2) 😈 Erzfeind-Duell: einer ist der Erzfeind (#1) des anderen – und die Bilanz ist klar (≤ 40 %)
//  3) ⚖️ Ebenbürtig: ≥ 20 Duelle und Bilanz zwischen 45 % und 55 %
//  4) 🤝 Jubiläum: das kommende Duell ist das 50., 100., 150. …
// Grundlage: Duelle wie in lib/rivals.ts (alle Formate außer DYP, ohne Bots/Platzhalter).

import { pickRivals, RIVAL_MIN_DUELS, type RivalStat } from "@/lib/rivals";

export const INSIGHT_MIN_STREAK = 3;
/** Erzfeind-Duell nur bei klar schlechter Bilanz (höchstens so viel % gewonnen) */
export const INSIGHT_NEMESIS_MAX_WINRATE = 40;
export const INSIGHT_EVEN_MIN_DUELS = 20;
export const INSIGHT_EVEN_BAND = 5; // ± Prozentpunkte um 50 %
export const INSIGHT_JUBILEE_STEP = 50;

export type RivalryInsight = {
  kind: "streak" | "nemesis" | "even" | "jubilee";
  /** "Hauptperson": Serien-Sieger bzw. der Erzfeind (dominant); bei even/jubilee egal */
  a: string;
  b: string;
  /** Siege a gegen b / b gegen a (bisherige Duelle) */
  aWins: number;
  bWins: number;
  duels: number;
  /** Serienlänge bzw. Nummer des kommenden Duells */
  n: number;
  /** höher = spannender (zum Auswählen pro Match) */
  score: number;
};

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** deutscher Genitiv: "Flos", aber "Chris'" / "Max'" */
export const gen = (name: string) => (/[sßxz]$/i.test(name.trim()) ? `${name}'` : `${name}s`);

/**
 * @param players Turnierspieler (player_id → profile_id), nur echte Menschen
 * @param statsByProfile je Profil die Duell-Bilanz gegen alle Gegner (computeRivalStats)
 */
export function buildInsights(
  players: readonly { playerId: string; profileId: string }[],
  statsByProfile: ReadonlyMap<string, readonly RivalStat[]>
): Record<string, RivalryInsight> {
  const statOf = new Map<string, Map<string, RivalStat>>();
  const nemesisOf = new Map<string, string | null>();
  statsByProfile.forEach((list, prof) => {
    statOf.set(prof, new Map(list.map((s) => [s.profileId, s])));
    nemesisOf.set(prof, pickRivals(list).nemesis[0]?.profileId ?? null);
  });

  const out: Record<string, RivalryInsight> = {};
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const X = players[i];
      const Y = players[j];
      if (X.profileId === Y.profileId) continue;
      const sx = statOf.get(X.profileId)?.get(Y.profileId); // X gegen Y
      const sy = statOf.get(Y.profileId)?.get(X.profileId); // Y gegen X
      if (!sx || !sy) continue;

      const cands: RivalryInsight[] = [];
      const base = (a: typeof X, b: typeof Y, aWins: number, bWins: number) => ({
        a: a.playerId,
        b: b.playerId,
        aWins,
        bWins,
        duels: sx.duels,
      });

      // 1) laufende Serie
      if (sx.currentStreak >= INSIGHT_MIN_STREAK)
        cands.push({ kind: "streak", ...base(X, Y, sx.wins, sx.losses), n: sx.currentStreak, score: 400 + sx.currentStreak });
      if (sy.currentStreak >= INSIGHT_MIN_STREAK)
        cands.push({ kind: "streak", ...base(Y, X, sy.wins, sy.losses), n: sy.currentStreak, score: 400 + sy.currentStreak });

      // 2) Erzfeind: a = der Erzfeind (dominant), b = der, dessen Erzfeind er ist
      if (nemesisOf.get(X.profileId) === Y.profileId && sx.winrate <= INSIGHT_NEMESIS_MAX_WINRATE)
        cands.push({ kind: "nemesis", ...base(Y, X, sy.wins, sy.losses), n: 0, score: 300 + Math.min(99, sx.duels / 10) });
      if (nemesisOf.get(Y.profileId) === X.profileId && sy.winrate <= INSIGHT_NEMESIS_MAX_WINRATE)
        cands.push({ kind: "nemesis", ...base(X, Y, sx.wins, sx.losses), n: 0, score: 300 + Math.min(99, sy.duels / 10) });

      // 3) Ebenbürtig
      if (sx.duels >= INSIGHT_EVEN_MIN_DUELS && Math.abs(sx.winrate - 50) <= INSIGHT_EVEN_BAND) {
        const xLeads = sx.wins >= sx.losses;
        cands.push({
          kind: "even",
          ...(xLeads ? base(X, Y, sx.wins, sx.losses) : base(Y, X, sy.wins, sy.losses)),
          n: 0,
          score: 200 + Math.min(99, sx.duels / 10),
        });
      }

      // 4) Jubiläum (das kommende Duell)
      const next = sx.duels + 1;
      if (next >= INSIGHT_JUBILEE_STEP && next % INSIGHT_JUBILEE_STEP === 0)
        cands.push({ kind: "jubilee", ...base(X, Y, sx.wins, sx.losses), n: next, score: 100 + next / 100 });

      cands.sort((p, q) => q.score - p.score);
      if (cands[0]) out[pairKey(X.playerId, Y.playerId)] = cands[0];
    }
  }
  return out;
}

/** spannendster Hinweis für ein Match (alle Paare der Spieler) */
export function bestInsightForMatch(
  playerIds: readonly string[],
  insights: Readonly<Record<string, RivalryInsight>>
): RivalryInsight | null {
  let best: RivalryInsight | null = null;
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const ins = insights[pairKey(playerIds[i], playerIds[j])];
      if (ins && (!best || ins.score > best.score)) best = ins;
    }
  }
  return best;
}

/** kurzer Text (Deutsch) für Badge/Zeile */
export function insightText(ins: RivalryInsight, nameOf: (playerId: string) => string): { icon: string; text: string } {
  const A = nameOf(ins.a);
  const B = nameOf(ins.b);
  switch (ins.kind) {
    case "streak":
      return { icon: "🔥", text: `${A} hat die letzten ${ins.n} Duelle gegen ${B} gewonnen` };
    case "nemesis":
      return { icon: "😈", text: `Erzfeind-Duell: ${A} ist ${gen(B)} Erzfeind (${ins.aWins} : ${ins.bWins})` };
    case "even":
      return { icon: "⚖️", text: `Ebenbürtig: ${A} – ${B} ${ins.aWins} : ${ins.bWins}` };
    case "jubilee":
      return { icon: "🤝", text: `${ins.n}. Duell zwischen ${A} und ${B}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎉 Ereignisse NACH einem Match (Schritt 2): Serie gerissen / Erzfeind besiegt / Jubiläum
// Grundlage: Duell-Stand je Paar VOR dem Match (pairs, einmal pro Runde geladen) + Plätze im fertigen Match.

/** ab dieser Serienlänge ist "Serie gerissen" ein Ereignis */
export const EVENT_MIN_BROKEN_STREAK = 5;

export type PairState = {
  /** Spieler-IDs (players.id) – x < y */
  x: string;
  y: string;
  xWins: number;
  yWins: number;
  duels: number;
  /** laufende Serie von x gegen y bzw. y gegen x */
  xStreak: number;
  yStreak: number;
  /** y ist x' Erzfeind (klar, ≤ 40 %) bzw. umgekehrt */
  yIsXsNemesis: boolean;
  xIsYsNemesis: boolean;
  /** Siegquote (%) von x bzw. y gegen den eigenen bisherigen Erzfeind (null = keiner) */
  xNemRate: number | null;
  yNemRate: number | null;
};

export function buildPairStates(
  players: readonly { playerId: string; profileId: string }[],
  statsByProfile: ReadonlyMap<string, readonly RivalStat[]>
): Record<string, PairState> {
  const statOf = new Map<string, Map<string, RivalStat>>();
  const nemesisOf = new Map<string, string | null>();
  const nemRateOf = new Map<string, number | null>();
  statsByProfile.forEach((list, prof) => {
    statOf.set(prof, new Map(list.map((s) => [s.profileId, s])));
    const nem = pickRivals(list).nemesis[0];
    // nur ein "echter" Erzfeind (≤ 40 %) zählt
    const real = nem && nem.winrate <= INSIGHT_NEMESIS_MAX_WINRATE ? nem : null;
    nemesisOf.set(prof, real?.profileId ?? null);
    nemRateOf.set(prof, real ? real.winrate : null);
  });
  const out: Record<string, PairState> = {};
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      let X = players[i];
      let Y = players[j];
      if (X.profileId === Y.profileId) continue;
      if (Y.playerId < X.playerId) [X, Y] = [Y, X];
      const sx = statOf.get(X.profileId)?.get(Y.profileId) ?? null;
      const sy = statOf.get(Y.profileId)?.get(X.profileId) ?? null;
      out[pairKey(X.playerId, Y.playerId)] = {
        x: X.playerId,
        y: Y.playerId,
        xWins: sx?.wins ?? 0,
        yWins: sy?.wins ?? 0,
        duels: sx?.duels ?? 0,
        xStreak: sx?.currentStreak ?? 0,
        yStreak: sy?.currentStreak ?? 0,
        yIsXsNemesis: !!sx && nemesisOf.get(X.profileId) === Y.profileId && sx.winrate <= INSIGHT_NEMESIS_MAX_WINRATE,
        xIsYsNemesis: !!sy && nemesisOf.get(Y.profileId) === X.profileId && sy.winrate <= INSIGHT_NEMESIS_MAX_WINRATE,
        xNemRate: nemRateOf.get(X.profileId) ?? null,
        yNemRate: nemRateOf.get(Y.profileId) ?? null,
      };
    }
  }
  return out;
}

export type RivalryEvent = {
  /** eindeutig: Match + Art + Paar */
  id: string;
  kind: "streakBroken" | "nemesisBeaten" | "jubilee" | "leadChange" | "streakGrow" | "newNemesis" | "evenReached";
  winner: string;
  loser: string;
  /** gerissene Serienlänge bzw. Nummer des Duells */
  n: number;
  /** Bilanz NACH dem Match aus Sicht des Siegers */
  winnerWins: number;
  loserWins: number;
  score: number;
  /** true = nur für den 📣 Ticker, keine Einblendung (z. B. Serie 4, 6, 7 …) */
  quiet?: boolean;
};

/** Ereignisse eines gerade fertig gewordenen Matches (alle Paare), spannendstes zuerst */
export function eventsForFinishedMatch(
  matchId: string,
  players: readonly { player_id: string; position: number | null }[],
  pairs: Readonly<Record<string, PairState>>
): RivalryEvent[] {
  const out: RivalryEvent[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (typeof a.position !== "number" || typeof b.position !== "number" || a.position === b.position) continue;
      const st = pairs[pairKey(String(a.player_id), String(b.player_id))];
      if (!st) continue;
      const winner = a.position < b.position ? String(a.player_id) : String(b.player_id);
      const loser = winner === String(a.player_id) ? String(b.player_id) : String(a.player_id);
      const wIsX = winner === st.x;
      const wWins = (wIsX ? st.xWins : st.yWins) + 1;
      const lWins = wIsX ? st.yWins : st.xWins;
      const loserStreak = wIsX ? st.yStreak : st.xStreak; // Serie des Verlierers gegen den Sieger
      const loserIsWinnersNemesis = wIsX ? st.yIsXsNemesis : st.xIsYsNemesis;
      const base = { winner, loser, winnerWins: wWins, loserWins: lWins };

      // 💥 Serie gerissen: Ticker ab 3 Siegen, Einblendung (Vollbild/Karte) erst ab 5
      if (loserStreak >= INSIGHT_MIN_STREAK)
        out.push({
          id: `${matchId}|streak|${winner}|${loser}`,
          kind: "streakBroken",
          n: loserStreak,
          score: 300 + loserStreak,
          quiet: loserStreak < EVENT_MIN_BROKEN_STREAK,
          ...base,
        });
      // 🔥 Serie wächst: Ticker bei jedem Sieg ab 3; Einblendung nur bei 3, 5, 10, 15 …
      const winnerStreak = (wIsX ? st.xStreak : st.yStreak) + 1;
      if (winnerStreak >= 3) {
        const milestone = winnerStreak === 3 || (winnerStreak >= 5 && winnerStreak % 5 === 0);
        out.push({
          id: `${matchId}|grow|${winner}|${loser}`,
          kind: "streakGrow",
          n: winnerStreak,
          score: milestone ? 150 + winnerStreak : 50 + winnerStreak,
          quiet: !milestone,
          ...base,
        });
      }

      // 📣 nur Ticker: 😈 Neuer Erzfeind – der Sieger wird zum (schlimmsten) Erzfeind des Verlierers
      const duelsAfter = st.duels + 1;
      const loserRate = duelsAfter ? (lWins / duelsAfter) * 100 : 0;
      const loserWasNemesisVictim = wIsX ? st.xIsYsNemesis : st.yIsXsNemesis; // Sieger war schon Erzfeind des Verlierers
      const loserNemRate = wIsX ? st.yNemRate : st.xNemRate;
      if (
        !loserWasNemesisVictim &&
        duelsAfter >= RIVAL_MIN_DUELS &&
        loserRate <= INSIGHT_NEMESIS_MAX_WINRATE &&
        (loserNemRate == null || loserRate < loserNemRate)
      )
        out.push({ id: `${matchId}|newnem|${winner}|${loser}`, kind: "newNemesis", n: 0, score: 180, ...base });

      // 📣 nur Ticker: ⚖️ Ebenbürtig – 20. Duell und Bilanz zwischen 45 und 55 %
      if (duelsAfter === INSIGHT_EVEN_MIN_DUELS && Math.abs((wWins / duelsAfter) * 100 - 50) <= INSIGHT_EVEN_BAND)
        out.push({ id: `${matchId}|even|${winner}|${loser}`, kind: "evenReached", n: duelsAfter, score: 120, ...base });

      // ⚖️ Führungswechsel / Gleichstand in einer ausgeglichenen Rivalität (≥ 20 Duelle):
      //    der Hintere zieht gleich, oder bei Gleichstand übernimmt jemand die Führung
      const wBefore = wIsX ? st.xWins : st.yWins;
      if (st.duels >= INSIGHT_EVEN_MIN_DUELS && wBefore <= lWins && wWins >= lWins)
        out.push({ id: `${matchId}|lead|${winner}|${loser}`, kind: "leadChange", n: 0, score: 250, ...base });
      if (loserIsWinnersNemesis)
        out.push({ id: `${matchId}|nemesis|${winner}|${loser}`, kind: "nemesisBeaten", n: 0, score: 200, ...base });
      const nth = st.duels + 1;
      if (nth >= INSIGHT_JUBILEE_STEP && nth % INSIGHT_JUBILEE_STEP === 0)
        out.push({ id: `${matchId}|jubilee|${winner}|${loser}`, kind: "jubilee", n: nth, score: 100 + nth / 100, ...base });
    }
  }
  return out.sort((p, q) => q.score - p.score);
}

/** Text: Titel + Zeile; meId → persönliche Sicht ("Du …") fürs Handy */
export function eventText(
  ev: RivalryEvent,
  nameOf: (playerId: string) => string,
  meId?: string | null
): { icon: string; title: string; text: string } {
  const W = nameOf(ev.winner);
  const L = nameOf(ev.loser);
  const meWin = !!meId && meId === ev.winner;
  const meLose = !!meId && meId === ev.loser;
  const bil = `${ev.winnerWins} : ${ev.loserWins}`;
  switch (ev.kind) {
    case "streakBroken":
      return {
        icon: "💥",
        title: "Serie gerissen!",
        text: meWin
          ? `Du hast ${gen(L)} Serie von ${ev.n} Siegen gegen dich beendet!`
          : meLose
          ? `${W} hat deine Serie von ${ev.n} Siegen beendet.`
          : `${W} beendet ${gen(L)} Serie von ${ev.n} Siegen in Folge.`,
      };
    case "nemesisBeaten":
      return {
        icon: "😈",
        title: "Erzfeind besiegt!",
        text: meWin
          ? `Du hast deinen Erzfeind ${L} geschlagen! (jetzt ${bil})`
          : meLose
          ? `${W} hat dich geschlagen – dabei bist du sein Erzfeind. (jetzt ${bil})`
          : `${W} schlägt seinen Erzfeind ${L} (jetzt ${bil}).`,
      };
    case "leadChange": {
      const tie = ev.winnerWins === ev.loserWins;
      return {
        icon: "⚖️",
        title: tie ? "Gleichstand!" : "Führungswechsel!",
        text: tie
          ? meWin
            ? `Du ziehst gegen ${L} gleich – ${bil}!`
            : meLose
            ? `${W} zieht gegen dich gleich – ${bil}.`
            : `${W} zieht gegen ${L} gleich – ${bil}!`
          : meWin
          ? `Du übernimmst die Führung gegen ${L} – ${bil}!`
          : meLose
          ? `${W} übernimmt die Führung gegen dich – ${bil}.`
          : `${W} übernimmt die Führung gegen ${L} – ${bil}!`,
      };
    }
    case "streakGrow":
      return {
        icon: "🔥",
        title: "Serie geht weiter",
        text: meWin
          ? `Du gewinnst wieder gegen ${L} – jetzt ${ev.n} Siege in Folge!`
          : meLose
          ? `${W} gewinnt wieder gegen dich – jetzt ${ev.n} Siege in Folge.`
          : `${W} gewinnt wieder gegen ${L} und setzt die Serie fort – jetzt ${ev.n} Siege in Folge.`,
      };
    case "newNemesis":
      return {
        icon: "😈",
        title: "Neuer Erzfeind",
        text: meWin
          ? `Du bist jetzt ${gen(L)} Erzfeind (${bil}).`
          : meLose
          ? `${W} ist jetzt dein Erzfeind (${bil}).`
          : `${W} ist jetzt ${gen(L)} Erzfeind (${bil}).`,
      };
    case "evenReached":
      return {
        icon: "⚖️",
        title: "Ebenbürtig",
        text: `${W} und ${L}: ${ev.n} Duelle, ${bil} – ebenbürtig!`,
      };
    case "jubilee":
      return {
        icon: "🤝",
        title: `${ev.n}. Duell!`,
        text: meWin
          ? `Dein ${ev.n}. Duell gegen ${L} – und du hast gewonnen!`
          : meLose
          ? `Dein ${ev.n}. Duell gegen ${W} – diesmal hat ${W} gewonnen.`
          : `${W} gewinnt das ${ev.n}. Duell gegen ${L}.`,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 📣 Gegner-Hinweis (Badge) einmal pro Turnier in den Live-Ticker – neu nur, wenn sich die Aussage ändert
// (Serie: andere Zahl · Erzfeind: anderer Erzfeind · Ebenbürtig: einmal · Jubiläum: neue Nummer)

const INSIGHT_TITLE: Record<RivalryInsight["kind"], string> = {
  streak: "Duell-Serie",
  nemesis: "Erzfeind-Duell",
  even: "Ebenbürtiges Duell",
  jubilee: "Duell-Jubiläum",
};

export function insightFeedItem(
  ins: RivalryInsight,
  nameOf: (playerId: string) => string,
  machine?: string | null
): { key: string; kind: string; icon: string; title: string; body: string; players: string[]; data: Record<string, unknown> } {
  const { icon, text } = insightText(ins, nameOf);
  const what =
    ins.kind === "streak"
      ? `${ins.a}:${ins.n}`
      : ins.kind === "nemesis"
      ? `${ins.a}`
      : ins.kind === "jubilee"
      ? `${ins.n}`
      : "";
  return {
    key: `insight|${pairKey(ins.a, ins.b)}|${ins.kind}|${what}`,
    kind: "rivalryInsight",
    icon,
    title: `Vor dem Match: ${INSIGHT_TITLE[ins.kind]}`,
    body: machine ? `${text} – gleich an ${machine}` : text,
    players: [ins.a, ins.b],
    data: { ...ins },
  };
}
