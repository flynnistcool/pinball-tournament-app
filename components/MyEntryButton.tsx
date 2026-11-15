"use client";

// 📱 "Meine Eingabe": Wer angemeldet ist und mit einem Spielerprofil verknüpft ist, das in diesem
// Turnier mitspielt, öffnet hier direkt seine Handy-Eingabe – ohne den QR-Code zu scannen.
// (Erscheint nur, wenn es für den Login in diesem Turnier einen Spieler gibt.)

import { useEffect, useState } from "react";

// pro Turnier nur EINE Anfrage (Spielerliste + Kopfleiste teilen sich das Ergebnis, 60 s gültig)
type Link = { token: string; playerId: string } | null;
const cache = new Map<string, { at: number; p: Promise<Link> }>();
function loadMyLink(code: string): Promise<Link> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = fetch(`/api/my/player-link?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j?.ok && j.token ? { token: String(j.token), playerId: String(j.playerId ?? "") } : null))
    .catch(() => null);
  cache.set(code, { at: Date.now(), p });
  return p;
}

export default function MyEntryButton({
  code,
  variant = "header",
  onlyPlayerId,
}: {
  code: string;
  variant?: "header" | "pill" | "row";
  /** nur anzeigen, wenn der eigene Spieler im Turnier genau dieser ist (Spielerliste) */
  onlyPlayerId?: string;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setToken(null);
    if (!code) return;
    loadMyLink(code).then((l) => {
      if (!alive || !l) return;
      if (onlyPlayerId && l.playerId !== String(onlyPlayerId)) return;
      setToken(l.token);
    });
    return () => {
      alive = false;
    };
  }, [code, onlyPlayerId]);

  if (!token) return null;
  return (
    <a
      href={`/s/${encodeURIComponent(code)}/spieler/${encodeURIComponent(token)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={
        variant === "pill"
          ? "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-indigo-400 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 shadow-sm hover:bg-indigo-50"
          : variant === "row"
          ? "inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-200"
          : "rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
      }
      title="Deine persönliche Eingabe öffnen (wie der QR-Code) – Ergebnisse eintragen, nächstes Match sehen"
    >
      📱 Meine Eingabe
    </a>
  );
}
