"use client";

// 📣 Live-Ticker als schwebendes, verschiebbares Fenster (Admin) – zum Ausprobieren neben dem alten Ticker.
// - Startposition: links im freien Raum neben dem Programm
// - an der Kopfzeile ziehen (Maus/Finger); Position + Größe merkt sich das Gerät
// - Ecke unten rechts: Größe ändern · ▁ einklappen · ✕ ausblenden (kleiner Knopf holt ihn zurück)
// - schmale Bildschirme: zuerst ausgeblendet (verdeckt sonst den Inhalt)

import { useEffect, useRef, useState } from "react";
import LiveTicker from "@/components/LiveTicker";
import type { FeedItem } from "@/lib/feed";
import { notifSetting } from "@/lib/notifications";
import { useNotificationSettings } from "@/components/useNotificationSettings";

type Box = { x: number; y: number; w: number; h: number; open: boolean; shown: boolean };

const KEY = "pb_floatTicker";
const DEFAULT: Box = { x: 12, y: 120, w: 300, h: 520, open: true, shown: true };

function load(): Box {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  // erster Start: auf schmalen Bildschirmen ausgeblendet
  return { ...DEFAULT, shown: window.innerWidth >= 1280 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 📱 Schmale Bildschirme (Handy, iPad hochkant): unten angeheftete Leiste mit der neuesten Meldung,
//    Antippen öffnet die ganze Liste von unten. ✕ blendet aus, kleiner 📣-Knopf holt sie zurück.

const NARROW = "(max-width: 1023px)";
const MOBILE_KEY = "pb_tickerDockHidden";

function useNarrow(): boolean | null {
  const [narrow, setNarrow] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

function MobileTickerDock({ code }: { code: string }) {
  const ns = useNotificationSettings();
  const [latest, setLatest] = useState<FeedItem | null>(null);
  const [flash, setFlash] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastIdRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(MOBILE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const setHiddenSaved = (v: boolean) => {
    setHidden(v);
    try {
      window.localStorage.setItem(MOBILE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  // neueste (sichtbare) Meldung laden
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/public/feed?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.ok) return;
          const first = (j.items ?? []).find((x: FeedItem) => notifSetting(ns, x.kind, "ticker").enabled) ?? null;
          if (first && lastIdRef.current != null && first.id !== lastIdRef.current) {
            setFlash(true);
            window.setTimeout(() => !cancelled && setFlash(false), 2500);
          }
          lastIdRef.current = first?.id ?? null;
          setLatest(first);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(() => !document.hidden && load(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [code, ns]);

  // 📌 Die Ticker-Zeile bleibt ganz unten; die Menüleiste der Admin-Seite (Runde erzeugen …) rutscht darüber.
  //    Höhe der Zeile als CSS-Variable --pb-ticker-dock (0, wenn nur der 📣-Knopf zu sehen ist).
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (hidden) {
      root.style.setProperty("--pb-ticker-dock", "0px");
      return;
    }
    const set = () => root.style.setProperty("--pb-ticker-dock", `${barRef.current?.offsetHeight ?? 0}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" && barRef.current ? new ResizeObserver(set) : null;
    if (ro && barRef.current) ro.observe(barRef.current);
    return () => {
      ro?.disconnect();
      root.style.setProperty("--pb-ticker-dock", "0px");
    };
  }, [hidden]);

  // unten Platz lassen, damit die Leiste nichts verdeckt
  useEffect(() => {
    if (hidden) return;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "56px";
    return () => {
      document.body.style.paddingBottom = prev;
    };
  }, [hidden]);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHiddenSaved(false)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] left-3 z-[60] rounded-full border bg-white px-3 py-2 text-sm font-semibold shadow-lg"
        title="Live-Ticker einblenden"
      >
        📣
      </button>
    );
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[60] bg-black/30" onClick={() => setOpen(false)} aria-hidden="true" />
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-[61] pb-[env(safe-area-inset-bottom,0px)]">
        {open ? (
          <div className="mx-2 mb-1 max-h-[55vh] overflow-y-auto rounded-2xl border bg-white p-2 shadow-lg">
            <LiveTicker code={code} variant="admin" maxItems={40} title={false} className="!border-0 !p-0" soundOn={false} />
          </div>
        ) : null}
        <div
          ref={barRef}
          className={
            "flex items-center gap-2 border-t px-3 py-2 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] transition-colors duration-700 " +
            (flash ? "bg-amber-100" : "bg-white")
          }
        >
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="shrink-0">📣</span>
            {latest ? (
              <span className="min-w-0 flex-1 truncate text-xs">
                <span className="mr-1">{latest.icon}</span>
                <b>{latest.title}</b>
                {latest.body ? <span className="text-neutral-600"> · {latest.body}</span> : null}
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">Live-Ticker – noch keine Meldungen</span>
            )}
            <span className="shrink-0 text-xs text-neutral-400">{open ? "▼" : "▲"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setHiddenSaved(true);
            }}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-100"
            title="Ausblenden"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}

/** schmal → angeheftete Leiste, breit → verschiebbares Fenster */
export default function FloatingTicker({ code }: { code: string }) {
  const narrow = useNarrow();
  if (narrow == null) return null;
  return narrow ? <MobileTickerDock code={code} /> : <FloatingTickerWindow code={code} />;
}

function FloatingTickerWindow({ code }: { code: string }) {
  const [box, setBox] = useState<Box | null>(null);
  const boxRef = useRef<Box | null>(null);
  boxRef.current = box;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    // gespeicherte Position in den sichtbaren Bereich holen (z. B. auf dem iPad gespeichert, als es anders gedreht war)
    const b = load();
    const w = Math.min(b.w, Math.max(240, window.innerWidth - 24));
    const h = Math.min(b.h, Math.max(200, window.innerHeight - 24));
    const x = Math.min(Math.max(0, b.x), Math.max(0, window.innerWidth - Math.min(w, 200)));
    const y = Math.min(Math.max(0, b.y), Math.max(0, window.innerHeight - 60));
    setBox({ ...b, x, y, w, h });
  }, []);

  const save = (b: Box) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(b));
    } catch {
      /* ignore */
    }
  };
  const update = (patch: Partial<Box>, persist = true) =>
    setBox((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...patch };
      if (persist) save(next);
      return next;
    });

  // im Fenster halten (z. B. nach Drehen des Tablets)
  useEffect(() => {
    const clamp = () => {
      const b = boxRef.current;
      if (!b) return;
      const x = Math.min(Math.max(0, b.x), Math.max(0, window.innerWidth - 120));
      const y = Math.min(Math.max(0, b.y), Math.max(0, window.innerHeight - 48));
      if (x !== b.x || y !== b.y) update({ x, y });
    };
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Größe (CSS-Ecke) übernehmen + merken
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let t: number | undefined;
    const ro = new ResizeObserver(() => {
      const b = boxRef.current;
      if (!b?.open) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const w = Math.round(el.offsetWidth);
        const h = Math.round(el.offsetHeight);
        if (Math.abs(w - b.w) > 2 || Math.abs(h - b.h) > 2) update({ w, h });
      }, 250);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box?.open, box?.shown]);

  function onPointerDown(e: React.PointerEvent) {
    if (!box) return;
    if ((e.target as HTMLElement).closest("button")) return; // Knöpfe nicht als Ziehen werten
    dragRef.current = { dx: e.clientX - box.x, dy: e.clientY - box.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - 120);
    const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - 48);
    update({ x, y }, false);
  }
  // ↘ Größe ändern (eigene Ecke)
  const resizeRef = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null);
  function onResizeDown(e: React.PointerEvent) {
    if (!box) return;
    e.stopPropagation();
    resizeRef.current = { sx: e.clientX, sy: e.clientY, w: box.w, h: box.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: React.PointerEvent) {
    const r = resizeRef.current;
    const b = boxRef.current;
    if (!r || !b) return;
    const w = Math.round(Math.min(Math.max(220, r.w + e.clientX - r.sx), window.innerWidth - b.x - 4));
    const h = Math.round(Math.min(Math.max(160, r.h + e.clientY - r.sy), window.innerHeight - b.y - 4));
    update({ w, h }, false);
  }
  function onResizeUp(e: React.PointerEvent) {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (boxRef.current) save(boxRef.current);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (boxRef.current) save(boxRef.current);
  }

  if (!box) return null;

  // ausgeblendet → kleiner Knopf unten links
  if (!box.shown) {
    return (
      <button
        type="button"
        onClick={() => update({ shown: true, open: true })}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] left-4 z-[60] rounded-full border bg-white px-3 py-2 text-sm font-semibold shadow-lg hover:bg-neutral-50"
        title="Live-Ticker als Fenster einblenden"
      >
        📣 Ticker
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-[60] flex flex-col overflow-hidden rounded-2xl border bg-white/95 shadow-lg backdrop-blur"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.open ? box.h : undefined,
        minWidth: 220,
        minHeight: box.open ? 160 : undefined,
        maxWidth: "90vw",
        maxHeight: "90vh",
      }}
    >
      {/* Kopfzeile = Griff zum Verschieben */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex cursor-move touch-none select-none items-center justify-between gap-2 border-b bg-neutral-50 px-3 py-2"
        title="Zum Verschieben ziehen"
      >
        <span className="text-sm font-semibold">📣 Live-Ticker</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => update({ open: !box.open })}
            className="rounded-md px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-200"
            title={box.open ? "Einklappen" : "Ausklappen"}
          >
            {box.open ? "▁" : "▢"}
          </button>
          <button
            type="button"
            onClick={() => update({ shown: false })}
            className="rounded-md px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-200"
            title="Ausblenden (unten links wieder einblenden)"
          >
            ✕
          </button>
        </span>
      </div>
      {box.open ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <LiveTicker code={code} variant="admin" maxItems={40} title={false} className="!border-0 !p-0" soundOn={false} />
        </div>
      ) : null}
      {/* ↘ Größe ändern – eigene Ecke (Maus UND Finger; die eingebaute Browser-Ecke geht auf dem iPad nicht) */}
      {box.open ? (
        <div
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          className="absolute bottom-0 right-0 flex h-7 w-7 cursor-se-resize touch-none select-none items-end justify-end p-1"
          title="Zum Vergrößern/Verkleinern ziehen"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" className="text-neutral-400" aria-hidden="true">
            <path d="M13 5 L5 13 M13 9 L9 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}
