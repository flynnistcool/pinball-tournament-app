"use client";

// 📣 Live-Ticker: Mitteilungen des Turniers wie ein Chat – neueste oben, ältere rutschen nach unten.
// - Lesen: GET /api/public/feed (TV, Admin, Handy)
// - Eintragen: postFeedItems() – nur vom Admin-Tablet (POST /api/feed/add, Admin-Pflicht)
// - Welche Arten im Ticker erscheinen: 🔔 Meldungen & Sounds, Spalte "📣 Ticker"

import { useEffect, useRef, useState } from "react";
import type { FeedItem, FeedItemInput } from "@/lib/feed";
import { NOTIFICATIONS, SCOPE_INFO, notifSetting, scopeOf } from "@/lib/notifications";

// Icons aus den Einstellungen statt des gespeicherten Icons – nur für Arten mit festem Icon
// (andere Arten wählen ihr Icon je Meldung, z. B. Serien/Momente). Alte 🎯-Icons werden immer ersetzt.
const FIXED_ICON_KINDS = new Set(["superfinalGame"]);
const REGISTRY_ICON: Record<string, string> = Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, n.icon]));
function tickerIcon(x: { kind: string; icon: string }): string {
  const reg = REGISTRY_ICON[x.kind];
  if (reg && (FIXED_ICON_KINDS.has(x.kind) || x.icon === "🎯")) return reg;
  return x.icon;
}
import ScopeChip from "@/components/ScopeChip";
import { fmtScore, posLabel, shortLines, type ShortMatchLine, type ShortWaveLine } from "@/lib/shortNews";
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

