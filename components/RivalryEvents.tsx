"use client";

// 🎉 Gegner-Ereignisse nach einem Match: 💥 Serie gerissen · 😈 Erzfeind besiegt · 🤝 Jubiläum
// - TV: groß in der Mitte (7 s)
// - Admin: klein rechts unten (6 s, stapelbar, Antippen schließt)
// - Handy: Karte oben, nur wenn man selbst beteiligt ist (8 s)
// Erkennung: ein Match wird fertig (alle Spieler haben einen Platz), während die Seite offen ist.
// Beim ersten Laden schon fertige Matches lösen NICHTS aus.

import { useEffect, useRef, useState } from "react";
import { eventsForFinishedMatch, eventText, type PairState, type RivalryEvent } from "@/lib/rivalryInsights";

type MpLike = { match_id: string | number; player_id: string | number; position: number | null | undefined };

export function useRivalryEvents({
  matchPlayers,
  pairs,
  enabled,
  onlyFor,
}: {
  matchPlayers: readonly MpLike[] | null | undefined;
  pairs: Readonly<Record<string, PairState>>;
  enabled: boolean;
  /** Handy: nur Ereignisse, an denen dieser Spieler beteiligt ist */
  onlyFor?: string | null;
}) {
  const [queue, setQueue] = useState<RivalryEvent[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !matchPlayers) return;
    const byMatch = new Map<string, { player_id: string; position: number | null }[]>();
    for (const mp of matchPlayers) {
      const id = String(mp.match_id);
      const list = byMatch.get(id) ?? [];
      list.push({ player_id: String(mp.player_id), position: typeof mp.position === "number" ? mp.position : null });
      byMatch.set(id, list);
    }
    const finishedNow: string[] = [];
    byMatch.forEach((list, id) => {
      if (list.length >= 2 && list.every((x) => typeof x.position === "number")) finishedNow.push(id);
    });

    // erster Durchlauf: Bestand merken, nichts auslösen
    if (!seenRef.current) {
      seenRef.current = new Set(finishedNow);
      return;
    }
    const seen = seenRef.current;
    const fresh: RivalryEvent[] = [];
    for (const id of finishedNow) {
      if (seen.has(id)) continue;
      seen.add(id);
      let evs = eventsForFinishedMatch(id, byMatch.get(id) ?? [], pairs);
      if (onlyFor) evs = evs.filter((e) => e.winner === onlyFor || e.loser === onlyFor);
      const top = evs[0]; // höchstens ein Ereignis pro Match
      if (top && !firedRef.current.has(top.id)) {
        firedRef.current.add(top.id);
        fresh.push(top);
      }
    }
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [matchPlayers, pairs, enabled, onlyFor]);

  const dismiss = (id: string) => setQueue((q) => q.filter((e) => e.id !== id));
  return { events: queue, dismiss };
}

/** schließt ein Ereignis nach ms automatisch */
function useAutoDismiss(id: string | undefined, ms: number, dismiss: (id: string) => void) {
  useEffect(() => {
    if (!id) return;
    const t = window.setTimeout(() => dismiss(id), ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ms]);
}

const KIND_TONE: Record<RivalryEvent["kind"], { tv: string; light: string }> = {
  streakBroken: { tv: "from-orange-500/90 to-rose-600/90", light: "border-orange-200 bg-orange-50 text-orange-900" },
  nemesisBeaten: { tv: "from-rose-600/90 to-fuchsia-700/90", light: "border-rose-200 bg-rose-50 text-rose-900" },
  jubilee: { tv: "from-sky-500/90 to-indigo-600/90", light: "border-sky-200 bg-sky-50 text-sky-900" },
};

// 🔊 kurze, selbst erzeugte Klänge (kein Download nötig) – je Ereignis eigene Melodie
const EVENT_SOUND: Record<RivalryEvent["kind"], { notes: number[]; step: number; type: OscillatorType }> = {
  // 💥 Serie gerissen: absteigend, etwas "kaputt" klingend
  streakBroken: { notes: [784, 622, 523, 392], step: 0.12, type: "triangle" },
  // 😈 Erzfeind besiegt: aufsteigender Triumph
  nemesisBeaten: { notes: [523, 659, 784, 1047], step: 0.11, type: "square" },
  // 🤝 Jubiläum: freundliches Glockenspiel
  jubilee: { notes: [659, 988, 1319], step: 0.16, type: "sine" },
};

function playEventSound(kind: RivalryEvent["kind"]) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const { notes, step, type } = EVENT_SOUND[kind];
    const vol = type === "square" ? 0.08 : 0.22; // Rechteck klingt lauter
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * step;
      const last = i === notes.length - 1;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (last ? 0.7 : 0.25));
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + (last ? 0.75 : 0.3));
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {
    /* ohne Ton weiter */
  }
}

