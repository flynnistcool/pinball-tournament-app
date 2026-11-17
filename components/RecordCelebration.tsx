"use client";

// 🏆 Highscore-Jubel am Infobildschirm.
// - Lädt die bisherigen Rekorde (/api/public/machine-records) beim Start + alle 5 Minuten.
// - Beobachtet die Live-Daten der TV-Seite: neue/geänderte Scores werden erst nach
//   STABLE_MS ohne Änderung bewertet (Schutz vor Tippfehlern).
// - Was beim Öffnen der Seite schon eingetragen ist, wird nicht nachträglich gefeiert.
// - Auch im Admin-Bereich (Dashboard) im Einsatz: dort ohne Ton und per Antippen schließbar.
// - 🏆 Allzeit-Rekord: Konfetti + Vollbild 16 s + Fanfare (wenn Ton an).
// - 🥇 30-Tage-Highscore (bester Score der letzten 30 Tage): Vollbild ohne Konfetti 10 s + Fanfare (5 s).
// - 🎖️ Matchsieg-Meilenstein (1, 10, 25, 50, 100, 250, 500, jede 1.000): Vollbild lila 10 s + kurzer Ton.
// - 🔥 Siegesserie (erstmals 3 bzw. 5 Siege in Folge im Turnier): Karte am Rand 5 s + kurzer Ton.
// - 💪 Persönlicher Rekord: Karte am Rand 10 s + kurzer Ton.
// Zeiten bewusst lang: man soll es noch sehen, wenn man erst zum TV läuft.

import { useEffect, useMemo, useRef, useState } from "react";
import { notifSetting, type NotifDevice } from "@/lib/notifications";
import { useNotificationSettings } from "@/components/useNotificationSettings";
import type { FeedItemInput } from "@/lib/feed";
import ScopeChip from "@/components/ScopeChip";
import { playDing } from "@/lib/synthSounds";
import { playSoundById } from "@/lib/playSound";
export { playDing };
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert (createPortal funktioniert trotzdem)
import { createPortal } from "react-dom";
import { evaluateEntry, liveEntriesFrom, type Celebration, type PriorRecords } from "@/lib/recordWatch";
import { isWinMilestone, liveWinsFrom, milestoneIcon, milestoneTitle } from "@/lib/winMilestones";
import { computeStreaks, lastFinishedMatchOf, streakRunIds, streakFire, streakMin, streakMode, streakText, type StreakMode } from "@/lib/winStreaks";

const STABLE_MS = 10_000;
const RECORDS_REFRESH_MS = 5 * 60_000;

type WinShown = { kind: "wins"; n: number; playerName: string; key: string };
type StreakShown = { kind: "streak"; n: number; mode: StreakMode; playerName: string; key: string };
/** 🧯 Turnier-Serie beendet: wer (breakerIds/Names) hat die Serie von victimName (n in Folge) gebrochen */
type StreakEndShown = {
  kind: "streakEnd";
  n: number;
  victimName: string;
  breakerName: string;
  breakerIds: string[];
  key: string;
};
type Shown = Celebration | WinShown | StreakShown | StreakEndShown;

const SHOW_MS: Record<Shown["kind"], number> = {
  record: 16_000,
  month: 10_000,
  wins: 10_000,
  streak: 5_000,
  streakEnd: 6_000,
  personal: 10_000,
};
const KIND_ORDER: Record<Shown["kind"], number> = { record: 0, month: 1, wins: 2, streak: 3, streakEnd: 4, personal: 5 };
const sortValue = (x: Shown) => (x.kind === "wins" || x.kind === "streak" || x.kind === "streakEnd" ? x.n : x.entry.score);

type LiveData = Parameters<typeof liveEntriesFrom>[0] &
  Parameters<typeof liveWinsFrom>[0] &
  Parameters<typeof computeStreaks>[0] & { tournament?: { status?: string | null; format?: string | null } };

const fmt = (n: number) => n.toLocaleString("de-DE");

/** "matchId|playerId" → playerId */
const pidOfKey = (key: string) => String(key).split("|").pop() ?? "";

