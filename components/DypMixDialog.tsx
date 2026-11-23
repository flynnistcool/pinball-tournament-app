"use client";

// 🎱 DYP: Geräte-Mix vor der ersten Runde abfragen (nur wenn neben Flippern auch andere Geräte aktiv sind).
// Danach weiter änderbar im Block "Geräte-Mix" (components/DypMachineMix.tsx). Logik: lib/dypMachinePick.ts

import { useEffect, useState } from "react";
import { clampPinballWeight, DYP_PINBALL_WEIGHT_DEFAULT } from "@/lib/dypMachinePick";

export default function DypMixDialog({
  open,
  initialWeight,
  otherNames,
  pinballCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  initialWeight: unknown;
  /** Namen der aktiven Nicht-Flipper */
  otherNames: string[];
  /** Anzahl aktiver Flipper */
  pinballCount: number;
  onConfirm: (weight: number) => void;
  onCancel: () => void;
}) {
  const [w, setW] = useState(DYP_PINBALL_WEIGHT_DEFAULT);
  useEffect(() => {
    if (open) setW(clampPinballWeight(initialWeight ?? DYP_PINBALL_WEIGHT_DEFAULT));
  }, [open, initialWeight]);

  if (!open) return null;

  const btn = "h-10 w-10 rounded-full border bg-white text-lg font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="text-center text-xl font-bold">Geräte-Mix</div>
        <div className="mt-1 text-center text-sm text-neutral-600">Wie oft soll welches Gerät drankommen?</div>

        <div className="mt-4 space-y-1.5 text-sm">
          {otherNames.map((n) => (
            <div key={n} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
              <span className="truncate">{n}</span>
              <span className="font-semibold tabular-nums">1×</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
            <span className="font-semibold">
              alle {pinballCount} Flipper zusammen
            </span>
            <span className="flex items-center gap-2">
              <button type="button" className={btn} disabled={w <= 0} onClick={() => setW(clampPinballWeight(w - 1))} aria-label="weniger Flipper">
                −
              </button>
              <span className="min-w-[2.5rem] text-center text-lg font-bold tabular-nums">{w}×</span>
              <button type="button" className={btn} disabled={w >= 10} onClick={() => setW(clampPinballWeight(w + 1))} aria-label="mehr Flipper">
                +
              </button>
            </span>
          </div>
        </div>

        <div className="mt-3 text-center text-[12px] leading-snug text-neutral-500">
          Bei den Flippern kommt immer der am seltensten gespielte dran. Später änderbar im Block „Geräte-Mix“.
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => onConfirm(w)}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            Runde erzeugen
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-white px-5 py-2.5 font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
