"use client";

// 🎰 Vollbild-Timer für "Round the Pinball" (Rotation).
// Nur Darstellung – Timer-Logik (Start/Pause/Reset, Restzeit) kommt unverändert aus app/t/page.tsx.

import { useEffect, useRef, useState } from "react";
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert (createPortal funktioniert trotzdem)
import { createPortal } from "react-dom";

type Phase = "idle" | "prestart" | "green" | "orange" | "red" | "done";

const PHASE_STYLE: Record<Phase, { ring: string; glow: string; text: string; bar: string; label: string }> = {
  idle: { ring: "#64748b", glow: "rgba(100,116,139,0.25)", text: "text-white/70", bar: "from-slate-500 to-slate-400", label: "bereit" },
  prestart: { ring: "#38bdf8", glow: "rgba(56,189,248,0.35)", text: "text-sky-200", bar: "from-sky-500 to-cyan-300", label: "gleich geht’s los" },
  green: { ring: "#10b981", glow: "rgba(16,185,129,0.35)", text: "text-white", bar: "from-emerald-500 to-lime-300", label: "noch übrig" },
  orange: { ring: "#f97316", glow: "rgba(249,115,22,0.38)", text: "text-white", bar: "from-amber-400 to-orange-500", label: "noch übrig" },
  red: { ring: "#ef4444", glow: "rgba(239,68,68,0.45)", text: "text-white", bar: "from-orange-500 to-red-500", label: "letzte Minute!" },
  done: { ring: "#ef4444", glow: "rgba(239,68,68,0.55)", text: "text-red-300", bar: "from-red-500 to-rose-500", label: "Zeit abgelaufen" },
};

// Kreisgröße – Schriftgrößen in der Mitte sind daran gekoppelt (passen so immer in den Innenkreis)
const RING_SIZE = "max(200px, min(100vh - 270px, 86vw))"; // Höhe minus Kopfzeile, Verlauf-Balken, Knöpfe

