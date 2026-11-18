// 🏦 Prüfskript für das Elo-Buchungsprinzip (lib/eloLedger.ts) – läuft nur lokal, keine Datenbank.
//
//   node --experimental-strip-types --no-warnings scripts/elo-ledger-check.mjs [Anzahl]
//
// Würfelt viele Abläufe: mehrere Turniere gleichzeitig, Pausen, Score-Korrekturen (Ergebnis ändert sich),
// Löschen laufender Turniere, Superfinale +8, Umstellung eines laufenden Alt-Turniers.
// Nach JEDEM Schritt muss gelten (Probe):
//   Profil = Startwert + Summe der gebuchten Ergebnisse aller (nicht gelöschten) Turniere + Superfinale-Boni
// und jedes Turnier hat genau sein letztes Ergebnis gebucht.

import { book, unbook, initApplied, ZERO } from "../lib/eloLedger.ts";

const RUNS = Number(process.argv[2] ?? 20000);
const EPS = 1e-6;
const KEYS = ["rating", "matches", "provisional"];

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function fail(msg, ctx) {
  console.error("❌ FEHLER:", msg);
  console.error(JSON.stringify(ctx, null, 2));
  process.exit(1);
}

function checkInvariant(state, where) {
  for (const p of state.players) {
    for (const k of KEYS) {
      let expect = state.start[p][k] + state.bonus[p][k];
      for (const t of state.tournaments) {
        if (t.deleted || !t.players.includes(p)) continue;
        expect += t.lastResult[p][k];
        // jedes Turnier hat genau sein letztes Ergebnis gebucht
        if (Math.abs(t.applied[p][k] - t.lastResult[p][k]) > EPS) fail(`gebucht ≠ Ergebnis (${k})`, { where, p, t: t.id });
      }
      if (Math.abs(state.profile[p][k] - expect) > EPS) {
        fail(`Probe stimmt nicht (${k})`, { where, player: p, profile: state.profile[p][k], expect });
      }
    }
  }
}

function newTournament(state, players, legacy = false) {
  const t = {
    id: state.tournaments.length,
    players,
    snapshot: Object.fromEntries(players.map((p) => [p, { ...state.profile[p] }])),
    applied: Object.fromEntries(players.map((p) => [p, legacy ? null : { ...ZERO }])),
    lastResult: Object.fromEntries(players.map((p) => [p, { ...ZERO }])),
    deleted: false,
    finished: false,
  };
  state.tournaments.push(t);
  return t;
}

/** Neuberechnung: neues (zufälliges) Ergebnis vom Foto aus, dann buchen */
function recalc(state, t) {
  for (const p of t.players) {
    const result = { rating: (rnd() - 0.5) * 80, matches: ri(0, 12), provisional: -ri(0, 5) };
    const replayEnd = {
      rating: t.snapshot[p].rating + result.rating,
      matches: t.snapshot[p].matches + result.matches,
      provisional: t.snapshot[p].provisional + result.provisional,
    };
    const r = book(state.profile[p], t.snapshot[p], replayEnd, t.applied[p]);
    state.profile[p] = r.profile;
    t.applied[p] = r.applied;
    t.lastResult[p] = result;
  }
}

