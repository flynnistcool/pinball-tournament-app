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
import { evaluateEntry, liveEntriesFrom, machineKey, personalKey, type Celebration, type PriorRecords } from "@/lib/recordWatch";
import { isWinMilestone, liveWinsFrom, milestoneIcon, milestoneTitle } from "@/lib/winMilestones";
import { completedMatchIds, momentMode, momentsForMatch, type MatchMoment } from "@/lib/matchMoments";
import { liveLeaderboard } from "@/lib/myMatch";
import { flawlessMode, isUnbeaten, playerRuns, runCount, unbeatenStep, type FlawlessMode, type PlayerRun } from "@/lib/flawless";
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
/** 🛡️ noch unbesiegt (n = Siege bzw. Flipper, matches = gespielte Matches) */
type UnbeatenShown = { kind: "unbeaten"; n: number; matches: number; mode: FlawlessMode; playerName: string; playerId: string; key: string };
/** 💔 Traum geplatzt: bisher Unbesiegter verliert zum ersten Mal */
type UnbeatenEndShown = {
  kind: "unbeatenEnd";
  n: number;
  mode: FlawlessMode;
  victimName: string;
  breakerName: string;
  breakerIds: string[];
  machine: string | null;
  key: string;
};
/** 🧊 / 📸 / 💣 besonderer Match-Moment */
type MomentShown = {
  [K in MatchMoment["kind"]]: { kind: K; m: Extract<MatchMoment, { kind: K }>; winnerName: string; loserName: string; key: string };
}[MatchMoment["kind"]];
/** 👑 neuer Tabellenführer */
type LeaderShown = { kind: "leader"; playerName: string; playerId: string; points: number; prevName: string | null; key: string };
/** 🎰 Flipper-Premiere: erster Score eines Spielers auf diesem Flipper (an der Location) */
/** score = null: Match nur mit Plätzen gewertet (ohne Punkte) */
type PremiereShown = { kind: "premiere"; playerName: string; playerId: string; machineName: string; score: number | null; key: string };
/** 📈 Elo-Meilenstein: Live-Elo knackt eine Hunderter-Marke (again = im Turnier schon mal darüber) */
type EloMarkShown = { kind: "eloMark"; playerName: string; playerId: string; mark: number; elo: number; again: boolean; key: string };
type Shown =
  | Celebration
  | WinShown
  | StreakShown
  | StreakEndShown
  | UnbeatenShown
  | UnbeatenEndShown
  | MomentShown
  | LeaderShown
  | PremiereShown
  | EloMarkShown;

