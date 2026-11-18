// 🧮 Elo-Rechner – reine Logik, GLEICHE Regeln wie app/api/tournaments/recalc-elo (Standard-Duell):
//   Erwartung  E = 1 / (1 + 10^((Gegner − Ich) / 400))
//   K-Faktor   32 solange Neuling (provisional_matches > 0) · 24 unter 30 Spielen · sonst 16
//   Änderung   K × Gewicht × (Ergebnis − E)   (Ergebnis: Sieg 1 · Unentschieden 0,5 · Niederlage 0)
//   Neuling-Schutz: gegen einen Neuling zählt das Duell nur halb (Gewicht 0,5)
// Ein 4er-Spiel = 3 solche Duelle (jeder gegen jeden), bei Round the Pinball je Flipper.
// ⚠️ Ändert sich die Rechnung in recalc-elo, hier mit anpassen.

export type EloPlayer = { rating: number; matchesPlayed: number; provisional: number };

export function expectedScore(me: number, other: number): number {
  return 1 / (1 + Math.pow(10, (other - me) / 400));
}

export function kFactor(p: EloPlayer): { k: number; why: string } {
  if (p.provisional > 0) return { k: 32, why: `Neuling (noch ${p.provisional} Neulingsspiele)` };
  if (p.matchesPlayed < 30) return { k: 24, why: `weniger als 30 Spiele (${p.matchesPlayed})` };
  return { k: 16, why: `etabliert (${p.matchesPlayed} Spiele)` };
}

export type DuelSide = {
  expected: number;
  k: number;
  kWhy: string;
  /** 0,5 wenn der Gegner Neuling ist (Neuling-Schutz), sonst 1 */
  weight: number;
  win: number;
  draw: number;
  loss: number;
};

/** Ein Duell aus Sicht von A und B */
export function duel(a: EloPlayer, b: EloPlayer): { a: DuelSide; b: DuelSide } {
  const side = (me: EloPlayer, other: EloPlayer): DuelSide => {
    const expected = expectedScore(me.rating, other.rating);
    const { k, why } = kFactor(me);
    const weight = other.provisional > 0 ? 0.5 : 1;
    const d = (score: number) => k * weight * (score - expected);
    return { expected, k, kWhy: why, weight, win: d(1), draw: d(0.5), loss: d(0) };
  };
  return { a: side(a, b), b: side(b, a) };
}
