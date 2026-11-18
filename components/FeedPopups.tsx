"use client";

// 🪧 Karten (TV / Admin) für Ticker-Meldungen, die sonst keine eigene Einblendung haben
// – z. B. 🕹️ Superfinale: Finalspiel (Sieger + Zwischenstand).
// Liest den Live-Ticker (/api/public/feed); beim ersten Laden vorhandene Einträge lösen nichts aus.
// An/Aus, Dauer, Sound je Gerät: 🔔 Meldungen & Sounds.

import { useEffect, useRef, useState, type CSSProperties } from "react";
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert (createPortal funktioniert trotzdem)
import { createPortal } from "react-dom";
import type { FeedItem } from "@/lib/feed";
import { notifSetting } from "@/lib/notifications";
import { playSoundById } from "@/lib/playSound";
import { useNotificationSettings } from "@/components/useNotificationSettings";
import { fmtScore, posLabel, shortLines, type ShortMatchLine, type ShortWaveLine } from "@/lib/shortNews";

/** Arten, die als Karte aus dem Ticker kommen */
const FROM_FEED = new Set(["superfinalGame", "superfinalChampion", "tournamentEnd", "matchShort", "waveShort"]);
/** 📰 Shortnews: kleine Karte unten links, eigene Warteschlange (hält die großen Karten nicht auf) */
const SMALL_KINDS = new Set(["matchShort", "waveShort"]);
/** große Karte in der Mitte mit Effekten */
const BIG_KINDS = new Set(["superfinalChampion", "tournamentEnd"]);

