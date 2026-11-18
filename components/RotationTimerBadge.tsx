"use client";

// ⏱️ Round the Pinball – kleines Badge am TV: "Timer läuft · 7:32" bzw. "Timer pausiert".
// Der Stand kommt vom Admin-iPad (tournaments.rotation_timer, siehe supabase_rotation_timer.sql).
// Die Restzeit wird mit der Server-Uhr abgeglichen (offsetMs), damit eine falsch gehende TV-Uhr nicht stört.

import { useEffect, useState } from "react";

export type RotationTimerState = {
  state?: "running" | "paused" | string;
  endAt?: number | null;
  remainingMs?: number | null;
};

function fmt(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RotationTimerBadge({
  timer,
  offsetMs = 0,
}: {
  timer: RotationTimerState | null | undefined;
  /** Server-Uhr minus TV-Uhr */
  offsetMs?: number;
}) {
  const running = timer?.state === "running" && typeof timer.endAt === "number";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  if (!timer) return null;

  if (running) {
    const left = (timer.endAt as number) - (now + offsetMs);
    if (left <= 0) return null; // abgelaufen
    const last = left <= 60_000;
    return (
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 font-semibold tabular-nums ring-1 " +
          (last
            ? "animate-pulse bg-rose-500/20 text-rose-200 ring-rose-300/50"
            : "bg-emerald-400/15 text-emerald-300 ring-emerald-300/40")
        }
        title="Round-the-Pinball-Timer (vom Admin gestartet)"
      >
        ⏱️ Timer läuft · {fmt(left)}
      </span>
    );
  }

  if (timer.state === "paused") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-0.5 font-semibold tabular-nums text-white/60 ring-1 ring-white/15"
        title="Round-the-Pinball-Timer ist pausiert"
      >
        ⏸️ Timer pausiert · {fmt(Number(timer.remainingMs) || 0)}
      </span>
    );
  }

  return null;
}
