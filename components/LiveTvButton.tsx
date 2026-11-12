"use client";

// 📺 Blinkender Live-Knopf oben rechts (neben Admin/Abmelden):
// Zeigt laufende Turniere und öffnet deren Infobildschirm (/s/<code>/tv) in einem neuen Tab.
// Fragt selbst /api/tournaments/list ab (beim Start + jede Minute), damit er auch stimmt,
// wenn ein Turnier inzwischen beendet oder neu angelegt wurde.

import { useEffect, useState } from "react";

type ListedTournament = { id: string; code: string; name?: string | null; status?: string | null };

const REFRESH_MS = 60_000;

export default function LiveTvButton() {
  const [running, setRunning] = useState<ListedTournament[]>([]);

  useEffect(() => {
    let disposed = false;

    async function load() {
      try {
        const res = await fetch(`/api/tournaments/list?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return; // Fehler: alten Stand behalten
        const j = (await res.json().catch(() => null)) as { tournaments?: ListedTournament[] } | null;
        if (!j || !Array.isArray(j.tournaments)) return;
        const live = j.tournaments.filter((t) => t.code && t.status !== "finished");
        if (!disposed) setRunning(live);
      } catch {
        // offline o. Ä.: alten Stand behalten
      }
    }

    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  if (running.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {running.slice(0, 3).map((t) => (
        <a
          key={t.id}
          href={`/s/${encodeURIComponent(t.code)}/tv`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Infobildschirm (TV) von „${t.name ?? t.code}“ in neuem Tab öffnen`}
          aria-label={`Infobildschirm (TV) von ${t.name ?? t.code} öffnen`}
          className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-sky-400 bg-white px-2.5 py-1 text-xs font-bold text-sky-700 shadow-sm hover:bg-sky-50"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
          </span>
          <span className="shrink-0">📺</span>
          <span className="max-w-[14ch] truncate">{t.name ?? t.code}</span>
        </a>
      ))}
    </div>
  );
}
