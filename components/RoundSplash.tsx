"use client";

// 🎲 Matchplay, Swiss, Round Robin, Elimination, DYP, Timeplay (alles außer Round the Pinball):
// - "Runde N generiert – Es kann losgehen!" nach jedem Erzeugen einer Runde
// - "Runde N abgeschlossen" + kleiner Rückblick, sobald alle Plätze der Runde vergeben sind
// Admin + TV; beim ersten Laden der Seite wird nichts gezeigt (nur echte Wechsel).
// An/aus, Dauer, Ton: 🔔 Meldungen & Sounds ("roundStart" / "roundDone"). Ticker: onFeed (nur Admin).

import { useEffect, useRef, useState } from "react";
import type { MmData } from "@/lib/myMatch";
import { notifSetting } from "@/lib/notifications";
import { useNotificationSettings } from "@/components/useNotificationSettings";
import { playSoundById } from "@/lib/playSound";
import { roundSummary, summaryText, type RoundSummary } from "@/lib/roundSummary";
import type { FeedItemInput } from "@/lib/feed";
import ScopeChip from "@/components/ScopeChip";

type Splash =
  | { kind: "roundStart"; roundId: string; number: number; matches: number; machines: number }
  | { kind: "roundDone"; roundId: string; number: number; summary: RoundSummary };

function roundFinished(data: MmData, roundId: string): boolean {
  const matches = data.matches.filter((m) => String(m.round_id) === String(roundId));
  if (!matches.length) return false;
  return matches.every((m) => {
    const mps = data.match_players.filter((mp) => String(mp.match_id) === String(m.id));
    return mps.length > 0 && mps.every((mp) => mp.position != null && Number.isFinite(Number(mp.position)));
  });
}