const SHOW_MS: Record<Shown["kind"], number> = {
  record: 16_000,
  month: 10_000,
  wins: 10_000,
  streak: 5_000,
  streakEnd: 6_000,
  unbeaten: 7_000,
  unbeatenEnd: 7_000,
  leader: 6_000,
  upset: 7_000,
  photo: 7_000,
  blowout: 7_000,
  revenge: 6_000,
  premiere: 6_000,
  eloMark: 6_000,
  personal: 10_000,
};
const KIND_ORDER: Record<Shown["kind"], number> = {
  record: 0,
  month: 1,
  unbeatenEnd: 2,
  unbeaten: 3,
  upset: 4,
  photo: 5,
  blowout: 6,
  revenge: 7,
  leader: 8,
  eloMark: 9,
  wins: 10,
  streak: 11,
  streakEnd: 12,
  premiere: 13,
  personal: 14,
};
const sortValue = (x: Shown) =>
  "n" in x ? x.n : "entry" in x ? x.entry.score : "points" in x ? x.points : "mark" in x ? x.mark : "score" in x ? x.score ?? 0 : 0;

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
  if (c.kind === "unbeaten") return { ...base, players: [c.playerId], data: { player: c.playerName, n: c.n, matches: c.matches, mode: c.mode } };
  if (c.kind === "unbeatenEnd")
    return { ...base, players: c.breakerIds, data: { player: c.breakerName, victim: c.victimName, n: c.n, mode: c.mode, machine: c.machine } };
  if (c.kind === "leader") return { ...base, players: [c.playerId], data: { player: c.playerName, points: c.points } };
  if (c.kind === "premiere")
    return { ...base, players: [c.playerId], data: { player: c.playerName, machine: c.machineName, score: c.score } };
  if (c.kind === "eloMark")
    return { ...base, players: [c.playerId], data: { player: c.playerName, mark: c.mark, elo: c.elo, again: c.again } };
  if (c.kind === "upset" || c.kind === "photo" || c.kind === "blowout" || c.kind === "revenge")
    return { ...base, players: [c.m.winnerId], data: { player: c.winnerName, other: c.loserName, ...momentData(c.m) } };
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
    case "leader":
      return {
        key: `leader|${c.key}`,
        kind: "leader",
        icon: "👑",
        title: "Neuer Tabellenführer",
        body: c.prevName
          ? `${c.playerName} übernimmt die Spitze von ${c.prevName} (${c.points} Pkt.)`
          : `${c.playerName} führt jetzt allein (${c.points} Pkt.)`,
      };
    case "upset":
    case "photo":
    case "blowout":
    case "revenge":
      return { key: `${c.kind}|${c.key}`, kind: c.kind, icon: MOMENT_ICON[c.kind], title: MOMENT_TITLE[c.kind], body: momentText(c) };
    case "premiere":
      return {
        key: `premiere|${c.key}`,
        kind: "premiere",
        icon: "🎰",
        title: "Flipper-Premiere",
        body:
          c.score != null
            ? `${c.playerName} spielt zum ersten Mal ${c.machineName} – Einstand mit ${fmt(c.score)} Punkten!`
            : `${c.playerName} spielt zum ersten Mal ${c.machineName}!`,
      };
    case "eloMark":
      return {
        key: `eloMark|${c.key}`,
        kind: "eloMark",
        icon: "📈",
        title: c.again ? "Elo-Marke erneut geknackt" : "Elo-Meilenstein",
        body: `${c.playerName} knackt ${c.again ? "erneut " : ""}die ${c.mark} – jetzt ${c.elo} Elo`,
      };
    case "unbeaten":
      return {
        key: `unbeaten|${c.key}`,
        kind: "unbeaten",
        icon: "🛡️",
        title: "Noch unbesiegt",
        body:
          c.mode === "leads"
            ? `${c.playerName} liegt an allen ${c.n} bisherigen Flippern vorn – schafft er die Flawless Victory?`
            : `${c.playerName}: ${c.n} Siege ohne Niederlage (${c.matches} Matches) – schafft er die Flawless Victory oder wird er noch gestoppt?`,
      };
    case "unbeatenEnd":
      return {
        key: `unbeatenEnd|${c.key}`,
        kind: "unbeatenEnd",
        icon: "💔",
        title: "Traum geplatzt",
        body:
          c.mode === "leads"
            ? `${c.breakerName} überbietet ${c.victimName}${c.machine ? ` an ${c.machine}` : ""} – der Traum von der Flawless Victory ist vorbei`
            : `${c.breakerName} stoppt ${c.victimName} nach ${c.n} Siegen – der Traum von der Flawless Victory ist geplatzt`,
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

function UnbeatenCard({ c, onClose }: { c: UnbeatenShown; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-700 px-7 py-5 text-white shadow-2xl ring-4 ring-emerald-300/60">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-emerald-100">🛡️ Noch unbesiegt</div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.playerName}</div>
        <div className="text-[1.8vw] font-extrabold">
          {c.mode === "leads" ? `an allen ${c.n} Flippern vorn` : `${c.n} Siege ohne Niederlage`}
        </div>
        <div className="mt-1 text-[1.2vw] font-semibold text-emerald-100">Schafft er die Flawless Victory?</div>
      </div>
    </div>
  );
}

function UnbeatenEndCard({ c, onClose }: { c: UnbeatenEndShown; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-rose-600 to-fuchsia-800 px-7 py-5 text-white shadow-2xl ring-4 ring-rose-300/60">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-rose-100">💔 Traum geplatzt</div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.breakerName}</div>
        <div className="text-[1.8vw] font-extrabold">
          {c.mode === "leads"
            ? `überbietet ${c.victimName}${c.machine ? ` an ${c.machine}` : ""}`
            : `stoppt ${c.victimName} nach ${c.n} Siegen`}
        </div>
        <div className="mt-1 text-[1.2vw] font-semibold text-rose-100">Keine Flawless Victory</div>
      </div>
    </div>
  );
}

const MOMENT_ICON = { upset: "🧊", photo: "📸", blowout: "💣", revenge: "🔄" } as const;
const MOMENT_TITLE = { upset: "Favoritensturz", photo: "Fotofinish", blowout: "Kantersieg", revenge: "Revanche" } as const;

function momentData(m: MatchMoment): Record<string, unknown> {
  if (m.kind === "upset") return { winnerElo: m.winnerElo, loserElo: m.loserElo, machine: m.machine };
  if (m.kind === "photo") return { gapPct: m.gapPct, machine: m.machine };
  if (m.kind === "revenge") return { prevRound: m.prevRound, machine: m.machine };
  return { factor: m.factor, machine: m.machine };
}

