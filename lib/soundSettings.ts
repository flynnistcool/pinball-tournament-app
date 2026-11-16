// 🔊 Sound- & Timer-Einstellungen (global, für alle Turniere und Geräte).
// Gespeichert in app_settings (key "sound_settings"); fehlt der Eintrag → Standardwerte (= bisheriges Verhalten).

export type SoundSettings = {
  /** Lautstärke der Sprachansagen (0–1) */
  speechVol: number;
  /** Hintergrundmusik (0–1) */
  musicVol: number;
  /** Hintergrundmusik während einer Ansage (0–1) */
  musicDuckVol: number;
  /** End-Ton "Zeit ist um" (0–1) */
  endVol: number;
  /** Sprechtempo (0.7 = langsamer … 1.3 = schneller) */
  speechRate: number;
  /** vorausgewählte Timer-Dauer in Minuten */
  defaultMinutes: number;
  /** Vorlauf vor dem Start in Sekunden */
  prestartSec: number;
  /** einzelne Ansagen an/aus */
  announce: {
    getReady: boolean;
    halftime: boolean;
    oneMinute: boolean;
    countdown: boolean;
    timesUp: boolean;
  };
};

export const SOUND_SETTINGS_KEY = "sound_settings";

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  speechVol: 1,
  musicVol: 0.43,
  musicDuckVol: 0.17,
  endVol: 0.9,
  speechRate: 1,
  defaultMinutes: 10,
  prestartSec: 15,
  announce: { getReady: true, halftime: true, oneMinute: true, countdown: true, timesUp: true },
};

/** wählbare Timer-Dauern (Minuten) */
export const TIMER_MINUTE_OPTIONS = [3, 5, 8, 10, 15, 20] as const;

const num = (v: unknown, def: number, min: number, max: number, step = 0.01) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const c = Math.min(max, Math.max(min, n));
  return Math.round(c / step) * step;
};
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);

/** unbekannte/kaputte Werte → Standard, Zahlen in sinnvolle Grenzen */
export function normalizeSoundSettings(raw: unknown): SoundSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const a = (r.announce && typeof r.announce === "object" ? r.announce : {}) as Record<string, unknown>;
  const d = DEFAULT_SOUND_SETTINGS;
  const minutes = Number(r.defaultMinutes);
  return {
    speechVol: num(r.speechVol, d.speechVol, 0, 1),
    musicVol: num(r.musicVol, d.musicVol, 0, 1),
    musicDuckVol: num(r.musicDuckVol, d.musicDuckVol, 0, 1),
    endVol: num(r.endVol, d.endVol, 0, 1),
    speechRate: num(r.speechRate, d.speechRate, 0.7, 1.3, 0.05),
    defaultMinutes: (TIMER_MINUTE_OPTIONS as readonly number[]).includes(minutes) ? minutes : d.defaultMinutes,
    prestartSec: num(r.prestartSec, d.prestartSec, 5, 30, 1),
    announce: {
      getReady: bool(a.getReady, d.announce.getReady),
      halftime: bool(a.halftime, d.announce.halftime),
      oneMinute: bool(a.oneMinute, d.announce.oneMinute),
      countdown: bool(a.countdown, d.announce.countdown),
      timesUp: bool(a.timesUp, d.announce.timesUp),
    },
  };
}
