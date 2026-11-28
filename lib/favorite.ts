// ★ Favorit eines laufenden Matches (Admin + TV + Handy + Sprachansage, gleiche Regel) – reine Logik.
//
// NEU (2026-11-19): eine gemeinsame GEWINNCHANCE statt "Winrate-Punkte, sonst Elo".
// Für jedes Duell (jeder gegen jeden im Match) wird eine Gewinnchance gerechnet:
//   1) Basis Elo (wie im 🧮 Elo-Rechner): Elo-Unterschied
//      + Flipper-Winrate (an diesem Flipper/Location) – zählt umso mehr, je mehr Spiele dahinterstehen
//      + Turnierform (Turnier-Winrate) – leicht gewichtet
//   2) Direkte Bilanz der beiden an DIESEM Flipper (Location): je mehr Duelle, desto stärker ersetzt sie die Basis
//      (höchstens zu 70 %). Wenige Daten → es bleibt fast bei Elo.
//   Gewinnchance eines Spielers = Durchschnitt seiner Duell-Chancen gegen alle anderen im Match.
// Favorit = höchste Gewinnchance mit mindestens FAVORITE_MIN_LEAD Vorsprung auf den Zweiten.
// Platzhalter (Testprofile) können nicht Favorit sein (zählen aber als Gegner); Bots schon.
// 🤖 Duelle gegen Bots (Nutzer 2026-11-28): NUR Elo – Flipper-Winrate, Turnierform und Bilanz zählen nicht
//    (Bots würfeln rein nach Elo; ihre Siege werden nirgends gezählt). Kann später geändert werden.

import { machineKey } from "@/lib/machineStats";

/** Mindestvorsprung der Gewinnchance (0,10 = 10 Prozentpunkte) */
export const FAVORITE_MIN_LEAD = 0.1;
/** Flipper-Winrate: ab so vielen Spielen zählt sie halb (n / (n + K)) */
const MACHINE_K = 15;
/** Gewicht der Flipper-Winrate gegenüber der Elo */
const MACHINE_W = 0.5;
/** Gewicht der Turnierform */
const FORM_W = 0.25;
/** direkte Bilanz: ab so vielen Duellen zählt sie halb; höchstens H2H_MAX */
const H2H_K = 10;
const H2H_MAX = 0.7;

export type FavoriteCandidate = {
  key: string;
  /** Anzeigename (für die Erklärung) */
  name?: string;
  /** players.id – für die direkte Bilanz am Flipper */
  pid?: string;
  /** Turnier-Winrate in % (null = keine) */
  t: number | null;
  /** Flipper-Winrate in % (null = noch nie an diesem Flipper) */
  m: number | null;
  /** Anzahl Spiele hinter der Flipper-Winrate */
  mCount?: number | null;
  /** aktuelle Elo (null = unbekannt) */
  elo: number | null;
  /** Platzhalter/Testprofil → nie Favorit */
  placeholder?: boolean;
  /** 🤖 KI-Bot → Duelle mit ihm nur nach Elo */
  isBot?: boolean;
};

/** direkte Bilanz an diesem Flipper aus Sicht von a: Siege a, Siege b, Duelle */
export type H2hLookup = (
  aPid: string,
  bPid: string
) => { aWins: number; bWins: number; duels: number; fmt?: { aWins: number; bWins: number; duels: number; label?: string } | null } | null;
/** Format-Bilanz: ab so vielen Duellen im Format zählt sie zur Hälfte (n / (n + K)) */
const FMT_K = 10;

export type FavoriteResult = {
  key: string;
  reason: "chance";
  /** Gewinnchance des Favoriten (0..1) */
  chance: number;
  /** Vorsprung auf den Zweiten (0..1) */
  lead: number;
  /** Erklärung für den Mouseover (Zeilen) */
  explain: string[];
};

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Quote (0..1) → Elo-Punkte (logistische Umrechnung wie bei Elo) */
const eloOf = (p: number) => 400 * Math.log10(p / (1 - p));
const chanceOf = (diff: number) => 1 / (1 + Math.pow(10, -diff / 400));
const pct = (p: number) => `${Math.round(p * 100)} %`;
const pct1 = (v: number) => `${Math.round(v * 10) / 10}`.replace(".", ",") + " %";

