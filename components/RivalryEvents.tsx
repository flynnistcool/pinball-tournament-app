"use client";

// 🎉 Gegner-Ereignisse nach einem Match: 💥 Serie gerissen · 😈 Erzfeind besiegt · 🤝 Jubiläum
// - TV: groß in der Mitte (7 s)
// - Admin: klein rechts unten (6 s, stapelbar, Antippen schließt)
// - Handy: Karte oben, nur wenn man selbst beteiligt ist (8 s)
// Erkennung: ein Match wird fertig (alle Spieler haben einen Platz), während die Seite offen ist.
// Beim ersten Laden schon fertige Matches lösen NICHTS aus.

import { useEffect, useRef, useState } from "react";
import {
  applyDuel,
  emptyPairState,
  eventsForFinishedMatch,
  eventText,
  pairKey,
  type PairState,
  type RivalryEvent,
} from "@/lib/rivalryInsights";
import { notifSetting } from "@/lib/notifications";
import { useNotificationSettings } from "@/components/useNotificationSettings";
import ScopeChip from "@/components/ScopeChip";
import { playEventSound } from "@/lib/synthSounds";
import { playSoundById } from "@/lib/playSound";
export { playEventSound };

type MpLike = {
  match_id: string | number;
  player_id: string | number;
  position: number | null | undefined;
  score?: number | string | null;
};

/** Round the Pinball: Score erst nach so langer Stabilität werten (Tippfehler-Schutz) */
const RTP_STABLE_MS = 10_000;
const hasScore = (v: unknown) => v != null && v !== "" && Number.isFinite(Number(v));

/** Arten mit Einblendung (Vollbild/Karte) – ob sie je Gerät erscheint, steht in 🔔 Meldungen & Sounds */
const POPUP_KINDS = new Set<RivalryEvent["kind"]>([
  "streakBroken",
  "nemesisBeaten",
  "leadChange",
  "jubilee",
  "streakGrow",
  "newNemesis",
  "evenReached",
]);

/** 📱 Handy: "Serie geht weiter" bei JEDER Verlängerung als Karte für die Beteiligten (TV/Admin nur 3, 5, 10 …) */
function showQuietForMe(e: RivalryEvent, onlyFor: string | null | undefined): boolean {
  return !!onlyFor && e.kind === "streakGrow" && (e.winner === onlyFor || e.loser === onlyFor);
}

/** Arten mit Karte am Handy (siehe lib/notifications.ts: Platzierung "phone") */
const PHONE_POPUP_KINDS = new Set<RivalryEvent["kind"]>([
  "streakBroken",
  "nemesisBeaten",
  "leadChange",
  "jubilee",
  "streakGrow",
  "newNemesis",
  "evenReached",
]);