/** 👑 Effekte hinter/über der Champion-Karte: Lichtstrahlen, Konfetti-Regen, Funkel-Sterne */
const CONFETTI_COLORS = ["#fbbf24", "#f59e0b", "#fde68a", "#fb923c", "#f43f5e", "#38bdf8", "#a3e635", "#ffffff"];
function ChampionFx() {
  // feste Pseudo-Zufallswerte (gleiches Bild bei jedem Rendern)
  const rnd = (i: number, k: number) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const confetti = Array.from({ length: 70 }, (_, i) => ({
    left: rnd(i, 1) * 100,
    delay: rnd(i, 2) * 2.5,
    dur: 2.8 + rnd(i, 3) * 2.2,
    size: 7 + rnd(i, 4) * 9,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: rnd(i, 5) > 0.6,
    drift: (rnd(i, 6) - 0.5) * 160,
  }));
  const stars = Array.from({ length: 14 }, (_, i) => ({
    a: (i / 14) * Math.PI * 2,
    r: 34 + rnd(i, 7) * 14,
    delay: rnd(i, 8) * 1.4,
    size: 14 + rnd(i, 9) * 18,
  }));
  return (
    <>
      <style>{`@keyframes feedRays { to { transform: translate(-50%,-50%) rotate(360deg) } }
@keyframes feedFall { 0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 1 } 100% { transform: translate3d(var(--dx),110vh,0) rotate(720deg); opacity: 0.9 } }
@keyframes feedStar { 0%,100% { transform: translate(-50%,-50%) scale(0.2); opacity: 0 } 50% { transform: translate(-50%,-50%) scale(1); opacity: 1 } }
@keyframes feedShine { 0% { left: -50% } 60%,100% { left: 130% } }
@keyframes feedGlow { 0%,100% { box-shadow: 0 0 60px rgba(251,191,36,0.55) } 50% { box-shadow: 0 0 120px rgba(251,191,36,0.95) } }
@keyframes feedFlash { 0% { opacity: 0.85 } 100% { opacity: 0 } }`}</style>
      {/* kurzer Lichtblitz beim Erscheinen */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-amber-100" style={{ animation: "feedFlash 0.8s ease-out both" }} />
      {/* drehende Lichtstrahlen */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-1/2 h-[180vmax] w-[180vmax] opacity-60"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, rgba(253,230,138,0.35) 0deg 8deg, rgba(253,230,138,0) 8deg 20deg)",
          maskImage: "radial-gradient(circle, black 0%, transparent 55%)",
          WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 55%)",
          animation: "feedRays 14s linear infinite",
        }}
      />
      {/* Funkel-Sterne rund um die Mitte */}
      {stars.map((st, i) => (
        <span
          key={"s" + i}
          aria-hidden
          className="pointer-events-none fixed text-amber-200"
          style={{
            left: `calc(50% + ${Math.cos(st.a) * st.r}vmin)`,
            top: `calc(50% + ${Math.sin(st.a) * st.r * 0.8}vmin)`,
            fontSize: st.size,
            animation: `feedStar 1.6s ease-in-out ${st.delay}s infinite`,
            textShadow: "0 0 12px rgba(253,230,138,0.9)",
          }}
        >
          ✦
        </span>
      ))}
      {/* Konfetti-Regen */}
      {confetti.map((c, i) => (
        <span
          key={"c" + i}
          aria-hidden
          className="pointer-events-none fixed top-0"
          style={
            {
              left: `${c.left}%`,
              width: c.size,
              height: c.round ? c.size : c.size * 0.45,
              background: c.color,
              borderRadius: c.round ? "9999px" : "2px",
              "--dx": `${c.drift}px`,
              animation: `feedFall ${c.dur}s linear ${c.delay}s infinite`,
              opacity: 0,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

export default function FeedPopups({
  code,
  variant,
  soundOn = false,
}: {
  code: string;
  variant: "tv" | "admin";
  /** TV: erst nach "🔊 Ton aktivieren" */
  soundOn?: boolean;
}) {
  const ns = useNotificationSettings();
  const nsRef = useRef(ns);
  nsRef.current = ns;
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [smallQueue, setSmallQueue] = useState<FeedItem[]>([]);
  const seenRef = useRef<Set<number> | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/public/feed?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.ok) return;
          const list: FeedItem[] = (j.items ?? []).filter((x: FeedItem) => FROM_FEED.has(x.kind));
          if (!seenRef.current) {
            seenRef.current = new Set(list.map((x) => x.id)); // Bestand: nicht anzeigen
            return;
          }
          const fresh = list.filter((x) => !seenRef.current!.has(x.id)).reverse(); // älteste zuerst
          fresh.forEach((x) => seenRef.current!.add(x.id));
          const small = fresh.filter((x) => SMALL_KINDS.has(x.kind));
          const big = fresh.filter((x) => !SMALL_KINDS.has(x.kind));
          if (big.length) setQueue((q) => [...q, ...big]);
          if (small.length) setSmallQueue((q) => [...q, ...small]);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(() => !document.hidden && load(), 6_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [code]);

  const current = queue[0] ?? null;
  useEffect(() => {
    if (!current) return;
    const st = notifSetting(nsRef.current, current.kind, variant);
    if (!st.enabled) {
      setQueue((q) => q.slice(1));
      return;
    }
    // 🏁 Turnierende am TV: Ton (Trommelwirbel + Fanfare) kommt schon mit der Siegerehrung
    const ownSound = !(variant === "tv" && current.kind === "tournamentEnd");
    if (ownSound && (variant === "tv" ? soundOn : true) && st.sound !== "none") playSoundById(st.sound, st.volume);
    const t = window.setTimeout(
      () => setQueue((q) => q.slice(1)),
      st.ms ?? (BIG_KINDS.has(current.kind) ? 10_000 : 7_000)
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // 📰 kleine Shortnews-Karte
  const small = smallQueue[0] ?? null;
  useEffect(() => {
    if (!small) return;
    const st = notifSetting(nsRef.current, small.kind, variant);
    if (!st.enabled) {
      setSmallQueue((q) => q.slice(1));
      return;
    }
    if ((variant === "tv" ? soundOn : true) && st.sound !== "none") playSoundById(st.sound, st.volume);
    const t = window.setTimeout(() => setSmallQueue((q) => q.slice(1)), st.ms ?? 5_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [small]);

  if (!mounted) return null;
  const smallEl = small ? (
    <ShortNewsCard
      key={small.id}
      item={small}
      onClose={variant === "admin" ? () => setSmallQueue((q) => q.slice(1)) : undefined}
    />
  ) : null;
  if (!current) return smallEl;
  const close = variant === "admin" ? () => setQueue((q) => q.slice(1)) : undefined;
  if (BIG_KINDS.has(current.kind)) {
    // 👑 Super Grand Champion (gold) / 🏁 Turnier beendet (blau): große Karte in der Mitte
    const isEnd = current.kind === "tournamentEnd";
    return (
      <>
      {smallEl}
      {createPortal(
      <div
        className={
          "fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 " +
          (close ? "cursor-pointer" : "pointer-events-none")
        }
        onClick={close}
        role={close ? "button" : undefined}
      >
        <style>{`@keyframes feedChampIn { 0% { opacity: 0; transform: scale(0.7) } 60% { opacity: 1; transform: scale(1.05) } 100% { transform: scale(1) } }
@keyframes feedCrown { 0%,100% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-8px) rotate(6deg) } }`}</style>
        <ChampionFx />
        <div
          className={
            "relative isolate max-w-[min(92vw,900px)] overflow-hidden rounded-[2rem] bg-gradient-to-br px-[max(24px,4vw)] py-[max(20px,3vw)] text-center text-white ring-4 " +
            (isEnd ? "from-sky-400 via-blue-600 to-indigo-800 ring-sky-100/70" : "from-amber-300 via-amber-500 to-orange-700 ring-amber-100/70")
          }
          style={{ animation: "feedChampIn 0.7s ease-out both, feedGlow 1.6s ease-in-out 0.7s infinite" }}
        >
          {/* Glanz, der über die Karte wischt */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/2 -z-10 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
            style={{ animation: "feedShine 2.4s ease-in-out 0.6s infinite" }}
          />
          <div className="text-[max(56px,7vw)] leading-none" style={{ animation: "feedCrown 2s ease-in-out infinite" }}>
            {current.icon}
          </div>
          <div className={"mt-2 text-[max(14px,1.4vw)] font-bold uppercase tracking-[0.3em] " + (isEnd ? "text-sky-100" : "text-amber-50")}>
            {isEnd ? "🏆 Siegerehrung" : "🔥 Superfinale entschieden"}
          </div>
          <div className="mt-2 text-[max(30px,4.2vw)] font-black leading-tight drop-shadow">{current.title}</div>
          {isEnd && current.body ? (
            // "🏆 test3 · 🥈 test2 · 🥉 test1" → Podest-Zeilen, Namen fett
            <div className="mt-4 flex flex-col items-center gap-2">
              <div
                className="mb-1 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-[max(18px,2.2vw)] font-black uppercase tracking-[0.35em] text-transparent drop-shadow"
                style={{ animation: "feedChampIn 0.6s ease-out 0.3s both" }}
              >
                ✦ Champions ✦
              </div>
              {current.body.split(" · ").map((part, i) => {
                const m0 = part.trim().match(/^(\S+)\s+(.+)$/);
                const m = m0 && !/^[\p{L}\p{N}]/u.test(m0[1]) ? m0 : null; // nur Emoji als Medaille
                const medal = (m ? m[1] : "") || ["🏆", "🥈", "🥉"][i] || "";
                const name = m ? m[2] : part.trim();
                return (
                  <div
                    key={i}
                    className={
                      "flex items-center gap-3 rounded-2xl bg-white/15 px-5 py-1.5 font-extrabold " +
                      (i === 0 ? "text-[max(32px,4.2vw)]" : "text-[max(24px,2.8vw)]")
                    }
                    style={{ animation: `feedChampIn 0.6s ease-out ${0.5 + i * 0.35}s both` }}
                  >
                    {medal ? <span className="inline-block scale-125 drop-shadow">{medal}</span> : null}
                    <span>{name}</span>
                  </div>
                );
              })}
            </div>
          ) : current.body ? (() => {
            // "test2 gewinnt das Superfinale – Endstand: …" → Siegerzeile groß, Endstand klein
            const [head, ...rest] = current.body.split(" – ");
            return (
              <>
                <div className="mt-3 text-[max(22px,2.8vw)] font-extrabold text-white">{head}</div>
                {rest.length ? (
                  <div className="mt-2 text-[max(14px,1.5vw)] font-semibold text-amber-50">{rest.join(" – ")}</div>
                ) : null}
              </>
            );
          })() : null}
          {close ? <div className={"mt-3 text-xs " + (isEnd ? "text-sky-100/80" : "text-amber-100/80")}>Antippen schließt</div> : null}
        </div>
      </div>,
      document.body
      )}
      </>
    );
  }
  return (
    <>
    {smallEl}
    {createPortal(
    <div
      className={
        "fixed bottom-[4vh] right-[2vw] z-[100] max-w-[calc(100vw-1rem)] " + (close ? "cursor-pointer" : "pointer-events-none")
      }
      onClick={close}
      role={close ? "button" : undefined}
    >
      <style>{`@keyframes feedPopIn { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }`}</style>
      <div
        className="rounded-3xl bg-gradient-to-br from-amber-500 to-orange-700 px-7 py-5 text-white shadow-2xl ring-4 ring-amber-200/60"
        style={{ animation: "feedPopIn 0.5s ease-out both" }}
      >
        <div className="text-[max(14px,1.5vw)] font-bold uppercase tracking-wider text-amber-50">
          {current.icon} Superfinale
        </div>
        <div className="mt-1 text-[max(22px,2.4vw)] font-black leading-tight">{current.title}</div>
        {current.body ? (
          <div className="mt-1 text-[max(14px,1.4vw)] font-semibold text-amber-50">{current.body}</div>
        ) : null}
        {close ? <div className="mt-2 text-[11px] text-amber-100/80">Antippen schließt</div> : null}
      </div>
    </div>,
    document.body
    )}
    </>
  );
}

/** 📰 kleine Shortnews-Karte unten links (TV / Admin) */
function ShortNewsCard({ item, onClose }: { item: FeedItem; onClose?: () => void }) {
  const lines = shortLines(item);
  return createPortal(
    <div
      className={"fixed bottom-[4vh] left-[2vw] z-[99] max-w-[min(30rem,calc(100vw-1rem))] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <style>{`@keyframes feedShortIn { from { opacity: 0; transform: translateX(-16px) } to { opacity: 1; transform: none } }`}</style>
      <div
        className="rounded-2xl bg-neutral-900/90 px-4 py-3 text-white shadow-xl ring-1 ring-white/15 backdrop-blur"
        style={{ animation: "feedShortIn 0.4s ease-out both" }}
      >
        <div className="flex items-center gap-2 text-[max(11px,0.8vw)] font-semibold uppercase tracking-wider text-white/60">
          <span>📰 Turnier-Shortnews</span>
        </div>
        <div className="mt-0.5 text-[max(15px,1.2vw)] font-bold leading-snug">
          {item.icon} {item.title}
        </div>
        {lines.length ? (
          item.kind === "matchShort" ? (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[max(13px,1vw)] text-white/85">
              {(lines as ShortMatchLine[]).map((l, i) => (
                <span key={i} className="whitespace-nowrap">
                  {posLabel(l.pos)} <b className="text-white">{l.name}</b>
                  {l.score != null ? <span className="tabular-nums"> {fmtScore(l.score)}</span> : null}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-1 flex flex-col gap-0.5 text-[max(13px,1vw)] text-white/85">
              {(lines as ShortWaveLine[]).map((l, i) => (
                <span key={i} className="flex flex-col">
                  <b className="text-white">{l.name}</b>
                  <span>
                    {l.machineIcon ? `${l.machineIcon} ` : ""}{l.machine}: <b className="text-white">Platz {l.place}</b> mit{" "}
                    <b className="tabular-nums text-white">{fmtScore(l.score)}</b>
                  </span>
                </span>
              ))}
            </div>
          )
        ) : item.body ? (
          <div className="mt-1 text-[max(13px,1vw)] text-white/85">{item.body}</div>
        ) : null}
        {onClose ? <div className="mt-1 text-[10px] text-white/40">Antippen schließt</div> : null}
      </div>
    </div>,
    document.body
  );
}
