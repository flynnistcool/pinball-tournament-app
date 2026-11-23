"use client";

// 🎱 DYP: Geräte-Mix einstellen – jedes Nicht-Flipper-Gerät (Kicker, Arcade …) zählt 1,
// alle Flipper zusammen zählen "weight" (Standard 3 → z. B. 1-1-1-3). Logik: lib/dypMachinePick.ts

import { useEffect, useState } from "react";
import { clampPinballWeight, DYP_PINBALL_WEIGHT_DEFAULT } from "@/lib/dypMachinePick";

export default function DypMachineMix({ code, weight }: { code: string; weight: unknown }) {
  const [value, setValue] = useState<number>(clampPinballWeight(weight ?? DYP_PINBALL_WEIGHT_DEFAULT));
  const [busy, setBusy] = useState(false);

  // nur nachziehen, wenn sich der Wert vom Server wirklich ändert (nicht nach eigenem Speichern zurückspringen)
  useEffect(() => {
    setValue(clampPinballWeight(weight ?? DYP_PINBALL_WEIGHT_DEFAULT));
  }, [weight]);

  async function save(next: number) {
    const v = clampPinballWeight(next);
    if (v === value || busy) return;
    const prev = value;
    setValue(v);
    setBusy(true);
    try {
      const res = await fetch("/api/tournaments/set-dyp-weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ code, weight: v }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setValue(prev);
        alert(j?.error ?? "Konnte den Geräte-Mix nicht speichern.");
      }
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "h-7 w-7 rounded-full border bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40";

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-4 pb-2.5">
        <span className="text-sm font-semibold text-gray-900">Geräte-Mix</span>
        <span className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={busy || value <= 0} onClick={() => save(value - 1)} aria-label="weniger Flipper">
            −
          </button>
          <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums text-gray-900">{value}×</span>
          <button type="button" className={btn} disabled={busy || value >= 10} onClick={() => save(value + 1)} aria-label="mehr Flipper">
            +
          </button>
        </span>
      </div>
      <div className="border-t px-2.5 py-2 text-[12px] leading-snug text-gray-500">
        Jedes andere Gerät (Kicker, Arcade …) kommt 1× dran, <b className="text-gray-700">alle Flipper zusammen {value}×</b> –
        dabei immer der am seltensten gespielte Flipper. Gilt ab der nächsten Runde.
      </div>
    </div>
  );
}
