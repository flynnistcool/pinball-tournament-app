// 🔊 Alle Sounds, die einer Mitteilung zugeordnet werden können (🔔 Meldungen & Sounds).
// - Standard: die bisherigen Töne der App (+ ein paar vorhandene Dateien aus public/sounds)
// - Eigene: Dateien aus public/sounds/effekte/ (Liste erzeugt "npm run musik" → lib/effectSounds.generated.ts)

import { GENERATED_EFFECTS } from "@/lib/effectSounds.generated";
import type { SynthEventKind } from "@/lib/synthSounds";

export type SoundDef =
  | { id: string; label: string; group: "Standard" | "Eigene"; kind: "none" }
  | { id: string; label: string; group: "Standard" | "Eigene"; kind: "file"; src: string; base: number; stopAfterMs?: number }
  | { id: string; label: string; group: "Standard" | "Eigene"; kind: "ding" }
  | { id: string; label: string; group: "Standard" | "Eigene"; kind: "evt"; event: SynthEventKind }
  | { id: string; label: string; group: "Standard" | "Eigene"; kind: "drumFanfare" };

const STANDARD: SoundDef[] = [
  { id: "none", label: "🔇 Kein Ton", group: "Standard", kind: "none" },
  { id: "fanfare", label: "Fanfare", group: "Standard", kind: "file", src: "/sounds/winner-fanfare.mp3", base: 0.9 },
  { id: "fanfare5", label: "Fanfare (5 s)", group: "Standard", kind: "file", src: "/sounds/winner-fanfare.mp3", base: 0.9, stopAfterMs: 5000 },
  { id: "drumroll", label: "Trommelwirbel", group: "Standard", kind: "file", src: "/sounds/drumroll.mp3", base: 0.8 },
  { id: "drumFanfare", label: "Trommelwirbel + Fanfare", group: "Standard", kind: "drumFanfare" },
  { id: "ding", label: "Ding", group: "Standard", kind: "ding" },
  { id: "evt:streakBroken", label: "Absteigende Töne", group: "Standard", kind: "evt", event: "streakBroken" },
  { id: "evt:nemesisBeaten", label: "Arcade-Triumph", group: "Standard", kind: "evt", event: "nemesisBeaten" },
  { id: "evt:jubilee", label: "Glockenspiel", group: "Standard", kind: "evt", event: "jubilee" },
  { id: "evt:leadChange", label: "Wippe", group: "Standard", kind: "evt", event: "leadChange" },
  { id: "end", label: "End-Gong", group: "Standard", kind: "file", src: "/sounds/end.mp3", base: 0.9 },
  { id: "ufo", label: "UFO-Start", group: "Standard", kind: "file", src: "/sounds/ufo-start.mp3", base: 0.9 },
  { id: "fight", label: "3-2-1 Fight", group: "Standard", kind: "file", src: "/sounds/three-two-one-fight-deep-voice.mp3", base: 0.9 },
  { id: "robot", label: "Roboter-Countdown", group: "Standard", kind: "file", src: "/sounds/robotic-countdown.mp3", base: 0.9 },
];

const EIGENE: SoundDef[] = GENERATED_EFFECTS.map((e) => ({
  id: e.id,
  label: e.label,
  group: "Eigene" as const,
  kind: "file" as const,
  src: e.src,
  base: 0.9,
}));

export const SOUND_CATALOG: readonly SoundDef[] = [...STANDARD, ...EIGENE];

export function soundById(id: string | null | undefined): SoundDef | null {
  return SOUND_CATALOG.find((s) => s.id === id) ?? null;
}

export const isValidSound = (id: unknown): id is string => typeof id === "string" && !!soundById(id);