function fmt(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RotationTimerOverlay({
  open,
  onClose,
  timeLeftLabel,
  timeLeftMs,
  durationSec,
  running,
  paused,
  locked,
  prestart = false,
  onPauseToggle,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  timeLeftLabel: string;
  timeLeftMs: number | null;
  durationSec: number;
  running: boolean;
  paused: boolean;
  locked: boolean;
  /** Vorlauf-Countdown vor dem eigentlichen Start */
  prestart?: boolean;
  onPauseToggle: () => void;
  onReset: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // iOS/Safari: während Overlay offen ist -> body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const totalMs = Math.max(1, (durationSec || 600) * 1000);
  const left = timeLeftMs == null ? null : Math.max(0, Math.min(totalMs, timeLeftMs));
  const fracLeft = left == null ? 1 : left / totalMs; // 1 = voll, 0 = abgelaufen
  const elapsedMs = left == null ? 0 : totalMs - left;
  const pct = Math.round((1 - fracLeft) * 100);

  let phase: Phase = "idle";
  if (left != null) {
    if (prestart) phase = "prestart";
    else if (left <= 0) phase = "done";
    else if (left <= 60_000) phase = "red";
    else if (left <= totalMs / 2) phase = "orange";
    else phase = "green";
  }
  const st = PHASE_STYLE[phase];
  const urgent = phase === "red" && !paused;
  const done = phase === "done";

  // Ring-Geometrie (SVG, skaliert mit dem Bildschirm)
  const R = 46;
  const C = 2 * Math.PI * R;
  const dash = C * fracLeft;

  // Ticks rund um den Ring (60 Stück, jeder 5. länger)
  const ticks = Array.from({ length: 60 }, (_, i) => i);

  async function requestTrueFullscreen() {
    // Best effort: funktioniert nicht überall (iOS Safari oft nicht)
    try {
      const el = wrapRef.current as any;
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el?.requestFullscreen) await el.requestFullscreen();
    } catch {
      /* ignore */
    }
  }

  return createPortal(
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[9999] overflow-hidden bg-[#070814] text-white"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes rto-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.035) } }
        @keyframes rto-blink { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        @keyframes rto-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
      `}</style>

      {/* Hintergrund-Leuchten in der aktuellen Farbe */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
        style={{
          background: `radial-gradient(60% 55% at 50% 45%, ${st.glow}, transparent 70%), radial-gradient(40% 40% at 15% 90%, rgba(99,102,241,0.18), transparent 70%), radial-gradient(35% 35% at 90% 10%, rgba(168,85,247,0.15), transparent 70%)`,
        }}
      />

      <div className="relative flex h-full w-full flex-col">
        {/* Kopfzeile */}
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎰</span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300/80">Round the Pinball</div>
              <div className="text-lg font-extrabold leading-tight">Rotation-Timer</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestTrueFullscreen}
              title="Echtes Browser-Vollbild (nicht überall verfügbar)"
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/20"
            >
              ⛶ Vollbild
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Overlay schließen"
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition hover:bg-white/85"
            >
              ✕ Schließen
            </button>
          </div>
        </div>

        {/* Ring + Zeit */}
        <div className="flex flex-1 flex-col items-center justify-center gap-[2vh] px-4">
          <div
            className="relative aspect-square"
            style={{ width: RING_SIZE, animation: urgent ? "rto-pulse 1s ease-in-out infinite" : undefined }}
          >
            {/* viewBox mit Rand, damit Leuchten + Striche nicht abgeschnitten werden */}
            <svg
              viewBox="-8 -8 116 116"
              className="absolute inset-0 h-full w-full -rotate-90"
              style={{ overflow: "visible" }}
            >
              {/* Ticks */}
              {ticks.map((i) => {
                const a = (i / 60) * 2 * Math.PI;
                const long = i % 5 === 0;
                const r1 = 49.5;
                const r2 = long ? 47.2 : 48.3;
                const passed = i / 60 < 1 - fracLeft;
                return (
                  <line
                    key={i}
                    x1={50 + r1 * Math.cos(a)}
                    y1={50 + r1 * Math.sin(a)}
                    x2={50 + r2 * Math.cos(a)}
                    y2={50 + r2 * Math.sin(a)}
                    stroke={passed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.45)"}
                    strokeWidth={long ? 0.6 : 0.35}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Hintergrund-Ring */}
              <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
              {/* Restzeit-Ring */}
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={st.ring}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C}`}
                style={{
                  transition: "stroke-dasharray 0.9s linear, stroke 0.8s ease",
                  filter: `drop-shadow(0 0 2.2px ${st.ring})`,
                }}
              />
            </svg>

            {/* Mitte */}
            <div className="absolute inset-[17%] flex flex-col items-center justify-center rounded-full bg-black/35 ring-1 ring-white/10 backdrop-blur-sm">
              {done ? (
                <>
                  <div className="leading-none" style={{ fontSize: `calc(${RING_SIZE} * 0.17)`, animation: "rto-float 1.6s ease-in-out infinite" }}>
                    ⏰
                  </div>
                  <div
                    className="mt-[1vh] text-center font-black uppercase tracking-wide text-red-400"
                    style={{ fontSize: `calc(${RING_SIZE} * 0.06)`, animation: "rto-blink 0.9s ease-in-out infinite" }}
                  >
                    Zeit abgelaufen!
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`font-black tabular-nums leading-none tracking-tight ${st.text} ${paused ? "opacity-50" : ""}`}
                    style={{ fontSize: `calc(${RING_SIZE} * 0.22)`, textShadow: `0 0 40px ${st.glow}` }}
                    aria-live="polite"
                  >
                    {timeLeftLabel}
                  </div>
                  <div
                    style={{ fontSize: `calc(${RING_SIZE} * 0.04)`, animation: paused ? "rto-blink 1.4s ease-in-out infinite" : undefined }}
                    className={`mt-[1.2vh] font-bold uppercase tracking-[0.25em] ${
                      paused ? "text-amber-300" : phase === "red" ? "text-red-300" : "text-white/55"
                    }`}
                  >
                    {paused ? "⏸ Pausiert" : st.label}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Fortschrittsbalken: wie viel ist schon vergangen */}
          {left != null && !prestart ? (
            <div className="w-full max-w-3xl">
              <div className="mb-2 flex items-end justify-between text-[min(2.4vh,3.6vw)] font-semibold">
                <span className="text-white/60">
                  vergangen <span className="tabular-nums text-white">{fmt(elapsedMs)}</span>
                </span>
                <span className="tabular-nums text-[1.4em] font-black text-white">{pct}%</span>
                <span className="text-white/60">
                  gesamt <span className="tabular-nums text-white">{fmt(totalMs)}</span>
                </span>
              </div>
              <div className="relative h-4 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${st.bar}`}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%`, transition: "width 0.9s linear" }}
                />
                {/* Markierungen: Hälfte + letzte Minute */}
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" title="Hälfte" />
                {totalMs > 60_000 ? (
                  <div
                    className="absolute inset-y-0 w-px bg-red-300/60"
                    style={{ left: `${(1 - 60_000 / totalMs) * 100}%` }}
                    title="letzte Minute"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Knöpfe */}
          <div className="grid w-full max-w-xs grid-cols-2 gap-2">
            <button
              type="button"
              disabled={locked || (!running && !paused)}
              onClick={onPauseToggle}
              title={paused ? "Timer weiterlaufen lassen" : "Timer anhalten"}
              className={
                "h-10 rounded-xl text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-35 " +
                (paused
                  ? "bg-emerald-500 text-white hover:bg-emerald-400"
                  : "bg-white text-black hover:bg-white/85")
              }
            >
              {paused ? "▶ Weiter" : "⏸ Pause"}
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={onReset}
              className="h-10 rounded-xl bg-white/10 text-base font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