/** Flipper-Form in Elo-Punkten (geschrumpft nach Datenmenge) */
function machineForm(c: FavoriteCandidate): number {
  if (c.m == null || !Number.isFinite(c.m)) return 0;
  const n = Math.max(0, Number(c.mCount ?? 0));
  if (!n) return 0;
  return (n / (n + MACHINE_K)) * eloOf(clip(c.m / 100, 0.1, 0.9));
}
/** Turnierform in Elo-Punkten (schwach) */
function tournamentForm(c: FavoriteCandidate): number {
  if (c.t == null || !Number.isFinite(c.t)) return 0;
  return FORM_W * eloOf(clip(c.t / 100, 0.25, 0.75));
}

type DuelCalc = {
  chance: number;
  base: number;
  eloDiff: number;
  mPart: number;
  tPart: number;
  /** 🤖 Duell gegen einen Bot → nur Elo */
  botEloOnly?: boolean;
  h2h: {
    w: number;
    l: number;
    n: number;
    weight: number;
    /** Bilanz (geglättet, inkl. Format-Anpassung) */
    chance: number;
    /** nur alle Formate (geglättet) */
    chanceAll: number;
    /** Bilanz im Format des Turniers (falls vorhanden) */
    fmt: { w: number; l: number; n: number; chance: number; share: number; label?: string } | null;
  } | null;
};

function duelCalc(a: FavoriteCandidate, b: FavoriteCandidate, h2h?: H2hLookup): DuelCalc {
  const eloDiff = a.elo != null && b.elo != null ? a.elo - b.elo : 0;
  // 🤖 gegen Bots nur Elo
  if (a.isBot || b.isBot) {
    return { chance: chanceOf(eloDiff), base: eloDiff, eloDiff, mPart: 0, tPart: 0, h2h: null, botEloOnly: true };
  }
  const mPart = MACHINE_W * (machineForm(a) - machineForm(b));
  const tPart = tournamentForm(a) - tournamentForm(b);
  const base = eloDiff + mPart + tPart;
  let diff = base;
  let h: DuelCalc["h2h"] = null;
  const r = h2h && a.pid && b.pid ? h2h(a.pid, b.pid) : null;
  if (r && r.duels > 0) {
    const n = r.aWins + r.bWins;
    if (n > 0) {
      const pAll = (r.aWins + 1) / (n + 2); // geglättet: 0:0 = 50 %
      // Format-Bilanz (z. B. nur Round the Pinball) gleicht an – je mehr Duelle im Format, desto stärker
      let p = pAll;
      let fmt: NonNullable<DuelCalc["h2h"]>["fmt"] = null;
      const f = r.fmt;
      const nf = f ? f.aWins + f.bWins : 0;
      if (f && nf > 0) {
        const pF = (f.aWins + 1) / (nf + 2);
        const share = nf / (nf + FMT_K);
        p = (1 - share) * pAll + share * pF;
        fmt = { w: f.aWins, l: f.bWins, n: nf, chance: pF, share, label: f.label };
      }
      const weight = Math.min(H2H_MAX, n / (n + H2H_K));
      diff = (1 - weight) * base + weight * eloOf(clip(p, 0.05, 0.95));
      h = { w: r.aWins, l: r.bWins, n, weight, chance: p, chanceAll: pAll, fmt };
    }
  }
  return { chance: chanceOf(diff), base, eloDiff, mPart, tPart, h2h: h };
}

/** Aufschlüsselung je Spieler: Gewinnchance (Schnitt seiner Duelle) + Rechnung je Gegner */
export type FavoriteRow = {
  cand: FavoriteCandidate;
  chance: number;
  duels: { opp: FavoriteCandidate; calc: DuelCalc }[];
};
export type { DuelCalc };

/** 📊 Für die Match-Analyse: Zeilen aller Spieler (beste Chance zuerst) + Favorit (oder null) */
export function favoriteBreakdown(
  cands: readonly FavoriteCandidate[],
  opts: { h2h?: H2hLookup } = {}
): { rows: FavoriteRow[]; favoriteKey: string | null; lead: number } {
  const list = [...cands];
  if (list.length < 2) return { rows: [], favoriteKey: null, lead: 0 };
  const rows: FavoriteRow[] = list
    .map((a) => {
      const duels = list.filter((b) => b.key !== a.key).map((b) => ({ opp: b, calc: duelCalc(a, b, opts.h2h) }));
      const chance = duels.reduce((s, x) => s + x.calc.chance, 0) / duels.length;
      return { cand: a, duels, chance };
    })
    .sort((x, y) => y.chance - x.chance);
  const best = rows.find((r) => !r.cand.placeholder);
  if (!best) return { rows, favoriteKey: null, lead: 0 };
  const second = rows.find((r) => r.cand.key !== best.cand.key);
  const lead = best.chance - (second?.chance ?? 0);
  return { rows, favoriteKey: lead >= FAVORITE_MIN_LEAD ? best.cand.key : null, lead };
}

