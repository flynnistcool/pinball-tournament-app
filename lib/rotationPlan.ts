// 🎰 Round the Pinball: Planung "Anzahl Flipper" (reine Logik, genutzt vom Fenster vor dem Erzeugen + rounds/create).
//
// Ablauf siehe lib/rotationTurn.ts: Stufe für Stufe (erst alle Startpositionen 1, dann 2 …),
// in jeder Welle hat jeder Spieler genau einen Flipper (zufällig gewählt).
// Bei M Flippern und P Spielern hat in jeder Stufe jeder Spieler M/P Flipper.
// Glatt läuft es, wenn das aufgeht (Flipper = Vielfaches der Spielerzahl): dann spielen in jedem
// Durchgang alle gleichzeitig. Sonst gibt es je Stufe einen letzten Durchgang, in dem nur
// (M mod P) Spieler spielen und die anderen warten.

export type RotationPlan = {
  players: number;
  machines: number;
  /** Durchgänge insgesamt (Wellen über alle Stufen) */
  turns: number;
  smooth: boolean;
  /** so viele Spieler spielen im "Rest-Durchgang" je Stufe (0 = keiner) */
  restMachines: number;
  /** so viele Spieler warten in jedem Rest-Durchgang */
  waitingPerTurn: number;
  /** Anzahl Rest-Durchgänge (= Spielerzahl, einer je Stufe) */
  restTurns: number;
};

export function rotationPlan(players: number, machines: number): RotationPlan {
  const p = Math.max(0, Math.floor(players));
  const m = Math.max(0, Math.floor(machines));
  const rest = p > 0 && m % p !== 0 ? m % p : 0;
  return {
    players: p,
    machines: m,
    turns: p > 0 ? p * Math.ceil(m / p) : 0,
    smooth: p > 0 && m > 0 && rest === 0,
    restMachines: rest,
    waitingPerTurn: rest ? p - rest : 0,
    restTurns: rest ? p : 0,
  };
}

/** Flipper-Anzahlen, mit denen es glatt läuft (Vielfache der Spielerzahl bis maxMachines) */
export function smoothMachineCounts(players: number, maxMachines: number): number[] {
  const out: number[] = [];
  if (players < 1) return out;
  for (let n = players; n <= maxMachines; n += players) out.push(n);
  return out;
}

/**
 * Startreihenfolge für den i-ten Flipper (0-basiert): zyklisch um (i mod P) verschoben – wie früher.
 * So steht jeder Spieler je Startposition gleich oft (bzw. höchstens einmal mehr) an einem Flipper.
 */
export function rotationStartOrder<T>(baseOrder: readonly T[], machineIndex: number): T[] {
  const n = baseOrder.length;
  if (!n) return [];
  const shift = machineIndex % n;
  return baseOrder.slice(shift).concat(baseOrder.slice(0, shift));
}