export function SummaryBlock({ s, tv, rotation = false }: { s: RoundSummary; tv: boolean; rotation?: boolean }) {
  const line = tv ? "text-2xl" : "text-sm";
  const fmt = (n: number) => n.toLocaleString("de-DE");
  return (
    <div className={"mx-auto mt-4 space-y-1.5 text-left font-semibold text-white/95 " + (tv ? "max-w-2xl" : "max-w-sm")}>
      {s.winners.length ? (
        <div className={line}>
          🥇 {rotation ? "Vorn an ihrem Flipper" : "Rundensieger"}:{" "}
          <span className="font-black">
            {s.winners
              .slice(0, 6)
              .map((w) => `${w.name} (${w.machine})`)
              .join(" · ")}
          </span>
        </div>
      ) : null}
      {s.top ? (
        <div className={line}>
          🎯 Höchster Score: <span className="font-black">{s.top.name}</span> an {s.top.machine} – {fmt(s.top.score)}
        </div>
      ) : null}
      {s.leader ? (
        <div className={line}>
          {s.climber && s.climber.name === s.leader.name ? (
            <>
              📈 <span className="font-black">{s.leader.name}</span> übernimmt die Führung ({s.leader.points} Pkt.)
            </>
          ) : (
            <>
              📈 Führend: <span className="font-black">{s.leader.name}</span> ({s.leader.points} Pkt.)
              {s.climber ? ` – ${s.climber.name} rückt auf Platz ${s.climber.place} vor` : ""}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function RoundSplash({
  data,
  variant = "admin",
  soundOn = true,
  onFeed,
}: {
  data: MmData | null | undefined;
  variant?: "admin" | "tv";
  /** TV: erst nach "🔊 Ton aktivieren" */
  soundOn?: boolean;
  /** 📣 Live-Ticker eintragen (nur Admin-Tablet) */
  onFeed?: (items: FeedItemInput[]) => void;
}) {
  const ns = useNotificationSettings();
  const device = variant === "tv" ? "tv" : "admin";
  const [queue, setQueue] = useState<Splash[]>([]);
  const knownRef = useRef<Set<string> | null>(null);
  const doneRef = useRef<Set<string>>(new Set());
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;

  useEffect(() => {
    if (!data || String(data.tournament?.format ?? "") === "rotation") return;
    const rounds = data.rounds.slice().sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0));
    // erster Stand: nur merken
    if (!knownRef.current) {
      knownRef.current = new Set(rounds.map((r) => String(r.id)));
      rounds.forEach((r) => roundFinished(data, String(r.id)) && doneRef.current.add(String(r.id)));
      return;
    }
    const fresh: Splash[] = [];
    const feed: FeedItemInput[] = [];
    // zuerst: fertig gewordene Runden (Rückblick) …
    for (const r of rounds) {
      const id = String(r.id);
      if (doneRef.current.has(id) || !roundFinished(data, id)) continue;
      doneRef.current.add(id);
      const summary = roundSummary(data, id);
      fresh.push({ kind: "roundDone", roundId: id, number: Number(r.number ?? 0), summary });
      feed.push({
        key: `roundDone|${id}`,
        kind: "roundDone",
        icon: "✅",
        title: `Runde ${r.number} abgeschlossen`,
        body: summaryText(summary) || "Alle Plätze vergeben.",
      });
    }
    // … dann neue Runden
    for (const r of rounds) {
      const id = String(r.id);
      if (knownRef.current.has(id)) continue;
      knownRef.current.add(id);
      const matches = data.matches.filter((m) => String(m.round_id) === id);
      const machines = new Set(matches.map((m) => String(m.machine_id ?? ""))).size;
      fresh.push({ kind: "roundStart", roundId: id, number: Number(r.number ?? 0), matches: matches.length, machines });
      feed.push({
        key: `roundStart|${id}`,
        kind: "roundStart",
        icon: "🎲",
        title: `Runde ${r.number} generiert`,
        body: `${matches.length} ${matches.length === 1 ? "Match" : "Matches"} an ${machines} ${machines === 1 ? "Flipper" : "Flippern"} – viel Spaß!`,
      });
    }
    if (feed.length) onFeedRef.current?.(feed);
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [data]);

  const cur = queue[0];
  const st = cur ? notifSetting(ns, cur.kind, device) : null;
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    if (!cur || !st) return;
    if (!st.enabled) {
      setQueue((q) => q.slice(1));
      return;
    }
    if ((device === "tv" ? soundOn : true) && st.sound !== "none") playSoundById(st.sound, st.volume);
    setAnim(false);
    const raf = window.requestAnimationFrame(() => setAnim(true));
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), st.ms ?? (cur.kind === "roundDone" ? 10_000 : 4000));
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  if (!cur || !st?.enabled) return null;
  const tv = variant === "tv";
  const done = cur.kind === "roundDone";
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={() => setQueue((q) => q.slice(1))}
      role="status"
      aria-live="polite"
    >
      <div
        className={
          "relative w-full overflow-hidden rounded-3xl bg-gradient-to-br text-center text-white shadow-2xl ring-1 ring-white/25 transition-all duration-500 " +
          (anim ? "scale-100 opacity-100 " : "scale-90 opacity-0 ") +
          (tv ? "max-w-4xl px-14 py-12 " : "max-w-md px-8 py-8 ") +
          (done ? "from-emerald-500 via-teal-600 to-cyan-700" : "from-fuchsia-500 via-violet-600 to-indigo-700")
        }
      >
        <div className="pointer-events-none absolute -top-1/2 left-1/2 h-full w-[140%] -translate-x-1/2 rounded-full bg-white/15 blur-3xl" />
        <div className="relative">
          <div className="mb-2">
            <ScopeChip kind={cur.kind} variant="dark" />
          </div>
          {done ? (
            <>
              <div className={"font-semibold uppercase tracking-widest " + (tv ? "text-2xl text-white/80" : "text-sm text-white/85")}>
                ✅ Runde {cur.number} abgeschlossen
              </div>
              <div className={"mt-2 font-black " + (tv ? "text-5xl" : "text-2xl")}>Starke Runde!</div>
              <SummaryBlock s={cur.summary} tv={tv} />
              <div className={"mt-5 font-bold " + (tv ? "text-3xl" : "text-lg")}>Weiter geht's mit Runde {cur.number + 1}! 🍀</div>
            </>
          ) : (
            <>
              <div className={"font-semibold uppercase tracking-widest " + (tv ? "text-2xl text-white/80" : "text-sm text-white/85")}>
                🎲 Runde {cur.number} generiert
              </div>
              <div className={"mt-2 font-black " + (tv ? "text-6xl" : "text-3xl")}>Es kann losgehen!</div>
              <div className={"mt-2 font-semibold " + (tv ? "text-3xl text-white/80" : "text-lg text-white/85")}>
                {cur.matches} {cur.matches === 1 ? "Match" : "Matches"} an {cur.machines} {cur.machines === 1 ? "Flipper" : "Flippern"}
              </div>
              <div className={"mt-6 font-bold " + (tv ? "text-5xl" : "text-2xl")}>Viel Spaß! 🍀</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
