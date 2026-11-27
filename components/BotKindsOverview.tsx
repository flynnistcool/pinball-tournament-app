"use client";

// 📖 Übersicht aller Bot-Arten: wie sie spielen, woraus sie würfeln, mit den aktuell gespeicherten Zahlen
// aus dem Bot-Labor – und welche Bots es von jeder Art gibt. Genutzt im Bot-Labor (Admin-Tab) und als
// Fenster im Spieler-Tab (neben „Bot-Art“). Rechnungen: lib/botScore.ts, botMirror, botRival, botChampion, botSpecialist.

import { useState } from "react";
import type { BotSettings } from "@/lib/botScore";

export type OverviewBot = { name: string; rating: number | null; kind: string | null; owner?: string | null };

const pct = (v: number) => `${Math.round(v * 100)} %`;
const mid = (lo: number, hi: number) => `${Math.round(hi - lo)} %`;

type Row = { kind: string; icon: string; name: string; plays: string; basis: (S: BotSettings) => string; owner?: boolean };

const ROWS: Row[] = [
  {
    kind: "fixed",
    icon: "🤖",
    name: "Feste Elo",
    plays: "wie ein typischer Spieler seiner Elo",
    basis: (S) =>
      `Scores von Spielern mit ähnlicher Elo am Flipper (±${S.eloWindows.join(" → ±")}); Bereich mittlere ${mid(S.rangeLowPct, S.rangeHighPct)}, ${pct(S.outlierChance)} Ausreißer bis ${pct(S.outlierMax)}`,
  },
  {
    kind: "gambler",
    icon: "🔴",
    name: "Gambler",
    plays: "sehr wechselhaft – mal Pech, mal Wahnsinn",
    basis: (S) =>
      `wie feste Elo, aber mittlere ${mid(S.gambler.rangeLowPct, S.gambler.rangeHighPct)}, ${pct(S.gambler.outlierChance)} Ausreißer bis ${pct(S.gambler.outlierMax)}`,
  },
  {
    kind: "pro",
    icon: "🟣",
    name: "Pro",
    plays: "sehr konstant, kaum Überraschungen",
    basis: (S) =>
      `wie feste Elo, aber mittlere ${mid(S.pro.rangeLowPct, S.pro.rangeHighPct)}, ${pct(S.pro.outlierChance)} Ausreißer bis ${pct(S.pro.outlierMax)}`,
  },
  {
    kind: "champion",
    icon: "👑",
    name: "Champion",
    plays: "wie die Besten – unabhängig von der Elo",
    basis: (S) =>
      `zwischen den ${Math.round(S.champion.rangeLowPct)} % und ${Math.round(S.champion.rangeHighPct)} % besten aller echten Scores am Flipper; ${pct(S.champion.outlierChance)} Ausreißer bis ${pct(S.champion.outlierMax)}`,
  },
  {
    kind: "specialist",
    icon: "🟠",
    name: "Specialist",
    plays: "an seinen Lieblingsflippern deutlich stärker",
    basis: (S) =>
      `je Turnier ${S.specialistFavs} Lieblinge aus den aktiven Flippern (bis 4 Flipper: 1), dort +${S.specialistBonus} Elo; sonst wie feste Elo`,
  },
  {
    kind: "character",
    icon: "🎭",
    name: "Charakter",
    plays: "wie ein Mensch: Lieblings- und Angstflipper",
    basis: (S) =>
      `je Turnier ${S.characterFavs} Lieblinge (+${S.characterBonus} Elo) und ${S.characterFlops} Angstflipper (−${S.characterMalus} Elo); bei 4–6 Flippern je 1, bis 3 nur 1 Liebling`,
  },
  {
    kind: "ghost",
    icon: "👻",
    name: "Ghost",
    plays: "wie ein bestimmter Spieler",
    basis: () => "alle Scores des Spielers am Flipper (seine mittleren Scores + Ausreißer); unter 3 Scores wie feste Elo mit seiner Elo",
    owner: true,
  },
  {
    kind: "form",
    icon: "⚡",
    name: "Form",
    plays: "die aktuelle Form eines Spielers",
    basis: (S) =>
      `Durchschnitt seiner letzten 2 Scores am Flipper (auch von heute) ±${pct(S.formSpreadPct)}; ohne Score wie feste Elo mit seiner Elo`,
    owner: true,
  },
  {
    kind: "rival",
    icon: "🥊",
    name: "Rivale",
    plays: "wächst mit seinem Spieler mit",
    basis: (S) =>
      `startet mit der Elo des Spielers; nach jedem direkten Duell ±${S.rivalStep} (Spieler vorne → stärker), Grenzen ${S.rivalMin}–${S.rivalMax}; zählt sofort`,
    owner: true,
  },
];

/** Zusatz hinter dem Namen: Spieler und/oder Elo */
function botDetail(kind: string, b: OverviewBot): string {
  const elo = b.rating != null ? String(Math.round(b.rating)) : null;
  if (kind === "champion") return "";
  if (kind === "ghost" || kind === "form") return b.owner ? ` (${b.owner})` : "";
  if (kind === "rival") return ` (${[b.owner, elo].filter(Boolean).join(", ")})`;
  return elo ? ` (${elo})` : "";
}

export function BotKindsTable({ settings, bots }: { settings: BotSettings; bots: readonly OverviewBot[] }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-xs text-neutral-500">
              <th className="py-1.5 pr-2">Bot-Art</th>
              <th className="py-1.5 pr-2">So spielt er</th>
              <th className="py-1.5 pr-2">Grundlage</th>
              <th className="py-1.5 pr-2">Deine Bots</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const mine = bots.filter((b) => (b.kind || "fixed") === r.kind);
              return (
                <tr key={r.kind} className="border-t align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 font-semibold">
                    {r.icon} {r.name}
                  </td>
                  <td className="py-1.5 pr-2">{r.plays}</td>
                  <td className="py-1.5 pr-2 text-neutral-600">{r.basis(settings)}</td>
                  <td className="py-1.5 pr-2">
                    {mine.length ? (
                      mine.map((b, i) => (
                        <span key={i} className="mr-2 inline-block whitespace-nowrap">
                          {b.name}
                          <span className="text-neutral-400">{botDetail(r.kind, b)}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-neutral-400">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-neutral-500">
        Für alle Bots gilt: Spiele gegen Bots ändern die Elo der Menschen nicht, Bot-Scores zählen nicht in Rekorden/Statistiken,
        Bots spielen nicht in Timeplay, DYP und Elimination. Zahlen = gespeicherte Werte aus dem Bot-Labor.
      </div>
    </div>
  );
}

/** zuklappbare Karte (Bot-Labor) */
export default function BotKindsOverview({ settings, bots }: { settings: BotSettings; bots: readonly OverviewBot[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="font-semibold">📖 Bot-Arten im Überblick</span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="border-t px-4 py-3">
          <BotKindsTable settings={settings} bots={bots} />
        </div>
      ) : null}
    </div>
  );
}

/** Link + Fenster (Spieler-Tab, neben „Bot-Art“) */
export function BotKindsOverviewLink({ settings, bots }: { settings: BotSettings; bots: readonly OverviewBot[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-violet-700 underline-offset-2 hover:underline">
        📖 Alle Bot-Arten erklärt
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">📖 Bot-Arten im Überblick</div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-2 py-1 text-sm hover:bg-neutral-100">
                ✕
              </button>
            </div>
            <BotKindsTable settings={settings} bots={bots} />
          </div>
        </div>
      ) : null}
    </>
  );
}