function momentText(c: MomentShown): string {
  const m = c.m;
  const at = m.machine ? ` an ${m.machine}` : "";
  if (m.kind === "upset")
    return `${c.winnerName} (${m.winnerElo}) schlägt Favorit ${c.loserName} (${m.loserElo})${at} – ${m.loserElo - m.winnerElo} Elo Unterschied!`;
  if (m.kind === "photo")
    return `${c.winnerName} gewinnt${at} hauchdünn gegen ${c.loserName} – nur ${String(m.gapPct).replace(".", ",")} % Vorsprung (${fmt(m.winnerScore)} zu ${fmt(m.loserScore)})`;
  if (m.kind === "revenge")
    return `${c.winnerName} revanchiert sich${at} bei ${c.loserName}${m.prevRound ? ` – in Runde ${m.prevRound} hatte ${c.loserName} noch gewonnen` : ""}`;
  return `${c.winnerName} zerlegt${at} ${c.loserName} – ${String(m.factor).replace(".", ",")}× so viele Punkte (${fmt(m.winnerScore)} zu ${fmt(m.loserScore)})`;
}

const MOMENT_TONE = {
  upset: "from-cyan-500 to-blue-700 ring-cyan-200/60",
  photo: "from-slate-600 to-zinc-800 ring-slate-300/60",
  blowout: "from-orange-500 to-red-700 ring-orange-300/60",
  revenge: "from-violet-500 to-purple-800 ring-violet-300/60",
} as const;

function MomentCard({ c, onClose }: { c: MomentShown; onClose?: () => void }) {
  const m = c.m;
  const line =
    m.kind === "upset"
      ? `schlägt Favorit ${c.loserName}`
      : m.kind === "photo"
      ? `gewinnt mit nur ${String(m.gapPct).replace(".", ",")} % Vorsprung`
      : m.kind === "revenge"
      ? `revanchiert sich bei ${c.loserName}`
      : `${String(m.factor).replace(".", ",")}× so viele Punkte wie ${c.loserName}`;
  const sub =
    m.kind === "upset"
      ? `${m.winnerElo} gegen ${m.loserElo} Elo${m.machine ? ` · ${m.machine}` : ""}`
      : m.kind === "revenge"
      ? `${m.prevRound ? `in Runde ${m.prevRound} verloren – jetzt gewonnen` : "letztes Duell verloren – jetzt gewonnen"}${m.machine ? ` · ${m.machine}` : ""}`
      : `${fmt(m.winnerScore)} zu ${fmt(m.loserScore)}${m.machine ? ` · ${m.machine}` : ""}`;
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className={"rounded-3xl bg-gradient-to-br px-7 py-5 text-white shadow-2xl ring-4 " + MOMENT_TONE[m.kind]}>
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-white/80">
          {MOMENT_ICON[m.kind]} {MOMENT_TITLE[m.kind]}
        </div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.winnerName}</div>
        <div className="text-[1.8vw] font-extrabold">{line}</div>
        <div className="mt-1 text-[1.2vw] font-semibold text-white/80">{sub}</div>
      </div>
    </div>
  );
}

function PremiereCard({ c, onClose }: { c: PremiereShown; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-pink-500 to-rose-700 px-7 py-5 text-white shadow-2xl ring-4 ring-pink-300/60">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-pink-100">🎰 Flipper-Premiere</div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.playerName}</div>
        <div className="text-[1.8vw] font-extrabold">zum ersten Mal an {c.machineName}</div>
        {c.score != null ? (
          <div className="mt-1 text-[1.2vw] font-semibold text-pink-100">Einstand mit {fmt(c.score)} Punkten</div>
        ) : null}
      </div>
    </div>
  );
}

function EloMarkCard({ c, onClose }: { c: EloMarkShown; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-green-800 px-7 py-5 text-white shadow-2xl ring-4 ring-emerald-300/60">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-emerald-100">
          📈 {c.again ? "Erneut geknackt" : "Elo-Meilenstein"}
        </div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.playerName}</div>
        <div className="text-[1.8vw] font-extrabold">knackt {c.again ? "erneut " : ""}die {c.mark}</div>
        <div className="mt-1 text-[1.2vw] font-semibold text-emerald-100">jetzt {c.elo} Elo</div>
      </div>
    </div>
  );
}