/** 📣 Text für den Live-Ticker (+ beteiligte Spieler und Angaben für persönliche Handy-Einblendungen) */
function feedItemOf(c: Shown): FeedItemInput {
  const base = feedItemText(c);
  if (c.kind === "record" || c.kind === "month" || c.kind === "personal") {
    return {
      ...base,
      players: [pidOfKey(c.entry.key)],
      data: { player: c.entry.playerName, machine: c.entry.machineName ?? "?", score: c.entry.score },
    };
  }
  if (c.kind === "wins") return { ...base, players: [pidOfKey(c.key)], data: { player: c.playerName, n: c.n } };
  // 🧯 Handy-Karte nur für den, der die Serie beendet hat
  if (c.kind === "streakEnd")
    return { ...base, players: c.breakerIds, data: { player: c.breakerName, victim: c.victimName, n: c.n } };
  // On fire: key = "playerId|startMatch|n" (bzw. "playerId|n")
  return { ...base, players: [String(c.key).split("|")[0]], data: { player: c.playerName, n: c.n, mode: c.mode } };
}

function feedItemText(c: Shown): FeedItemInput {
  switch (c.kind) {
    case "record":
      return {
        key: `record|${c.entry.key}|${c.entry.score}`,
        kind: "record",
        icon: "🏆",
        title: "Allzeit-Highscore!",
        body: `${c.entry.playerName} an ${c.entry.machineName ?? "?"} – ${fmt(c.entry.score)}`,
      };
    case "month":
      return {
        key: `month|${c.entry.key}|${c.entry.score}`,
        kind: "month",
        icon: "🥇",
        title: "30-Tage-Highscore",
        body: `${c.entry.playerName} an ${c.entry.machineName ?? "?"} – ${fmt(c.entry.score)}`,
      };
    case "personal":
      return {
        key: `personal|${c.entry.key}|${c.entry.score}`,
        kind: "personal",
        icon: "💪",
        title: "Persönlicher Highscore",
        body: `${c.entry.playerName} an ${c.entry.machineName ?? "?"} – ${fmt(c.entry.score)}`,
      };
    case "wins":
      return {
        key: `wins|${c.key}|${c.n}`,
        kind: "wins",
        icon: "🎉",
        title: `${c.n}. Matchsieg`,
        body: `${c.playerName} feiert den ${c.n}. Matchsieg`,
      };
    case "streak":
      return {
        key: `streak|${c.key}`,
        kind: "streak",
        icon: "🔥",
        title: "On fire!",
        body: `${c.playerName}: ${streakText(c.mode, c.n)} im Turnier`,
      };
    case "streakEnd":
      return {
        key: `streakEnd|${c.key}`,
        kind: "streakEnd",
        icon: "🧯",
        title: "Serie beendet",
        body: `${c.breakerName} beendet die Siegesserie von ${c.victimName} (${c.n} Siege in Folge)`,
      };
  }
}


