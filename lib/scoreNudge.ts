// 📊 Lob fürs Score-Eintragen am Handy + 💡 freundliche Erinnerung – reine Logik (Texte, Stufen, Meldungen).
//
// Gezählt wird, wie viele Scores ein Spieler im Turnier SELBST am Handy eingetragen hat (eigene + die der
// Mitspieler; Grundlage: match_players.entry_log, src "phone", by = Spielername). Eine Zeile (Spieler im Match)
// zählt einmal, egal wie oft korrigiert wurde.
// Nur Matchplay & Co. (Plätze reichen dort – Scores sind freiwillig).

import type { FeedItemInput } from "@/lib/feed";
import { parseEntryLog } from "@/lib/entryLog";

/** Stufen fürs Lob: 1, 3 (nur Handy) · 5, 10, 15 … (Handy + Ticker) */
export function scoreMilestones(max: number): number[] {
  const out = [1, 3];
  for (let m = 5; m <= Math.max(5, max); m += 5) out.push(m);
  return out.filter((m) => m <= max);
}

/** höchste Stufe, die mit diesem Speichern neu erreicht wurde (prev < m ≤ now) – null = keine */
export function crossedMilestone(prev: number, now: number): number | null {
  const hit = scoreMilestones(now).filter((m) => m > prev && m <= now);
  return hit.length ? hit[hit.length - 1] : null;
}

/** Zählt Zeilen (Spieler im Match), deren Score dieser Spieler am Handy eingetragen hat und der noch steht */
export function countPhoneScores(
  rows: { match_id: string; score: unknown; entry_log: unknown }[],
  playerName: string,
  exceptMatchId?: string
): number {
  let n = 0;
  for (const r of rows) {
    if (exceptMatchId && String(r.match_id) === exceptMatchId) continue;
    if (r.score == null || r.score === "") continue;
    const log = parseEntryLog(r.entry_log);
    if (log.some((x) => x.src === "phone" && x.by === playerName && x.score && x.score[1] != null)) n++;
  }
  return n;
}

/** Lob-Meldung (1 und 3: nur Handy-Karte "scoreThanks"; ab 5: Ticker + Handy "scoreHelper") */
export function scorePraiseItem(playerId: string, playerName: string, n: number): FeedItemInput {
  const ticker = n >= 5;
  const title =
    n === 1 ? "Danke für deinen Score!" : n === 3 ? "Score-Sammler!" : n >= 15 ? "Score-Legende!" : n >= 10 ? "Score-Held!" : "Score-Profi!";
  return {
    key: `${ticker ? "scoreHelper" : "scoreThanks"}|${playerId}|${n}`,
    kind: ticker ? "scoreHelper" : "scoreThanks",
    icon: "📊",
    title,
    body: ticker
      ? `${playerName} hat schon ${n} Scores eingetragen – Vorbild! 👏`
      : n === 1
      ? `${playerName} trägt Scores ein – damit zählen sie für Highscores & Bestwerte.`
      : `${playerName} hat schon ${n} Scores eingetragen – stark!`,
    players: [playerId],
    data: { player: playerName, n },
  };
}

/** 💡 Erinnerung (einmal pro Turnier): Match nur mit Plätzen eingetragen */
export function scoreTipItem(playerId: string, playerName: string): FeedItemInput {
  return {
    key: `scoreTip|${playerId}`,
    kind: "scoreTip",
    icon: "💡",
    title: "Tipp: Scores eintragen",
    body: `${playerName} hat nur Plätze eingetragen – mit Scores gibt's Highscores, Bestwerte, Score-Form & mehr.`,
    players: [playerId],
    data: { player: playerName },
  };
}
