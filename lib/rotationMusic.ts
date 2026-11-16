// 🎵 Hintergrundmusik für den Round-the-Pinball-Timer.
//
// Neue Lieder: MP3 nach public/sounds/rotation/ kopieren ("Künstler - Titel-Art.mp3") und
//   npm run musik
// ausführen – wandelt um (128 kbps), gleicht die Lautheit an und erzeugt die Liste
// lib/rotationTracks.generated.ts automatisch. Anleitung: public/sounds/rotation/LIESMICH.txt
//
// Auswahl merkt sich das Gerät (localStorage), keine Datenbank:
//   "random" = 🎲 Zufall (alle) · "cat:<Art>" = 🎲 Zufall aus einer Art · "<id>" = festes Lied · "off" = 🔇 Aus

import { GENERATED_TRACKS } from "@/lib/rotationTracks.generated";

export type RotationTrack = { id: string; title: string; artist?: string; category: string; src: string };

export const ROTATION_TRACKS: readonly RotationTrack[] = [
  { id: "timer", title: "Timer (Standard)", category: "Standard", src: "/sounds/timer.mp3" },
  ...GENERATED_TRACKS,
];

/** "random" = 🎲 Zufall, "cat:<Art>" = Zufall aus einer Art, "off" = 🔇 Aus, sonst die id eines Liedes */
export type MusicChoice = string;

/** Arten in fester Reihenfolge (wie in der Liste) */
export const ROTATION_CATEGORIES: readonly string[] = Array.from(new Set(ROTATION_TRACKS.map((t) => t.category)));

const isValidChoice = (v: string | null): v is string =>
  v === "random" ||
  v === "off" ||
  (!!v && v.startsWith("cat:") && ROTATION_CATEGORIES.includes(v.slice(4))) ||
  ROTATION_TRACKS.some((t) => t.id === v);

const STORAGE_KEY = "pb_rotMusic";

export function loadMusicChoice(): MusicChoice {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (isValidChoice(v)) return v;
  } catch {
    /* kein Speicher → Standard */
  }
  return "random";
}

export function saveMusicChoice(c: MusicChoice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, c);
  } catch {
    /* ignore */
  }
}

/** Lied für den nächsten Start. Zufall: möglichst nicht dasselbe wie zuletzt. null = keine Musik. */
export function pickTrack(choice: MusicChoice, lastId?: string | null): RotationTrack | null {
  if (choice === "off" || !ROTATION_TRACKS.length) return null;
  let candidates: readonly RotationTrack[] = ROTATION_TRACKS;
  if (choice.startsWith("cat:")) {
    const cat = choice.slice(4);
    candidates = ROTATION_TRACKS.filter((t) => t.category === cat);
    if (!candidates.length) candidates = ROTATION_TRACKS;
  } else if (choice !== "random") {
    return ROTATION_TRACKS.find((t) => t.id === choice) ?? ROTATION_TRACKS[0];
  }
  const pool = candidates.length > 1 ? candidates.filter((t) => t.id !== lastId) : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}
