"use client";

// 🔵 Round the Pinball: "Durchgang 3 von 6" (Admin, Infobildschirm, Handy).
// Ein Durchgang = eine Vergabe der blauen Felder (lib/rotationTurn.ts → rotationProgress).

import type { RotationProgress } from "@/lib/rotationTurn";
import { Card } from "@/components/ui";

/** Admin: wer gerade blau ist (Klick → zum Flipper springen) */
export type RotationActiveItem = {
  key: string;
  player: string;
  machine: string;
  onClick?: () => void;
};

export default function RotationProgressBar({
  progress,
  variant = "light",
  activeItems,
}: {
  progress: RotationProgress;
  variant?: "light" | "tv" | "admin";
  activeItems?: RotationActiveItem[];
}) {
  const { current, total, done } = progress;
  if (total < 1) return null;
  const finishedTurns = done ? total : current - 1;
  const pct = Math.round((finishedTurns / total) * 100);

  // Admin: Karte im Stil der "Rotation Timer"-Karte (rechte Spalte)
  if (variant === "admin") {
    return (
      <Card className="mt-2">
        {/* gleiche Kopf-Abstände wie "Leaderboard (live)" */}
        <div className="border-b px-2.5 pb-2.5 pt-4">
          <div className="text-sm font-semibold">Durchgang</div>
        </div>
        <div className="px-2.5 py-3">
          <div className="whitespace-nowrap text-center text-2xl font-semibold tabular-nums">
            {done ? "✓ fertig" : `${current} / ${total}`}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 whitespace-nowrap text-center text-xs text-neutral-500">
            {finishedTurns} von {total} fertig
          </div>
          {!done && activeItems && activeItems.length ? (
            <div className="mt-3 space-y-1 border-t pt-2">
              {activeItems.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={it.onClick}
                  className="flex w-full items-center gap-2 rounded-lg bg-sky-50 px-2 py-1 text-left text-xs ring-1 ring-sky-200 hover:bg-sky-100"
                  title={`Zu ${it.machine} springen`}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">{it.player}</span>
                  <span className="min-w-0 max-w-[55%] truncate text-neutral-500">{it.machine}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Card>
    );
  }

  if (variant === "tv") {
    return (
      <span className="inline-flex shrink-0 items-center gap-3 rounded-full bg-sky-400/15 px-4 py-1 text-2xl font-bold leading-snug text-sky-100 ring-1 ring-sky-300/40">
        {done ? `✓ Alle ${total} Durchgänge fertig` : `🔵 Durchgang ${current} / ${total}`}
        <span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-white/15">
          <span className="block h-full rounded-full bg-sky-300" style={{ width: `${pct}%` }} />
        </span>
      </span>
    );
  }

  return (
    <div className="rounded-xl bg-sky-50 px-3 py-2 ring-1 ring-sky-200">
      <div className="flex items-baseline justify-between gap-2 text-sm font-bold text-sky-900">
        <span>{done ? "✓ Alle Durchgänge fertig" : `🔵 Durchgang ${current} von ${total}`}</span>
        <span className="text-xs font-semibold tabular-nums text-sky-700">{pct} %</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sky-100">
        <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
