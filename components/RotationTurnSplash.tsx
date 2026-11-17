"use client";

// 🔵 Round the Pinball: kurze Einblendung (4 Sek.), sobald ein neuer Durchgang startet
// ("Durchgang 5 / 6" + Fortschritt + "Viel Spaß!") bzw. wenn alle Durchgänge geschafft sind.
// Genutzt im Admin-Bereich und am Infobildschirm. Beim ersten Laden der Seite wird nichts gezeigt.
// Start-Meldung ("Runden generiert – los geht's mit dem 1. Durchgang"):
// - Admin: über startSignal (wird nach dem Erzeugen gesetzt)
// - TV: detectStart = Wechsel von "keine Runden" auf "Runden da", solange die Seite offen ist

import { useEffect, useRef, useState } from "react";
import type { RotationProgress } from "@/lib/rotationTurn";
import { notifSetting } from "@/lib/notifications";
import { playSoundById } from "@/lib/playSound";
import type { MmData } from "@/lib/myMatch";
import type { FeedItemInput } from "@/lib/feed";
import { rotationWaveSummary, summaryText, type RoundSummary } from "@/lib/roundSummary";
import { SummaryBlock } from "@/components/RoundSplash";
import { useNotificationSettings } from "@/components/useNotificationSettings";

const SHOW_MS = 4000;

type Splash =
  | { kind: "start"; total: number }
  | { kind: "turn"; current: number; total: number; summary?: RoundSummary | null }
  | { kind: "done"; total: number; summary?: RoundSummary | null };

