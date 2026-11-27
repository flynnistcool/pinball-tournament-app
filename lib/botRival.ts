// 🥊 Rivalen-Bot: Stärke aus den direkten Duellen mit "seinem" Spieler (reine Logik, keine Datenbank).
// Mit dem Nutzer abgestimmt (2026-11-14 / 2026-11-28):
// - Start = Elo des Spielers beim Anlegen (profiles.bot_strength).
// - Jedes Match, in dem Spieler UND Rivale ein Ergebnis haben: Spieler vorne → Rivale +step,
//   Rivale vorne → Rivale −step (Standard 25, im Bot-Labor einstellbar). Grenzen rivalMin…rivalMax.
// - Zählt sofort (auch Matches des laufenden Turniers). Andere Spieler ändern nichts an der Stärke.
// - Stärke wird nicht hochgezählt gespeichert, sondern jedes Mal aus allen Duellen nachgerechnet
//   (korrigierte Ergebnisse stimmen so automatisch).

export type RivalDuel = {
  /** Turnierdatum (Reihenfolge) */
  at: string | null;
  /** Rundennummer (Reihenfolge innerhalb des Turniers) */
  round: number | null;
  tournament: string;
  machine: string | null;
  /** true = Spieler lag vor seinem Rivalen */
  ownerWon: boolean;
  current: boolean;
};

/**
 * Wer liegt vorne? Zuerst nach Platz (kleiner = besser), sonst – solange noch keine Plätze gesetzt sind
 * (z. B. Round the Pinball während der Runde) – nach Score. Gleichstand / fehlende Werte → null (zählt nicht).
 */
export function duelOutcome(
  owner: { position: number | null; score: number | null },
  rival: { position: number | null; score: number | null }
): boolean | null {
  if (owner.position != null && rival.position != null) {
    if (owner.position === rival.position) return null;
    return owner.position < rival.position;
  }
  const a = owner.score != null && owner.score > 0 ? owner.score : null;
  const b = rival.score != null && rival.score > 0 ? rival.score : null;
  if (a == null || b == null || a === b) return null;
  return a > b;
}

/** älteste zuerst */
export function sortDuelsOldestFirst(duels: readonly RivalDuel[]): RivalDuel[] {
  return [...duels].sort(
    (x, y) => String(x.at ?? "").localeCompare(String(y.at ?? "")) || (x.round ?? 0) - (y.round ?? 0)
  );
}

export type RivalStrength = {
  start: number;
  strength: number;
  wins: number;
  losses: number;
  /** Stärke nach jedem Duell (älteste zuerst) – für einen Verlauf */
  path: number[];
};

export function rivalStrength(
  start: number,
  duels: readonly RivalDuel[],
  S: { rivalStep: number; rivalMin: number; rivalMax: number }
): RivalStrength {
  const lo = Math.min(S.rivalMin, S.rivalMax);
  const hi = Math.max(S.rivalMin, S.rivalMax);
  let st = Math.min(hi, Math.max(lo, Math.round(start)));
  let wins = 0;
  let losses = 0;
  const path: number[] = [];
  for (const d of sortDuelsOldestFirst(duels)) {
    if (d.ownerWon) {
      wins++;
      st = Math.min(hi, st + S.rivalStep);
    } else {
      losses++;
      st = Math.max(lo, st - S.rivalStep);
    }
    path.push(st);
  }
  return { start: Math.round(start), strength: st, wins, losses, path };
}
