// 🏦 Elo-Buchungsprinzip für gleichzeitige Turniere – reine Logik (keine Datenbank).
//
// Jedes Turnier merkt sich je Spieler, wie viel es schon ins Profil "gebucht" hat (applied).
// Bei jeder Neuberechnung: Ergebnis = Nachspiel-Endstand − Foto; Buchung = Ergebnis − applied;
// Profil += Buchung; applied = Ergebnis. So überschreibt kein Turnier ein anderes.
//
// Dieselbe Rechnung macht die Datenbank-Funktion (supabase_elo_parallel.sql) in EINEM Schritt
// (Zeilensperre → zwei Turniere, die gleichzeitig rechnen, können sich nichts wegnehmen).
// Hier steht sie nur, damit sie mit scripts/elo-ledger-check.mjs geprüft werden kann.
//
// applied = null → Altbestand (vor der Umstellung): wie bisher absolut setzen, danach applied merken.
// Neuling-Zähler wird bewusst NICHT bei 0 abgeschnitten (sonst stimmt die Rückbuchung nicht); ≤ 0 = kein Neuling.

export type EloValues = { rating: number; matches: number; provisional: number };

/** Foto zu Turnierbeginn (tournament_ratings.rating_before / matches_before / provisional_before) */
export type EloSnapshot = EloValues;

export const ZERO: EloValues = { rating: 0, matches: 0, provisional: 0 };

const sub = (a: EloValues, b: EloValues): EloValues => ({
  rating: a.rating - b.rating,
  matches: a.matches - b.matches,
  provisional: a.provisional - b.provisional,
});
const add = (a: EloValues, b: EloValues): EloValues => ({
  rating: a.rating + b.rating,
  matches: a.matches + b.matches,
  provisional: a.provisional + b.provisional,
});

/**
 * Eine Buchung: neuer Profilstand + neues "schon gebucht".
 * @param profile   aktueller Stand im Profil
 * @param snapshot  Foto dieses Turniers
 * @param replayEnd Endstand aus dem Nachspielen dieses Turniers (vom Foto aus)
 * @param applied   bisher gebucht (null = Altbestand)
 */
export function book(
  profile: EloValues,
  snapshot: EloSnapshot,
  replayEnd: EloValues,
  applied: EloValues | null
): { profile: EloValues; applied: EloValues } {
  const result = sub(replayEnd, snapshot);
  if (applied == null) {
    // Altbestand: wie bisher absolut (nur einmal, danach gilt das Buchungsprinzip)
    return { profile: { ...replayEnd }, applied: result };
  }
  return { profile: add(profile, sub(result, applied)), applied: result };
}

/** Turnier ohne Ergebnis (gelöscht / keine Elo-Runden mehr): eigenen Anteil komplett zurückbuchen */
export function unbook(profile: EloValues, applied: EloValues | null): { profile: EloValues; applied: EloValues } {
  if (applied == null) return { profile, applied: ZERO }; // Altbestand: Aufrufer setzt wie bisher aufs Foto
  return { profile: sub(profile, applied), applied: ZERO };
}

/** Umstellung für ein Turnier, das als einziges läuft: schon gebucht = Profil − Foto */
export function initApplied(profile: EloValues, snapshot: EloSnapshot): EloValues {
  return sub(profile, snapshot);
}
