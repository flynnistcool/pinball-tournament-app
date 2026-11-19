// ⚖️ Auf Messers Schneide: ein noch unberührtes Match, in dem die Siegchancen höchstens 10 Prozentpunkte
// auseinanderliegen (bei 3–4 Spielern: höchste minus niedrigste). Reine Logik (ohne DB).
//
// Grundlage ist der eingefrorene Stand vor dem Spiel (lib/chanceSnapshots.ts) – dieselben Zahlen,
// die auf dem Bildschirm standen. Ist das Match danach fertig, bekommt die Ergebnis-Meldung den Zusatz
// "⚖️ Auf Messers Schneide – X setzt sich durch".

import type { FeedItemInput } from "@/lib/feed";
import type { ChanceSnapshot } from "@/lib/chanceSnapshots";

/** höchstens so weit dürfen die Siegchancen auseinanderliegen (0..1) */
export const CLOSE_MAX_SPREAD = 0.1;

export const CLOSE_TITLE = "Auf Messers Schneide";

export type CloseChance = { name: string; pct: number; /** players.id (für die Du-Form am Handy) */ id?: string };

/** Snapshot eng genug? (mind. 2 Spieler) */
export function isCloseSnapshot(snap: ChanceSnapshot | null | undefined): boolean {
  const v = Object.values(snap?.chances ?? {}).filter((x) => typeof x === "number" && Number.isFinite(x));
  if (v.length < 2) return false;
  return Math.max(...v) - Math.min(...v) <= CLOSE_MAX_SPREAD + 1e-9;
}

/** Prozentwerte so runden, dass sie zusammen 100 ergeben (46 + 54 statt 46 + 53) */
export function roundedPcts(chances: readonly number[]): number[] {
  const raw = chances.map((c) => c * 100);
  const base = raw.map((x) => Math.floor(x));
  let rest = Math.round(raw.reduce((a, b) => a + b, 0)) - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (rest <= 0) break;
    base[o.i]++;
    rest--;
  }
  return base;
}

/** Ticker-Eintrag vor dem Match */
export function closeMatchFeedItem(opts: {
  matchId: string;
  machine: string | null;
  machineIcon: string | null;
  /** players.id → Name */
  nameOf: (playerId: string) => string;
  snap: ChanceSnapshot;
}): FeedItemInput | null {
  const { matchId, machine, machineIcon, nameOf, snap } = opts;
  if (!isCloseSnapshot(snap)) return null;
  const ids = Object.keys(snap.chances);
  const pcts = roundedPcts(ids.map((id) => snap.chances[id]));
  // niedrigste Chance zuerst (wie beim Favoritensturz: links der Außenseiter)
  const rows: CloseChance[] = ids
    .map((id, i) => ({ name: nameOf(id), pct: pcts[i], id }))
    .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
  const m = machine ? `${machineIcon ? `${machineIcon} ` : ""}${machine}` : "";
  const list = rows.map((r) => `${r.name} ${r.pct} %`).join(rows.length === 2 ? " vs " : " · ");
  return {
    key: `closeMatch|${matchId}`,
    kind: "closeMatch",
    icon: "⚖️",
    title: CLOSE_TITLE,
    body: `${m ? `Siegchancen im ${m}-Match: ` : "Siegchancen: "}${list} – völlig offen, hier ist alles drin!`,
    players: ids,
    data: { machine, machineIcon, chances: rows },
  };
}

