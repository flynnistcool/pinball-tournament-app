"use client";

// 📰 Turnier-Shortnews (Matchplay & Co.): sobald in einem Match alle Plätze feststehen und
// 10 s lang nicht mehr korrigiert wurden → kleine Ergebnis-Meldung in den Live-Ticker.
// Nur die Admin-Seite trägt ein (onFeed). Beim ersten Laden schon fertige Matches lösen nichts aus.
// Round the Pinball: eine Sammelmeldung je Durchgang kommt aus RotationTurnSplash.

import { useEffect, useRef } from "react";
import type { FeedItemInput } from "@/lib/feed";
import type { MmData } from "@/lib/myMatch";
import { finishedMatchSigs, matchShortNews } from "@/lib/shortNews";

const STABLE_MS = 10_000;
const TICK_MS = 2_000;

export default function ShortNewsWatcher({
  code,
  data,
  onFeed,
}: {
  /** Turniercode – bei Wechsel neu anfangen */
  code: string;
  data: MmData | null | undefined;
  onFeed?: (items: FeedItemInput[]) => void;
}) {
  const dataRef = useRef<MmData | null>(null);
  dataRef.current = data ?? null;
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;
  /** schon gemeldet bzw. beim Laden schon fertig */
  const seenRef = useRef<Set<string> | null>(null);
  /** frisch fertig: seit wann mit welcher Prüfsumme */
  const pendingRef = useRef<Map<string, { since: number; sig: string }>>(new Map());

  useEffect(() => {
    seenRef.current = null;
    pendingRef.current = new Map();
    const check = () => {
      const d = dataRef.current;
      if (!d || !Array.isArray(d.match_players) || !Array.isArray(d.matches)) return;
      // nach Turnierwechsel: warten, bis die Daten des neuen Turniers da sind
      const dCode = (d.tournament as { code?: string | null } | null)?.code;
      if (dCode && String(dCode).toUpperCase() !== String(code).toUpperCase()) return;
      const sigs = finishedMatchSigs(d);
      if (!seenRef.current) {
        seenRef.current = new Set(sigs.keys());
        return;
      }
      const seen = seenRef.current;
      const pend = pendingRef.current;
      // wieder offen (Korrektur) → nicht mehr warten
      for (const id of Array.from(pend.keys())) if (!sigs.has(id)) pend.delete(id);
      const now = Date.now();
      const ready: FeedItemInput[] = [];
      for (const [id, sig] of Array.from(sigs.entries())) {
        if (seen.has(id)) continue;
        const p = pend.get(id);
        if (!p || p.sig !== sig) {
          pend.set(id, { since: now, sig });
          continue;
        }
        if (now - p.since < STABLE_MS) continue;
        pend.delete(id);
        seen.add(id);
        const item = matchShortNews(d, id);
        if (item) ready.push(item);
      }
      if (ready.length && onFeedRef.current) onFeedRef.current(ready);
    };
    check();
    const t = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(t);
  }, [code]);

  return null;
}