/** Erklärungszeilen der Duelle eines Spielers (Mouseover / Analyse) */
export function duelExplainLines(row: FavoriteRow): string[] {
  const nm = (c: FavoriteCandidate) => c.name ?? "?";
  const out: string[] = [];
  const a = row.cand;
  for (const { opp: b, calc: d } of row.duels) {
    out.push("");
    out.push(`gegen ${nm(b)}: ${pct(d.chance)}`);
    if (a.elo != null && b.elo != null) {
      out.push(`  · Elo ${Math.round(a.elo)} gegen ${Math.round(b.elo)} → allein nach Elo ${pct(chanceOf(d.eloDiff))}`);
    }
    if (d.botEloOnly) {
      out.push(`  · 🤖 gegen Bots zählt nur die Elo (Flipper-Winrate, Turnierform und Bilanz zählen nicht)`);
      continue;
    }
    const ma = a.m != null ? `${pct1(a.m)} (${a.mCount ?? 0} Spiele)` : "—";
    const mb = b.m != null ? `${pct1(b.m)} (${b.mCount ?? 0} Spiele)` : "—";
    out.push(`  · Flipper-Winrate ${ma} gegen ${mb} → ${d.mPart >= 0 ? "+" : "−"}${Math.abs(Math.round(d.mPart))} Elo-Punkte`);
    const ta = a.t != null ? pct1(a.t) : "—";
    const tb = b.t != null ? pct1(b.t) : "—";
    out.push(`  · Turnierform ${ta} gegen ${tb} → ${d.tPart >= 0 ? "+" : "−"}${Math.abs(Math.round(d.tPart))} Elo-Punkte`);
    out.push(
      d.h2h
        ? `  · direkte Bilanz an diesem Flipper ${d.h2h.w} : ${d.h2h.l}${
            d.h2h.fmt ? `, davon ${d.h2h.fmt.label ?? "im Format"} ${d.h2h.fmt.w} : ${d.h2h.fmt.l} (zählt ${Math.round(d.h2h.fmt.share * 100)} %)` : ""
          } → ${pct(d.h2h.chance)} – zählt zu ${Math.round(d.h2h.weight * 100)} %`
        : `  · direkte Bilanz an diesem Flipper: noch keine`
    );
  }
  return out;
}

/** Elo-Chance aus einem Unterschied (für Anzeigen) */
export const eloChance = chanceOf;

export function pickFavorite(cands: readonly FavoriteCandidate[], opts: { h2h?: H2hLookup } = {}): FavoriteResult | null {
  const { rows, favoriteKey, lead } = favoriteBreakdown(cands, opts);
  if (!favoriteKey) return null;
  const best = rows.find((r) => r.cand.key === favoriteKey)!;
  const explain: string[] = [];
  explain.push(
    `★ Favorit: ${best.cand.name ?? "?"} – Gewinnchance ${pct(best.chance)}${rows.length > 2 ? " (Schnitt aller Duelle in diesem Match)" : ""}`
  );
  explain.push(`Vorsprung auf den Nächsten: ${Math.round(lead * 100)} Prozentpunkte`);
  explain.push(...duelExplainLines(best));
  explain.push("");
  explain.push("Je mehr Spiele hinter Flipper-Winrate und Bilanz stehen, desto stärker zählen sie gegenüber der Elo.");
  return { key: best.cand.key, reason: "chance", chance: best.chance, lead, explain };
}

export function favoriteTitle(r: FavoriteResult): string {
  return r.explain.join("\n");
}

