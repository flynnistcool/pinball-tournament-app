// 🔥 kleine Serien-Markierung hinter einem Namen ("on fire", siehe lib/winStreaks.ts).
// variant "tv" = größer und für dunklen Hintergrund.

import { streakFire, streakMin, streakText, type StreakMode } from "@/lib/winStreaks";

export default function StreakFire({
  n,
  mode = "wins",
  variant = "admin",
}: {
  n: number | null | undefined;
  mode?: StreakMode;
  variant?: "admin" | "tv";
}) {
  if (mode === "none") return null;
  const fire = streakFire(n, streakMin(mode));
  if (!fire) return null;
  const title = streakText(mode, Number(n));
  if (variant === "tv") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-500/20 px-2 py-0.5 text-[0.8em] font-extrabold tabular-nums text-orange-200 ring-1 ring-orange-400/50"
        title={title}
      >
        {fire}
        <span>{n}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-orange-700"
      title={title}
    >
      {fire}
      <span>{n}</span>
    </span>
  );
}