const CONFETTI_COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb923c", "#f87171"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.8 + Math.random() * 2.4,
        size: 8 + Math.random() * 10,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * 360,
        round: Math.random() < 0.3,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute -top-8 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            backgroundColor: p.color,
            borderRadius: p.round ? "9999px" : "2px",
            transform: `rotate(${p.rot}deg)`,
            animation: `recConfetti ${p.dur}s linear ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}

const CSS = `
@keyframes recConfetti {
  0% { transform: translate3d(0,-5vh,0) rotate(0deg); opacity: 1; }
  100% { transform: translate3d(6vw,110vh,0) rotate(720deg); opacity: 0.9; }
}
@keyframes recPop {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes recSlide {
  0% { transform: translateX(120%); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
@keyframes recGlow {
  0%,100% { text-shadow: 0 0 24px rgba(251,191,36,.7), 0 0 60px rgba(251,191,36,.35); }
  50% { text-shadow: 0 0 40px rgba(251,191,36,1), 0 0 90px rgba(251,191,36,.6); }
}
`;

function BigRecord({ c, onClose }: { c: Extract<Celebration, { kind: "record" }>; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <Confetti />
      <div className="relative px-8 text-center" style={{ animation: "recPop 0.7s ease-out both" }}>
        <div className="text-[9vw] leading-none">🏆</div>
        <div
          className="mt-2 text-[7vw] font-black uppercase leading-none tracking-tight text-amber-300"
          style={{ animation: "recGlow 1.6s ease-in-out infinite" }}
        >
          Neuer Rekord!
        </div>
        <div className="mt-6 text-[3.6vw] font-extrabold text-white">{c.entry.playerName}</div>
        <div className="mt-1 font-mono text-[5vw] font-black tabular-nums text-white">{fmt(c.entry.score)}</div>
        <div className="mt-2 text-[2.2vw] font-semibold text-white/80">🎰 {c.entry.machineName ?? "Flipper"}</div>
        <div className="mt-5 text-[1.6vw] text-white/55">
          vorher {fmt(c.previous.score)}
          {c.previous.holder ? ` von ${c.previous.holder}` : ""}
        </div>
      </div>
    </div>
  );
}

function MonthRecord({ c, onClose }: { c: Extract<Celebration, { kind: "month" }>; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div
        className="relative rounded-[3vw] bg-gradient-to-b from-sky-900/90 to-slate-950/95 px-[5vw] py-[3vw] text-center ring-4 ring-sky-300/70"
        style={{ animation: "recPop 0.6s ease-out both", boxShadow: "0 0 80px rgba(56,189,248,.45)" }}
      >
        <div className="text-[6vw] leading-none">🥇</div>
        <div className="mt-2 text-[5vw] font-black uppercase leading-none tracking-tight text-sky-300">
          30-Tage-Highscore
        </div>
        <div className="mt-1 text-[1.4vw] font-semibold uppercase tracking-widest text-sky-100/60">
          bester Score der letzten 30 Tage
        </div>
        <div className="mt-5 text-[3vw] font-extrabold text-white">{c.entry.playerName}</div>
        <div className="mt-1 font-mono text-[4.2vw] font-black tabular-nums text-white">{fmt(c.entry.score)}</div>
        <div className="mt-2 text-[2vw] font-semibold text-white/80">🎰 {c.entry.machineName ?? "Flipper"}</div>
        <div className="mt-4 text-[1.5vw] text-white/55">
          vorher {fmt(c.previous.score)}
          {c.previous.holder ? ` von ${c.previous.holder}` : ""}
        </div>
      </div>
    </div>
  );
}

function WinMilestone({ c, onClose }: { c: WinShown; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div
        className="relative rounded-[3vw] bg-gradient-to-b from-violet-800/90 to-slate-950/95 px-[5vw] py-[3vw] text-center ring-4 ring-violet-300/70"
        style={{ animation: "recPop 0.6s ease-out both", boxShadow: "0 0 80px rgba(167,139,250,.5)" }}
      >
        <div className="text-[7vw] leading-none">{milestoneIcon(c.n)}</div>
        <div className="mt-3 text-[5vw] font-black uppercase leading-none tracking-tight text-violet-200">
          {milestoneTitle(c.n)}
        </div>
        <div className="mt-5 text-[3.4vw] font-extrabold text-white">{c.playerName}</div>
        <div className="mt-2 text-[1.6vw] font-semibold uppercase tracking-widest text-violet-100/60">
          {c.n === 1 ? "Willkommen im Club der Sieger" : "Matchsiege insgesamt – herzlichen Glückwunsch!"}
        </div>
      </div>
    </div>
  );
}

function SmallPersonal({ c, onClose }: { c: Extract<Celebration, { kind: "personal" }>; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 px-7 py-5 text-white shadow-2xl ring-4 ring-emerald-300/60">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-emerald-100">💪 Persönlicher Rekord</div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.entry.playerName}</div>
        <div className="font-mono text-[2.4vw] font-extrabold tabular-nums">{fmt(c.entry.score)}</div>
        <div className="text-[1.2vw] text-emerald-50/90">
          🎰 {c.entry.machineName ?? "Flipper"} · vorher {fmt(c.previous)}
        </div>
      </div>
    </div>
  );
}

function StreakCard({ c, onClose }: { c: StreakShown; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-orange-500 to-red-600 px-7 py-5 text-white shadow-2xl ring-4 ring-orange-300/60">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-orange-100">
          {streakFire(c.n, streakMin(c.mode))} On fire!
        </div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.playerName}</div>
        <div className="text-[1.8vw] font-extrabold">{streakText(c.mode, c.n)}</div>
      </div>
    </div>
  );
}

function StreakEndCard({ c, onClose }: { c: StreakEndShown; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-sky-600 to-indigo-700 px-7 py-5 text-white shadow-2xl ring-4 ring-sky-300/60">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-sky-100">🧯 Serie beendet!</div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.breakerName}</div>
        <div className="text-[1.8vw] font-extrabold">
          stoppt {c.victimName} nach {c.n} Siegen in Folge
        </div>
      </div>
    </div>
  );
}

const TICK_MS = 2000; // lokale Prüfung (kein Netzwerk): ist ein Score schon STABLE_MS stabil?

function RecordCelebrationInner({
  code,
  data,
  soundOn,
  onRecordSound,
  dismissOnTap = false,
  device = "tv",
  onEvents,
}: {
  code: string;
  data: LiveData | null;
  soundOn: boolean;
  /** Fanfare abspielen: "record" ganz, "month" kurz (ca. 5 s); volume = Faktor aus 🔔 Meldungen & Sounds */
  onRecordSound?: (kind: "record" | "month", volume: number) => void;
  /** Admin-Bereich: Antippen schließt die Einblendung sofort */
  dismissOnTap?: boolean;
  /** für 🔔 Meldungen & Sounds (An/Aus, Dauer, Lautstärke je Gerät) */
  device?: NotifDevice;
  /** 📣 Live-Ticker: erkannte Ereignisse melden (nur Admin-Tablet trägt ein) */
  onEvents?: (items: FeedItemInput[]) => void;
}) {
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;
  const backfilledRef = useRef(false); // 📣 vorhandene Highscores einmal nachgetragen?
  const notifSettings = useNotificationSettings();
  const [prior, setPrior] = useState<PriorRecords | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [priorWins, setPriorWins] = useState<Record<string, number> | null>(null);
  const [queue, setQueue] = useState<Shown[]>([]);
  const [mounted, setMounted] = useState(false);

  const seenRef = useRef<Map<string, number> | null>(null); // key → zuletzt bewerteter Score
  const pendingRef = useRef<Map<string, { score: number; since: number }>>(new Map());
  // Matchsiege: bereits gezählte Siege (key → Profil) und noch nicht stabile
  const seenWinsRef = useRef<Map<string, string> | null>(null);
  const pendingWinsRef = useRef<Map<string, number>>(new Map());
  // Siegesserien: zuletzt bestätigte Serie je Spieler + noch nicht stabile Änderungen
  const seenStreakRef = useRef<Map<string, number> | null>(null);
  const pendingStreakRef = useRef<Map<string, { n: number; since: number }>>(new Map());
  // schon gemeldete Stufen (pro Spieler je Stufe nur einmal – auch wenn die Serie reißt und wiederkommt)
  const celebratedStreakRef = useRef<Set<string>>(new Set());
  // aktueller Stand für die lokale 2-s-Prüfung
  const dataRef = useRef<LiveData | null>(null);
  const priorRef = useRef<PriorRecords | null>(null);
  const enabledRef = useRef(false);
  const priorWinsRef = useRef<Record<string, number> | null>(null);
  const excludedWinsRef = useRef<Set<string>>(new Set());
  // Matchsiege neu laden, wenn ein Spieler in der geladenen Liste fehlt (z. B. später hinzugefügt)
  const reloadWinsRef = useRef<() => void>(() => {});
  const lastWinsReloadRef = useRef(0);
  dataRef.current = data;
  priorRef.current = prior;
  enabledRef.current = enabled;
  priorWinsRef.current = priorWins;

  useEffect(() => setMounted(true), []);

  // bisherige Rekorde + bisherige Matchsiege laden
  useEffect(() => {
    let disposed = false;
    setPriorWins(null); // anderes Turnier → alte Zählung nicht weiterverwenden
    async function loadRecords() {
      try {
        const res = await fetch(`/api/public/machine-records?code=${encodeURIComponent(code)}&ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (disposed || !res.ok || !j?.ok) return;
        setEnabled(!!j.enabled);
        setPrior({
          records: j.records ?? {},
          monthly: j.monthly ?? {},
          personal: j.personal ?? {},
          excludedProfiles: j.excludedProfiles ?? [], // 🤖/🚫 kein Rekord-Jubel für Bots/Platzhalter
        });
      } catch {
        /* nächster Versuch beim nächsten Intervall */
      }
    }
    async function loadWins() {
      try {
        const res = await fetch(`/api/public/player-wins?code=${encodeURIComponent(code)}&ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (disposed || !res.ok || !j?.ok) return;
        setPriorWins(j.wins ?? {});
        excludedWinsRef.current = new Set((j.excluded ?? []).map(String)); // 🤖/🚫 keine Meilensteine
      } catch {
        /* nächster Versuch beim nächsten Intervall */
      }
    }
    reloadWinsRef.current = () => void loadWins();
    const load = () => {
      void loadRecords();
      void loadWins();
    };
    void load();
    const t = window.setInterval(load, RECORDS_REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(t);
    };
  }, [code]);

  // Scores prüfen – bei neuen Daten UND alle 2 s (nur lokal, keine Anfrage)
  useEffect(() => {
    function check() {
      const d = dataRef.current;
      if (!d) return;
      const entries = liveEntriesFrom(d);
      const wins = liveWinsFrom(d);
      const sMode = streakMode(d.tournament?.format);
      const streaks = computeStreaks(d, sMode);
      const runIds = streakRunIds(d, sMode); // je Serie eigene Kennung (neue Serie = neue Meldung)
      const streakKey = (pid: string, n: number) => (runIds[pid] ? `${pid}|${runIds[pid]}|${n}` : `${pid}|${n}`);

      // erstes Laden: alles Vorhandene gilt als bekannt (nicht nachträglich feiern)
      if (!seenRef.current || !seenWinsRef.current || !seenStreakRef.current) {
        seenRef.current = new Map(entries.map((e) => [e.key, e.score]));
        seenWinsRef.current = new Map(wins.map((w) => [w.key, w.profileId]));
        seenStreakRef.current = new Map(Object.entries(streaks));
        return;
      }
      const seen = seenRef.current;
      const pending = pendingRef.current;
      const pr = priorRef.current;
      const now = Date.now();
      const found: Shown[] = [];
      const finished = d.tournament?.status === "finished";

      // 📣 Nachtragen: Highscores + Serien, die beim Öffnen/Neuladen schon bestanden, einmal in den Ticker
      // (ohne Einblendung; doppelte Einträge verhindert die eindeutige Kennung im Ticker)
      if (!backfilledRef.current && pr && enabledRef.current && !finished && onEventsRef.current) {
        backfilledRef.current = true;
        const items = entries
          .map((e) => evaluateEntry(e, pr, entries))
          .filter((c): c is Celebration => !!c)
          .map(feedItemOf);
        // 🔥 laufende Siegesserien (aktuelle Stufe) ebenfalls nachtragen
        const nameOf = new Map((d.players ?? []).map((p) => [String(p.id), String(p.name ?? "?")]));
        for (const [pid, n] of Object.entries(streaks)) {
          if (n < streakMin(sMode)) continue;
          const ck = streakKey(pid, n);
          celebratedStreakRef.current.add(ck);
          items.push(feedItemOf({ kind: "streak", n, mode: sMode, playerName: nameOf.get(pid) ?? "?", key: ck }));
        }
        if (items.length) onEventsRef.current(items);
      }

      for (const e of entries) {
        if (seen.get(e.key) === e.score) {
          pending.delete(e.key);
          continue;
        }
        const p = pending.get(e.key);
        if (!p || p.score !== e.score) {
          pending.set(e.key, { score: e.score, since: now }); // neu oder korrigiert → Zeit neu starten
          continue;
        }
        if (now - p.since < STABLE_MS) continue;
        if (!pr) continue; // Rekorde noch nicht geladen → später bewerten
        pending.delete(e.key);
        seen.set(e.key, e.score);
        if (!enabledRef.current || finished) continue;
        const c = evaluateEntry(e, pr, entries);
        if (c) found.push(c);
      }
      // gelöschte Scores vergessen
      const live = new Set(entries.map((e) => e.key));
      for (const k of Array.from(pending.keys())) if (!live.has(k)) pending.delete(k);

      // 🎖️ Matchsiege: neuer Platz 1 → nach STABLE_MS zählen; Meilenstein? → feiern
      const seenWins = seenWinsRef.current;
      const pendingWins = pendingWinsRef.current;
      const pw = priorWinsRef.current;
      const liveWinKeys = new Set(wins.map((w) => w.key));
      // korrigierte Plätze (kein Platz 1 mehr) wieder aus der Zählung nehmen
      for (const k of Array.from(seenWins.keys())) if (!liveWinKeys.has(k)) seenWins.delete(k);
      for (const k of Array.from(pendingWins.keys())) if (!liveWinKeys.has(k)) pendingWins.delete(k);
      for (const w of wins) {
        if (seenWins.has(w.key)) continue;
        const since = pendingWins.get(w.key);
        if (since == null) {
          pendingWins.set(w.key, now);
          continue;
        }
        if (now - since < STABLE_MS || !pw) continue;
        if (!Object.prototype.hasOwnProperty.call(pw, w.profileId)) {
          // Spieler fehlt in der geladenen Zählung (nach dem Laden hinzugefügt) → NICHT als 0 werten,
          // sondern neu laden (höchstens alle 10 s) und den Sieg danach bewerten
          if (now - lastWinsReloadRef.current >= 10_000) {
            lastWinsReloadRef.current = now;
            reloadWinsRef.current();
          }
          continue;
        }
        pendingWins.delete(w.key);
        seenWins.set(w.key, w.profileId);
        if (finished) continue;
        if (excludedWinsRef.current.has(String(w.profileId))) continue; // 🤖/🚫 Bots + Platzhalter
        let liveCount = 0;
        for (const pid of Array.from(seenWins.values())) if (pid === w.profileId) liveCount++;
        const n = (pw[w.profileId] ?? 0) + liveCount;
        if (isWinMilestone(n)) found.push({ kind: "wins", n, playerName: w.playerName, key: w.key });
      }

      // 🔥 Siegesserien: Serie erstmals auf 3 (bzw. 5) gestiegen und STABLE_MS stabil → Karte
      const seenStreak = seenStreakRef.current;
      const pendingStreak = pendingStreakRef.current;
      const nameById = new Map((d.players ?? []).map((p) => [String(p.id), String(p.name ?? "?")]));
      const allPids = new Set([...Array.from(seenStreak.keys()), ...Object.keys(streaks)]);
      for (const pid of Array.from(allPids)) {
        const n = streaks[pid] ?? 0;
        const old = seenStreak.get(pid) ?? 0;
        if (n === old) {
          pendingStreak.delete(pid);
          continue;
        }
        // 🧯 Serie (ab Mindestwert) gerissen → wie Anstiege erst nach STABLE_MS melden (Korrekturen abwarten)
        const endCandidate = sMode === "wins" && n === 0 && old >= streakMin(sMode);
        if (n < old && !endCandidate) {
          // Platz korrigiert / Serie unter dem Mindestwert gerissen → ohne Meldung übernehmen
          seenStreak.set(pid, n);
          pendingStreak.delete(pid);
          continue;
        }
        const p = pendingStreak.get(pid);
        if (!p || p.n !== n) {
          pendingStreak.set(pid, { n, since: now });
          continue;
        }
        if (now - p.since < STABLE_MS) continue;
        pendingStreak.delete(pid);
        seenStreak.set(pid, n);
        if (finished) continue;
        if (endCandidate) {
          const last = lastFinishedMatchOf(d, pid);
          const breakers = (last?.winnerIds ?? []).filter((x) => x !== pid);
          if (last && breakers.length) {
            const ek = `${pid}|${last.matchId}`;
            if (!celebratedStreakRef.current.has("end|" + ek)) {
              celebratedStreakRef.current.add("end|" + ek);
              found.push({
                kind: "streakEnd",
                n: old,
                victimName: nameById.get(pid) ?? "?",
                breakerName: breakers.map((b) => nameById.get(b) ?? "?").join(" & "),
                breakerIds: breakers,
                key: ek,
              });
            }
          }
          continue;
        }
        // Meldung bei jeder neuen Stufe ab dem Mindestwert (Siege: 3, 4, 5 … · Round the Pinball: 2, 3, 4 …)
        const ck = streakKey(pid, n);
        if (n >= streakMin(sMode) && !celebratedStreakRef.current.has(ck)) {
          celebratedStreakRef.current.add(ck);
          found.push({ kind: "streak", n, mode: sMode, playerName: nameById.get(pid) ?? "?", key: ck });
        }
      }

      if (found.length) {
        // Rekorde zuerst, dann 30 Tage, Matchsiege, persönliche – jeweils höchster Wert zuerst
        found.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || sortValue(b) - sortValue(a));
        setQueue((q) => [...q, ...found]);
        onEventsRef.current?.(found.map(feedItemOf)); // 📣 Live-Ticker
      }
    }
    check();
    const t = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(t);
  }, [data, prior, enabled, priorWins]);

  // Warteschlange abspielen
  const current = queue[0] ?? null;
  useEffect(() => {
    if (!current) return;
    // 🔔 Meldungen & Sounds: auf diesem Gerät aus → überspringen
    const st = notifSetting(notifSettings, current.kind, device);
    if (!st.enabled) {
      setQueue((q) => q.slice(1));
      return;
    }
    // 🔊 gewählter Sound (🔔 Meldungen & Sounds); TV nur nach "🔊 Ton aktivieren"
    if ((device === "tv" ? soundOn : true) && st.sound !== "none") playSoundById(st.sound, st.volume);
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), st.ms ?? SHOW_MS[current.kind]);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!mounted || !current) return null;
  const close = dismissOnTap ? () => setQueue((q) => (q[0] === current ? q.slice(1) : q)) : undefined;
  return createPortal(
    <>
      <style>{CSS}</style>
      {current.kind === "record" ? (
        <BigRecord c={current} onClose={close} />
      ) : current.kind === "month" ? (
        <MonthRecord c={current} onClose={close} />
      ) : current.kind === "wins" ? (
        <WinMilestone c={current} onClose={close} />
      ) : current.kind === "streak" ? (
        <StreakCard c={current} onClose={close} />
      ) : current.kind === "streakEnd" ? (
        <StreakEndCard c={current} onClose={close} />
      ) : (
        <SmallPersonal c={current} onClose={close} />
      )}
      {/* 🏷️ worauf bezieht sich die Meldung (Turnier / 30 Tage / Allzeit) */}
      <div className="pointer-events-none fixed left-1/2 top-[2vh] z-[101] -translate-x-1/2">
        <ScopeChip kind={current.kind} variant="dark" long className="!px-3 !py-1 !text-sm" />
      </div>
      {dismissOnTap ? (
        <div className="pointer-events-none fixed bottom-[1.5vh] left-1/2 z-[101] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
          Antippen zum Schließen
        </div>
      ) : null}
    </>,
    document.body
  );
}

/**
 * Beendetes Turnier: gar nichts laden, prüfen oder feiern – auch nicht, wenn man es
 * Wochen später wieder öffnet. Erst bei laufenden Turnieren startet die Jubel-Logik.
 */
export default function RecordCelebration(props: Parameters<typeof RecordCelebrationInner>[0]) {
  if (props.data?.tournament?.status === "finished") return null;
  return <RecordCelebrationInner {...props} />;
}
