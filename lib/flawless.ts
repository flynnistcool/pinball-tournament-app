// 🥋 Flawless Victory – reine Logik, keine Datenbank.
//
// "Makelloses Turnier": ein Spieler gewinnt JEDES seiner Matches.
// - Matchplay, Swiss, Round Robin, DYP, Timeplay ("wins"): Platz 1 in jedem FERTIGEN Match
//   (alle Spieler des Matches haben einen Platz). Gezählt werden SIEGE gegen Gegner:
//   1 gegen 1 gewonnen = 1 Sieg, ein gewonnenes 4er-Match = 3 Siege (drei Gegner geschlagen).
// - Round the Pinball ("leads"): an jedem Flipper, an dem er gespielt hat, den besten Score.
// - Elimination: bewusst nicht (der Turniersieger ist dort praktisch immer ungeschlagen).
//
// Unterwegs: 🛡️ "Noch unbesiegt" bei 4, 8, 12 … Siegen (Round the Pinball: 3, 6, 9 … Flipper).

import { matchWinValue } from "@/lib/winStreaks";

export type FlawlessMode = "none" | "wins" | "leads";

export function flawlessMode(format: string | null | undefined): FlawlessMode {
  const f = String(format ?? "").toLowerCase();
  if (f === "rotation") return "leads";
  if (f === "elimination") return "none";
  return "wins";
}

/** Ab so vielen Siegen (bzw. Flippern) zählt ein makelloses Turnier als Flawless Victory */
export const FLAWLESS_MIN = 3;

/** Zählgröße: Siege gegen Gegner (Matchplay & Co.) bzw. Flipper (Round the Pinball) */
export function runCount(run: PlayerRun | undefined, mode: FlawlessMode): number {
  if (!run) return 0;
  return mode === "leads" ? run.played : run.beaten;
}

/** "Noch unbesiegt"-Meldung in diesen Schritten (Siege bzw. Flipper) */
export function unbeatenStep(mode: FlawlessMode): number {
  return mode === "leads" ? 3 : 4;
}

export type PlayerRun = {
  /** fertige Matches (bzw. Flipper mit eigenem Score) */
  played: number;
  /** alle davon gewonnen (bzw. überall vorn) */
  allWon: boolean;
  /** geschlagene Gegner insgesamt */
  beaten: number;
  /** Round the Pinball: Matches (= Flipper), an denen er gerade vorn liegt */
  led: string[];
};

type RunData = {
  matches?: { id: string }[];
  match_players?: {
    match_id: string;
    player_id: string;
    position?: number | null;
    score?: number | string | null;
  }[];
};

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Bilanz je Spieler im laufenden Turnier */
export function playerRuns(data: RunData, mode: FlawlessMode): Record<string, PlayerRun> {
  const out: Record<string, PlayerRun> = {};
  if (mode === "none") return out;
  const get = (pid: string) => (out[pid] ??= { played: 0, allWon: true, beaten: 0, led: [] });

  const byMatch = new Map<string, NonNullable<RunData["match_players"]>>();
  for (const mp of data.match_players ?? []) {
    const k = String(mp.match_id);
    const list = byMatch.get(k);
    if (list) list.push(mp);
    else byMatch.set(k, [mp]);
  }

  for (const m of data.matches ?? []) {
    const mid = String(m.id);
    const mps = byMatch.get(mid) ?? [];
    if (mps.length < 2) continue;

    if (mode === "wins") {
      if (!mps.every((x) => Number(x.position) > 0)) continue; // noch nicht fertig
      const gain = matchWinValue(mps); // 4er-Match = 3 Siege, DYP = 1
      for (const mp of mps) {
        const r = get(String(mp.player_id));
        r.played++;
        if (Number(mp.position) === 1) r.beaten += gain;
        else r.allWon = false;
      }
    } else {
      const scored = mps
        .map((x) => ({ pid: String(x.player_id), s: toScore(x.score) }))
        .filter((x): x is { pid: string; s: number } => x.s != null);
      if (!scored.length) continue;
      const best = Math.max(...scored.map((x) => x.s));
      for (const x of scored) {
        const r = get(x.pid);
        r.played++;
        if (x.s === best) {
          r.led.push(mid);
          r.beaten += scored.filter((y) => y.s < best).length;
        } else {
          r.allWon = false;
        }
      }
    }
  }
  return out;
}

/** gerade "unbesiegt" im Sinne der Meldung? (alle gewonnen und mindestens ein Schritt geschafft) */
export function isUnbeaten(run: PlayerRun | undefined, mode: FlawlessMode): boolean {
  return !!run && run.allWon && runCount(run, mode) >= unbeatenStep(mode);
}

/** Round the Pinball: sind alle Scores eingetragen (alle Durchgänge fertig)? */
export function rotationAllDone(data: RunData): boolean {
  const mids = new Set((data.matches ?? []).map((m) => String(m.id)));
  const mps = (data.match_players ?? []).filter((mp) => mids.has(String(mp.match_id)));
  return mps.length > 0 && mps.every((mp) => toScore(mp.score) != null);
}

/** Wer hat am Ende alles gewonnen? (mind. FLAWLESS_MIN Matches/Flipper) */
export function flawlessWinners(data: RunData, mode: FlawlessMode): { playerId: string; run: PlayerRun }[] {
  const runs = playerRuns(data, mode);
  return Object.entries(runs)
    .filter(([, r]) => r.allWon && runCount(r, mode) >= FLAWLESS_MIN)
    .map(([playerId, run]) => ({ playerId, run }))
    .sort((a, b) => runCount(b.run, mode) - runCount(a.run, mode));
}

/** Text-Baustein, z. B. "12 Siege ohne Niederlage (5 Matches)" / "an allen 5 Flippern vorn" */
export function flawlessText(mode: FlawlessMode, run: PlayerRun): string {
  if (mode === "leads") return `an allen ${run.played} Flippern vorn`;
  return `${run.beaten} Siege ohne Niederlage (${run.played} ${run.played === 1 ? "Match" : "Matches"})`;
}
