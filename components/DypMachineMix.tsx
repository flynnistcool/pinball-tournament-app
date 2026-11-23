"use client";

// 🎱 DYP: Geräte-Mix einstellen – jedes Nicht-Flipper-Gerät (Kicker, Arcade …) zählt 1,
// alle Flipper zusammen zählen "weight" (Standard 3 → z. B. 1-1-1-3). Logik: lib/dypMachinePick.ts

import { useEffect, useState } from "react";
import { clampPinballWeight, DYP_PINBALL_WEIGHT_DEFAULT } from "@/lib/dypMachinePick";

export default function DypMachineMix({ code, weight }: { code: string; weight: unknown }) {
  const [value, setValue] = useState<number>(clampPinballWeight(weight ?? DYP_PINBALL_WEIGHT_DEFAULT));
  const [busy, setBusy] = useState(false);
  // auf-/zuklappen (wie die anderen Blöcke, bleibt nach Neuladen)
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem("pb_open_dyp_mix");
      if (v != null) setOpen(v === "1");
    } catch {}
  }, []);
  function toggle() {
    setOpen((v) => {
      try {
        localStorage.setItem("pb_open_dyp_mix", v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

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
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggle();
          }
        }}
        className={"flex cursor-pointer select-none items-center justify-between gap-2 px-2.5 pt-4 pb-2.5 " + (open ? "border-b" : "")}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span>Geräte-Mix</span>
          <span className="text-xs text-neutral-400">{open ? "▾" : "▸"}</span>
        </span>
        {!open ? (
          <span className="text-[12px] font-semibold text-gray-700">Flipper {value}×</span>
        ) : (
        <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button type="button" className={btn} disabled={busy || value <= 0} onClick={() => save(value - 1)} aria-label="weniger Flipper">
            −
          </button>
          <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums text-gray-900">{value}×</span>
          <button type="button" className={btn} disabled={busy || value >= 10} onClick={() => save(value + 1)} aria-label="mehr Flipper">
            +
          </button>
        </span>
        )}
      </div>
      {open ? (
      <div className="px-2.5 py-2 text-[12px] leading-snug text-gray-500">
        Jedes andere Gerät (Kicker, Arcade …) kommt 1× dran, <b className="text-gray-700">alle Flipper zusammen {value}×</b> –
        dabei immer der am seltensten gespielte Flipper. Gilt ab der nächsten Runde.
      </div>
      ) : null}
    </div>
  );
}
