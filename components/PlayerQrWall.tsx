"use client";

// 📱 TV-Seite "QR-Codes": alle Spieler mit ihrem persönlichen QR-Code zum Selbst-Scannen.
// Die Links kommen aus /api/players/links – das ist eine ADMIN-Schnittstelle (nicht öffentlich):
// Ist der TV-Browser nicht als Admin angemeldet, liefert sie nichts → der Reiter wird gar nicht angezeigt.
// Bots und Platzhalter bekommen keinen Code (keine Handy-Eingabe nötig).

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

export type QrWallPlayer = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

/** Links (playerId → Token) laden; null = kein Zugriff (nicht als Admin angemeldet) */
export async function loadPlayerLinks(code: string): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(`/api/players/links?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j?.ok ? ((j.links ?? {}) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function PlayerQrWall({
  code,
  players,
  links,
}: {
  code: string;
  players: QrWallPlayer[];
  links: Record<string, string>;
}) {
  const [imgs, setImgs] = useState<Record<string, string>>({});

  const list = useMemo(
    () =>
      players
        .filter((p) => !!links[p.id])
        .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" })),
    [players, links]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const p of list) {
        const u = `${window.location.origin}/s/${encodeURIComponent(code)}/spieler/${encodeURIComponent(links[p.id])}`;
        try {
          out[p.id] = await QRCode.toDataURL(u, { margin: 1, width: 360 });
        } catch {
          /* einzelner Code fehlgeschlagen → Kachel ohne Bild */
        }
      }
      if (alive) setImgs(out);
    })();
    return () => {
      alive = false;
    };
  }, [list, code, links]);

  // Kachelgröße an die Spielerzahl anpassen (alles auf einen Bildschirm)
  const n = list.length;
  const cols = n <= 4 ? n || 1 : n <= 8 ? 4 : n <= 12 ? 6 : 8;
  const qrSize = n <= 4 ? 300 : n <= 8 ? 240 : n <= 12 ? 190 : 150;

  return (
    <div className="w-[1500px]">
      <div className="mb-5 text-center">
        <div className="text-4xl font-black tracking-tight">📱 Dein persönlicher QR-Code</div>
        <div className="mt-1 text-lg text-white/60">
          Mit der Handy-Kamera scannen – dann trägst du deine Ergebnisse selbst ein und siehst dein nächstes Match.
        </div>
      </div>
      {!n ? (
        <div className="py-16 text-center text-xl text-white/50">Noch keine Spieler mit Handy-Eingabe.</div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {list.map((p) => (
            <div
              key={p.id}
              className="flex flex-col items-center rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/15"
            >
              <div className="mb-3 flex max-w-full items-center gap-2">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ring-2 ring-white/20"
                  style={p.color ? { background: p.color } : { background: "rgba(255,255,255,0.1)" }}
                >
                  {p.icon ?? <span className="text-xs font-bold text-white/80">{initials(p.name)}</span>}
                </span>
                <span className="truncate text-2xl font-extrabold">{p.name}</span>
              </div>
              <div className="rounded-2xl bg-white p-2" style={{ width: qrSize, height: qrSize }}>
                {imgs[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgs[p.id]} alt={`QR-Code für ${p.name}`} className="h-full w-full" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">lädt …</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
