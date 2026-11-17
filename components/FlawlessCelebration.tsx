"use client";

// 🥋 Flawless Victory – große Einblendung, wenn ein Turnier makellos gewonnen wurde.
// Auslöser (nur bei einem echten Wechsel, nicht beim Öffnen eines schon fertigen Turniers):
// - Matchplay & Co. (auch Timeplay): Turnier wird beendet
// - Round the Pinball: alle Durchgänge fertig (alle Scores da) – also schon vor "Turnier beenden"
// Admin-Tablet trägt zusätzlich in den 📣 Live-Ticker ein (onFeed) – auch nachträglich beim Öffnen,
// falls der Eintrag fehlt (doppelte Einträge verhindert die eindeutige Kennung).
// Einstellbar unter 🔔 Meldungen & Sounds.

import { useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert (createPortal funktioniert trotzdem)
import { createPortal } from "react-dom";
import { flawlessMode, flawlessText, flawlessWinners, rotationAllDone, type FlawlessMode, type PlayerRun } from "@/lib/flawless";
import type { FeedItemInput } from "@/lib/feed";
import { notifSetting } from "@/lib/notifications";
import { playSoundById } from "@/lib/playSound";
import { useNotificationSettings } from "@/components/useNotificationSettings";

type Data = {
  tournament?: { status?: string | null; format?: string | null } | null;
  players?: { id: string; name?: string | null }[];
  matches?: { id: string }[];
  match_players?: { match_id: string; player_id: string; position?: number | null; score?: number | string | null }[];
};

type Shown = { playerId: string; name: string; run: PlayerRun; text: string };

/** Wartezeit bis zur Einblendung – andere Einblendungen (Siegerehrung, "alle Durchgänge geschafft") zuerst */
function delayMs(variant: "tv" | "admin", leads: boolean): number {
  if (leads) return 11_000;
  return variant === "tv" ? 12_000 : 1_500;
}

function winnersOf(data: Data, mode: FlawlessMode): Shown[] {
  const nameOf = (pid: string) => String((data.players ?? []).find((p) => String(p.id) === pid)?.name ?? "?");
  return flawlessWinners(data, mode).map((w) => ({
    playerId: w.playerId,
    name: nameOf(w.playerId),
    run: w.run,
    text: flawlessText(mode, w.run),
  }));
}

function feedItems(shown: Shown[], mode: FlawlessMode): FeedItemInput[] {
  return shown.map((x) => ({
    key: `flawless|${x.playerId}`,
    kind: "flawless",
    icon: "🥋",
    // gleicher Text wie die Einblendung: Titel · Name · Leistung · "kein einziges Duell verloren"
    title: "Flawless Victory",
    body: `${x.name} – ${x.text} – kein einziges Duell verloren`,
    players: [x.playerId],
    data: { player: x.name, n: x.run.played, beaten: x.run.beaten, mode },
  }));
}

export default function FlawlessCelebration({
  data,
  variant,
  soundOn = false,
  onFeed,
}: {
  data: Data | null;
  variant: "tv" | "admin";
  soundOn?: boolean;
  onFeed?: (items: FeedItemInput[]) => void;
}) {
  const ns = useNotificationSettings();
  const [queue, setQueue] = useState<Shown[]>([]);
  const [mounted, setMounted] = useState(false);
  const prevEndedRef = useRef<boolean | null>(null);
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;
  const backfilledRef = useRef(false); // 📣 Ticker-Eintrag schon geschickt?

  useEffect(() => setMounted(true), []);

  const mode = flawlessMode(data?.tournament?.format);
  const ended =
    !!data &&
    mode !== "none" &&
    (data.tournament?.status === "finished" || (mode === "leads" && rotationAllDone(data)));

  useEffect(() => {
    if (!data) return;
    const prev = prevEndedRef.current;
    prevEndedRef.current = ended;
    if (!ended) return;

    if (prev !== false) return; // nur beim Wechsel "läuft" → "fertig" (schon fertig beim Öffnen: siehe Nachtragen unten)

    const shown = winnersOf(data, mode);
    if (!shown.length) return;
    if (onFeedRef.current) backfilledRef.current = true;
    // 📣 Ticker-Eintrag erst zusammen mit der Einblendung – die anderen Meldungen des letzten Spiels
    // (On fire, Serien …) kommen ~10 s später; so steht Flawless Victory als Abschluss ganz oben
    const t = window.setTimeout(() => {
      onFeedRef.current?.(feedItems(shown, mode));
      setQueue((q) => [...q, ...shown]);
    }, Math.max(14_000, delayMs(variant, mode === "leads"))); // nach "Runde abgeschlossen" (12 s)
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, !!data]);

  // 📣 Nachtragen in den Ticker (ohne Einblendung), wenn das Turnier schon fertig ist – erst sobald
  // onFeed da ist: die Admin-Rolle wird nach den Turnierdaten geladen (vorher ist onFeed noch leer)
  useEffect(() => {
    if (backfilledRef.current || !onFeed || !data || !ended) return;
    backfilledRef.current = true;
    const shown = winnersOf(data, mode);
    if (shown.length) onFeed(feedItems(shown, mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onFeed, ended, !!data]);

  const current = queue[0] ?? null;
  const st = notifSetting(ns, "flawless", variant);

  useEffect(() => {
    if (!current) return;
    if (!st.enabled) {
      setQueue((q) => q.slice(1));
      return;
    }
    if ((variant === "tv" ? soundOn : true) && st.sound !== "none") playSoundById(st.sound, st.volume);
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), st.ms ?? 14_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!mounted || !current || !st.enabled) return null;
  const tv = variant === "tv";
  const close = tv ? undefined : () => setQueue((q) => q.slice(1));
  return createPortal(<FlawlessOverlay current={current} tv={tv} close={close} />, document.body);
}

/** 👀 Vorschau (🔔 Meldungen & Sounds) mit Beispieldaten, Klick schließt */
export function FlawlessPreview({ variant, onClose }: { variant: "tv" | "admin"; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const run: PlayerRun = { played: 8, allWon: true, beaten: 8, led: [] };
  const sample: Shown = { playerId: "a", name: "Andre", run, text: flawlessText("wins", run) };
  return createPortal(<FlawlessOverlay current={sample} tv={variant === "tv"} close={onClose} />, document.body);
}

/** goldene Vollbild-Einblendung */
function FlawlessOverlay({ current, tv, close }: { current: Shown; tv: boolean; close?: () => void }) {
  return (
    <div
      className={"fixed inset-0 z-[120] overflow-hidden " + (close ? "cursor-pointer" : "pointer-events-none")}
      onClick={close}
      role={close ? "button" : undefined}
      style={{
        animation: "flawIn 0.5s ease-out both",
        background: "radial-gradient(ellipse at center, rgba(120,53,15,0.92) 0%, rgba(20,10,0,0.96) 70%)",
      }}
    >
      <style>{FLAW_CSS}</style>
      {/* drehende Lichtstrahlen */}
      <div className="flaw-rays" />
      {/* Blitze: Aufleuchten + Zacken links/rechts */}
      <div className="flaw-flash" />
      <Bolt side="left" />
      <Bolt side="right" />
      {/* Konfetti + Funken */}
      <Confetti />

      <div className="relative flex h-full w-full items-center justify-center px-4">
        <div className="text-center" style={{ animation: "flawPop 1s cubic-bezier(.2,1.4,.4,1) both" }}>
          <div
            className={tv ? "text-[11vw] leading-none" : "text-[22vw] leading-none sm:text-[14vw] lg:text-[10vw]"}
            style={{ filter: "drop-shadow(0 0 30px rgba(253,224,71,0.9))", animation: "flawBob 2.4s ease-in-out infinite" }}
          >
            🥋
          </div>
          <div
            className={
              "mt-2 font-black uppercase leading-[0.95] tracking-wide text-transparent " +
              (tv ? "text-[9vw]" : "text-[13vw] sm:text-[10vw] lg:text-[7.5vw]")
            }
            style={{
              backgroundImage: "linear-gradient(90deg,#fde68a,#ffffff,#fbbf24,#ffffff,#fde68a)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              animation: "flawShine 2.5s linear infinite",
              filter: "drop-shadow(0 4px 0 rgba(120,53,15,0.8)) drop-shadow(0 0 24px rgba(251,191,36,0.7))",
            }}
          >
            Flawless
            <br />
            Victory
          </div>
          <div
            className={"mt-4 font-black text-white " + (tv ? "text-[5vw] leading-tight" : "text-[9vw] sm:text-[6vw] lg:text-[4.5vw]")}
            style={{ textShadow: "0 0 24px rgba(251,191,36,0.8)" }}
          >
            {current.name}
          </div>
          <div className={"mt-1 font-bold text-amber-200 " + (tv ? "text-[2.6vw]" : "text-[5vw] sm:text-[3vw] lg:text-[2.2vw]")}>
            {current.text}
          </div>
          <div className={"mt-1 font-semibold text-amber-100/80 " + (tv ? "text-[1.8vw]" : "text-[4vw] sm:text-[2.2vw] lg:text-[1.5vw]")}>
            kein einziges Duell verloren
          </div>
          {close ? <div className="mt-6 text-xs font-semibold text-amber-100/60">Antippen zum Schließen</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Blitz-Zacke am Rand (SVG), blitzt in Abständen auf */
function Bolt({ side }: { side: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 60 160"
      className="pointer-events-none absolute top-[8%] h-[70%]"
      style={{
        [side]: "4%",
        transform: side === "right" ? "scaleX(-1)" : undefined,
        opacity: 0,
        animation: `flawBolt 2.6s ease-out ${side === "right" ? "1.3s" : "0.2s"} 4`, // nur in den ersten Sekunden
        filter: "drop-shadow(0 0 18px #fde047) drop-shadow(0 0 40px #facc15)",
      }}
      aria-hidden="true"
    >
      <polygon points="34,0 8,88 28,88 16,160 54,58 32,58 46,0" fill="#fef9c3" />
    </svg>
  );
}

/** Konfetti + goldene Funken (deterministisch verteilt) */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 53) % 50) / 10,
        dur: 3.5 + ((i * 29) % 35) / 10,
        size: 7 + ((i * 17) % 9),
        color: ["#fbbf24", "#fde047", "#ffffff", "#f59e0b", "#fef3c7", "#f472b6", "#60a5fa"][i % 7],
        round: i % 4 === 0,
        drift: ((i * 13) % 80) - 40,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            borderRadius: p.round ? "9999px" : "2px",
            backgroundColor: p.color,
            boxShadow: p.round ? `0 0 8px ${p.color}` : undefined,
            ["--drift" as string]: `${p.drift}px`,
            animation: `flawFall ${p.dur}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

const FLAW_CSS = `
@keyframes flawIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes flawPop { 0% { transform: scale(0.3) rotate(-6deg); opacity: 0 } 60% { transform: scale(1.08) rotate(1deg); opacity: 1 } 100% { transform: scale(1) rotate(0) } }
@keyframes flawShine { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
@keyframes flawBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes flawFall {
  0% { transform: translate(0,-40px) rotate(0deg); opacity: 0 }
  8% { opacity: 1 }
  100% { transform: translate(var(--drift),105vh) rotate(720deg); opacity: 0.9 }
}
@keyframes flawSpin { from { transform: translate(-50%,-50%) rotate(0deg) } to { transform: translate(-50%,-50%) rotate(360deg) } }
@keyframes flawFlash { 0%, 100% { opacity: 0 } 3% { opacity: 0.55 } 6% { opacity: 0 } 9% { opacity: 0.35 } 14% { opacity: 0 } }
@keyframes flawBolt { 0% { opacity: 0 } 4% { opacity: 1 } 10% { opacity: 0.2 } 14% { opacity: 1 } 30% { opacity: 0 } 100% { opacity: 0 } }
.flaw-rays {
  position: absolute; left: 50%; top: 50%; width: 220vmax; height: 220vmax;
  background: repeating-conic-gradient(from 0deg, rgba(253,224,71,0.16) 0deg 8deg, transparent 8deg 20deg);
  animation: flawSpin 30s linear infinite;
  -webkit-mask-image: radial-gradient(circle, black 0%, transparent 60%);
  mask-image: radial-gradient(circle, black 0%, transparent 60%);
}
.flaw-flash { position: absolute; inset: 0; background: #fffbe6; opacity: 0; animation: flawFlash 2.6s ease-out 3; }
`;
