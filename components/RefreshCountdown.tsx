"use client";

// 🔄 Kleine Anzeige, wann die Admin-Seite das nächste Mal neue Daten holt (Polling),
// mit ablaufendem Balken. Klick = sofort aktualisieren.
// 🧩 Zusätzlich: Hinweis, wenn ein Match nur halb gespeichert ankam und kurz nachgeladen wird.

import { useEffect, useState } from "react";

export type RecheckInfo = {
  /** waiting = Nachladen geplant · loading = lädt · resolved = jetzt vollständig · gaveup = weiter im normalen Takt */
  phase: "waiting" | "loading" | "resolved" | "gaveup";
  attempt: number;
  max: number;
  /** Anzahl halb gespeicherter Matches */
  count: number;
};

function recheckText(r: RecheckInfo) {
  const what = r.count > 1 ? `${r.count} Matches halb gespeichert` : "Match halb gespeichert";
  switch (r.phase) {
    case "waiting":
      return `🧩 ${what} – lade gleich nach (${r.attempt}/${r.max})`;
    case "loading":
      return `🧩 ${what} – lade nach … (${r.attempt}/${r.max})`;
    case "resolved":
      return "✅ Nachgeladen – jetzt vollständig";
    case "gaveup":
      return "⏸️ Noch unvollständig – weiter im normalen Takt";
  }
}

const RECHECK_STYLE: Record<RecheckInfo["phase"], string> = {
  waiting: "border-amber-300 bg-amber-50 text-amber-900",
  loading: "border-amber-300 bg-amber-50 text-amber-900",
  resolved: "border-emerald-300 bg-emerald-50 text-emerald-800",
  gaveup: "border-neutral-300 bg-neutral-100 text-neutral-700",
};

export default function RefreshCountdown({
  lastAt,
  intervalMs,
  busy,
  onRefreshNow,
  recheck,
}: {
  /** Zeitpunkt des letzten Abrufs (ms) – null = noch keiner */
  lastAt: number | null;
  intervalMs: number;
  busy: boolean;
  onRefreshNow?: () => void;
  recheck?: RecheckInfo | null;
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
      className={
        "mt-2 block w-full rounded-xl border px-2.5 py-1.5 text-left transition-colors duration-300 disabled:cursor-default " +
        (recheck ? RECHECK_STYLE[recheck.phase] : "bg-white hover:bg-neutral-50")
      }
      title={time ? `Zuletzt aktualisiert um ${time} – klicken = jetzt aktualisieren` : "Klicken = jetzt aktualisieren"}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span className="whitespace-nowrap">{busy ? "🔄 aktualisiert …" : `🔄 Aktualisierung in ${secs} s`}</span>
        {time ? <span className="whitespace-nowrap tabular-nums text-neutral-400">{time}</span> : null}
      </div>
      {recheck ? (
        <div className={"mt-0.5 text-[11px] font-semibold " + (recheck.phase === "loading" ? "animate-pulse" : "")}>
          {recheckText(recheck)}
        </div>
      ) : null}
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