/** 📺 TV: groß in der Mitte, eins nach dem anderen (Ton nur, wenn am TV "🔊 Ton aktivieren" gedrückt wurde) */
export function RivalryEventTv({
  events,
  dismiss,
  nameOf,
  soundOn = false,
}: {
  events: RivalryEvent[];
  dismiss: (id: string) => void;
  nameOf: (playerId: string) => string;
  soundOn?: boolean;
}) {
  const ev = events[0];
  useAutoDismiss(ev?.id, 7000, dismiss);
  useEffect(() => {
    if (ev && soundOn) playEventSound(ev.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id]);
  if (!ev) return null;
  const t = eventText(ev, nameOf);
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
      <div
        className={
          "max-w-[70vw] rounded-[2.5rem] bg-gradient-to-br px-16 py-12 text-center text-white shadow-2xl ring-4 ring-white/20 " +
          KIND_TONE[ev.kind].tv
        }
      >
        <div className="text-8xl">{t.icon}</div>
        <div className="mt-4 text-6xl font-black tracking-tight">{t.title}</div>
        <div className="mt-4 text-3xl font-semibold text-white/90">{t.text}</div>
      </div>
    </div>
  );
}

function Toast({
  ev,
  dismiss,
  nameOf,
}: {
  ev: RivalryEvent;
  dismiss: (id: string) => void;
  nameOf: (playerId: string) => string;
}) {
  useAutoDismiss(ev.id, 6000, dismiss);
  const t = eventText(ev, nameOf);
  return (
    <button
      type="button"
      onClick={() => dismiss(ev.id)}
      className={"flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left shadow-lg " + KIND_TONE[ev.kind].light}
      title="Antippen schließt"
    >
      <span className="text-2xl leading-none">{t.icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{t.title}</span>
        <span className="block text-xs">{t.text}</span>
      </span>
    </button>
  );
}

/** 🖥️ Admin: klein rechts unten, gestapelt (max. 3 sichtbar) */
export function RivalryEventToasts({
  events,
  dismiss,
  nameOf,
}: {
  events: RivalryEvent[];
  dismiss: (id: string) => void;
  nameOf: (playerId: string) => string;
}) {
  if (!events.length) return null;
  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 z-[70] flex w-[min(90vw,340px)] flex-col gap-2">
      {events.slice(0, 3).map((ev) => (
        <Toast key={ev.id} ev={ev} dismiss={dismiss} nameOf={nameOf} />
      ))}
    </div>
  );
}

/** 📱 Handy: Karte oben, persönliche Sicht ("Du …") */
export function RivalryEventPhone({
  events,
  dismiss,
  nameOf,
  meId,
}: {
  events: RivalryEvent[];
  dismiss: (id: string) => void;
  nameOf: (playerId: string) => string;
  meId: string;
}) {
  const ev = events[0];
  useAutoDismiss(ev?.id, 8000, dismiss);
  if (!ev) return null;
  const t = eventText(ev, nameOf, meId);
  return (
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[70]">
      <button
        type="button"
        onClick={() => dismiss(ev.id)}
        className={"flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-xl " + KIND_TONE[ev.kind].light}
      >
        <span className="text-4xl leading-none">{t.icon}</span>
        <span className="min-w-0">
          <span className="block text-base font-black">{t.title}</span>
          <span className="block text-sm">{t.text}</span>
        </span>
      </button>
    </div>
  );
}