/** 📰 Turnier-Shortnews: Plätze/Scores aus data.lines (lib/shortNews.ts) */
function ShortNewsBody({ item, tv }: { item: FeedItem; tv: boolean }) {
  const strong = tv ? "font-bold text-white" : "font-semibold text-neutral-900";
  const soft = tv ? "text-white/80" : "text-neutral-700";
  const lines = shortLines(item);
  if (item.kind === "matchShort") {
    const machine = item.data?.machine ? String(item.data.machine) : "";
    const machineIcon = item.data?.machineIcon ? String(item.data.machineIcon) : "";
    return (
      <span className="mt-0.5 flex flex-col gap-0.5">
        {/* Flipper steht schon im Titel ("Ergebnis auf 🎱 Elvira"); nur bei alten Meldungen ohne Flipper-Angabe fehlt er */}
        {!machine && machineIcon ? <span className={strong}>{machineIcon}</span> : null}
        {/* 🥇 Name   🥈 Name … */}
        <span className={"flex flex-wrap gap-x-3 gap-y-0.5 " + soft}>
          {(lines as ShortMatchLine[]).map((l, i) => (
            <span key={i} className="whitespace-nowrap">
              {posLabel(l.pos)} <b className={strong}>{l.name}</b>
              {l.score != null ? <span className="tabular-nums"> {fmtScore(l.score)}</span> : null}
            </span>
          ))}
        </span>
      </span>
    );
  }
  return (
    <span className={"mt-0.5 flex flex-col " + (tv ? "gap-1 " : "gap-0.5 ") + soft}>
      {(lines as ShortWaveLine[]).map((l, i) => (
        <span key={i} className="flex flex-col">
          <b className={strong}>{l.name}</b>
          <span>
            {l.machineIcon ? `${l.machineIcon} ` : ""}{l.machine}: <b className={strong}>Platz {l.place}</b> mit{" "}
            <b className={strong + " tabular-nums"}>{fmtScore(l.score)}</b>
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * ✅ Runde abgeschlossen / Durchgang geschafft: Rückblick-Text (lib/roundSummary.ts summaryText)
 * zeilenweise mit Icon, Namen fett, Flipper dezent – nur Darstellung, Text unverändert
 */
function RoundDoneBody({ body, tv }: { body: string; tv: boolean }) {
  const strong = tv ? "font-bold text-white" : "font-semibold text-neutral-900";
  const soft = tv ? "text-white/80" : "text-neutral-700";
  const parts = body.split(" · ");
  const lines = parts.map((part, i) => {
    let icon = "•";
    let content: React.ReactNode = part;
    const win = part.match(/^(Rundensieger|Vorn an ihrem Flipper): (.+)$/);
    const top = part.match(/^Höchster Score: (.+) an (.+) – ([\d.]+)$/);
    const lead = part.match(/^Führend: (.+) \((.+)\)$/);
    const takes = part.match(/^(.+) übernimmt die Führung \((.+)\)$/);
    const climb = part.match(/^(.+) rückt auf (Platz \d+) vor$/);
    if (win) {
      icon = "🥇";
      const ws = Array.from(win[2].matchAll(/([^,]+?) \(([^)]*)\)(?:, |$)/g));
      content = (
        <>
          <span className={soft}>{win[1]}: </span>
          {ws.length
            ? ws.map((w, k) => (
                <span key={k} className="whitespace-nowrap">
                  {k > 0 ? <span className={soft}> · </span> : null}
                  <b className={strong}>{w[1].trim()}</b> <span className={soft}>({w[2]})</span>
                </span>
              ))
            : win[2]}
        </>
      );
    } else if (top) {
      icon = "🚀";
      content = (
        <>
          <span className={soft}>Höchster Score: </span>
          <b className={strong}>{top[1]}</b> <span className={soft}>an {top[2]} –</span> <b className={strong}>{top[3]}</b>
        </>
      );
    } else if (lead) {
      icon = "📈";
      content = (
        <>
          <span className={soft}>Führend: </span>
          <b className={strong}>{lead[1]}</b> <span className={soft}>({lead[2]})</span>
        </>
      );
    } else if (takes) {
      icon = "📈";
      content = (
        <>
          <b className={strong}>{takes[1]}</b> übernimmt die Führung <span className={soft}>({takes[2]})</span>
        </>
      );
    } else if (climb) {
      icon = "⬆️";
      content = (
        <>
          <b className={strong}>{climb[1]}</b> rückt auf {climb[2]} vor
        </>
      );
    } else if (parts.length === 1) {
      return <span key={i}>{part}</span>; // z. B. "Alle Plätze vergeben."
    }
    return (
      <span key={i} className="flex gap-1.5">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0">{content}</span>
      </span>
    );
  });
  return <span className={"mt-0.5 flex flex-col " + (tv ? "gap-1 text-white/80" : "gap-0.5 text-neutral-700")}>{lines}</span>;
}

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
  autoTopMs = AUTO_TOP_MS,
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
  /** 📜 so lange oben stehen bleiben, bevor wieder gescrollt wird (Standard 10 s) */
  autoTopMs?: number;
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
      timer = window.setTimeout(jumpDown, autoTopMs);
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
  }, [newestId, autoScroll, autoTopMs]);
  const tv = variant === "tv";

  // 📱 Laufband (Handy unter der Match-Eintragung): eine schmale Zeile, Meldungen laufen durch
  if (variant === "strip") {
    if (!shown.length) return null;
    // "On fire!" + Text → kein "!:" (nach ! oder ? nur Leerzeichen, sonst Doppelpunkt)
    const line = shown
      .map((x) => {
        const sc = scopeOf(x.kind);
        const tag = sc ? `[${SCOPE_INFO[sc].icon} ${SCOPE_INFO[sc].label}] ` : "";
        return `${tickerIcon(x)} ${x.title}${/[!?]$/.test(x.title) ? "" : ":"} ${tag}${x.body}`;
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
            // 🧪 zum Ausprobieren: dünner Rand je Bereich (Turnier = blau + dezenter Verlauf, Allzeit = sand)
            const sc = scopeOf(x.kind);
            const roundEntry = x.kind === "roundStart" || x.kind === "roundDone" || x.kind === "tournamentEnd";
            const SHOW_EDGE = false; // 🧪 dünner Rand gerade ausgeschaltet (nur Verlauf)
            const edge = !SHOW_EDGE
              ? ""
              : sc === "turnier"
                ? tv
                  ? " border border-sky-400/50"
                  : " border border-sky-300"
                : sc === "allzeit"
                ? tv
                  ? " border border-amber-200/45"
                  : " border border-[#e6d3a8]"
                : "";
            return (
              <li
                key={x.id}
                className={
                  "flex items-start gap-2 rounded-xl transition-colors duration-1000 " +
                  (gold
                    ? tv
                      ? "bg-gradient-to-r from-amber-400/40 via-yellow-300/30 to-amber-500/40 px-3 py-2 ring-2 ring-amber-300/70"
                      : "bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-200 px-2 py-1.5 ring-2 ring-amber-300"
                    : (tv
                        ? "px-3 py-2 " +
                          (isNew
                            ? "bg-amber-400/20 ring-1 ring-amber-300/50"
                            : sc === "turnier"
                            ? roundEntry
                              ? "bg-gradient-to-r from-sky-400/[0.18] to-sky-400/[0.07]"
                              : "bg-gradient-to-r from-sky-400/15 to-sky-400/[0.05]"
                            : sc === "allzeit"
                            ? "bg-gradient-to-r from-amber-200/15 to-amber-200/[0.05]"
                            : sc === "duell"
                            ? "bg-gradient-to-r from-rose-400/15 to-rose-400/[0.05]"
                            : "bg-white/[0.03]")
                        : "px-2 py-1.5 " +
                          (isNew
                            ? "bg-amber-50 ring-1 ring-amber-200"
                            : sc === "turnier"
                            ? roundEntry
                              ? "bg-gradient-to-r from-[#e3f2fc] to-[#f0f8fe]" // Runde generiert/abgeschlossen: etwas kräftiger
                              : "bg-gradient-to-r from-sky-50 to-[#f5fafe]"
                            : sc === "allzeit"
                            ? "bg-gradient-to-r from-[#f8efdc] to-[#fdf9f1]"
                            : sc === "duell"
                            ? "bg-gradient-to-r from-rose-50 to-[#fff7f8]"
                            : "bg-neutral-50")) + edge)
                }
                style={{
                  ...(isNew ? { animation: "tickerIn 0.6s ease-out both" } : {}),
                  ...(x.kind === "premiereWin" || x.kind === "upset" || x.kind === "superfinalStart" || x.kind === "superfinalChampion"
                    ? { position: "relative", overflow: "hidden", isolation: "isolate" }
                    : {}),
                }}
              >
                {/* 🎉 Premieren-Sieg: dezentes Konfetti + funkelnde Sternchen rechts im Kästchen */}
                {x.kind === "premiereWin" ? <TickerConfetti tv={tv} /> : null}
                {/* 🧊 Favoritensturz: Eissplitter + Riss + ⚡ */}
                {x.kind === "upset" ? <TickerIceCrack tv={tv} /> : null}
                {/* 🏆 Superfinale gestartet / 👑 Super Grand Champion: gold-sandfarbene Sterne */}
                {x.kind === "superfinalStart" || x.kind === "superfinalChampion" ? <TickerGoldStars tv={tv} /> : null}
                <span className={tv ? "text-2xl leading-none" : "text-base leading-none"}>{tickerIcon(x)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className={tv ? "text-base font-bold text-white" : "text-xs font-semibold text-neutral-800"}>
                      {/* 🏁 Match-Ergebnis: "Ergebnis auf 🎱 Elvira" – Plätze stehen darunter */}
                      {x.kind === "matchShort" && x.data?.machine
                        ? `Ergebnis auf ${x.data?.machineIcon ? `${String(x.data.machineIcon)} ` : ""}${String(x.data.machine)}`
                        : x.title}
                    </span>
                    <ScopeChip kind={x.kind} variant={tv ? "dark" : "light"} />
                  </span>
                  {x.kind === "tournamentEnd" ? (
                    // 🏁 Podest: Zeile "Champions" + Namen fett, etwas größer ("🏆 test3 · 🥈 test2 · 🥉 test1")
                    <span className="block">
                      <span
                        className={
                          tv
                            ? "block text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/90"
                            : "block text-[9px] font-black uppercase tracking-[0.3em] text-amber-600"
                        }
                      >
                        ✦ Champions ✦
                      </span>
                      <span className={tv ? "block text-base text-white/70" : "block text-[13px] leading-snug text-neutral-600"}>
                        {x.body.split(" · ").map((part, i) => {
                          const m0 = part.trim().match(/^(\S+)\s+(.+)$/);
                          const m = m0 && !/^[\p{L}\p{N}]/u.test(m0[1]) ? m0 : null; // nur Emoji als Medaille
                          return (
                            <span key={i}>
                              {i > 0 ? " · " : ""}
                              {m ? <span className={tv ? "text-lg" : "text-sm"}>{m[1]} </span> : null}
                              <b className={tv ? "font-bold text-white" : "font-semibold text-neutral-800"}>{m ? m[2] : part.trim()}</b>
                            </span>
                          );
                        })}
                      </span>
                    </span>
                  ) : (
                    <span className={tv ? "block text-sm text-white/70" : "block text-[11px] leading-snug text-neutral-600"}>
                      {x.kind === "roundDone" ? (
                        <RoundDoneBody body={x.body} tv={tv} />
                      ) : (x.kind === "matchShort" || x.kind === "waveShort") && shortLines(x).length ? (
                        <ShortNewsBody item={x} tv={tv} />
                      ) : x.kind === "superfinalChampion" && x.body.includes(" gewinnt ") ? (
                        // 👑 Siegername fett ("test2 gewinnt das Superfinale – Endstand: …")
                        <>
                          <b className={tv ? "font-bold text-white" : "font-semibold text-neutral-800"}>
                            {x.body.slice(0, x.body.indexOf(" gewinnt "))}
                          </b>
                          {x.body.slice(x.body.indexOf(" gewinnt "))}
                        </>
                      ) : (
                        x.body
                      )}
                    </span>
                  )}
                </span>
                <span className={tv ? "shrink-0 text-sm tabular-nums text-white/40" : "shrink-0 text-[10px] tabular-nums text-neutral-400"}>
                  {timeFmt(x.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <style>{`@keyframes tickerIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }
@keyframes tickerTwinkle { 0%, 100% { opacity: 0.15; transform: scale(0.7) } 50% { opacity: 1; transform: scale(1.15) } }`}</style>
    </div>
  );
}

/** 🎉 kleines, festes Konfetti + funkelnde Sternchen (rechte Hälfte, hinter dem Text) */
function TickerConfetti({ tv }: { tv: boolean }) {
  const colors = ["#f472b6", "#fbbf24", "#60a5fa", "#34d399", "#a78bfa", "#fb923c"];
  const bits = Array.from({ length: 14 }, (_, i) => ({
    left: 48 + ((i * 37) % 50), // % – nur rechte Hälfte, damit der Text frei bleibt
    top: 8 + ((i * 53) % 80),
    w: 4 + (i % 3) * 2,
    h: i % 2 ? 3 : 6,
    rot: (i * 47) % 180,
    color: colors[i % colors.length],
  }));
  const stars = [
    { left: 62, top: 18, d: 0 },
    { left: 84, top: 58, d: 0.7 },
    { left: 74, top: 78, d: 1.3 },
    { left: 93, top: 22, d: 1.9 },
  ];
  return (
    // zIndex -1 (im eigenen Stapel des Kästchens): Konfetti liegt HINTER dem Text, aber über dem Hintergrund
    <span className="pointer-events-none absolute inset-0" style={{ zIndex: -1 }} aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-[1px]"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.w,
            height: b.h,
            background: b.color,
            opacity: tv ? 0.45 : 0.35,
            transform: `rotate(${b.rot}deg)`,
          }}
        />
      ))}
      {stars.map((st, i) => (
        <span
          key={"s" + i}
          className={"absolute leading-none " + (tv ? "text-sm" : "text-[10px]")}
          style={{ left: `${st.left}%`, top: `${st.top}%`, animation: `tickerTwinkle 2.4s ease-in-out ${st.d}s infinite` }}
        >
          ✨
        </span>
      ))}
    </span>
  );
}

/** 🧊 Favoritensturz: zersplittertes Eis (Splitter + Riss-Blitz + funkelnde ⚡), hinter dem Text */
function TickerIceCrack({ tv }: { tv: boolean }) {
  const shards = Array.from({ length: 11 }, (_, i) => ({
    left: 46 + ((i * 41) % 52),
    top: 6 + ((i * 59) % 82),
    size: 6 + (i % 4) * 3,
    rot: (i * 67) % 360,
    color: ["#a5f3fc", "#7dd3fc", "#e0f2fe", "#67e8f9"][i % 4],
  }));
  const bolts = [
    { left: 70, top: 14, d: 0 },
    { left: 90, top: 60, d: 1.1 },
  ];
  return (
    <span className="pointer-events-none absolute inset-0" style={{ zIndex: -1 }} aria-hidden="true">
      {/* Riss quer durch die rechte Hälfte */}
      <svg className="absolute inset-y-0 right-0 h-full w-1/2" viewBox="0 0 100 40" preserveAspectRatio="none">
        <polyline
          points="0,8 22,14 30,6 48,20 60,12 78,26 88,18 100,30"
          fill="none"
          stroke={tv ? "rgba(165,243,252,0.55)" : "rgba(14,165,233,0.35)"}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points="48,20 52,34 58,30"
          fill="none"
          stroke={tv ? "rgba(165,243,252,0.4)" : "rgba(14,165,233,0.25)"}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {shards.map((b, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: b.size,
            background: b.color,
            opacity: tv ? 0.5 : 0.55,
            clipPath: "polygon(50% 0%, 100% 70%, 30% 100%)", // Splitter-Dreieck
            transform: `rotate(${b.rot}deg)`,
          }}
        />
      ))}
      {bolts.map((st, i) => (
        <span
          key={"b" + i}
          className={"absolute leading-none " + (tv ? "text-sm" : "text-[10px]")}
          style={{ left: `${st.left}%`, top: `${st.top}%`, animation: `tickerTwinkle 2s ease-in-out ${st.d}s infinite` }}
        >
          ⚡
        </span>
      ))}
    </span>
  );
}

/** 🏆 Superfinale: gold-/sandfarbene Sterne (feste Sterne + einige funkelnde), hinter dem Text */
function TickerGoldStars({ tv }: { tv: boolean }) {
  const stars = Array.from({ length: 12 }, (_, i) => ({
    left: 44 + ((i * 43) % 54),
    top: 4 + ((i * 61) % 84),
    size: 8 + (i % 4) * 3,
    color: ["#d4a017", "#e6c46b", "#c9a45c", "#f0d78c"][i % 4],
    twinkle: i % 3 === 0,
    d: (i * 0.37) % 2,
  }));
  return (
    <span className="pointer-events-none absolute inset-0" style={{ zIndex: -1 }} aria-hidden="true">
      {stars.map((st, i) => (
        <span
          key={i}
          className="absolute leading-none"
          style={{
            left: `${st.left}%`,
            top: `${st.top}%`,
            fontSize: st.size,
            color: st.color,
            opacity: tv ? 0.6 : 0.55,
            ...(st.twinkle ? { animation: `tickerTwinkle 2.6s ease-in-out ${st.d}s infinite` } : {}),
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}
