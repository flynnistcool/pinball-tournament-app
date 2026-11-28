"use client";

// 🎬 Arcade-Overlay (Admin): der "Arcade-Moment" als Vollbild über der Seite –
//   start    = "READY?" vor Stufe 1
//   win      = "STAGE CLEAR!" – besiegte Stufe wird abgehakt, der Auswahl-Rahmen fährt eine Stufe hoch
//   loss     = "TRY AGAIN" – ein Herz zerbricht, Revanche gegen denselben Gegner
//   cleared  = "CONGRATULATIONS!" – Endboss abgehakt, Konfetti
//   gameover = "GAME OVER" – letztes Herz zerbricht
// Ablauf (Nutzer 2026-11-28): sanft einblenden → 1,5 s den Stand VORHER zeigen → Animation →
// Titel knallt rein → Text + Knöpfe. Schließt nur per Knopf.
// Dazu ArcadeBar: schmale Leiste direkt über den Matches (Stufe, Leben, Gegner, 🗼 Turm).

import { useEffect, useState } from "react";
import { arcadeKindIcon, type ArcadeModeDef, type ArcadeState } from "@/lib/arcade";

export type ArcadeMoment = "start" | "win" | "loss" | "cleared" | "gameover" | "tower";

type Prof = { name?: string | null; rating?: number | null; bot_kind?: string | null };

/** Zeitplan (ms) */
const T_HOLD = 1500; // Stand vorher zeigen
const T_CHECK = 650; // Haken + "CLEAR" auf der besiegten Stufe, dann fährt der Rahmen hoch
const T_MOVE = 900; // Rahmen fährt hoch
const T_BREAK = 1100; // Herz zerbricht

/** Zeilenhöhe + Abstand im Turm (px) – der Auswahl-Rahmen fährt in diesen Schritten */
const ROW_H = 46;
const GAP = 6;

const KEYFRAMES = `
@keyframes arcIn { 0% { opacity: 0 } 100% { opacity: 1 } }
@keyframes arcCardIn { 0% { opacity: 0; transform: translateY(18px) scale(.96) } 100% { opacity: 1; transform: none } }
@keyframes arcSlam { 0% { transform: scale(2.4); opacity: 0; filter: blur(6px) } 55% { transform: scale(.92); opacity: 1; filter: blur(0) } 75% { transform: scale(1.06) } 100% { transform: scale(1) } }
@keyframes arcFade { 0% { opacity: 0; transform: translateY(8px) } 100% { opacity: 1; transform: none } }
@keyframes arcGlow { 0%,100% { box-shadow: 0 0 0 2px rgba(240,171,252,.9), 0 0 14px 2px rgba(217,70,239,.55) } 50% { box-shadow: 0 0 0 2px rgba(240,171,252,1), 0 0 34px 10px rgba(217,70,239,.75) } }
@keyframes arcCheck { 0% { transform: scale(0) rotate(-30deg) } 60% { transform: scale(1.6) rotate(8deg) } 100% { transform: scale(1) rotate(0) } }
@keyframes arcFlash { 0% { opacity: 0; transform: scale(.6) } 25% { opacity: 1; transform: scale(1.15) } 70% { opacity: 1 } 100% { opacity: 0; transform: scale(1.3) } }
@keyframes arcRowFlash { 0% { background: rgba(16,185,129,.25) } 30% { background: rgba(52,211,153,.9) } 100% { background: rgba(4,120,87,.5) } }
@keyframes arcBreak { 0% { transform: scale(1) rotate(0) } 20% { transform: scale(1.5) rotate(-14deg) } 40% { transform: scale(1.3) rotate(14deg) } 60% { transform: scale(1.4) rotate(-8deg); filter: brightness(1.6) } 100% { transform: scale(.75); opacity: .35; filter: grayscale(1) } }
@keyframes arcShake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-8px) } 40% { transform: translateX(8px) } 60% { transform: translateX(-5px) } 80% { transform: translateX(5px) } }
@keyframes arcFall { 0% { transform: translateY(-20px) rotate(0); opacity: 1 } 100% { transform: translateY(110vh) rotate(540deg); opacity: .9 } }
`;

type Phase = "hold" | "anim" | "done";