function runScenario(n) {
  const players = Array.from({ length: ri(2, 6) }, (_, i) => `P${i}`);
  const state = { players, tournaments: [], profile: {}, start: {}, bonus: {} };
  for (const p of players) {
    state.profile[p] = { rating: ri(1300, 2000) + rnd(), matches: ri(0, 300), provisional: ri(0, 10) };
    state.start[p] = { ...state.profile[p] };
    state.bonus[p] = { ...ZERO };
  }

  // 50 %: wie heute – ein Alt-Turnier läuft schon (absolut gerechnet), dann Umstellung
  if (rnd() < 0.5) {
    const t0 = newTournament(state, players.filter(() => rnd() < 0.8).concat(players[0]).filter((v, i, a) => a.indexOf(v) === i), true);
    for (let i = ri(1, 3); i > 0; i--) recalc(state, t0); // altes Verhalten (applied = null → absolut)
    // Umstellung: schon gebucht = Profil − Foto (gilt, weil t0 bisher das einzige Turnier war)
    for (const p of t0.players) {
      t0.applied[p] = initApplied(state.profile[p], t0.snapshot[p]);
      // Profil = Foto + letztes Ergebnis → applied muss gleich dem letzten Ergebnis sein
      for (const k of KEYS) if (Math.abs(t0.applied[p][k] - t0.lastResult[p][k]) > EPS) fail("Umstellung falsch", { n, p });
    }
    checkInvariant(state, `Szenario ${n}: nach Umstellung`);
  }

  for (let step = 0; step < ri(5, 40); step++) {
    const open = state.tournaments.filter((t) => !t.deleted && !t.finished);
    const r = rnd();
    if (r < 0.2 || !open.length) {
      // neues Turnier mit zufälligen Spielern (Überschneidung erwünscht)
      const ps = players.filter(() => rnd() < 0.7);
      if (ps.length >= 2) newTournament(state, ps);
    } else if (r < 0.7) {
      recalc(state, pick(open)); // Runde fertig / Score korrigiert / nach Pause weiter
    } else if (r < 0.8) {
      // laufendes Turnier löschen → eigener Anteil wird zurückgebucht
      const t = pick(open);
      for (const p of t.players) {
        const u = unbook(state.profile[p], t.applied[p]);
        state.profile[p] = u.profile;
        t.applied[p] = u.applied;
        t.lastResult[p] = { ...ZERO };
      }
      t.deleted = true;
    } else if (r < 0.9) {
      // Superfinale-Sieg: +8 direkt aufs Profil (eigene Buchung, nicht Teil des Turnier-Ergebnisses)
      const p = pick(pick(open).players);
      state.profile[p] = { ...state.profile[p], rating: state.profile[p].rating + 8 };
      state.bonus[p].rating += 8;
    } else {
      pick(open).finished = true; // beendet → rechnet nie mehr
    }
    checkInvariant(state, `Szenario ${n}, Schritt ${step}`);
  }
  return state.tournaments.length;
}

// Beispiel aus der Besprechung (Flo 1900, A und B gleichzeitig) – fest durchgerechnet
function example() {
  let flo = { rating: 1900, matches: 0, provisional: 0 };
  const foto = { ...flo };
  let aApplied = { ...ZERO };
  let bApplied = { ...ZERO };
  const end = (r) => ({ rating: 1900 + r, matches: 0, provisional: 0 });
  ({ profile: flo, applied: aApplied } = book(flo, foto, end(10), aApplied));
  ({ profile: flo, applied: bApplied } = book(flo, foto, end(-5), bApplied));
  ({ profile: flo, applied: aApplied } = book(flo, foto, end(18), aApplied));
  ({ profile: flo, applied: aApplied } = book(flo, foto, end(12), aApplied)); // Score korrigiert
  flo = { ...flo, rating: flo.rating + 8 }; // Superfinale
  ({ profile: flo, applied: bApplied } = unbook(flo, bApplied)); // B gelöscht
  const ok = Math.abs(flo.rating - 1920) < EPS;
  console.log(`${ok ? "✅" : "❌"} Beispiel aus der Besprechung: Flo endet bei ${flo.rating} (erwartet 1920)`);
  if (!ok) process.exit(1);
}

example();
const t0 = Date.now();
let tours = 0;
for (let n = 0; n < RUNS; n++) tours += runScenario(n);
console.log(`✅ ${RUNS.toLocaleString("de-DE")} zufällige Abläufe (${tours.toLocaleString("de-DE")} Turniere) – Probe hat nach jedem Schritt gestimmt (${Date.now() - t0} ms)`);
