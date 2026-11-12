"use client";

// Punktesystem-Anzeigen (Admin):
// - PointsSystemButton: ℹ️-Knopf + Fenster mit Match-, Turnier- und Superfinale-Punkten
// - PointsSchemeLine: kleine Zeile "🎯 4 · 2 · 1 · 0" im Match-Kopf
// - PointsGainBadge: "+4" neben dem Platz eines Spielers
// Regeln aus lib/pointsDisplay.ts (NICHT lib/points.ts – die bleibt vorerst unberührt).

import { useEffect, useState } from "react";
import {
  matchPointsScheme,
  tournamentPointsScheme,
  SUPER_FINAL_TP_BONUS_DISPLAY as SUPER_FINAL_TP_BONUS,
  SUPER_FINAL_START_POINTS,
  SUPER_FINAL_TARGET,
} from "@/lib/pointsDisplay";

export function PointsSchemeLine({ values }: { values: number[] }) {
  if (!values || values.length === 0) return null;
  const shown = values.length <= 9 ? values.join(" · ") : values.slice(0, 9).join(" · ") + " · …";
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700"
      title={"Matchpunkte nach Platz: " + values.map((v, i) => `${i + 1}. = ${v}`).join(", ")}
    >
      🎯 {shown}
    </span>
  );
}

export function PointsGainBadge({ points }: { points: number | null }) {
  if (points == null) return null;
  return (
    <span
      className={
        "inline-flex h-6 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-bold " +
        (points > 0 ? "bg-indigo-600 text-white" : "bg-neutral-200 text-neutral-600")
      }
      title="Matchpunkte für diesen Platz"
    >
      +{points}
    </span>
  );
}

function SchemeTable({ values, unit }: { values: number[]; unit: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v, i) => (
        <div
          key={i}
          className={
            "flex min-w-[3rem] flex-col items-center rounded-lg border px-2 py-1 " +
            (i === 0 ? "border-amber-300 bg-amber-50" : "bg-white")
          }
        >
          <span className="text-[10px] font-medium text-neutral-500">{i + 1}. Platz</span>
          <span className="text-base font-bold tabular-nums">
            {v}
            <span className="ml-0.5 text-[10px] font-medium text-neutral-400">{unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function PointsSystemButton({
  format,
  matchSize,
  nPlayers,
}: {
  format: string | null | undefined;
  matchSize: number | null | undefined;
  nPlayers: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const f = String(format ?? "");
  const n = Number.isFinite(nPlayers) ? nPlayers : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
        title="Wie werden Punkte vergeben?"
      >
        ℹ️ Punktesystem
      </button>

      {open ? (
        <PointsSystemDialog format={f} matchSize={matchSize} nPlayers={n} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function PointsSystemDialog({
  format,
  matchSize,
  nPlayers,
  onClose,
}: {
  format: string;
  matchSize: number | null | undefined;
  nPlayers: number;
  onClose: () => void;
}) {
  // Berechnung nur, wenn das Fenster offen ist
  const mp = matchPointsScheme(format, matchSize, nPlayers);
  const tp = tournamentPointsScheme(nPlayers);

  const matchHint =
    format === "rotation"
      ? `Alle ${nPlayers} Spieler spielen jeden Flipper – Punkte pro Flipper.`
      : format === "dyp_round_robin"
      ? "Teams à 2 Spieler: beide im Sieger- bzw. Verlierer-Team bekommen dieselben Punkte."
      : `Pro Match mit ${mp.length} Spielern. Spielen weniger an einer Maschine, gilt deren Tabelle (2 Spieler: 2 · 0, 3 Spieler: 3 · 1 · 0).`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">ℹ️ Punktesystem</div>
            <div className="text-sm text-neutral-500">für dieses Turnier mit {nPlayers} Spielern</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <section className="mb-5">
          <div className="mb-1 font-semibold">🎯 Matchpunkte</div>
          <div className="mb-2 text-xs text-neutral-500">{matchHint}</div>
          <SchemeTable values={mp} unit="P" />
          <div className="mt-2 text-xs text-neutral-500">Die Summe der Matchpunkte ergibt die Turniertabelle.</div>
        </section>

        <section className="mb-5">
          <div className="mb-1 font-semibold">🏆 Turnierpunkte (Serie)</div>
          <div className="mb-2 text-xs text-neutral-500">
            Nach Turnierende je Endplatz: 1. Platz = N + 2, 2. Platz = N, danach je 1 weniger (N = {nPlayers}). Bei
            Gleichstand wird gemittelt.
          </div>
          {tp.length ? (
            <SchemeTable values={tp} unit="TP" />
          ) : (
            <div className="text-sm text-neutral-400">Noch keine Spieler.</div>
          )}
        </section>

        <section>
          <div className="mb-1 font-semibold">🔥 Superfinale (falls gespielt)</div>
          <div className="text-sm text-neutral-700">
            Die Top 4 starten mit Vorpunkten <b>{SUPER_FINAL_START_POINTS.join(" · ")}</b>. Jeder Spielsieg gibt 1 Punkt
            – wer zuerst <b>{SUPER_FINAL_TARGET}</b> hat, gewinnt.
          </div>
          <div className="mt-1 text-sm text-neutral-700">
            Der Superfinale-Sieger bekommt <b>+{SUPER_FINAL_TP_BONUS} TP</b> 🔥 zusätzlich.
          </div>
        </section>
      </div>
    </div>
  );
}

/** Punkte-Chips für den Kopf des Infobildschirms (neben Format/LIVE, dunkles Design). */
export function PointsSystemTvChips({
  format,
  matchSize,
  nPlayers,
  showSuperFinal,
}: {
  format: string | null | undefined;
  matchSize: number | null | undefined;
  nPlayers: number;
  showSuperFinal: boolean;
}) {
  const n = Number.isFinite(nPlayers) ? nPlayers : 0;
  if (n < 2) return null;
  const mp = matchPointsScheme(format, matchSize, n);
  const tp = tournamentPointsScheme(n);
  const join = (v: number[], max: number) => (v.length <= max ? v.join(" · ") : v.slice(0, max).join(" · ") + " · …");
  const chip = "rounded-full bg-white/10 px-3 py-0.5 text-sm normal-case tracking-normal text-white/80";
  return (
    <>
      <span className={chip}>
        🎯 Match <b className="font-bold text-white">{join(mp, 9)}</b>
      </span>
      <span className={chip}>
        🏆 Turnier <b className="font-bold text-white">{join(tp, 6)}</b>
      </span>
      {showSuperFinal ? (
        <span className={chip}>
          🔥 Superfinale <b className="font-bold text-white">+{SUPER_FINAL_TP_BONUS}</b>
        </span>
      ) : null}
    </>
  );
}