function LeaderCard({ c, onClose }: { c: LeaderShown; onClose?: () => void }) {
  return (
    <div
      className={"fixed bottom-[4vh] right-[2vw] z-[100] " + (onClose ? "cursor-pointer" : "pointer-events-none")}
      style={{ animation: "recSlide 0.5s ease-out both" }}
      onClick={onClose}
      role={onClose ? "button" : undefined}
    >
      <div className="rounded-3xl bg-gradient-to-br from-yellow-400 to-amber-600 px-7 py-5 text-amber-950 shadow-2xl ring-4 ring-yellow-200/70">
        <div className="text-[1.5vw] font-bold uppercase tracking-wider text-amber-900">👑 Neuer Tabellenführer</div>
        <div className="mt-1 text-[2.4vw] font-black leading-tight">{c.playerName}</div>
        <div className="text-[1.8vw] font-extrabold">
          {c.prevName ? `übernimmt die Spitze von ${c.prevName}` : "führt jetzt allein"}
        </div>
        <div className="mt-1 text-[1.2vw] font-semibold text-amber-900/80">{c.points} Punkte</div>
      </div>
    </div>
  );
}

const nameById2 = (d: { players?: { id: string; name?: string | null }[] }, pid: string) =>
  String((d.players ?? []).find((p) => String(p.id) === pid)?.name ?? "?");

const TICK_MS = 2000; // lokale Prüfung (kein Netzwerk): ist ein Score schon STABLE_MS stabil?