export function useRivalryEvents({
  matchPlayers,
  pairs,
  enabled,
  onlyFor,
  onNew,
  rotation = false,
}: {
  matchPlayers: readonly MpLike[] | null | undefined;
  pairs: Readonly<Record<string, PairState>>;
  enabled: boolean;
  /** Round the Pinball: Duell je Flipper, sobald beide einen Score haben (Plätze gibt es erst am Ende) */
  rotation?: boolean;
  /** Handy: nur Ereignisse, an denen dieser Spieler beteiligt ist */
  onlyFor?: string | null;
  /** 📣 Live-Ticker: neue Ereignisse melden */
  onNew?: (evs: RivalryEvent[]) => void;
}) {
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  const [queue, setQueue] = useState<RivalryEvent[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  // Round the Pinball: entschiedene Duelle (Match|Paar → Scores) + lokal fortgeschriebene Paar-Stände
  const rtpSeenRef = useRef<Map<string, string> | null>(null);
  const rtpPendingRef = useRef<Map<string, { sig: string; since: number }>>(new Map());
  const rtpPairsRef = useRef<Map<string, PairState>>(new Map());
  const mpsRef = useRef(matchPlayers);
  mpsRef.current = matchPlayers;
  const pairsRef = useRef(pairs);
  pairsRef.current = pairs;

  // ── Round the Pinball ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!rotation || !enabled) return;
    function check() {
      const mps = mpsRef.current;
      if (!mps) return;
      const byMatch = new Map<string, { pid: string; s: number }[]>();
      for (const mp of mps) {
        if (!hasScore(mp.score)) continue;
        const id = String(mp.match_id);
        const list = byMatch.get(id) ?? [];
        list.push({ pid: String(mp.player_id), s: Number(mp.score) });
        byMatch.set(id, list);
      }
      // alle Paare mit zwei Scores (Gleichstand = kein Sieger)
      const duels: { id: string; matchId: string; a: string; b: string; winner: string; sig: string }[] = [];
      byMatch.forEach((list, matchId) => {
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            if (a.s === b.s) continue;
            duels.push({
              id: `${matchId}|${pairKey(a.pid, b.pid)}`,
              matchId,
              a: a.pid,
              b: b.pid,
              winner: a.s > b.s ? a.pid : b.pid,
              sig: `${a.pid}:${a.s}|${b.pid}:${b.s}`,
            });
          }
      });
      const stateOf = (a: string, b: string) => {
        const k = pairKey(a, b);
        return rtpPairsRef.current.get(k) ?? pairsRef.current[k] ?? emptyPairState(a, b);
      };
      // erster Durchlauf: Bestand nur mitzählen (Serienstand), nichts melden
      if (!rtpSeenRef.current) {
        rtpSeenRef.current = new Map();
        for (const d of duels) {
          rtpSeenRef.current.set(d.id, d.sig);
          rtpPairsRef.current.set(pairKey(d.a, d.b), applyDuel(stateOf(d.a, d.b), d.winner));
        }
        return;
      }
      const seen = rtpSeenRef.current;
      const pend = rtpPendingRef.current;
      const now = Date.now();
      const fresh: RivalryEvent[] = [];
      const tickerEvs: RivalryEvent[] = [];
      for (const d of duels) {
        if (seen.has(d.id)) continue; // entschieden (spätere Korrekturen ändern die Meldung nicht mehr)
        const p = pend.get(d.id);
        if (!p || p.sig !== d.sig) {
          pend.set(d.id, { sig: d.sig, since: now });
          continue;
        }
        if (now - p.since < RTP_STABLE_MS) continue;
        pend.delete(d.id);
        seen.set(d.id, d.sig);
        const k = pairKey(d.a, d.b);
        const st = stateOf(d.a, d.b);
        const all = eventsForFinishedMatch(
          d.id,
          [
            { player_id: d.a, position: d.winner === d.a ? 1 : 2 },
            { player_id: d.b, position: d.winner === d.b ? 1 : 2 },
          ],
          { [k]: st }
        );
        rtpPairsRef.current.set(k, applyDuel(st, d.winner));
        if (all.length) tickerEvs.push(...all);
        let evs = all.filter((e) => POPUP_KINDS.has(e.kind) && (!e.quiet || showQuietForMe(e, onlyFor)));
        if (onlyFor) evs = evs.filter((e) => (e.winner === onlyFor || e.loser === onlyFor) && PHONE_POPUP_KINDS.has(e.kind));
        const top = evs[0];
        if (top && !firedRef.current.has(top.id)) {
          firedRef.current.add(top.id);
          fresh.push(top);
        }
      }
      if (fresh.length) setQueue((q) => [...q, ...fresh]);
      if (tickerEvs.length) onNewRef.current?.(tickerEvs);
    }
    check();
    const t = window.setInterval(check, 2000);
    return () => window.clearInterval(t);
  }, [rotation, enabled, onlyFor]);

  // ── Matchplay & Co.: nach Plätzen ───────────────────────────────────────────
  useEffect(() => {
    if (rotation || !enabled || !matchPlayers) return;
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
    const tickerEvs: RivalryEvent[] = [];
    for (const id of finishedNow) {
      if (seen.has(id)) continue;
      seen.add(id);
      const all = eventsForFinishedMatch(id, byMatch.get(id) ?? [], pairs);
      if (all.length) tickerEvs.push(...all); // 📣 Ticker: alle Ereignisse
      // Einblendung: nur diese Arten, ohne "leise" (Handy: Serie wächst auch leise – betrifft ja mich)
      let evs = all.filter((e) => POPUP_KINDS.has(e.kind) && (!e.quiet || showQuietForMe(e, onlyFor)));
      // 📱 Handy: nur Arten, die dort eine Karte haben – sonst würde z. B. "Serie wächst" den einzigen Platz
      //    belegen und die Karte (z. B. Jubiläum) fiele ganz weg
      if (onlyFor) evs = evs.filter((e) => (e.winner === onlyFor || e.loser === onlyFor) && PHONE_POPUP_KINDS.has(e.kind));
      const top = evs[0]; // höchstens ein Ereignis pro Match
      if (top && !firedRef.current.has(top.id)) {
        firedRef.current.add(top.id);
        fresh.push(top);
      }
    }
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
    if (tickerEvs.length) onNewRef.current?.(tickerEvs);
  }, [matchPlayers, pairs, enabled, onlyFor, rotation]);

  const dismiss = (id: string) => setQueue((q) => q.filter((e) => e.id !== id));
  return { events: queue, dismiss };
}

