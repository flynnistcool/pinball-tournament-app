"use client";

// 📈 Schildchen "Siegchance 64 %" in der Spielerzeile (Admin / TV / Handy) – Rechnung: lib/favorite.ts.
// Höchste Chance im Match grün, niedrigste dezent rot, sonst grau. Mouseover: kurze Aufschlüsselung.

export default function ChanceChip({
  chance,
  tone,
  title,
  variant = "light",
  className = "",
}: {
  chance: number;
  tone: "top" | "low" | "mid";
  title?: string;
  variant?: "light" | "dark";
  className?: string;
}) {
  const cls =
    variant === "dark"
      ? tone === "top"
        ? "bg-emerald-400/15 text-emerald-300 ring-emerald-300/40"
        : tone === "low"
        ? "bg-rose-400/10 text-rose-300 ring-rose-300/30"
        : "bg-white/5 text-white/60 ring-white/15"
      : tone === "top"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "low"
      ? "bg-rose-50 text-rose-400 ring-rose-200"
      : "bg-neutral-50 text-neutral-500 ring-neutral-200";
  return (
    <span
      className={"inline-flex shrink-0 cursor-help items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 " + cls + " " + className}
      title={title}
    >
      Siegchance {Math.round(chance * 100)} %
    </span>
  );
}

/** Ton je Spieler: höchste Chance grün, niedrigste rot (nur wenn es Unterschiede gibt) */
export function chanceTone(chances: readonly number[], mine: number): "top" | "low" | "mid" {
  if (chances.length < 2) return "mid";
  const max = Math.max(...chances);
  const min = Math.min(...chances);
  if (Math.abs(max - min) < 0.005) return "mid";
  if (Math.abs(mine - max) < 0.0005) return "top";
  if (Math.abs(mine - min) < 0.0005) return "low";
  return "mid";
}