function RecordCelebrationInner({
  code,
  data,
  soundOn,
  onRecordSound,
  dismissOnTap = false,
  device = "tv",
  onEvents,
  elo,
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
  /** Elo je Spieler-ID – GENAU die Werte, die das Leaderboard daneben zeigt (Turnierbeginn / jetzt) */
  elo?: Record<string, { start: number | null; now: number | null }>;
}) {
  const eloRef = useRef(elo);
  eloRef.current = elo;
  // welche Profile spielen mit? (ändert sich, wenn Spieler hinzugefügt werden)
  const profilesKey = Array.from(
    new Set(
      ((data as { players?: { profile_id?: string | null }[] } | null)?.players ?? [])
        .map((p) => (p.profile_id ? String(p.profile_id) : ""))
        .filter(Boolean)
    )
  )
    .sort()
    .join(",");
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
  // 🛡️ Unbesiegt: bestätigte Bilanz je Spieler + noch nicht stabile Änderungen
  const seenRunsRef = useRef<Map<string, PlayerRun> | null>(null);
  const pendingRunsRef = useRef<Map<string, { sig: string; since: number }>>(new Map());
  const celebratedUnbeatenRef = useRef<Set<string>>(new Set());
  // "Serie beendet" nicht zusätzlich melden, wenn schon "Traum geplatzt" kam (pid|matchId)
  const suppressStreakEndRef = useRef<Set<string>>(new Set());
  // ⚡ Match-Momente: schon bewertete fertige Matches + noch nicht stabile
  const seenCompleteRef = useRef<Set<string> | null>(null);
  const pendingCompleteRef = useRef<Map<string, number>>(new Map());
  const celebratedMomentRef = useRef<Set<string>>(new Set());
  // 👑 Tabellenführer: zuletzt bestätigter alleiniger Führender (undefined = noch nicht geladen)
  // last = letzter ALLEINIGER Führender (bleibt bei kurzem Gleichstand erhalten)
  const leaderRef = useRef<{ id: string | null; lastId: string | null; lastName: string | null } | undefined>(undefined);
  const pendingLeaderRef = useRef<{ id: string | null; since: number } | null>(null);
  // 🎰 schon gemeldete Premieren (Eintrag-Key)
  const celebratedPremiereRef = useRef<Set<string>>(new Set());
  // 📈 Live-Elo je Spieler: letzter Wert + höchster Wert im Turnier (inkl. Start)
  const eloSeenRef = useRef<Map<string, { last: number; max: number }>>(new Map());
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
    setPrior(null); // anderes Turnier / neue Spieler → erst nach dem Neuladen bewerten (Scores warten so lange)
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
          played: Array.isArray(j.played) ? j.played.map(String) : [], // 🎰 schon irgendwann gespielt
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
  }, [code, profilesKey]); // Spieler hinzugefügt → Rekorde/persönliche Werte/Premiere-Liste sofort neu

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
      const fMode = flawlessMode(d.tournament?.format);
      const runs = playerRuns(d as any, fMode);
      const mMode = momentMode(d.tournament?.format);
      const complete = completedMatchIds(d as any, mMode);
      // 👑 alleiniger Führender im Live-Leaderboard (bei Gleichstand: niemand)
      let lead: { id: string | null; name: string | null; points: number } = { id: null, name: null, points: 0 };
      try {
        const lr = liveLeaderboard(d as any).rows;
        if (lr[0] && lr[0].total > 0 && (!lr[1] || lr[0].total > lr[1].total))
          lead = { id: String(lr[0].id), name: lr[0].name, points: lr[0].total };
      } catch {
        /* unvollständige Daten → diesmal ohne */
      }

      // erstes Laden: alles Vorhandene gilt als bekannt (nicht nachträglich feiern)
      if (!seenRef.current || !seenWinsRef.current || !seenStreakRef.current || !seenRunsRef.current || !seenCompleteRef.current) {
        seenRef.current = new Map(entries.map((e) => [e.key, e.score]));
        seenWinsRef.current = new Map(wins.map((w) => [w.key, w.profileId]));
        seenStreakRef.current = new Map(Object.entries(streaks));
        seenRunsRef.current = new Map(Object.entries(runs));
        seenCompleteRef.current = new Set(complete);
        leaderRef.current = { id: lead.id, lastId: lead.id, lastName: lead.name };
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
        // 🎰 Flipper-Premiere: noch nie an diesem Flipper (Location: beendete Turniere + dieses Turnier)
        if (e.profileId && !celebratedPremiereRef.current.has(e.key)) {
          const pk = personalKey(e.profileId, e.machineKey);
          const excludedP = new Set(pr.excludedProfiles ?? []);
          const playedBefore =
            pk in pr.personal ||
            (pr.played ?? []).includes(pk) ||
            entries.some((o) => o.key !== e.key && o.profileId === e.profileId && o.machineKey === e.machineKey);
          if (!playedBefore && !excludedP.has(e.profileId)) {
            celebratedPremiereRef.current.add(e.key);
            found.push({
              kind: "premiere",
              playerName: e.playerName,
              playerId: pidOfKey(e.key),
              machineName: e.machineName ?? "?",
              score: e.score,
              key: e.key,
            });
          }
        }
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

      // 📈 Elo-Meilensteine: Live-Elo (wie im Leaderboard) knackt eine Hunderter-Marke nach oben
      {
        const es = eloSeenRef.current;
        const nmE = new Map((d.players ?? []).map((p) => [String(p.id), String(p.name ?? "?")]));
        for (const [pid, e] of Object.entries(eloRef.current ?? {})) {
          const v = e?.now;
          if (v == null || !Number.isFinite(v)) continue;
          const prevE = es.get(pid);
          if (!prevE) {
            // erster Wert: nur merken (Start-Elo zählt als "schon mal erreicht")
            es.set(pid, { last: v, max: Math.max(v, e?.start ?? v) });
            continue;
          }
          if (v === prevE.last) continue;
          const markNew = Math.floor(v / 100) * 100;
          if (v > prevE.last && markNew > Math.floor(prevE.last / 100) * 100 && !finished) {
            found.push({
              kind: "eloMark",
              playerName: nmE.get(pid) ?? "?",
              playerId: pid,
              mark: markNew,
              elo: Math.round(v),
              again: markNew <= prevE.max,
              key: `${pid}|${markNew}|${Math.round(v)}`,
            });
          }
          es.set(pid, { last: v, max: Math.max(prevE.max, v) });
        }
      }

      // ⚡ Match-Momente (🧊 Favoritensturz, 📸 Fotofinish, 💣 Kantersieg): Match frisch fertig + STABLE_MS stabil
      if (mMode !== "none" && seenCompleteRef.current) {
        const seenC = seenCompleteRef.current;
        const pendC = pendingCompleteRef.current;
        const nowComplete = new Set(complete);
        // wieder offen (Korrektur) → vergessen, damit es danach neu bewertet wird
        for (const id of Array.from(seenC)) if (!nowComplete.has(id)) seenC.delete(id);
        for (const id of Array.from(pendC.keys())) if (!nowComplete.has(id)) pendC.delete(id);
        const nm = new Map((d.players ?? []).map((p) => [String(p.id), String(p.name ?? "?")]));
        const eloStart: Record<string, number | null> = {};
        for (const [pid, e] of Object.entries(eloRef.current ?? {})) eloStart[pid] = e?.start ?? null;
        for (const id of complete) {
          if (seenC.has(id)) continue;
          const since = pendC.get(id);
          if (since == null) {
            pendC.set(id, now);
            continue;
          }
          if (now - since < STABLE_MS) continue;
          pendC.delete(id);
          seenC.add(id);
          if (finished) continue;
          // 🎰 Premiere auch bei Matches NUR mit Plätzen (ohne Punkte – sonst kommt sie schon beim ersten Score)
          if (pr && enabledRef.current) {
            const mm = (d.matches ?? []).find((x) => String(x.id) === id) as { machine_id?: string | null } | undefined;
            const machineName =
              ((d as { machines?: { id: string; name: string | null }[] }).machines ?? []).find(
                (x) => String(x.id) === String(mm?.machine_id ?? "")
              )?.name ?? null;
            const mk = machineKey(machineName);
            const excludedP = new Set(pr.excludedProfiles ?? []);
            const profOf = new Map((d.players ?? []).map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));
            const machineOfMatch = new Map((d.matches ?? []).map((x) => [String(x.id), String((x as { machine_id?: string | null }).machine_id ?? "")]));
            for (const mp of (d.match_players ?? []).filter((x) => String(x.match_id) === id)) {
              const pid = String(mp.player_id);
              const key = `${id}|${pid}`;
              const prof = profOf.get(pid);
              if (!mk || !prof || celebratedPremiereRef.current.has(key) || excludedP.has(prof)) continue;
              if (mp.score != null && mp.score !== "") continue; // mit Score → läuft über die Score-Prüfung
              const pk = personalKey(prof, mk);
              const playedHere = (d.match_players ?? []).some((o) => {
                if (String(o.match_id) === id) return false;
                if (profOf.get(String(o.player_id)) !== prof) return false;
                const om = machineOfMatch.get(String(o.match_id));
                const oName = ((d as { machines?: { id: string; name: string | null }[] }).machines ?? []).find((x) => String(x.id) === om)?.name;
                return machineKey(oName ?? null) === mk && ((o as { position?: number | null }).position != null || (o.score != null && o.score !== ""));
              });
              if (pk in pr.personal || (pr.played ?? []).includes(pk) || playedHere) continue;
              celebratedPremiereRef.current.add(key);
              found.push({
                kind: "premiere",
                playerName: nameById2(d, pid),
                playerId: pid,
                machineName: machineName ?? "?",
                score: null,
                key,
              });
            }
          }
          for (const m of momentsForMatch(d as any, id, mMode, eloStart)) {
            const mk = `${m.kind}|${id}`;
            if (celebratedMomentRef.current.has(mk)) continue;
            celebratedMomentRef.current.add(mk);
            found.push({
              kind: m.kind,
              m,
              winnerName: nm.get(m.winnerId) ?? "?",
              loserName: nm.get(m.loserId) ?? "?",
              key: id,
            } as MomentShown);
          }
        }
      }

      // 👑 Neuer Tabellenführer (alleinige Spitze, STABLE_MS stabil)
      if (leaderRef.current !== undefined) {
        const prev = leaderRef.current;
        if (lead.id === prev.id) {
          pendingLeaderRef.current = null;
        } else {
          const pl = pendingLeaderRef.current;
          if (!pl || pl.id !== lead.id) {
            pendingLeaderRef.current = { id: lead.id, since: now };
          } else if (now - pl.since >= STABLE_MS) {
            pendingLeaderRef.current = null;
            if (!lead.id) {
              // Gleichstand an der Spitze: keine Meldung, bisherigen Führenden merken
              leaderRef.current = { ...prev, id: null };
            } else {
              leaderRef.current = { id: lead.id, lastId: lead.id, lastName: lead.name };
              // nur ein ECHTER Wechsel: jemand anderes als der bisherige alleinige Führende
              // (nicht der allererste Führende am Turnieranfang)
              if (prev.lastId && prev.lastId !== lead.id && !finished) {
                found.push({
                  kind: "leader",
                  playerName: lead.name ?? "?",
                  playerId: lead.id,
                  points: lead.points,
                  prevName: prev.lastName,
                  key: `${lead.id}|${complete.length}|${lead.points}`,
                });
              }
            }
          }
        }
      }

      // 🛡️ Unbesiegt / 💔 Traum geplatzt (nach STABLE_MS stabil, wie die anderen Meldungen)
      if (fMode !== "none") {
        const seenRuns = seenRunsRef.current;
        const pendingRuns = pendingRunsRef.current;
        const nm = new Map((d.players ?? []).map((p) => [String(p.id), String(p.name ?? "?")]));
        const empty: PlayerRun = { played: 0, allWon: true, beaten: 0, led: [] };
        const sigOf = (r: PlayerRun) => `${r.played}|${r.allWon ? 1 : 0}|${r.led.join(",")}`;
        const step = unbeatenStep(fMode);
        const allIds = new Set([...Array.from(seenRuns.keys()), ...Object.keys(runs)]);
        for (const pid of Array.from(allIds)) {
          const r = runs[pid] ?? empty;
          const old = seenRuns.get(pid) ?? empty;
          const sig = sigOf(r);
          if (sig === sigOf(old)) {
            pendingRuns.delete(pid);
            continue;
          }
          const p = pendingRuns.get(pid);
          if (!p || p.sig !== sig) {
            pendingRuns.set(pid, { sig, since: now });
            continue;
          }
          if (now - p.since < STABLE_MS) continue;
          pendingRuns.delete(pid);
          seenRuns.set(pid, r);
          if (finished) continue;

          if (isUnbeaten(old, fMode) && !r.allWon) {
            // 💔 erste Niederlage nach einer makellosen Strecke
            let breakers: string[] = [];
            let where = "";
            let machine: string | null = null;
            if (fMode === "wins") {
              const last = lastFinishedMatchOf(d, pid);
              breakers = (last?.winnerIds ?? []).filter((x) => x !== pid);
              where = last?.matchId ?? "";
            } else {
              // Round the Pinball: an welchem Flipper wurde er überboten – und von wem?
              const lost = old.led.find((mid) => !r.led.includes(mid));
              if (lost) {
                where = lost;
                breakers = Object.entries(runs)
                  .filter(([x, rr]) => x !== pid && rr.led.includes(lost))
                  .map(([x]) => x);
                const mm = (d.matches ?? []).find((x) => String(x.id) === lost) as { machine_id?: string | null } | undefined;
                const mach = ((d as { machines?: { id: string; name: string | null }[] }).machines ?? []).find(
                  (x) => String(x.id) === String(mm?.machine_id ?? "")
                );
                machine = mach?.name ? String(mach.name) : null;
              }
            }
            const ek = `${pid}|${where}`;
            if (breakers.length && !celebratedUnbeatenRef.current.has("end|" + ek)) {
              celebratedUnbeatenRef.current.add("end|" + ek);
              suppressStreakEndRef.current.add(ek);
              found.push({
                kind: "unbeatenEnd",
                n: runCount(old, fMode),
                mode: fMode,
                victimName: nm.get(pid) ?? "?",
                breakerName: breakers.map((b) => nm.get(b) ?? "?").join(" & "),
                breakerIds: breakers,
                machine,
                key: ek,
              });
            }
            continue;
          }

          // 🛡️ neue Stufe erreicht (4, 8, 12 … bzw. 3, 6, 9 …) und noch alles gewonnen
          const level = Math.floor(runCount(r, fMode) / step);
          if (isUnbeaten(r, fMode) && level > Math.floor(runCount(old, fMode) / step)) {
            const uk = `${pid}|${level * step}`;
            if (!celebratedUnbeatenRef.current.has(uk)) {
              celebratedUnbeatenRef.current.add(uk);
              found.push({
                kind: "unbeaten",
                n: runCount(r, fMode),
                matches: r.played,
                mode: fMode,
                playerName: nm.get(pid) ?? "?",
                playerId: pid,
                key: uk,
              });
            }
          }
        }
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
            if (!celebratedStreakRef.current.has("end|" + ek) && !suppressStreakEndRef.current.has(ek)) {
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
        // gleiche Stufe schon als "🛡️ Noch unbesiegt" gemeldet (alle Matches gewonnen) → kein zusätzliches "On fire"
        const asUnbeaten = celebratedUnbeatenRef.current.has(`${pid}|${n}`);
        if (n >= streakMin(sMode) && !asUnbeaten && !celebratedStreakRef.current.has(ck)) {
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
  return createPortal(<ShownView current={current} close={close} />, document.body);
}

/** Darstellung einer Einblendung (auch für die 👀 Vorschau) */
function ShownView({ current, close }: { current: Shown; close?: () => void }) {
  return (
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
      ) : current.kind === "unbeaten" ? (
        <UnbeatenCard c={current} onClose={close} />
      ) : current.kind === "unbeatenEnd" ? (
        <UnbeatenEndCard c={current} onClose={close} />
      ) : current.kind === "upset" || current.kind === "photo" || current.kind === "blowout" || current.kind === "revenge" ? (
        <MomentCard c={current} onClose={close} />
      ) : current.kind === "premiere" ? (
        <PremiereCard c={current} onClose={close} />
      ) : current.kind === "eloMark" ? (
        <EloMarkCard c={current} onClose={close} />
      ) : current.kind === "leader" ? (
        <LeaderCard c={current} onClose={close} />
      ) : (
        <SmallPersonal c={current} onClose={close} />
      )}
      {/* 🏷️ worauf bezieht sich die Meldung (Turnier / 30 Tage / Allzeit) */}
      <div className="pointer-events-none fixed left-1/2 top-[2vh] z-[101] -translate-x-1/2">
        <ScopeChip kind={current.kind} variant="dark" long className="!px-3 !py-1 !text-sm" />
      </div>
      {close ? (
        <div className="pointer-events-none fixed bottom-[1.5vh] left-1/2 z-[101] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
          Antippen zum Schließen
        </div>
      ) : null}
    </>
  );
}

