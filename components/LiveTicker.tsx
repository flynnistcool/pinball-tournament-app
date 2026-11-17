"use client";

// 📣 Live-Ticker: Mitteilungen des Turniers wie ein Chat – neueste oben, ältere rutschen nach unten.
// - Lesen: GET /api/public/feed (TV, Admin, Handy)
// - Eintragen: postFeedItems() – nur vom Admin-Tablet (POST /api/feed/add, Admin-Pflicht)
// - Welche Arten im Ticker erscheinen: 🔔 Meldungen & Sounds, Spalte "📣 Ticker"

import { useEffect, useRef, useState } from "react";
import type { FeedItem, FeedItemInput } from "@/lib/feed";
import { SCOPE_INFO, notifSetting, scopeOf } from "@/lib/notifications";
import ScopeChip from "@/components/ScopeChip";
import { useNotificationSettings } from "@/components/useNotificationSettings";
import { playSoundById } from "@/lib/playSound";

// ── Eintragen (gebündelt, jede Kennung nur einmal pro Seite) ─────────────────
const sent = new Set<string>();
let pending: { code: string; items: FeedItemInput[] } | null = null;
let flushTimer: number | undefined;
const refreshListeners = new Set<() => void>();
const FEED_CHUNK = 20; // = Obergrenze je Anfrage in /api/feed/add
// 📜 TV-Ticker läuft von selbst: so lange oben stehen / unten warten, so schnell scrollen (Pixel je ms)
const AUTO_TOP_MS = 10_000;
const AUTO_BOTTOM_MS = 2_000; // nach dem Sprung ans Ende kurz stehen, dann langsam hoch
const AUTO_SPEED = 0.03; // = 30 Pixel pro Sekunde

/** eigene Ticker sofort neu laden (z. B. nachdem der Server etwas eingetragen hat) */
export function refreshTickers() {
  refreshListeners.forEach((l) => l());
}

export function postFeedItems(code: string, items: FeedItemInput[]) {
  // 📡 "Ticker über Server" ist nur ein Sicherheitsnetz: die Admin-Seite trägt weiter SOFORT ein,
  //    der Server ergänzt nur, was fehlt (gleiche Kennungen → nichts doppelt)
  const fresh = items.filter((it) => it && !sent.has(`${code}|${it.key}`));
  if (!code || !fresh.length) return;
  fresh.forEach((it) => sent.add(`${code}|${it.key}`));
  if (pending && pending.code !== code) pending = null;
  pending = { code, items: [...(pending?.items ?? []), ...fresh] };
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    const p = pending;
    pending = null;
    if (!p) return;
    // Server nimmt höchstens 20 je Anfrage → in Pakete teilen (sonst gingen z. B. am Ende von
    // Round the Pinball, wenn viele Meldungen gleichzeitig kommen, die hinteren verloren)
    const chunks: FeedItemInput[][] = [];
    for (let i = 0; i < p.items.length; i += FEED_CHUNK) chunks.push(p.items.slice(i, i + FEED_CHUNK));
    Promise.all(
      chunks.map((items) =>
        fetch("/api/feed/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: p.code, items }),
        })
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status));
          })
          .catch(() => {
            // fehlgeschlagen → beim nächsten Erkennen erneut versuchen dürfen
            items.forEach((it) => sent.delete(`${p.code}|${it.key}`));
          })
      )
    ).then(() => refreshListeners.forEach((l) => l())); // eigener Ticker sofort aktualisieren
  }, 600);
}

const timeFmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";
};