/** Bilanz-Abfrage aus den Duell-Daten (/api/public/rivalry → pairMachine) für einen Flipper */
export function h2hFromPairMachine(
  pairMachine: Record<string, Record<string, { xWins: number; yWins: number; duels: number }>> | null | undefined,
  machineName: string | null | undefined,
  /** Format des laufenden Turniers → zusätzlich die Bilanz nur in diesem Format (Feinjustierung) */
  format?: string | null,
  /** Anzeigename des Formats für Erklärungen (z. B. "🎰 Round the Pinball") */
  formatName?: string | null
): H2hLookup | undefined {
  if (!pairMachine || !machineName) return undefined;
  const mk = machineKey(machineName);
  const fk = format ? `${mk}@${String(format).toLowerCase()}` : null;
  return (a, b) => {
    const [x, y] = a < b ? [a, b] : [b, a];
    const byM = pairMachine[`${x}|${y}`];
    const s = byM ? byM[mk] : undefined;
    if (!s) return null;
    const f = fk && byM ? byM[fk] : undefined;
    const side = (v: { xWins: number; yWins: number; duels: number }) =>
      a === x ? { aWins: v.xWins, bWins: v.yWins, duels: v.duels } : { aWins: v.yWins, bWins: v.xWins, duels: v.duels };
    return { ...side(s), fmt: f ? { ...side(f), label: formatName ?? undefined } : null };
  };
}

/** 🧾 Rechenweg eines Duells Schritt für Schritt (mit echten Zahlen) – zum Nachrechnen in der Match-Analyse */
export function duelSteps(a: FavoriteCandidate, b: FavoriteCandidate, h2h?: H2hLookup): string[] {
  const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const n2 = (x: number) => x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nmA = a.name ?? "A";
  const nmB = b.name ?? "B";
  const c = duelCalc(a, b, h2h);
  const out: string[] = [];

  // 1) Elo
  out.push(
    a.elo != null && b.elo != null
      ? `1) Elo-Unterschied: ${n1(a.elo)} − ${n1(b.elo)} = ${n1(c.eloDiff)} Pkt.`
      : `1) Elo-Unterschied: Elo fehlt → 0 Pkt.`
  );
  // 🤖 gegen Bots: nur Elo
  if (c.botEloOnly) {
    out.push(`2) 🤖 Gegen Bots zählen Flipper-Winrate, Turnierform und Bilanz nicht – Bots würfeln rein nach Elo,`);
    out.push(`   und ihre Siege werden nirgends gezählt.`);
    out.push(`3) Chance = 1 / (1 + 10^(−${n1(c.eloDiff)} / 400)) = ${Math.round(c.chance * 1000) / 10} %`.replace(".", ","));
    return out;
  }

  // 2) Flipper-Winrate
  const mLine = (x: FavoriteCandidate, nm: string) => {
    if (x.m == null || !Number.isFinite(x.m) || !Number(x.mCount ?? 0)) return `   ${nm}: keine Flipper-Winrate → 0 Pkt.`;
    const n = Number(x.mCount);
    const p = clip(x.m / 100, 0.1, 0.9);
    const raw = eloOf(p);
    const share = n / (n + MACHINE_K);
    const capped = p !== x.m / 100 ? ` (begrenzt auf ${Math.round(p * 100)} %)` : "";
    return `   ${nm}: ${n1(x.m)} %${capped} → Elo-Wert 400 × log10(${n2(p)} / ${n2(1 - p)}) = ${n1(raw)}; zählt zu ${n} / (${n} + ${MACHINE_K}) = ${Math.round(share * 100)} % → ${n1(raw * share)} Pkt.`;
  };
  out.push(`2) Flipper-Winrate (an diesem Flipper, je mehr Spiele desto mehr):`);
  out.push(mLine(a, nmA));
  out.push(mLine(b, nmB));
  out.push(`   Unterschied × ${String(MACHINE_W).replace(".", ",")} = ${n1(c.mPart)} Pkt.`);

  // 3) Turnierform
  const tLine = (x: FavoriteCandidate, nm: string) => {
    if (x.t == null || !Number.isFinite(x.t)) return `   ${nm}: keine Turnier-Winrate → 0 Pkt.`;
    const p = clip(x.t / 100, 0.25, 0.75);
    const capped = p !== x.t / 100 ? ` (begrenzt auf ${Math.round(p * 100)} %)` : "";
    return `   ${nm}: ${n1(x.t)} %${capped} → ${String(FORM_W).replace(".", ",")} × 400 × log10(${n2(p)} / ${n2(1 - p)}) = ${n1(FORM_W * eloOf(p))} Pkt.`;
  };
  out.push(`3) Turnierform (leicht gewichtet):`);
  out.push(tLine(a, nmA));
  out.push(tLine(b, nmB));
  out.push(`   Unterschied = ${n1(c.tPart)} Pkt.`);

  // 4) Basis
  out.push(`4) Basis = ${n1(c.eloDiff)} + ${n1(c.mPart)} + ${n1(c.tPart)} = ${n1(c.base)} Pkt.`);

  // 5) direkte Bilanz
  let diff = c.base;
  if (c.h2h) {
    const { w, l, n, weight, fmt } = c.h2h;
    const pAll = (w + 1) / (n + 2);
    const p = c.h2h.chance;
    const pc = clip(p, 0.05, 0.95);
    const hElo = eloOf(pc);
    const raw = n / (n + H2H_K);
    diff = (1 - weight) * c.base + weight * hElo;
    out.push(`5) Direkte Bilanz an diesem Flipper ${w} : ${l} (alle Formate):`);
    out.push(`   geglättet (${w} + 1) / (${n} + 2) = ${n2(pAll)}`);
    if (fmt) {
      out.push(
        `   davon ${fmt.label ?? "im Format"} ${fmt.w} : ${fmt.l} → geglättet (${fmt.w} + 1) / (${fmt.n} + 2) = ${n2(fmt.chance)}; zählt zu ${fmt.n} / (${fmt.n} + ${FMT_K}) = ${Math.round(fmt.share * 100)} %`
      );
      out.push(`   angeglichen: ${Math.round((1 - fmt.share) * 100)} % × ${n2(pAll)} + ${Math.round(fmt.share * 100)} % × ${n2(fmt.chance)} = ${n2(p)}`);
    }
    out.push(`   Bilanz ${n2(p)}${pc !== p ? ` (begrenzt auf ${n2(pc)})` : ""} → Elo-Wert 400 × log10(${n2(pc)} / ${n2(1 - pc)}) = ${n1(hElo)} Pkt.`);
    out.push(
      `   Gewicht = ${n} / (${n} + ${H2H_K}) = ${Math.round(raw * 100)} %${raw > H2H_MAX ? ` → höchstens ${Math.round(H2H_MAX * 100)} %` : ""}`
    );
    out.push(
      `   gemischt: ${Math.round((1 - weight) * 100)} % × ${n1(c.base)} + ${Math.round(weight * 100)} % × ${n1(hElo)} = ${n1(diff)} Pkt.`
    );
  } else {
    out.push(`5) Direkte Bilanz an diesem Flipper: noch keine → es bleibt bei ${n1(c.base)} Pkt.`);
  }

  // 6) Chance
  out.push(`6) Chance = 1 / (1 + 10^(−${n1(diff)} / 400)) = ${Math.round(c.chance * 1000) / 10} %`.replace(/(\d)\.(\d)/g, "$1,$2"));
  return out;
}