/** Arten, die RecordCelebration darstellt (für die 👀 Vorschau) */
export const CELEBRATION_KINDS = [
  "record",
  "month",
  "personal",
  "wins",
  "streak",
  "streakEnd",
  "unbeaten",
  "unbeatenEnd",
  "leader",
  "upset",
  "photo",
  "blowout",
  "revenge",
  "premiere",
  "eloMark",
] as const;

/** Beispiel-Einblendung je Art */
function sampleShown(kind: (typeof CELEBRATION_KINDS)[number]): Shown {
  const entry = {
    key: "preview|a",
    machineKey: "preview",
    machineName: "Godzilla Premium",
    profileId: null,
    playerName: "Andre",
    score: 123_456_780,
  };
  switch (kind) {
    case "record":
      return { kind, entry, previous: { score: 98_765_430, holder: "Christian" } };
    case "month":
      return { kind, entry, previous: { score: 98_765_430, holder: "Christian" } };
    case "personal":
      return { kind, entry, previous: 87_654_320 };
    case "wins":
      return { kind, n: 50, playerName: "Andre", key: "preview" };
    case "streak":
      return { kind, n: 5, mode: "wins", playerName: "Andre", key: "preview" };
    case "streakEnd":
      return { kind, n: 5, victimName: "Christian", breakerName: "Andre", breakerIds: [], key: "preview" };
    case "unbeaten":
      return { kind, n: 8, matches: 8, mode: "wins", playerName: "Andre", playerId: "a", key: "preview" };
    case "unbeatenEnd":
      return { kind, n: 8, mode: "wins", victimName: "Christian", breakerName: "Andre", breakerIds: [], machine: null, key: "preview" };
    case "leader":
      return { kind, playerName: "Andre", playerId: "a", points: 14, prevName: "Christian", key: "preview" };
    case "upset":
      return {
        kind,
        m: { kind, matchId: "p", winnerId: "a", loserId: "b", winnerElo: 1512, loserElo: 1758, machine: "Godzilla Premium" },
        winnerName: "Levin",
        loserName: "Andre",
        key: "preview",
      };
    case "photo":
      return {
        kind,
        m: { kind, matchId: "p", winnerId: "a", loserId: "b", winnerScore: 50_120_000, loserScore: 49_480_000, gapPct: 1.3, machine: "Elvira" },
        winnerName: "Christian",
        loserName: "Leon",
        key: "preview",
      };
    case "blowout":
      return {
        kind,
        m: { kind, matchId: "p", winnerId: "a", loserId: "b", winnerScore: 412_000_000, loserScore: 121_000_000, factor: 3.4, machine: "Jaws Premium" },
        winnerName: "Andre",
        loserName: "Leon",
        key: "preview",
      };
    case "revenge":
      return {
        kind,
        m: { kind, matchId: "p", winnerId: "a", loserId: "b", prevRound: 3, machine: "Black Knight LE" },
        winnerName: "Leon",
        loserName: "Levin",
        key: "preview",
      };
    case "premiere":
      return { kind, playerName: "Christian", playerId: "a", machineName: "Godzilla Premium", score: 12_345_670, key: "preview" };
    case "eloMark":
      return { kind, playerName: "Andre", playerId: "a", mark: 1600, elo: 1604, again: false, key: "preview" };
  }
}

/** 👀 Vorschau (🔔 Meldungen & Sounds): zeigt die Einblendung mit Beispieldaten, Klick schließt */
export function CelebrationPreview({ kind, onClose }: { kind: (typeof CELEBRATION_KINDS)[number]; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[130]" onClick={onClose}>
      <ShownView current={sampleShown(kind)} close={onClose} />
    </div>,
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
