// 🔊 Einen Sound aus lib/soundCatalog.ts abspielen (Mitteilungen + "▶ Probe").
// volume: Faktor, 1 = wie bisher (Datei-Sounds: base × volume, max. 1).
// Rückgabe: Funktion zum Stoppen (für Proben).

import { soundById } from "@/lib/soundCatalog";
import { playDing, playEventSound } from "@/lib/synthSounds";

function playFile(src: string, vol: number, stopAfterMs?: number): () => void {
  try {
    const a = new Audio(src);
    a.volume = Math.min(1, Math.max(0, vol));
    a.play().catch(() => {});
    const t = stopAfterMs ? window.setTimeout(() => a.pause(), stopAfterMs) : undefined;
    return () => {
      window.clearTimeout(t);
      try {
        a.pause();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}

export function playSoundById(id: string | null | undefined, volume = 1): () => void {
  const s = soundById(id);
  if (!s || volume <= 0) return () => {};
  switch (s.kind) {
    case "none":
      return () => {};
    case "file":
      return playFile(s.src, s.base * volume, s.stopAfterMs);
    case "ding":
      playDing(volume);
      return () => {};
    case "evt":
      playEventSound(s.event, volume);
      return () => {};
    case "drumFanfare": {
      const stopDrum = playFile("/sounds/drumroll.mp3", 0.8 * volume);
      let stopFan: () => void = () => {};
      const t = window.setTimeout(() => {
        stopFan = playFile("/sounds/winner-fanfare.mp3", 0.9 * volume);
      }, 2200);
      return () => {
        window.clearTimeout(t);
        stopDrum();
        stopFan();
      };
    }
  }
}
