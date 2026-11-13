"use client";

// 📱 Knopf "QR" in der Spielerliste (Admin): zeigt den persönlichen QR-Code eines Spielers.
// Der Spieler scannt ihn und landet auf /s/<CODE>/spieler/<token> (components/PlayerPhone.tsx).
// Die Links (lib/playerLink.ts) werden einmal pro Turnier geladen und zwischengespeichert.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const cache = new Map<string, Promise<Record<string, string>>>();

function loadLinks(code: string): Promise<Record<string, string>> {
  let p = cache.get(code);
  if (!p) {
    p = fetch(`/api/players/links?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) throw new Error(String(j?.error ?? "Links laden fehlgeschlagen"));
        return (j.links ?? {}) as Record<string, string>;
      });
    p.catch(() => cache.delete(code)); // beim nächsten Mal erneut versuchen
    cache.set(code, p);
  }
  return p;
}

export default function PlayerQrButton({ code, playerId, name }: { code: string; playerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [img, setImg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    (async () => {
      try {
        let links = await loadLinks(code);
        if (!links[playerId]) {
          cache.delete(code); // Spieler evtl. neu hinzugekommen
          links = await loadLinks(code);
        }
        const token = links[playerId];
        if (!token) throw new Error("Für diesen Spieler gibt es keinen Link");
        const u = `${window.location.origin}/s/${encodeURIComponent(code)}/spieler/${encodeURIComponent(token)}`;
        const dataUrl = await QRCode.toDataURL(u, { margin: 1, width: 360 });
        if (!alive) return;
        setUrl(u);
        setImg(dataUrl);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Fehler");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, code, playerId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
        title="Persönlicher QR-Code: Spieler trägt sein Ergebnis selbst am Handy ein"
      >
        📱 QR
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Handy-Eingabe für</div>
            <div className="text-2xl font-black text-neutral-900">{name}</div>
            <div className="mt-3 flex min-h-[260px] items-center justify-center">
              {error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={`QR-Code für ${name}`} className="h-auto w-full max-w-[300px]" />
              ) : (
                <div className="text-sm text-neutral-500">Lade …</div>
              )}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Mit der Handy-Kamera scannen – zeigt immer das aktuelle Match.
            </div>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-[11px] text-indigo-600 underline"
              >
                Link öffnen
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-2xl bg-neutral-900 px-4 py-2.5 font-bold text-white"
            >
              Schließen
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