/** schließt ein Ereignis nach ms automatisch (ms = null → bleibt, bis man es antippt) */
function useAutoDismiss(id: string | undefined, ms: number | null, dismiss: (id: string) => void) {
  useEffect(() => {
    if (!id || ms == null) return;
    const t = window.setTimeout(() => dismiss(id), ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ms]);
}

const KIND_TONE: Record<RivalryEvent["kind"], { tv: string; light: string }> = {
  streakBroken: { tv: "from-orange-500/90 to-rose-600/90", light: "border-orange-200 bg-orange-50 text-orange-900" },
  leadChange: { tv: "from-amber-500/90 to-yellow-600/90", light: "border-amber-200 bg-amber-50 text-amber-900" },
  // nur Ticker (keine Einblendung) – Farben nur der Vollständigkeit halber
  streakGrow: { tv: "from-orange-500/90 to-amber-600/90", light: "border-orange-200 bg-orange-50 text-orange-900" },
  newNemesis: { tv: "from-rose-600/90 to-fuchsia-700/90", light: "border-rose-200 bg-rose-50 text-rose-900" },
  evenReached: { tv: "from-amber-500/90 to-yellow-600/90", light: "border-amber-200 bg-amber-50 text-amber-900" },
  nemesisBeaten: { tv: "from-rose-600/90 to-fuchsia-700/90", light: "border-rose-200 bg-rose-50 text-rose-900" },
  jubilee: { tv: "from-sky-500/90 to-indigo-600/90", light: "border-sky-200 bg-sky-50 text-sky-900" },
};


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
  const ns = useNotificationSettings();
  const ev = events[0];
  const st = ev ? notifSetting(ns, ev.kind, "tv") : null;
  useAutoDismiss(ev?.id, st?.ms ?? 7000, dismiss);
  useEffect(() => {
    if (!ev || !st) return;
    if (!st.enabled) {
      dismiss(ev.id); // 🔔 auf dem TV ausgeschaltet
      return;
    }
    if (soundOn && st.sound !== "none") playSoundById(st.sound, st.volume); // 🔊 gewählter Sound
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id]);
  if (st && !st.enabled) return null;
  if (!ev) return null;
  const t = eventText(ev, nameOf);
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
      <div
        className={
          "mx-3 max-w-[92vw] rounded-[2.5rem] bg-gradient-to-br px-6 py-6 text-center text-white shadow-2xl ring-4 ring-white/20 sm:max-w-[70vw] sm:px-16 sm:py-12 " +
          KIND_TONE[ev.kind].tv
        }
      >
        <div className="text-6xl sm:text-8xl">{t.icon}</div>
        <div className="mt-3">
          <ScopeChip kind={ev.kind} variant="dark" long className="!px-3 !py-1 !text-xl" />
        </div>
        <div className="mt-3 text-3xl font-black tracking-tight sm:text-6xl">{t.title}</div>
        <div className="mt-4 text-lg font-semibold text-white/90 sm:text-3xl">{t.text}</div>
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
  const st = notifSetting(useNotificationSettings(), ev.kind, "admin");
  useAutoDismiss(ev.id, st.ms ?? 6000, dismiss);
  useEffect(() => {
    if (!st.enabled) dismiss(ev.id); // 🔔 im Admin ausgeschaltet
    else if (st.sound !== "none") playSoundById(st.sound, st.volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);
  if (!st.enabled) return null;
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
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold">{t.title}</span>
          <ScopeChip kind={ev.kind} />
        </span>
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

/** 👀 Vorschau (🔔 Meldungen & Sounds): Beispiel-Ereignis in TV- bzw. Admin-Darstellung, Klick schließt */
export function RivalryEventPreview({
  kind,
  variant,
  onClose,
}: {
  kind: RivalryEvent["kind"];
  variant: "tv" | "admin";
  onClose: () => void;
}) {
  const ev: RivalryEvent = {
    id: "preview",
    kind,
    winner: "a",
    loser: "b",
    n: kind === "jubilee" ? 50 : kind === "streakGrow" ? 5 : 6,
    winnerWins: 14,
    loserWins: 12,
    score: 0,
  };
  const nameOf = (pid: string) => (pid === "a" ? "Andre" : "Christian");
  const t = eventText(ev, nameOf);
  if (variant === "tv") {
    return (
      <div className="fixed inset-0 z-[130] flex cursor-pointer items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className={
            "mx-3 max-w-[92vw] rounded-[2.5rem] bg-gradient-to-br px-6 py-6 text-center text-white shadow-2xl ring-4 ring-white/20 sm:max-w-[70vw] sm:px-16 sm:py-12 " +
            KIND_TONE[kind].tv
          }
        >
          <div className="text-6xl sm:text-8xl">{t.icon}</div>
          <div className="mt-3">
            <ScopeChip kind={kind} variant="dark" long className="!px-3 !py-1 !text-xl" />
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight sm:text-6xl">{t.title}</div>
          <div className="mt-4 text-lg font-semibold text-white/90 sm:text-3xl">{t.text}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 z-[130] w-[min(90vw,340px)]">
      <button
        type="button"
        onClick={onClose}
        className={"flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left shadow-lg " + KIND_TONE[kind].light}
      >
        <span className="text-2xl leading-none">{t.icon}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold">{t.title}</span>
            <ScopeChip kind={kind} />
          </span>
          <span className="block text-xs">{t.text}</span>
        </span>
      </button>
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
  const ns = useNotificationSettings();
  const ev = events[0];
  const st = ev ? notifSetting(ns, ev.kind, "phone") : null;
  // Handy: bleibt stehen, bis man draufdrückt (niemand schaut genau in den 8 Sekunden aufs Handy)
  useAutoDismiss(ev?.id, st?.ms ?? null, dismiss);
  useEffect(() => {
    if (!ev || !st) return;
    if (!st.enabled) dismiss(ev.id); // 🔔 am Handy ausgeschaltet
    else if (st.sound !== "none") playSoundById(st.sound, st.volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id]);
  if (!ev || (st && !st.enabled)) return null;
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
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-black">{t.title}</span>
            <ScopeChip kind={ev.kind} />
          </span>
          <span className="block text-sm">{t.text}</span>
          <span className="mt-0.5 block text-[10px] opacity-60">
            Antippen zum Schließen{events.length > 1 ? ` · noch ${events.length - 1} weitere` : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
