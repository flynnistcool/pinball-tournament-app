"use client";

// 🃏 Spielerkarten fürs Handy: eine Karte pro Bildschirmbreite, mit dem Finger nach links/rechts wischen.
// Gleiche Karten und Datenquelle wie am Infobildschirm (/api/public/player-cards).
// Reihenfolge: eigene Karte zuerst, dann wie im Leaderboard (order).
// Lädt nur, solange die Komponente sichtbar ist (Reiter "Turnier-Infos"), und dann alle paar Minuten neu.

import { useEffect, useMemo, useRef, useState } from "react";
import { PlayerTradingCard } from "@/components/PlayerCardsTv";
import type { PlayerCard } from "@/lib/playerCards";

const REFRESH_MS = 3 * 60_000;

export default function PlayerCardsSwipe({
  code,
  meId,
  order,
}: {
  code: string;
  meId: string;
  order: readonly string[];
}) {
  const [cards, setCards] = useState<PlayerCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/public/player-cards?code=${encodeURIComponent(code)}&ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (disposed) return;
        if (!res.ok || !j?.ok) {
          setError(String(j?.error ?? `Fehler ${res.status}`));
          return;
        }
        setCards(Array.isArray(j.cards) ? (j.cards as PlayerCard[]) : []);
        setError(null);
      } catch {
        if (!disposed) setError("Keine Verbindung");
      }
    }
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [code]);

  const sorted = useMemo(() => {
    if (!cards) return [];
    const rank = new Map(order.map((id, i) => [String(id), i]));
    const pos = (c: PlayerCard) =>
      String(c.playerId) === String(meId) ? -1 : rank.get(String(c.playerId)) ?? Number.MAX_SAFE_INTEGER;
    return cards.slice().sort((a, b) => pos(a) - pos(b));
  }, [cards, order, meId]);

  const count = sorted.length;
  const current = Math.min(idx, Math.max(0, count - 1));

  function onScroll() {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(i);
  }

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    const target = Math.max(0, Math.min(count - 1, i));
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }

  if (!cards) {
    return (
      <div className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-neutral-500 shadow-sm">
        {error ? `Spielerkarten nicht verfügbar (${error})` : "Lade Spielerkarten …"}
      </div>
    );
  }
  if (!count) {
    return (
      <div className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-neutral-500 shadow-sm">
        Noch keine Spieler im Turnier.
      </div>
    );
  }

  const shown = sorted[current];

  return (
    <div className="rounded-2xl bg-white py-1 shadow-sm">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sorted.map((c) => (
          <div key={c.playerId} className="flex w-full shrink-0 snap-center justify-center px-5 py-6">
            <PlayerTradingCard card={c} light />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="h-9 w-9 shrink-0 rounded-full bg-neutral-100 text-lg font-bold text-neutral-700 disabled:opacity-30"
          aria-label="vorherige Karte"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold text-neutral-800">
            {shown?.name}
            {shown && String(shown.playerId) === String(meId) ? (
              <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                du
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            {sorted.map((c, i) => (
              <button
                key={c.playerId}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Karte ${i + 1}: ${c.name}`}
                className={`h-2 w-2 rounded-full ${i === current ? "bg-neutral-700" : "bg-neutral-300"}`}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => goTo(current + 1)}
          disabled={current >= count - 1}
          className="h-9 w-9 shrink-0 rounded-full bg-neutral-100 text-lg font-bold text-neutral-700 disabled:opacity-30"
          aria-label="nächste Karte"
        >
          ›
        </button>
      </div>
    </div>
  );
}
