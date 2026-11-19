"use client";

// 📊 Match-Analyse (Admin): klappt unter dem Match-Kopf auf (Klick auf den Kopf).
//   1) ⚔️ Bilanz aller Paarungen im Match – Allzeit, an diesem Flipper (alle Formate), an diesem Flipper (nur Format)
//   2) ★ Favoriten-Berechnung für JEDEN Spieler – Gewinnchance je Gegner mit allen Bausteinen (lib/favorite.ts)
// Daten: /api/public/rivalry (geteilt mit den Duell-Badges) + Werte aus der Match-Ansicht.

import { Fragment, useState } from "react";
import { getChanceSnapshot, UPSET_MAX_CHANCE } from "@/lib/chanceSnapshots";
import { useRivalryDataShared } from "@/components/RivalryBadge";
import { formatLabel } from "@/lib/formatLabel";
import { machineKey } from "@/lib/machineStats";
import { pairKey } from "@/lib/rivalryInsights";
import {
  duelSteps,
  eloChance,
  favoriteBreakdown,
  FAVORITE_MIN_LEAD,
  h2hFromPairMachine,
  type FavoriteCandidate,
} from "@/lib/favorite";

const pct = (p: number) => `${Math.round(p * 100)} %`;
const pct1 = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 10) / 10}`.replace(".", ",") + " %");
const signPts = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;

type Bal = { w: number; l: number; d: number; n: number; pct: number | null };
function bal(meWins: number, otherWins: number, duels: number): Bal {
  const d = Math.max(0, duels - meWins - otherWins);
  return { w: meWins, l: otherWins, d, n: duels, pct: duels ? ((meWins + d / 2) / duels) * 100 : null };
}
function side(s: { xWins: number; yWins: number; duels: number } | undefined, meIsX: boolean): Bal | null {
  return s ? bal(meIsX ? s.xWins : s.yWins, meIsX ? s.yWins : s.xWins, s.duels) : null;
}

function BalCell({ b }: { b: Bal | null }) {
  if (!b || !b.n) return <span className="text-neutral-300">—</span>;
  const tone = b.pct == null ? "" : b.pct > 50 ? "text-emerald-600" : b.pct < 50 ? "text-rose-400" : "text-neutral-600";
  return (
    <span className="whitespace-nowrap tabular-nums" title={`${b.n} Duelle: ${b.w} Siege, ${b.l} Niederlagen${b.d ? `, ${b.d} unentschieden` : ""}`}>
      <b className="text-neutral-700">
        {b.w} : {b.l}
      </b>
      {b.d ? <span className="text-neutral-400"> ({b.d} =)</span> : null} <b className={tone}>{Math.round(b.pct ?? 0)} %</b>
    </span>
  );
}

export default function MatchAnalysis({
  code,
  matchId,
  machineName,
  format,
  players,
}: {
  code: string;
  machineName: string | null;
  format: string | null;
  /** Spieler im Match (key = pid = players.id, name, Elo, Winrates wie beim ★ Favorit) */
  players: FavoriteCandidate[];
  /** für den eingefrorenen Stand vor dem Match (🧊 Favoritensturz) */
  matchId?: string | null;
}) {
  const riv = useRivalryDataShared(code);
  // 🧾 aufgeklappte Rechenwege (Schlüssel "Spieler|Gegner")
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  // 🧊 Probe: wer würde bei einem Sieg einen Favoritensturz auslösen? (Grenze nur zum Ausprobieren, ändert nichts)
  const [upsetProbe, setUpsetProbe] = useState(false);
  const [probeLimit, setProbeLimit] = useState(Math.round(UPSET_MAX_CHANCE * 100));
  const mk = machineKey(machineName);
  const fmtKey = String(format ?? "").toLowerCase();
  const list = players.filter((p) => p.pid);

  if (list.length < 2) {
    return <div className="px-3 py-2 text-xs text-neutral-500">Für die Analyse braucht es mindestens 2 Spieler im Match.</div>;
  }

  // 1) alle Paarungen
  const pairs: { a: FavoriteCandidate; b: FavoriteCandidate }[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairs.push({ a: list[i], b: list[j] });

  // 2) Favoriten-Berechnung
  const h2h = h2hFromPairMachine(riv.pairMachine, machineName);
  const { rows, favoriteKey, lead } = favoriteBreakdown(list, { h2h });

  const th = "px-2 py-1 text-left font-normal text-neutral-400";
  const td = "px-2 py-1 align-top";

  return (
    <div className="space-y-3 border-b bg-[#fffaf3] px-3 py-3 text-xs text-neutral-700 sm:px-4">
      {/* ── 1) Bilanz aller Paarungen ─────────────────────────────── */}
      <section>
        <div className="mb-1 font-semibold text-neutral-800">⚔️ Bilanz aller Paarungen in diesem Match</div>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full tabular-nums">
            <thead>
              <tr className="border-b border-neutral-100 align-bottom">
                <th className={th}>Paarung</th>
                <th className={th}>
                  Allzeit
                  <span className="block text-[10px] leading-tight">alle Matches</span>
                </th>
                <th className={th}>
                  {machineName ?? "Flipper"}
                  <span className="block text-[10px] leading-tight">alle Formate</span>
                </th>
                {fmtKey ? (
                  <th className={th}>
                    {machineName ?? "Flipper"}
                    <span className="block text-[10px] leading-tight">nur {formatLabel(fmtKey)}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {pairs.map(({ a, b }) => {
                const key = pairKey(a.pid!, b.pid!);
                const aIsX = a.pid! < b.pid!;
                return (
                  <tr key={key} className="border-b border-neutral-100 last:border-0">
                    <td className={td}>
                      <b>{a.name}</b> <span className="text-neutral-400">gegen</span> <b>{b.name}</b>
                    </td>
                    <td className={td}>
                      <BalCell b={side(riv.pairs[key], aIsX)} />
                    </td>
                    <td className={td}>
                      <BalCell b={side(riv.pairMachine?.[key]?.[mk], aIsX)} />
                    </td>
                    {fmtKey ? (
                      <td className={td}>
                        <BalCell b={side(riv.pairMachine?.[key]?.[`${mk}@${fmtKey}`], aIsX)} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-1 text-[10px] text-neutral-400">
          Sicht des zuerst genannten Spielers (Siege : Niederlagen). Ein Duell = im selben Spiel den besseren Platz; ein 4er-Spiel
          zählt für jedes Paar.
        </div>
      </section>

      {/* ── 2) Favoriten-Berechnung ───────────────────────────────── */}
      <section>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 font-semibold text-neutral-800">
          <span>★ Favoriten-Berechnung</span>
          <span className="text-[11px] font-normal text-neutral-500">
            {favoriteKey
              ? `Favorit: ${rows.find((r) => r.cand.key === favoriteKey)?.cand.name} (${Math.round(lead * 100)} Prozentpunkte Vorsprung)`
              : `kein Favorit – Vorsprung unter ${Math.round(FAVORITE_MIN_LEAD * 100)} Prozentpunkten`}
          </span>
          <button
            type="button"
            onClick={() => setUpsetProbe((v) => !v)}
            className={
              "ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 " +
              (upsetProbe ? "bg-cyan-600 text-white ring-cyan-600" : "bg-white text-cyan-700 ring-cyan-300 hover:bg-cyan-50")
            }
            title="Markiert, wer bei einem Sieg gegen den Favoriten die 🧊 Favoritensturz-Meldung bekäme"
          >
            🧊 Wer löst einen Favoritensturz aus?
          </button>
        </div>
        {upsetProbe ? (() => {
          // eingefrorener Stand vor dem Match (wie die echte Meldung) – sonst der aktuelle
          const snap = matchId ? getChanceSnapshot(code, String(matchId)) : null;
          const favK = snap ? snap.favoriteKey : favoriteKey;
          const chanceOfP = (k: string) => (snap ? snap.chances[k] : rows.find((r) => r.cand.key === k)?.chance);
          const limit = probeLimit / 100;
          const hits = rows.filter((r) => favK && r.cand.key !== favK && (chanceOfP(r.cand.key) ?? 1) <= limit);
          return (
            <div className="mb-2 rounded-lg bg-cyan-50 p-2 text-[11px] text-cyan-900 ring-1 ring-cyan-200">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Grenze zum Ausprobieren: <b>{probeLimit} %</b>
                  {probeLimit !== Math.round(UPSET_MAX_CHANCE * 100) ? ` (eingestellt sind ${Math.round(UPSET_MAX_CHANCE * 100)} %)` : " (eingestellt)"}
                </span>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={probeLimit}
                  onChange={(e) => setProbeLimit(Number(e.target.value))}
                  className="w-40 accent-cyan-600"
                />
              </div>
              <div className="mt-1">
                {!favK
                  ? "Kein ★ Favorit in diesem Match → es gibt keinen Favoritensturz."
                  : hits.length
                  ? `Bei einem Sieg gegen ${rows.find((r) => r.cand.key === favK)?.cand.name ?? "den Favoriten"} käme die Meldung für: ${hits
                      .map((r) => `${r.cand.name} (${pct(chanceOfP(r.cand.key) ?? 0)})`)
                      .join(", ")}`
                  : `Niemand hat höchstens ${probeLimit} % Siegchance → bei dieser Grenze käme keine Meldung.`}
              </div>
              <div className="mt-0.5 text-[10px] text-cyan-800/70">
                {snap ? "Grundlage: eingefrorener Stand vor dem Match (wie bei der echten Meldung)." : "Grundlage: aktueller Stand (das Match ist noch unberührt)."} Der
                Regler ändert nur diese Anzeige, nicht die echte Grenze.
              </div>
            </div>
          );
        })() : null}
        <div className="space-y-2">
          {rows.map((r) => {
            const isFav = r.cand.key === favoriteKey;
            // 🧊 Probe-Markierung (siehe Knopf oben)
            const snapP = upsetProbe && matchId ? getChanceSnapshot(code, String(matchId)) : null;
            const favP = snapP ? snapP.favoriteKey : favoriteKey;
            const chP = snapP ? snapP.chances[r.cand.key] : r.chance;
            const wouldUpset = upsetProbe && !!favP && r.cand.key !== favP && chP != null && chP <= probeLimit / 100;
            return (
              <div
                key={r.cand.key}
                className={
                  "rounded-lg border bg-white p-2 " +
                  (wouldUpset ? "border-cyan-400 ring-2 ring-cyan-300" : isFav ? "border-amber-300 ring-1 ring-amber-200" : "border-neutral-200")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm text-neutral-800">{r.cand.name}</b>
                  {wouldUpset ? (
                    <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      🧊 Sieg = Favoritensturz ({pct(chP ?? 0)} ≤ {probeLimit} %)
                    </span>
                  ) : upsetProbe && favP && r.cand.key !== favP ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
                      keine Meldung ({pct(chP ?? 0)} &gt; {probeLimit} %)
                    </span>
                  ) : null}
                  {isFav ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-300">★ Favorit</span>
                  ) : null}
                  {r.cand.placeholder ? <span className="text-[10px] text-neutral-400">(Platzhalter – kann nicht Favorit sein)</span> : null}
                  <span className="ml-auto flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200">
                      <span className="block h-full bg-emerald-500" style={{ width: `${r.chance * 100}%` }} />
                    </span>
                    <b className="tabular-nums">{pct(r.chance)}</b>
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-neutral-500">
                  Elo {r.cand.elo != null ? Math.round(r.cand.elo) : "—"} · Flipper-Winrate {pct1(r.cand.m)}
                  {r.cand.m != null ? ` (${r.cand.mCount ?? 0} Spiele)` : ""} · Turnierform {pct1(r.cand.t)}
                  {list.length > 2 ? " · Gewinnchance = Schnitt der Duelle unten" : ""}
                </div>
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full tabular-nums">
                    <thead>
                      <tr className="border-b border-neutral-100 align-bottom">
                        <th className={th}>gegen</th>
                        <th className={th}>nach Elo</th>
                        <th className={th}>Flipper-Winrate</th>
                        <th className={th}>Turnierform</th>
                        <th className={th}>Bilanz am Flipper</th>
                        <th className={th + " text-right"}>ergibt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.duels.map(({ opp, calc }) => {
                        const sk = `${r.cand.key}|${opp.key}`;
                        const open = !!steps[sk];
                        return (
                        <Fragment key={opp.key}>
                        <tr className="border-b border-neutral-100 last:border-0">
                          <td className={td}>
                            {opp.name}
                            <button
                              type="button"
                              onClick={() => setSteps((prev) => ({ ...prev, [sk]: !prev[sk] }))}
                              className="ml-1.5 whitespace-nowrap rounded px-1 text-[10px] text-indigo-600 hover:bg-indigo-50"
                              title="Rechnung Schritt für Schritt anzeigen"
                            >
                              {open ? "▾" : "▸"} Rechenweg
                            </button>
                          </td>
                          <td className={td}>
                            {r.cand.elo != null && opp.elo != null ? (
                              <>
                                {pct(eloChance(calc.eloDiff))}
                                <span className="text-neutral-400"> ({signPts(calc.eloDiff)})</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={td}>
                            {signPts(calc.mPart)} <span className="text-neutral-400">Pkt.</span>
                          </td>
                          <td className={td}>
                            {signPts(calc.tPart)} <span className="text-neutral-400">Pkt.</span>
                          </td>
                          <td className={td}>
                            {calc.h2h ? (
                              <>
                                {calc.h2h.w} : {calc.h2h.l}
                                <span className="text-neutral-400">
                                  {" "}
                                  → {pct(calc.h2h.chance)}, zählt {Math.round(calc.h2h.weight * 100)} %
                                </span>
                              </>
                            ) : (
                              <span className="text-neutral-300">noch keine</span>
                            )}
                          </td>
                          <td className={td + " text-right font-bold " + (calc.chance > 0.5 ? "text-emerald-600" : calc.chance < 0.5 ? "text-rose-400" : "")}>
                            {pct(calc.chance)}
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-b border-neutral-100 last:border-0">
                            <td colSpan={6} className="px-2 pb-2">
                              <div className="whitespace-pre-wrap rounded-md bg-neutral-50 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-neutral-600 ring-1 ring-neutral-200">
                                {[`${r.cand.name} gegen ${opp.name}`, ...duelSteps(r.cand, opp, h2h)].join("\n")}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 rounded-lg bg-white p-2 text-[10px] leading-snug text-neutral-500 ring-1 ring-neutral-200">
          <b className="text-neutral-600">So wird gerechnet:</b> Basis ist der Elo-Unterschied (wie im 🧮 Elo-Rechner). Dazu kommen
          Flipper-Winrate (halb gewichtet, zählt umso mehr, je mehr Spiele dahinterstehen) und Turnierform (leicht) – angegeben in
          Elo-Punkten. Die direkte Bilanz der beiden an diesem Flipper ersetzt diese Basis teilweise: je mehr Duelle, desto mehr
          (höchstens 70 %). Daraus ergibt sich die Chance je Duell; bei mehr als 2 Spielern ist die Gewinnchance der Schnitt aller
          Duelle. Favorit = höchste Gewinnchance mit mindestens {Math.round(FAVORITE_MIN_LEAD * 100)} Prozentpunkten Vorsprung
          (Platzhalter nie).
        </div>
      </section>
    </div>
  );
}
