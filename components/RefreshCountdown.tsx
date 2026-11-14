"use client";

// 🔄 Kleine Anzeige, wann die Admin-Seite das nächste Mal neue Daten holt (Polling),
// mit ablaufendem Balken. Klick = sofort aktualisieren.

import { useEffect, useState } from "react";

export default function RefreshCountdown({
  lastAt,
  intervalMs,
  busy,
  onRefreshNow,
}: {
  /** Zeitpunkt des letzten Abrufs (ms) – null = noch keiner */
  lastAt: number | null;
  intervalMs: number;
  busy: boolean;
  onRefreshNow?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const leftMs = lastAt == null ? intervalMs : Math.max(0, lastAt + intervalMs - now);
  const frac = Math.min(1, leftMs / intervalMs);
  const secs = Math.ceil(leftMs / 1000);
  const time = lastAt != null ? new Date(lastAt).toLocaleTimeString("de-DE") : null;

  return (
    <button
      type="button"
      onClick={onRefreshNow}
      disabled={busy || !onRefreshNow}
      className="mt-2 block w-full rounded-xl border bg-white px-2.5 py-1.5 text-left hover:bg-neutral-50 disabled:cursor-default"
      title={time ? `Zuletzt aktualisiert um ${time} – klicken = jetzt aktualisieren` : "Klicken = jetzt aktualisieren"}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span className="whitespace-nowrap">{busy ? "🔄 aktualisiert …" : `🔄 Aktualisierung in ${secs} s`}</span>
        {time ? <span className="whitespace-nowrap tabular-nums text-neutral-400">{time}</span> : null}
      </div>
      {/* bewusst dezent (dünn, grau), damit der Blick nicht ständig hierher wandert */}
      <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={"h-full rounded-full " + (busy ? "bg-neutral-400" : "bg-neutral-300")}
          style={{ width: `${busy ? 100 : frac * 100}%` }}
        />
      </div>
    </button>
  );
}
