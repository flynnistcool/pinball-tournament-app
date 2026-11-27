"use client";

// 📈 Vergleichswerte für die Bilanz (Handy + TV): persönliche Bestwerte und Ø je Profil|Flipper,
// nur aus Turnieren VOR diesem Turnier (cutoff=start). Lädt einmal und dann alle 5 Minuten neu.

import { useEffect, useState } from "react";

const REFRESH_MS = 5 * 60_000;

export type BalanceRefs = {
  enabled: boolean;
  personal: Record<string, number>;
  personalAvg: Record<string, { avg: number; n: number }>;
};

export function useBalanceRefs(code: string, active = true): { ref: BalanceRefs | null; error: boolean } {
  const [ref, setRef] = useState<BalanceRefs | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const run = () =>
      fetch(`/api/public/machine-records?code=${encodeURIComponent(code)}&cutoff=start&ts=${Date.now()}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          if (!j?.ok) {
            setError(true);
            return;
          }
          setError(false);
          setRef({ enabled: !!j.enabled, personal: j.personal ?? {}, personalAvg: j.personalAvg ?? {} });
        })
        .catch(() => alive && setError(true));
    run();
    const id = window.setInterval(run, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [code, active]);
  return { ref, error };
}