export default function RotationTurnSplash({
  progress,
  variant = "admin",
  startSignal,
  detectStart = false,
  data,
  onFeed,
}: {
  /** Turnierdaten → Rückblick des fertigen Durchgangs (Bester, höchster Score, Führender) */
  data?: MmData | null;
  /** 📣 Live-Ticker eintragen (nur Admin-Tablet) */
  onFeed?: (items: FeedItemInput[]) => void;
  progress: RotationProgress | null;
  variant?: "admin" | "tv";
  /** Admin: neuer Wert (z. B. Date.now()) nach dem Erzeugen der Runden → Start-Meldung */
  startSignal?: number | null;
  /** TV: Start-Meldung, wenn während die Seite offen ist Runden erzeugt werden */
  detectStart?: boolean;
}) {
  // 🔔 Meldungen & Sounds: an/aus + Dauer je Gerät
  const notif = notifSetting(useNotificationSettings(), "rotationSplash", variant === "tv" ? "tv" : "admin");
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;
  const prevRef = useRef<RotationProgress | null>(null);
  const pendingStartRef = useRef(false);
  const [splash, setSplash] = useState<Splash | null>(null);
  const [anim, setAnim] = useState(false);

  // 📣 Turnierstart in den Ticker (nur Admin hat onFeed; doppelte Einträge verhindert die Kennung)
  const postStart = (waves: number) => {
    const machines = new Set((data?.matches ?? []).map((m) => String(m.machine_id ?? m.id))).size;
    onFeedRef.current?.([
      {
        key: `rotStart|${waves}`,
        kind: "roundStart",
        icon: "🏁",
        title: "Los geht's!",
        body: `Round the Pinball: ${waves} ${waves === 1 ? "Durchgang" : "Durchgänge"}${
          machines ? ` an ${machines} ${machines === 1 ? "Flipper" : "Flippern"}` : ""
        } – viel Spaß!`,
      },
    ]);
  };

  const cur = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const done = !!progress?.done;

  useEffect(() => {
    // Daten noch nicht geladen / noch keine Runden → noch kein "erster Stand"
    // (so erscheint beim Öffnen der Seite nichts, erst bei echten Wechseln)
    if (!progress) return;
    if (total < 1) {
      // TV: "noch keine Runden" merken → der Wechsel auf "Runden da" ist der Start
      if (detectStart) prevRef.current = { current: 0, total: 0, done: false };
      return;
    }
    const prev = prevRef.current;
    prevRef.current = { current: cur, total, done };

    if (pendingStartRef.current || (prev && prev.total === 0)) {
      pendingStartRef.current = false;
      if (!done) {
        setSplash({ kind: "start", total });
        postStart(total);
      }
      return;
    }
    if (!prev) return;

    // Rückblick des gerade fertig gewordenen Durchgangs (+ Ticker)
    const withSummary = (wave: number) => {
      const s = data ? rotationWaveSummary(data, wave) : null;
      if (s) {
        onFeedRef.current?.([
          {
            key: `rotWave|${wave}|${total}`,
            kind: "roundDone",
            icon: "✅",
            title: `Durchgang ${wave} / ${total} geschafft`,
            body: summaryText(s, true) || "Alle Scores des Durchgangs sind da.",
          },
        ]);
      }
      return s;
    };
    if (done && !prev.done) {
      setSplash({ kind: "done", total, summary: withSummary(total) });
    } else if (!done && (prev.total !== total || cur > prev.current)) {
      setSplash({ kind: "turn", current: cur, total, summary: cur > 1 && prev.total === total ? withSummary(cur - 1) : null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, total, done]);

  // Admin: Signal nach dem Erzeugen. Sind die neuen Runden schon geladen → sofort,
  // sonst sobald sie da sind (siehe oben).
  useEffect(() => {
    if (!startSignal) return;
    if (total > 0 && !done && cur <= 1) {
      prevRef.current = { current: cur, total, done };
      setSplash({ kind: "start", total });
      postStart(total);
    } else {
      pendingStartRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSignal]);

  useEffect(() => {
    if (!splash) return;
    if (notif.enabled && notif.sound !== "none") playSoundById(notif.sound, notif.volume);
    setAnim(false);
    const raf = window.requestAnimationFrame(() => setAnim(true));
    const hasSummary = splash.kind !== "start" && !!splash.summary;
    const t = window.setTimeout(() => setSplash(null), Math.max(notif.ms ?? SHOW_MS, hasSummary ? 10_000 : 0));
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [splash]);

  if (!splash || !notif.enabled) return null;

  const tv = variant === "tv";
  const isDone = splash.kind === "done";
  // Balken = fertige Durchgänge (wie die Durchgang-Karte), animiert vom alten auf den neuen Stand
  const after = isDone ? splash.total : splash.kind === "start" ? 0 : Math.max(0, splash.current - 1);
  const before = Math.max(0, after - 1);
  const pct = (n: number) => `${Math.round((n / Math.max(1, splash.total)) * 100)}%`;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={() => setSplash(null)}
      role="status"
      aria-live="polite"
    >
      <div
        className={
          "w-full rounded-3xl text-center shadow-2xl transition-all duration-500 " +
          (anim ? "scale-100 opacity-100" : "scale-90 opacity-0") +
          " " +
          (tv ? "max-w-3xl px-14 py-12 " : "max-w-md px-8 py-8 ") +
          // farbiger Verlauf je Meldung: Start = Violett/Indigo, Durchgang = Blau/Türkis, fertig = Gold/Orange
          "relative overflow-hidden bg-gradient-to-br text-white ring-1 ring-white/25 " +
          (isDone
            ? "from-amber-400 via-orange-500 to-rose-500"
            : splash.kind === "start"
              ? "from-fuchsia-500 via-violet-600 to-indigo-700"
              : "from-sky-500 via-blue-600 to-indigo-700")
        }
      >
        {/* weicher Lichtschein oben */}
        <div className="pointer-events-none absolute -top-1/2 left-1/2 h-full w-[140%] -translate-x-1/2 rounded-full bg-white/15 blur-3xl" />
        <div className="relative">
        {isDone ? (
          <>
            <div className={tv ? "text-8xl" : "text-6xl"}>🏆</div>
            <div className={"mt-3 font-black " + (tv ? "text-6xl" : "text-3xl")}>Alle Durchgänge geschafft!</div>
            <div className={"mt-2 font-semibold " + (tv ? "text-3xl text-white/80" : "text-lg text-white/85")}>
              Super gespielt – {splash.total} von {splash.total} 🎉
            </div>
            {splash.summary ? <SummaryBlock s={splash.summary} tv={tv} rotation /> : null}
          </>
        ) : splash.kind === "start" ? (
          <>
            <div className={"font-semibold uppercase tracking-widest " + (tv ? "text-2xl text-white/80" : "text-sm text-white/85")}>
              🎰 Runden generiert
            </div>
            <div className={"mt-2 font-black " + (tv ? "text-6xl" : "text-3xl")}>Es kann losgehen!</div>
            <div className={"mt-2 font-semibold " + (tv ? "text-3xl text-white/80" : "text-lg text-white/85")}>
              Gleich startet der 1. Durchgang von {splash.total}
            </div>
          </>
        ) : (
          <>
            {splash.summary ? (
              <>
                <div className={"font-semibold uppercase tracking-widest " + (tv ? "text-2xl text-white/80" : "text-sm text-white/85")}>
                  ✅ Durchgang {splash.current - 1} / {splash.total} geschafft
                </div>
                <SummaryBlock s={splash.summary} tv={tv} rotation />
                <div className={"mt-4 font-black tabular-nums " + (tv ? "text-5xl" : "text-2xl")}>
                  Gleich startet Durchgang {splash.current}!
                </div>
              </>
            ) : (
              <>
                <div className={"font-semibold uppercase tracking-widest " + (tv ? "text-2xl text-white/80" : "text-sm text-white/85")}>
                  🔵 Neuer Durchgang
                </div>
                <div className={"mt-2 font-black tabular-nums " + (tv ? "text-8xl" : "text-5xl")}>
                  Durchgang {splash.current} / {splash.total}
                </div>
              </>
            )}
          </>
        )}

        <div className={"mx-auto mt-6 overflow-hidden rounded-full bg-white/25 " + (tv ? "h-5 max-w-xl" : "h-3 max-w-xs")}>
          <div
            className="h-full rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] transition-all duration-[1500ms] ease-out"
            style={{ width: anim ? pct(after) : pct(before) }}
          />
        </div>

        {!isDone ? (
          <div className={"mt-6 font-bold " + (tv ? "text-5xl" : "text-2xl")}>Viel Spaß! 🍀</div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