/** kurzer Mouseover für das Siegchance-Schildchen eines Spielers */
export function chanceShortTitle(row: FavoriteRow, isFavorite: boolean): string {
  const lines: string[] = [];
  lines.push(`Siegchance ${pct(row.chance)}${row.duels.length > 1 ? " (Schnitt seiner Duelle in diesem Match)" : ""}${isFavorite ? " – ★ Favorit" : ""}`);
  for (const { opp, calc } of row.duels) {
    const bits: string[] = [];
    if (row.cand.elo != null && opp.elo != null) bits.push(`nach Elo ${pct(chanceOf(calc.eloDiff))}`);
    if (Math.abs(calc.mPart) >= 1) bits.push(`Flipper-Winrate ${calc.mPart >= 0 ? "+" : "−"}${Math.abs(Math.round(calc.mPart))}`);
    if (Math.abs(calc.tPart) >= 1) bits.push(`Form ${calc.tPart >= 0 ? "+" : "−"}${Math.abs(Math.round(calc.tPart))}`);
    if (calc.h2h) bits.push(`Bilanz hier ${calc.h2h.w} : ${calc.h2h.l}${calc.h2h.fmt ? `, im Format ${calc.h2h.fmt.w} : ${calc.h2h.fmt.l}` : ""}`);
    lines.push(`· gegen ${opp.name ?? "?"}: ${pct(calc.chance)}${bits.length ? ` (${bits.join(", ")})` : ""}`);
  }
  lines.push("Nicht nur Elo: auch Flipper-Winrate, Turnierform und die Bilanz an diesem Flipper zählen.");
  lines.push("Ganze Rechnung: Klick auf den Match-Kopf (📊 Match-Analyse).");
  return lines.join("\n");
}
