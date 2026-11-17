"use client";

// 📡 Live-Ticker über den Server: offene Geräte (TV, Admin, Handy) klopfen regelmäßig an
// (/api/public/feed/sync) – der Server rechnet nach und trägt Fehlendes ein.
// Nur aktiv, wenn "Ticker über Server" in 🔔 Meldungen & Sounds eingeschaltet ist.
// Sicherheitsnetz: die Admin-Seite trägt weiterhin sofort ein – der Server ergänzt nur Fehlendes.

import { useEffect } from "react";
import { serverFeedOn } from "@/lib/notifications";
import { useNotificationSettings } from "@/components/useNotificationSettings";
import { refreshTickers } from "@/components/LiveTicker";

export function useFeedSync(code: string | null | undefined, opts: { rotation: boolean; active?: boolean; everyMs?: number }) {
  const ns = useNotificationSettings();
  const on = serverFeedOn(ns);
  const active = opts.active !== false;
  const everyMs = opts.everyMs ?? 10_000;

  useEffect(() => {
    if (!on || !active || !code) return;
    let stopped = false;
    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) return; // versteckter Tab: andere Geräte übernehmen
      try {
        const res = await fetch("/api/public/feed/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const j = await res.json().catch(() => null);
        if (!stopped && j?.ok && Number(j.added) > 0) refreshTickers();
      } catch {
        /* nächster Versuch beim nächsten Takt */
      }
    };
    void run();
    const t = window.setInterval(run, everyMs);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [on, active, code, everyMs]);

  return on;
}
