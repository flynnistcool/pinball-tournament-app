"use client";

// 🏷️ Kleine Plakette: worauf bezieht sich eine Mitteilung? (🏟️ Turnier · 📅 30 Tage · ♾️ Allzeit · ⚔️ Duell-Bilanz)

import { SCOPE_INFO, scopeOf, type NotifScope } from "@/lib/notifications";

const LOOK: Record<NotifScope, { light: string; dark: string }> = {
  turnier: { light: "bg-sky-50 text-sky-700 ring-sky-200", dark: "bg-sky-400/15 text-sky-200 ring-sky-300/30" },
  "30tage": { light: "bg-violet-50 text-violet-700 ring-violet-200", dark: "bg-violet-400/15 text-violet-200 ring-violet-300/30" },
  allzeit: { light: "bg-amber-50 text-amber-800 ring-amber-200", dark: "bg-amber-400/15 text-amber-200 ring-amber-300/30" },
  duell: { light: "bg-rose-50 text-rose-700 ring-rose-200", dark: "bg-rose-400/15 text-rose-200 ring-rose-300/30" },
};

export default function ScopeChip({
  kind,
  variant = "light",
  long = false,
  className = "",
}: {
  /** Art der Mitteilung (id aus lib/notifications.ts) */
  kind: string;
  /** light = Admin/Handy, dark = TV / dunkle Einblendung */
  variant?: "light" | "dark";
  /** ausführlicher Text ("Duell-Bilanz über alle Turniere") statt kurz */
  long?: boolean;
  className?: string;
}) {
  const scope = scopeOf(kind);
  if (!scope) return null;
  const info = SCOPE_INFO[scope];
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 " +
        LOOK[scope][variant] +
        " " +
        className
      }
      title={`${info.label} – ${info.long}`}
    >
      <span>{info.icon}</span>
      <span>{long ? `${info.label} · ${info.long}` : info.label}</span>
    </span>
  );
}
