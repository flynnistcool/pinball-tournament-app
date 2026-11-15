"use client";

// 🎨 Runder Knopf für eine frei wählbare Farbe (Farbwähler des Browsers).
// Aktiv (Ring), wenn die aktuelle Farbe keine der vorgegebenen ist.

import { solidColor } from "@/lib/playerColor";

export default function ColorPickerButton({
  value,
  presets,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  presets: readonly string[];
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const v = String(value ?? "").trim();
  const custom = !!v && !presets.includes(v);
  const solid = solidColor(v);
  const pickerValue = solid && /^#[0-9a-fA-F]{6}$/.test(solid) ? solid : "#888888";
  return (
    <label
      className={
        "relative inline-flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border text-[12px] " +
        (custom ? "ring-2 ring-neutral-900 ring-offset-2" : "") +
        (disabled ? " pointer-events-none opacity-50" : "")
      }
      style={
        custom
          ? { background: v }
          : { background: "conic-gradient(#f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)" }
      }
      title="Eigene Farbe wählen"
    >
      <span className="pointer-events-none drop-shadow">🎨</span>
      <input
        type="color"
        value={pickerValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}
