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
// - 💪 Persönlicher Rekord: Karte am Rand 10 s + kurzer Ton.
// Zeiten bewusst lang: man soll es noch sehen, wenn man erst zum TV läuft.

import { useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert (createPortal funktioniert trotzdem)
import { createPortal } from "react-dom";
import { evaluateEntry, liveEntriesFrom, type Celebration, type PriorRecords } from "@/lib/recordWatch";
import { isWinMilestone, liveWinsFrom, milestoneIcon, milestoneTitle } from "@/lib/winMilestones";

const STABLE_MS = 10_000;
const RECORDS_REFRESH_MS = 5 * 60_000;

type WinShown = { kind: "wins"; n: number; playerName: string; key: string };
type Shown = Celebration | WinShown;

const SHOW_MS: Record<Shown["kind"], number> = { record: 16_000, month: 10_000, wins: 10_000, personal: 10_000 };
const KIND_ORDER: Record<Shown["kind"], number> = { record: 0, month: 1, wins: 2, personal: 3 };
const sortValue = (x: Shown) => (x.kind === "wins" ? x.n : x.entry.score);

type LiveData = Parameters<typeof liveEntriesFrom>[0] &
  Parameters<typeof liveWinsFrom>[0] & { tournament?: { status?: string | null } };

const fmt = (n: number) => n.toLocaleString("de-DE");

function playDing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [880, 1318.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.5);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* ohne Ton weiter */
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

const TICK_MS = 2000; // lokale Prüfung (kein Netzwerk): ist ein Score schon STABLE_MS stabil?

function RecordCelebrationInner({
  code,
  data,
  soundOn,
  onRecordSound,
  dismissOnTap = false,
}: {
  code: string;
  data: LiveData | null;
  soundOn: boolean;
  /** Fanfare abspielen: "record" ganz, "month" kurz (ca. 5 s) */
  onRecordSound?: (kind: "record" | "month") => void;
  /** Admin-Bereich: Antippen schließt die Einblendung sofort */
  dismissOnTap?: boolean;
}) {
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
  // aktueller Stand für die lokale 2-s-Prüfung
  const dataRef = useRef<LiveData | null>(null);
  const priorRef = useRef<PriorRecords | null>(null);
  const enabledRef = useRef(false);
  const priorWinsRef = useRef<Record<string, number> | null>(null);
  dataRef.current = data;
  priorRef.current = prior;
  enabledRef.current = enabled;
  priorWinsRef.current = priorWins;

  useEffect(() => setMounted(true), []);

  // bisherige Rekorde + bisherige Matchsiege laden
  useEffect(() => {
    let disposed = false;
    async function loadRecords() {
      try {
        const res = await fetch(`/api/public/machine-records?code=${encodeURIComponent(code)}&ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (disposed || !res.ok || !j?.ok) return;
        setEnabled(!!j.enabled);
        setPrior({ records: j.records ?? {}, monthly: j.monthly ?? {}, personal: j.personal ?? {} });
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
      } catch {
        /* nächster Versuch beim nächsten Intervall */
      }
    }
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

      // erstes Laden: alles Vorhandene gilt als bekannt (nicht nachträglich feiern)
      if (!seenRef.current || !seenWinsRef.current) {
        seenRef.current = new Map(entries.map((e) => [e.key, e.score]));
        seenWinsRef.current = new Map(wins.map((w) => [w.key, w.profileId]));
        return;
      }
      const seen = seenRef.current;
      const pending = pendingRef.current;
      const pr = priorRef.current;
      const now = Date.now();
      const found: Shown[] = [];
      const finished = d.tournament?.status === "finished";

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
        pendingWins.delete(w.key);
        seenWins.set(w.key, w.profileId);
        if (finished) continue;
        let liveCount = 0;
        for (const pid of Array.from(seenWins.values())) if (pid === w.profileId) liveCount++;
        const n = (pw[w.profileId] ?? 0) + liveCount;
        if (isWinMilestone(n)) found.push({ kind: "wins", n, playerName: w.playerName, key: w.key });
      }

      if (found.length) {
        // Rekorde zuerst, dann 30 Tage, Matchsiege, persönliche – jeweils höchster Wert zuerst
        found.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || sortValue(b) - sortValue(a));
        setQueue((q) => [...q, ...found]);
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
    if (soundOn) {
      if (current.kind === "personal" || current.kind === "wins") playDing();
      else onRecordSound?.(current.kind);
    }
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS[current.kind]);
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
      ) : (
        <SmallPersonal c={current} onClose={close} />
      )}
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
