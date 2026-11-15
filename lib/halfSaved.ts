// 🧩 "Halb gespeichert" erkennen: Handy/Tablet speichern ein Match Spieler für Spieler nacheinander
// (Score A, Score B, Platz A, Platz B …). Erwischt das Admin-Nachladen genau diesen Moment, hat nur
// ein Teil der Spieler schon einen Platz. Dann soll das Tablet kurz danach noch einmal laden.
//
// Nur Formate mit Plätzen pro Match (Matchplay, Swiss, Round Robin, DYP, Elimination).
// Round the Pinball (rotation) und Timeplay sind ausgenommen – dort sind fehlende Plätze normal.

type RoundLike = { id?: unknown; format?: unknown };
type MatchLike = { id?: unknown; round_id?: unknown };
type MatchPlayerLike = { match_id?: unknown; position?: unknown; score?: unknown };

export type HalfSavedInput = {
  tournament?: { format?: unknown } | null;
  rounds?: RoundLike[] | null;
  matches?: MatchLike[] | null;
  match_players?: MatchPlayerLike[] | null;
};

const SKIP_FORMATS = new Set(["rotation", "timeplay"]);

const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "";

/**
 * Halb gespeicherte Matches. Halb gespeichert heißt:
 *  a) manche Spieler haben schon einen Platz, andere noch nicht, ODER
 *  b) alle Spieler haben einen Score, aber noch nicht alle einen Platz
 *     (Handy speichert erst alle Scores, danach die Plätze).
 * Rückgabe: je Match ein Schlüssel "matchId:Plätze:Scores" – ändert sich, sobald etwas Neues ankommt.
 */
export function findHalfSavedMatches(data: HalfSavedInput | null | undefined): string[] {
  if (!data) return [];
  const tFormat = String(data.tournament?.format ?? "");
  const roundFormat = new Map<string, string>();
  for (const r of data.rounds ?? []) roundFormat.set(String(r.id), String(r.format ?? "") || tFormat);

  const matchFormat = new Map<string, string>();
  for (const m of data.matches ?? []) matchFormat.set(String(m.id), roundFormat.get(String(m.round_id)) ?? tFormat);

  const counts = new Map<string, { withPos: number; withScore: number; total: number }>();
  for (const mp of data.match_players ?? []) {
    const id = String(mp.match_id);
    const c = counts.get(id) ?? { withPos: 0, withScore: 0, total: 0 };
    c.total += 1;
    if (hasValue(mp.position)) c.withPos += 1;
    if (hasValue(mp.score)) c.withScore += 1;
    counts.set(id, c);
  }

  const out: string[] = [];
  counts.forEach((c, id) => {
    const f = matchFormat.get(id) ?? tFormat;
    if (SKIP_FORMATS.has(f)) return;
    if (c.total < 2 || c.withPos === c.total) return; // vollständig
    const somePlaced = c.withPos > 0; // a)
    const allScored = c.withScore === c.total; // b)
    if (somePlaced || allScored) out.push(`${id}:${c.withPos}:${c.withScore}`);
  });
  return out;
}
