"use client";

// 🎰 Round the Pinball: Fenster vor dem Erzeugen der Runden – "Anzahl Flipper" wählen.
// Standard = Spielerzahl (wie früher). Mehr Flipper → je Welle ein zufälliger Flipper pro Spieler
// (lib/rotationTurn.ts). Läuft es nicht glatt (manche müssen warten), wird vor dem Erzeugen nachgefragt.

import { useEffect, useState } from "react";
import { rotationPlan, smoothMachineCounts } from "@/lib/rotationPlan";

export default function RotationRoundsDialog({
  open,
  players,
  maxMachines,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  players: number;
  maxMachines: number;
  busy?: boolean;
  onConfirm: (machineCount: number) => void;
  onCancel: () => void;
}) {
  const initial = Math.max(1, Math.min(players || 1, maxMachines || 1));
  const [count, setCount] = useState(initial);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setCount(initial);
      setConfirming(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const plan = rotationPlan(players, count);
  const smoothCounts = smoothMachineCounts(players, maxMachines);

  const change = (n: number) => {
    setCount(Math.max(1, Math.min(maxMachines, n)));
    setConfirming(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-lg font-semibold">🎰 Round the Pinball – Runden erzeugen</div>
        <div className="mb-4 text-sm text-neutral-500">
          {players} Spieler · {maxMachines} aktive Flipper
        </div>

        <div className="mb-1 text-sm font-semibold">Anzahl Flipper</div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => change(count - 1)}
            disabled={count <= 1 || busy}
            className="h-11 w-11 rounded-xl bg-neutral-100 text-xl font-bold disabled:opacity-30"
            aria-label="weniger Flipper"
          >
            −
          </button>
          <div className="w-14 text-center text-3xl font-black tabular-nums">{count}</div>
          <button
            type="button"
            onClick={() => change(count + 1)}
            disabled={count >= maxMachines || busy}
            className="h-11 w-11 rounded-xl bg-neutral-100 text-xl font-bold disabled:opacity-30"
            aria-label="mehr Flipper"
          >
            +
          </button>
          <div className="text-xs text-neutral-500">
            {plan.turns} Durchgänge
          </div>
        </div>

        {smoothCounts.length > 1 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            <span>läuft glatt mit:</span>
            {smoothCounts.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => change(n)}
                className={
                  "rounded-full px-2 py-0.5 font-semibold ring-1 " +
                  (n === count ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-emerald-700 ring-emerald-300")
                }
              >
                {n}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 text-sm">
          {plan.smooth ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
              ✓ Läuft glatt: In allen {plan.turns} Durchgängen spielen alle {players} gleichzeitig.
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
              ⚠️ Geht nicht ganz glatt auf – Details beim Erzeugen.
            </div>
          )}
        </div>

        {confirming && !plan.smooth ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="mb-1 font-bold">⚠️ Das geht nicht glatt auf</div>
            <div className="mb-1">
              {players} Spieler, {count} Flipper:
            </div>
            <ul className="mb-2 list-disc space-y-0.5 pl-5">
              <li>
                In {plan.restTurns} von {plan.turns} Durchgängen spielen nur {plan.restMachines}{" "}
                {plan.restMachines === 1 ? "Spieler" : "Spieler gleichzeitig"},{" "}
                {plan.waitingPerTurn === 1 ? "1 wartet" : `${plan.waitingPerTurn} warten`}.
              </li>
            </ul>
            {smoothCounts.length ? (
              <div className="mb-3">
                Glatt läuft es mit {smoothCounts.join(", ").replace(/, (\d+)$/, " oder $1")} Flippern.
              </div>
            ) : (
              <div className="mb-3">Für einen glatten Ablauf fehlen aktive Flipper (mind. {players}).</div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onConfirm(count)}
                disabled={busy}
                className="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                Trotzdem so erzeugen
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl bg-white px-4 py-2 font-semibold text-neutral-700 ring-1 ring-neutral-300"
              >
                Anzahl Flipper ändern
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl bg-white px-4 py-2 font-semibold text-neutral-700 ring-1 ring-neutral-300"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => (plan.smooth ? onConfirm(count) : setConfirming(true))}
              disabled={busy || count < 1 || players < 1}
              className="rounded-xl bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              Runden erzeugen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