export default function LiveTicker({
  code,
  variant = "admin",
  refreshMs = 10_000,
  maxItems = 30,
  className = "",
  title = true,
  collapsible = false,
  soundOn,
  scrollMaxPx,
  autoScroll: autoScrollProp = false,
}: {
  code: string;
  /** strip = schmales Laufband (Handy unter der Match-Eintragung) */
  variant?: "tv" | "admin" | "phone" | "strip";
  refreshMs?: number;
  maxItems?: number;
  className?: string;
  /** Überschrift "📣 Live-Ticker" zeigen */
  title?: boolean;
  /** Admin: per Klick auf die Überschrift ein-/ausklappen (merkt sich das Gerät) */
  collapsible?: boolean;
  /** 🔊 Ton bei neuen Einträgen erlaubt (TV: nach "Ton aktivieren"; Admin: ja; Handy: nein) */
  soundOn?: boolean;
  /** 📜 Liste höchstens so hoch (px), darüber scrollbar (TV: feste Höhe, damit das Einpassen stabil bleibt) */
  scrollMaxPx?: number;
  /** 📜 TV: Liste läuft von selbst (nur zusammen mit scrollMaxPx) – vorerst nur Round the Pinball */
  autoScroll?: boolean;
}) {
  const ns = useNotificationSettings();
  const nsRef = useRef(ns);
  nsRef.current = ns;
  const soundOnRef = useRef(soundOn ?? variant === "admin");
  soundOnRef.current = soundOn ?? variant === "admin";
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!collapsible) return;
    try {
      setOpen(window.localStorage.getItem("pb_tickerOpen") !== "0");
    } catch {
      /* ignore */
    }
  }, [collapsible]);
  const toggle = () => {
    setOpen((o) => {
      try {
        window.localStorage.setItem("pb_tickerOpen", o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  };
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [missing, setMissing] = useState(false);
  const seenRef = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  // 🔊 höchstens EIN Ton pro Aktualisierung; nicht, wenn dieselbe Mitteilung hier schon als Einblendung klingt
  function playTickerSound(neu: FeedItem[]) {
    if (!soundOnRef.current || variant === "phone") return;
    const cur = nsRef.current;
    for (const x of neu) {
      const t = notifSetting(cur, x.kind, "ticker");
      if (!t.enabled || t.sound === "none") continue;
      const popup = notifSetting(cur, x.kind, variant === "tv" ? "tv" : "admin");
      if (popup.enabled && popup.sound !== "none") continue;
      playSoundById(t.sound, t.volume);
      return;
    }
  }

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/public/feed?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.ok) return;
          const list: FeedItem[] = j.items ?? [];
          setMissing(!!j.tableMissing);
          // neu dazugekommene Einträge kurz hervorheben (nicht beim ersten Laden)
          if (seenRef.current) {
            const neu = list.filter((x) => !seenRef.current!.has(x.id)).map((x) => x.id);
            if (neu.length) {
              setFresh(new Set(neu));
              window.setTimeout(() => !cancelled && setFresh(new Set()), 6000);
              playTickerSound(list.filter((x) => neu.includes(x.id)));
            }
          }
          seenRef.current = new Set(list.map((x) => x.id));
          setItems(list);
        })
        .catch(() => {});
    load();
    refreshListeners.add(load);
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, refreshMs);
    return () => {
      cancelled = true;
      refreshListeners.delete(load);
      window.clearInterval(t);
    };
  }, [code, refreshMs]);

  const shown = (items ?? []).filter((x) => notifSetting(ns, x.kind, "ticker").enabled).slice(0, maxItems);

  // 📜 TV: scrollbare Liste läuft von selbst – 10 s oben stehen, nach unten springen, kurz warten,
  //    dann langsam wieder nach oben scrollen (älteste → neueste) und oben erneut 10 s stehen.
  //    Neue Meldung → sofort nach oben, Ablauf beginnt von vorn.
  const listRef = useRef<HTMLUListElement | null>(null);
  const newestId = shown[0]?.id ?? null;

  // ⬆️ neue Meldung → Ticker nach oben (auch wenn jemand von Hand runtergescrollt hat):
  //    eigene Liste + umgebende Scroll-Bereiche (z. B. das verschiebbare Ticker-Fenster)
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firstNewestRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (firstNewestRef.current === undefined) {
      firstNewestRef.current = newestId; // erster Stand: nichts tun
      return;
    }
    if (newestId == null || newestId === firstNewestRef.current) return;
    firstNewestRef.current = newestId;
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      const oy = window.getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight && el.scrollTop > 0) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [newestId]);
  const autoScroll = autoScrollProp && variant === "tv" && !!scrollMaxPx;
  useEffect(() => {
    const el = listRef.current;
    if (!autoScroll || !el) return;
    let cancelled = false;
    let raf = 0;
    let timer: number | undefined;
    el.scrollTo({ top: 0, behavior: "smooth" });
    const waitTop = () => {
      timer = window.setTimeout(jumpDown, AUTO_TOP_MS);
    };
    const jumpDown = () => {
      if (cancelled) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 4) return waitTop(); // passt alles hinein → nichts zu scrollen, später erneut prüfen
      el.scrollTo({ top: max, behavior: "smooth" }); // zügig ans Ende
      timer = window.setTimeout(scrollUp, AUTO_BOTTOM_MS);
    };
    const scrollUp = () => {
      if (cancelled) return;
      let last = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        el.scrollTop = Math.max(0, el.scrollTop - (now - last) * AUTO_SPEED);
        last = now;
        if (el.scrollTop <= 1) waitTop();
        else raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    waitTop();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [newestId, autoScroll]);
  const tv = variant === "tv";

  // 📱 Laufband (Handy unter der Match-Eintragung): eine schmale Zeile, Meldungen laufen durch
  if (variant === "strip") {
    if (!shown.length) return null;
    // "On fire!" + Text → kein "!:" (nach ! oder ? nur Leerzeichen, sonst Doppelpunkt)
    const line = shown
      .map((x) => {
        const sc = scopeOf(x.kind);
        const tag = sc ? `[${SCOPE_INFO[sc].icon} ${SCOPE_INFO[sc].label}] ` : "";
        return `${x.icon} ${x.title}${/[!?]$/.test(x.title) ? "" : ":"} ${tag}${x.body}`;
      })
      .join("     •     ");
    const seconds = Math.max(18, Math.round(line.length * 0.18)); // längerer Text → langsamer, gleichmäßiges Tempo
    return (
      <div className={"overflow-hidden rounded-xl bg-neutral-900 py-1.5 text-xs text-white/90 " + className} title="📣 Live-Ticker">
        <div className="flex w-max" style={{ animation: `tickerScroll ${seconds}s linear infinite` }}>
          {/* doppelt hintereinander → nahtlose Schleife */}
          <span className="whitespace-nowrap pl-4 pr-10">📣 {line}</span>
          <span className="whitespace-nowrap pl-4 pr-10" aria-hidden="true">
            📣 {line}
          </span>
        </div>
        <style>{`@keyframes tickerScroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={
        (tv
          ? "rounded-3xl bg-white/[0.04] p-4 ring-1 ring-white/10 "
          : "rounded-2xl border bg-white p-3 ") + className
      }
    >
      {title ? (
        collapsible ? (
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center justify-between text-left text-sm font-semibold"
            title={open ? "Einklappen" : "Ausklappen"}
          >
            <span>
              📣 Live-Ticker
              {!open && shown.length ? (
                <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                  {shown.length}
                </span>
              ) : null}
            </span>
            <span className="text-xs text-neutral-400">{open ? "▲" : "▼"}</span>
          </button>
        ) : (
          <div className={tv ? "mb-2 text-lg font-bold text-white/70" : "mb-2 text-sm font-semibold"}>📣 Live-Ticker</div>
        )
      ) : null}
      {collapsible && !open ? null : collapsible ? <div className="mt-2" /> : null}
      {collapsible && !open ? null : missing ? (
        <div className={tv ? "text-sm text-white/40" : "text-xs text-neutral-500"}>
          Ticker noch nicht eingerichtet (supabase_tournament_feed.sql ausführen).
        </div>
      ) : items == null ? (
        <div className={tv ? "text-sm text-white/40" : "text-xs text-neutral-400"}>Lade …</div>
      ) : !shown.length ? (
        <div className={tv ? "text-base text-white/40" : "text-xs text-neutral-400"}>Noch keine Meldungen – gleich geht's los.</div>
      ) : (
        <ul
          ref={listRef}
          className={(tv ? "space-y-2" : "space-y-1.5") + (scrollMaxPx ? " overflow-y-auto pr-1" : "")}
          style={
            scrollMaxPx
              ? { maxHeight: scrollMaxPx, scrollbarWidth: "thin", scrollbarColor: tv ? "rgba(255,255,255,0.25) transparent" : undefined }
              : undefined
          }
        >
          {shown.map((x) => {
            const isNew = fresh.has(x.id);
            const gold = x.kind === "flawless"; // 🥋 Flawless Victory: goldener Eintrag
            return (
              <li
                key={x.id}
                className={
                  "flex items-start gap-2 rounded-xl transition-colors duration-1000 " +
                  (gold
                    ? tv
                      ? "bg-gradient-to-r from-amber-400/40 via-yellow-300/30 to-amber-500/40 px-3 py-2 ring-2 ring-amber-300/70"
                      : "bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-200 px-2 py-1.5 ring-2 ring-amber-300"
                    : tv
                    ? "px-3 py-2 " + (isNew ? "bg-amber-400/20 ring-1 ring-amber-300/50" : "bg-white/[0.03]")
                    : "px-2 py-1.5 " + (isNew ? "bg-amber-50 ring-1 ring-amber-200" : "bg-neutral-50"))
                }
                style={isNew ? { animation: "tickerIn 0.6s ease-out both" } : undefined}
              >
                <span className={tv ? "text-2xl leading-none" : "text-base leading-none"}>{x.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className={tv ? "text-base font-bold text-white" : "text-xs font-semibold text-neutral-800"}>
                      {x.title}
                    </span>
                    <ScopeChip kind={x.kind} variant={tv ? "dark" : "light"} />
                  </span>
                  <span className={tv ? "block text-sm text-white/70" : "block text-[11px] leading-snug text-neutral-600"}>
                    {x.body}
                  </span>
                </span>
                <span className={tv ? "shrink-0 text-sm tabular-nums text-white/40" : "shrink-0 text-[10px] tabular-nums text-neutral-400"}>
                  {timeFmt(x.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <style>{`@keyframes tickerIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}
