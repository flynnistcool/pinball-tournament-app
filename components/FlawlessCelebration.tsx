"use client";

// 🥋 Flawless Victory – große Einblendung, wenn ein Turnier makellos gewonnen wurde.
// Auslöser (nur bei einem echten Wechsel, nicht beim Öffnen eines schon fertigen Turniers):
// - Matchplay & Co. (auch Timeplay): Turnier wird beendet
// - Round the Pinball: alle Durchgänge fertig (alle Scores da) – also schon vor "Turnier beenden"
// Admin-Tablet trägt zusätzlich in den 📣 Live-Ticker ein (onFeed). Einstellbar unter 🔔 Meldungen & Sounds.

import { useEffect, useRef, useState } from "react";
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert (createPortal funktioniert trotzdem)
import { createPortal } from "react-dom";
import { flawlessMode, flawlessText, flawlessWinners, rotationAllDone, type PlayerRun } from "@/lib/flawless";
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
    if (prev !== false || !ended) return; // nur beim Wechsel "läuft" → "fertig"

    const winners = flawlessWinners(data, mode);
    if (!winners.length) return;
    const nameOf = (pid: string) =>
      String((data.players ?? []).find((p) => String(p.id) === pid)?.name ?? "?");
    const shown = winners.map((w) => ({
      playerId: w.playerId,
      name: nameOf(w.playerId),
      run: w.run,
      text: flawlessText(mode, w.run),
    }));

    onFeedRef.current?.(
      shown.map((x) => ({
        key: `flawless|${x.playerId}`,
        kind: "flawless",
        icon: "🥋",
        title: "Flawless Victory!",
        body: `${x.name}: ${x.text}`,
        players: [x.playerId],
        data: { player: x.name, n: x.run.played, beaten: x.run.beaten, mode },
      }))
    );

    const t = window.setTimeout(() => setQueue((q) => [...q, ...shown]), delayMs(variant, mode === "leads"));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, !!data]);

  const current = queue[0] ?? null;
  const st = notifSetting(ns, "flawless", variant);

  useEffect(() => {
    if (!current) return;
    if (!st.enabled) {
      setQueue((q) => q.slice(1));
      return;
    }
    if ((variant === "tv" ? soundOn : true) && st.sound !== "none") playSoundById(st.sound, st.volume);
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), st.ms ?? 12_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!mounted || !current || !st.enabled) return null;
  const tv = variant === "tv";
  const close = tv ? undefined : () => setQueue((q) => q.slice(1));

  return createPortal(
    <div
      className={
        "fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm " +
        (close ? "cursor-pointer" : "pointer-events-none")
      }
      onClick={close}
      role={close ? "button" : undefined}
      style={{ animation: "flawIn 0.6s ease-out both" }}
    >
      <style>{`
        @keyframes flawIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes flawPop { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes flawShine { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>
      <div
        className={
          "mx-4 rounded-[2rem] bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 text-center shadow-2xl ring-8 ring-amber-200/60 " +
          (tv ? "px-[5vw] py-[4vh]" : "px-8 py-8")
        }
        style={{ animation: "flawPop 0.9s ease-out both" }}
      >
        <div className={tv ? "text-[7vw] leading-none" : "text-6xl leading-none"}>🥋</div>
        <div
          className={
            "mt-2 font-black uppercase tracking-wider text-transparent " + (tv ? "text-[5.5vw] leading-none" : "text-4xl")
          }
          style={{
            backgroundImage: "linear-gradient(90deg,#fff7d6,#ffffff,#fde68a,#ffffff,#fff7d6)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            animation: "flawShine 3s linear infinite",
            textShadow: "0 2px 0 rgba(120,53,15,0.35)",
          }}
        >
          Flawless Victory
        </div>
        <div className={"mt-3 font-black text-amber-950 " + (tv ? "text-[4vw] leading-tight" : "text-3xl")}>
          {current.name}
        </div>
        <div className={"font-bold text-amber-950/90 " + (tv ? "text-[2.2vw]" : "text-lg")}>{current.text}</div>
        <div className={"mt-1 font-semibold text-amber-900/80 " + (tv ? "text-[1.6vw]" : "text-sm")}>
          kein einziges Duell verloren
        </div>
        {close ? <div className="mt-4 text-xs font-semibold text-amber-950/60">Antippen zum Schließen</div> : null}
      </div>
    </div>,
    document.body
  );
}