/** ⚖️ eigene Meldung nach dem Match: "Janos setzt sich an 💥 AIQ LE gegen Christian durch" (Siegchancen vorher) */
export function closeDecidedFeedItem(opts: {
  matchId: string;
  machine: string | null;
  machineIcon: string | null;
  winners: { id: string; name: string }[];
  losers: { id: string; name: string }[];
  snap: ChanceSnapshot;
}): FeedItemInput | null {
  const { matchId, machine, machineIcon, winners, losers, snap } = opts;
  if (!winners.length || !losers.length) return null;
  const ids = [...winners, ...losers].map((p) => p.id);
  const pcts = roundedPcts(ids.map((id) => snap.chances[id] ?? 0));
  const pctOf = new Map(ids.map((id, i) => [id, pcts[i]]));
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs[xs.length - 1]}`);
  const w = join(winners.map((p) => p.name));
  const l = join(losers.map((p) => p.name));
  const m = machine ? ` an ${machineIcon ? `${machineIcon} ` : ""}${machine}` : "";
  const chances = [...winners, ...losers].map((p) => `${p.name} ${pctOf.get(p.id)} %`).join(" vs ");
  return {
    key: `closeMatch|${matchId}|result`,
    kind: "closeMatch",
    icon: "⚖️",
    title: `${CLOSE_TITLE} – entschieden!`,
    body: `${w} ${winners.length > 1 ? "setzen" : "setzt"} sich${m} gegen ${l} durch (Siegchancen vorher ${chances})`,
    players: winners.map((p) => p.id),
    data: {
      machine,
      machineIcon,
      decided: true,
      player: w,
      other: l,
      winnerNames: winners.map((p) => p.name),
      loserNames: losers.map((p) => p.name),
    },
  };
}

/** Zusatz für die Ergebnis-Meldung, wenn das Match vorher eng war (alt – wird nicht mehr angehängt) */
export function closeResultText(winners: readonly string[]): string {
  const w = winners.join(" & ");
  return `⚖️ ${CLOSE_TITLE} – ${w} ${winners.length > 1 ? "setzen sich durch" : "setzt sich durch"}`;
}

/** Siegchancen aus data.chances (Ticker/Karte) */
export function closeChancesOf(data: Record<string, unknown> | null | undefined): CloseChance[] {
  const raw = Array.isArray(data?.chances) ? (data!.chances as unknown[]) : [];
  return raw
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .filter((r) => typeof r.name === "string" && Number.isFinite(Number(r.pct)))
    .map((r) => ({ name: String(r.name), pct: Number(r.pct), ...(typeof r.id === "string" ? { id: r.id } : {}) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎱 Round the Pinball: je Flipper nur die BEIDEN Favoriten (höchste Siegchancen), Spanne ebenfalls 10 Punkte.
// Meldung erst, wenn einer der beiden vorgelegt hat, an dem Flipper vorn liegt und der andere noch nicht dran war.
// Folgemeldung, sobald der zweite gespielt hat: kontert er (liegt jetzt vorn) oder hält der erste stand?
// Hat inzwischen ein Dritter den höchsten Score, entfällt die jeweilige Meldung.

export type RotationCloseDuo = { first: string; second: string; firstChance: number; secondChance: number };

/** die beiden Favoriten am Flipper, falls höchstens CLOSE_MAX_SPREAD auseinander */
export function rotationCloseDuo(snap: ChanceSnapshot | null | undefined): { a: string; b: string; ca: number; cb: number } | null {
  const rows = Object.entries(snap?.chances ?? {})
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .sort((x, y) => y[1] - x[1]);
  if (rows.length < 2) return null;
  const [a, b] = rows;
  if (a[1] - b[1] > CLOSE_MAX_SPREAD + 1e-9) return null;
  return { a: a[0], b: b[0], ca: a[1], cb: b[1] };
}

/** Stand am Flipper (players.id → Score): legt gerade einer der beiden Favoriten vor? */
export function rotationCloseLead(snap: ChanceSnapshot | null | undefined, scores: Record<string, number>): RotationCloseDuo | null {
  const duo = rotationCloseDuo(snap);
  if (!duo) return null;
  const sa = scores[duo.a];
  const sb = scores[duo.b];
  if ((sa == null) === (sb == null)) return null; // keiner oder beide schon gespielt
  const first = sa != null ? duo.a : duo.b;
  const second = first === duo.a ? duo.b : duo.a;
  const fs = scores[first];
  // muss allein vorn liegen
  for (const [pid, s] of Object.entries(scores)) if (pid !== first && s >= fs) return null;
  return {
    first,
    second,
    firstChance: first === duo.a ? duo.ca : duo.cb,
    secondChance: first === duo.a ? duo.cb : duo.ca,
  };
}

/** Folgemeldung: beide haben gespielt → wer liegt vorn? (null = ein Dritter führt, oder noch offen) */
export function rotationCloseOutcome(
  duo: { first: string; second: string },
  scores: Record<string, number>
): { winner: string; loser: string; countered: boolean } | null {
  const fs = scores[duo.first];
  const ss = scores[duo.second];
  if (fs == null || ss == null) return null;
  const best = Math.max(...Object.values(scores));
  if (ss > fs && ss === best) return { winner: duo.second, loser: duo.first, countered: true };
  if (fs > ss && fs === best) return { winner: duo.first, loser: duo.second, countered: false };
  return null;
}

const fmtFull = (n: number) => Math.round(n).toLocaleString("de-DE");

/** 🎱 Ticker: "Janos legt an 🦖 Godzilla 45.000.000 vor – Marco ist gleich stark. Kann Marco kontern?" */
export function rotationCloseFeedItem(opts: {
  matchId: string;
  machine: string | null;
  machineIcon: string | null;
  firstName: string;
  secondName: string;
  duo: RotationCloseDuo;
  score: number;
}): FeedItemInput {
  const { matchId, machine, machineIcon, firstName, secondName, duo, score } = opts;
  const [pf, ps] = roundedPcts([duo.firstChance, duo.secondChance]);
  const m = machine ? `${machineIcon ? `${machineIcon} ` : ""}${machine}` : "";
  const line = `${firstName} legt ${fmtFull(score)} vor – kann ${secondName} kontern?`;
  return {
    key: `closeMatch|${matchId}`,
    kind: "closeMatch",
    icon: "⚖️",
    title: CLOSE_TITLE,
    body: `${firstName} legt${m ? ` an ${m}` : ""} ${fmtFull(score)} vor – ${secondName} ist gleich stark (${pf} % vs ${ps} %). Kann ${secondName} kontern?`,
    players: [duo.first, duo.second],
    data: {
      machine,
      machineIcon,
      rtp: true,
      head: m ? `Siegchancen der Favoriten an ${m}` : "Siegchancen der Favoriten",
      line,
      player: firstName,
      other: secondName,
      score,
      firstId: duo.first,
      secondId: duo.second,
      chances: [
        { name: firstName, pct: pf, id: duo.first },
        { name: secondName, pct: ps, id: duo.second },
      ],
    },
  };
}

/** 🎱 Folgemeldung: "Marco kontert an 🦖 Godzilla: 48.100.000 gegen 45.000.000 von Janos!" */
export function rotationCloseResultItem(opts: {
  matchId: string;
  machine: string | null;
  machineIcon: string | null;
  winnerName: string;
  loserName: string;
  winnerScore: number;
  loserScore: number;
  countered: boolean;
  winnerId: string;
}): FeedItemInput {
  const { matchId, machine, machineIcon, winnerName, loserName, winnerScore, loserScore, countered, winnerId } = opts;
  const m = machine ? ` an ${machineIcon ? `${machineIcon} ` : ""}${machine}` : "";
  return {
    key: `closeMatch|${matchId}|result`,
    kind: "closeMatch",
    icon: "⚖️",
    title: countered ? `${CLOSE_TITLE} – gekontert!` : `${CLOSE_TITLE} – gehalten!`,
    body: countered
      ? `${winnerName} kontert${m}: ${fmtFull(winnerScore)} gegen ${fmtFull(loserScore)} von ${loserName}!`
      : `${winnerName} hält stand${m}: ${fmtFull(winnerScore)} – ${loserName} bleibt bei ${fmtFull(loserScore)}`,
    players: [winnerId],
    data: { machine, machineIcon, player: winnerName, other: loserName, countered, winnerScore, loserScore },
  };
}