export default function ArcadeOverlay({
  moment,
  def,
  state,
  stages,
  profilesById,
  onNext,
  onClose,
  busy,
  revengeMachine,
}: {
  /** Flipper des verlorenen Duells (für "▶ Revanche · Evil Dead") */
  revengeMachine?: string | null;
  moment: ArcadeMoment;
  def: ArcadeModeDef;
  state: ArcadeState;
  stages: readonly string[];
  profilesById: Record<string, Prof>;
  onNext: (opts?: { sameMachine?: boolean }) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const animated = moment === "win" || moment === "loss" || moment === "cleared" || moment === "gameover";
  const [phase, setPhase] = useState<Phase>(animated ? "hold" : "done");
  const [moved, setMoved] = useState(false); // Rahmen schon oben?

  useEffect(() => {
    if (!animated) {
      setPhase("done");
      return;
    }
    setPhase("hold");
    setMoved(false);
    const climb = moment === "win";
    const animMs = moment === "loss" || moment === "gameover" ? T_BREAK : climb ? T_CHECK + T_MOVE : T_CHECK + 300;
    const t1 = window.setTimeout(() => setPhase("anim"), T_HOLD);
    const t2 = climb ? window.setTimeout(() => setMoved(true), T_HOLD + T_CHECK) : 0;
    const t3 = window.setTimeout(() => setPhase("done"), T_HOLD + animMs + 150);
    return () => {
      window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [moment, animated]);

  // —— was gerade gezeigt wird: vor der Animation der Stand VORHER ——
  const beforeWin = moment === "win" || moment === "cleared";
  const beforeLoss = moment === "loss" || moment === "gameover";
  const showBefore = phase === "hold";
  /** Index der gerade besiegten Stufe (win/cleared) */
  const beatenIdx = beforeWin ? state.wins - 1 : -1;
  /** wo der Auswahl-Rahmen steht */
  const frameIdx =
    moment === "win"
      ? moved
        ? state.wins
        : state.wins - 1
      : moment === "cleared"
      ? state.stagesTotal - 1
      : Math.min(state.wins, state.stagesTotal - 1);
  const showFrame = moment !== "cleared" || showBefore; // nach dem Sieg über den Endboss kein Rahmen mehr
  const livesShown = beforeLoss && showBefore ? state.livesLeft + 1 : state.livesLeft;

  const next = state.status === "playing" ? profilesById[stages[state.wins]] : null;
  const nextLabel = next
    ? `${arcadeKindIcon(next.bot_kind)} ${next.name ?? "?"}${
        next.bot_kind === "champion" ? "" : typeof next.rating === "number" ? ` · ${Math.round(next.rating)}` : ""
      }`
    : "";
  const title =
    moment === "start"
      ? "READY?"
      : moment === "win"
      ? "STAGE CLEAR!"
      : moment === "loss"
      ? "TRY AGAIN"
      : moment === "cleared"
      ? "CONGRATULATIONS!"
      : moment === "gameover"
      ? "GAME OVER"
      : `${def.icon} ${def.label}`;
  const titleCls =
    moment === "win"
      ? "text-emerald-300"
      : moment === "loss" || moment === "cleared"
      ? "text-amber-300"
      : moment === "gameover"
      ? "text-red-400"
      : "text-fuchsia-300";
  const sub =
    moment === "start"
      ? `${def.icon} ${def.label} · ${state.stagesTotal} Stufen · Stufe 1: ${nextLabel}`
      : moment === "win"
      ? `Stufe ${state.wins} geschafft! Nächster Gegner: ${nextLabel}`
      : moment === "loss"
      ? state.livesLeft === 1
        ? `Letztes Leben! Revanche gegen ${nextLabel}`
        : `Noch ${state.livesLeft} Leben – Revanche gegen ${nextLabel}`
      : moment === "cleared"
      ? `${def.icon} ${def.label} durchgespielt – alle ${state.stagesTotal} Gegner besiegt!`
      : moment === "gameover"
      ? `Stufe ${state.wins + 1} von ${state.stagesTotal} – ${def.icon} ${def.label}`
      : state.status === "playing"
      ? `Stufe ${state.wins + 1}/${state.stagesTotal} · Gegner: ${nextLabel}`
      : "";
  const canNext = state.status === "playing" && !state.open;
  const nextText =
    moment === "start" ? "▶ START" : moment === "loss" ? `▶ Revanche${revengeMachine ? ` · ${revengeMachine}` : ""}` : "▶ Nächste Stufe";
  const done = phase === "done";

  // Herzen
  const hearts = [];
  for (let i = 0; i < state.livesStart; i++) {
    const breakingNow = beforeLoss && phase === "anim" && i === state.livesLeft;
    const alive = i < livesShown;
    hearts.push(
      <span
        key={i}
        className="inline-block text-4xl"
        style={breakingNow ? { animation: `arcBreak ${T_BREAK}ms ease-out forwards` } : alive ? undefined : { opacity: 0.3, filter: "grayscale(1)" }}
      >
        {alive || breakingNow ? "❤️" : "🖤"}
      </span>
    );
  }

  return (
    // z-[300]: immer ÜBER den Mitteilungen (Runden-Splash z-200, Einblendungen z-100…130); schließt nur per Knopf
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-neutral-950/90 p-4 text-white"
      style={{ animation: "arcIn .5s ease-out" }}
    >
      <style>{KEYFRAMES}</style>
      {moment === "cleared" && done
        ? Array.from({ length: 40 }, (_, i) => (
            <span
              key={i}
              className="pointer-events-none fixed top-0 text-2xl"
              style={{ left: `${(i * 37) % 100}%`, animation: `arcFall ${2.5 + (i % 5) * 0.4}s linear ${(i % 10) * 0.15}s infinite` }}
            >
              {["🎉", "⭐", "🏆", "✨"][i % 4]}
            </span>
          ))
        : null}
      <div
        className="relative w-full max-w-xl rounded-3xl border-2 border-fuchsia-400/60 bg-gradient-to-b from-neutral-900 to-neutral-800 p-6 text-center shadow-2xl"
        style={{
          animation:
            "arcCardIn .55s ease-out" + (beforeLoss && phase === "anim" ? `, arcShake .5s ease-in-out ${T_BREAK * 0.25}ms` : ""),
        }}
      >
        <div className="text-xs uppercase tracking-[0.3em] text-fuchsia-300">🕹️ Arcade · {def.icon} {def.label}</div>

        {/* Titel knallt erst nach der Animation rein */}
        <div className="mt-1 flex h-14 items-center justify-center sm:h-16">
          {done ? (
            <div className={"text-4xl font-black tracking-wide sm:text-5xl " + titleCls} style={{ animation: "arcSlam .55s ease-out" }}>
              {title}
            </div>
          ) : (
            <div className="text-sm uppercase tracking-[0.4em] text-white/40">
              Stufe {Math.min(beforeWin ? state.wins : state.wins + 1, state.stagesTotal)} / {state.stagesTotal}
            </div>
          )}
        </div>
        <div className="h-6 text-base text-white/80" style={done ? { animation: "arcFade .4s ease-out" } : { opacity: 0 }}>
          {sub}
        </div>

        <div className="mt-3 flex justify-center gap-2">{hearts}</div>

        {/* 🗼 Turm mit fahrendem Auswahl-Rahmen */}
        {/* nur senkrecht scrollen – sonst blendet der Browser beim "CLEAR!"-Zoom einen waagrechten Balken ein */}
        <div className="mx-auto mt-4 max-h-[46vh] w-full max-w-md overflow-y-auto overflow-x-hidden">
          <div className="relative" style={{ height: stages.length * (ROW_H + GAP) - GAP }}>
            {stages.map((pid, i) => {
              const p = profilesById[pid];
              const boss = i === stages.length - 1;
              const beatenNow = i === beatenIdx;
              const doneRow = beatenNow ? phase !== "hold" : !!state.attempts[i]?.won && i < (beforeWin ? state.wins - 1 : state.wins);
              const bottom = i * (ROW_H + GAP);
              return (
                <div
                  key={`${pid}-${i}`}
                  className={
                    "absolute left-0 right-0 flex items-center gap-3 rounded-xl px-3 " +
                    (doneRow ? "bg-emerald-700/50" : i === frameIdx && showFrame ? "bg-fuchsia-600/80" : "bg-white/5")
                  }
                  style={{
                    bottom,
                    height: ROW_H,
                    opacity: doneRow || i === frameIdx || i <= frameIdx ? 1 : 0.55,
                    animation: beatenNow && phase === "anim" ? "arcRowFlash .65s ease-out" : undefined,
                    transition: "background-color .4s, opacity .4s",
                  }}
                >
                  <span className="w-6 text-center font-mono text-sm text-white/60">{i + 1}</span>
                  <span className="text-xl">{boss ? "☠️" : arcadeKindIcon(p?.bot_kind)}</span>
                  <span className="min-w-0 flex-1 truncate text-left font-bold">{p?.name ?? "?"}</span>
                  <span className="text-xs text-white/60">
                    {p?.bot_kind === "champion" ? "👑" : typeof p?.rating === "number" ? Math.round(p.rating) : ""}
                  </span>
                  <span className="relative w-7 text-right text-lg">
                    {doneRow ? (
                      <span className="inline-block" style={beatenNow ? { animation: "arcCheck .5s ease-out" } : undefined}>
                        ✅
                      </span>
                    ) : null}
                  </span>
                  {beatenNow && phase === "anim" ? (
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-black tracking-widest text-white drop-shadow"
                      style={{ animation: "arcFlash .9s ease-out forwards" }}
                    >
                      CLEAR!
                    </span>
                  ) : null}
                </div>
              );
            })}
            {/* Auswahl-Rahmen: fährt bei STAGE CLEAR eine Stufe hoch */}
            {showFrame && frameIdx >= 0 ? (
              <div
                className="pointer-events-none absolute left-0 right-0 rounded-xl"
                style={{
                  bottom: frameIdx * (ROW_H + GAP),
                  height: ROW_H,
                  transition: `bottom ${T_MOVE}ms cubic-bezier(.34,1.56,.64,1)`,
                  animation: "arcGlow 1.4s ease-in-out infinite",
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex min-h-[3.25rem] flex-wrap justify-center gap-2" style={done ? { animation: "arcFade .4s ease-out" } : { visibility: "hidden" }}>
          {canNext ? (
            <button
              type="button"
              disabled={busy || !done}
              onClick={() => onNext(moment === "loss" ? { sameMachine: true } : undefined)}
              className="rounded-xl bg-fuchsia-500 px-6 py-3 text-lg font-black shadow-lg hover:bg-fuchsia-400 disabled:opacity-50"
            >
              {busy ? "…" : nextText}
            </button>
          ) : null}
          {canNext && moment === "loss" ? (
            <button
              type="button"
              disabled={busy || !done}
              onClick={() => onNext({ sameMachine: false })}
              className="rounded-xl border border-fuchsia-300/60 px-5 py-3 text-base font-bold hover:bg-white/10 disabled:opacity-50"
            >
              🎲 Anderer Flipper
            </button>
          ) : null}
          <button
            type="button"
            disabled={!done}
            onClick={onClose}
            className="rounded-xl border border-white/30 px-5 py-3 text-base font-semibold hover:bg-white/10"
          >
            {canNext ? "Später" : "Schließen"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** schmale Leiste direkt über den Matches */
export function ArcadeBar({
  def,
  state,
  stages,
  profilesById,
  onTower,
}: {
  def: ArcadeModeDef;
  state: ArcadeState;
  stages: readonly string[];
  profilesById: Record<string, Prof>;
  onTower: () => void;
}) {
  const next = state.status === "playing" ? profilesById[stages[state.wins]] : null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-neutral-900 px-3 py-2 text-sm text-white">
      <span className="font-black text-fuchsia-300">
        🕹️ {def.icon} {def.label}
      </span>
      <span className="text-white/70">
        {state.status === "cleared"
          ? "🏆 geschafft"
          : state.status === "gameover"
          ? `💀 Game Over (Stufe ${state.wins + 1}/${state.stagesTotal})`
          : `Stufe ${state.wins + 1}/${state.stagesTotal}`}
      </span>
      <span>
        {"❤️".repeat(state.livesLeft)}
        <span className="opacity-40">{"🖤".repeat(Math.max(0, state.livesStart - state.livesLeft))}</span>
      </span>
      {next ? (
        <span className="text-white/80">
          Gegner: {arcadeKindIcon(next.bot_kind)} <b>{next.name ?? "?"}</b>
          {next.bot_kind !== "champion" && typeof next.rating === "number" ? ` ${Math.round(next.rating)}` : ""}
        </span>
      ) : null}
      <button type="button" onClick={onTower} className="ml-auto rounded-lg bg-fuchsia-600 px-3 py-1 text-xs font-bold hover:bg-fuchsia-500">
        🗼 Turm
      </button>
    </div>
  );
}
