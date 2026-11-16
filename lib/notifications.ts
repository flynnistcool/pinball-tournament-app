// 🔔 Übersicht aller MITTEILUNGEN (kurze Einblendungen, ggf. mit Ton) – nicht die dauerhaften Badges.
// Schritt 1: nur Anzeige (Werte = wie heute im Code). Später: global einstellbar (app_settings).
//
// Quellen im Code:
//  - Highscores, Meilensteine, On fire: components/RecordCelebration.tsx (SHOW_MS, playDing, Fanfare über TV-Seite)
//  - Gegner-Ereignisse: components/RivalryEvents.tsx (7 s TV / 6 s Admin / 8 s Handy, playEventSound)
//  - Round the Pinball: components/RotationTurnSplash.tsx (SHOW_MS 4 s)
//  - Turnierende: app/s/[code]/tv/page.tsx (Trommelwirbel + Fanfare)
//  - Timer: app/t/page.tsx (Sprachansagen + End-Ton, Einstellungen über ⚙️ im Rotation Timer)

import { isValidSound } from "@/lib/soundCatalog";

export type NotifDevice = "tv" | "admin" | "phone";

/** welcher Ton (für "▶ Probe") */
export type NotifSound =
  | { kind: "none" }
  | { kind: "file"; label: string; src: string; stopAfterMs?: number }
  | { kind: "ding"; label: string }
  | { kind: "rivalry"; label: string; event: "streakBroken" | "nemesisBeaten" | "jubilee" | "leadChange" }
  | { kind: "drumFanfare"; label: string }
  | { kind: "speech"; label: string };

export type NotifPlacement = {
  /** wo/wie es erscheint */
  where: string;
  /** Anzeigedauer in Sekunden (null = bleibt / ohne feste Dauer) */
  seconds: number | null;
  sound: NotifSound;
  /** Zusatz, z. B. "Antippen schließt" */
  note?: string;
};

export type NotificationDef = {
  id: string;
  icon: string;
  title: string;
  /** wann kommt sie */
  when: string;
  devices: Partial<Record<NotifDevice, NotifPlacement>>;
};

const FANFARE = "/sounds/winner-fanfare.mp3";
const SILENT: NotifSound = { kind: "none" };

export const NOTIFICATIONS: readonly NotificationDef[] = [
  {
    id: "record",
    icon: "🏆",
    title: "Allzeit-Highscore",
    when: "Neuer Allzeit-Rekord an einem Flipper (Location + Flipper, nur beendete Turniere, ohne Timeplay/DYP)",
    devices: {
      tv: { where: "Vollbild + Konfetti", seconds: 16, sound: { kind: "file", label: "Fanfare", src: FANFARE } },
      admin: { where: "Vollbild", seconds: 16, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "month",
    icon: "🥇",
    title: "30-Tage-Highscore",
    when: "Bester Score der letzten 30 Tage an einem Flipper",
    devices: {
      tv: { where: "Vollbild", seconds: 10, sound: { kind: "file", label: "Fanfare (5 s)", src: FANFARE, stopAfterMs: 5000 } },
      admin: { where: "Vollbild", seconds: 10, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "personal",
    icon: "💪",
    title: "Persönlicher Highscore",
    when: "Spieler schlägt seinen eigenen besten Score an diesem Flipper",
    devices: {
      tv: { where: "Karte", seconds: 10, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 10, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "wins",
    icon: "🎉",
    title: "Matchsieg-Meilenstein",
    when: "1., 10., 25., 50., 100., 250., 500. … Matchsieg eines Spielers",
    devices: {
      tv: { where: "Vollbild (lila)", seconds: 10, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Vollbild (lila)", seconds: 10, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "streak",
    icon: "🔥",
    title: "On fire – neue Stufe",
    when: "Siegesserie erreicht eine neue Stufe (ab 3 Siegen, 🔥🔥 ab 5; RtP: gehaltene Turnier-Highscores)",
    devices: {
      tv: { where: "Karte", seconds: 5, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 5, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "streakBroken",
    icon: "💥",
    title: "Serie gerissen",
    when: "Jemand beendet eine Serie von mindestens 5 Siegen gegen sich",
    devices: {
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Absteigende Töne", event: "streakBroken" } },
      admin: { where: "Karte rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Karte oben", seconds: 8, sound: SILENT, note: "nur Beteiligte" },
    },
  },
  {
    id: "nemesisBeaten",
    icon: "😈",
    title: "Erzfeind besiegt",
    when: "Jemand schlägt seinen Erzfeind (klare Bilanz, höchstens 40 %)",
    devices: {
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Arcade-Triumph", event: "nemesisBeaten" } },
      admin: { where: "Karte rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Karte oben", seconds: 8, sound: SILENT, note: "nur Beteiligte" },
    },
  },
  {
    id: "leadChange",
    icon: "⚖️",
    title: "Führungswechsel / Gleichstand",
    when: "Rivalität mit mind. 20 Duellen: der Hintere zieht gleich, oder aus dem Gleichstand übernimmt jemand die Führung",
    devices: {
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Wippe", event: "leadChange" } },
      admin: { where: "Karte rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Karte oben", seconds: 8, sound: SILENT, note: "nur Beteiligte" },
    },
  },
  {
    id: "jubilee",
    icon: "🤝",
    title: "Duell-Jubiläum",
    when: "50., 100., 150. … Duell zwischen zwei Spielern",
    devices: {
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Glockenspiel", event: "jubilee" } },
      admin: { where: "Karte rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Karte oben", seconds: 8, sound: SILENT, note: "nur Beteiligte" },
    },
  },
  {
    id: "rotationSplash",
    icon: "🎰",
    title: "Round the Pinball: Start / neuer Durchgang / alle fertig",
    when: "Nach dem Erzeugen der Runden, bei jedem neuen Durchgang und wenn alle fertig sind",
    devices: {
      tv: { where: "Einblendung Mitte", seconds: 4, sound: SILENT },
      admin: { where: "Einblendung Mitte", seconds: 4, sound: SILENT },
    },
  },
  {
    id: "tournamentEnd",
    icon: "🏁",
    title: "Turnierende / Siegerehrung",
    when: "Turnier wird beendet (bzw. Superfinale entschieden)",
    devices: {
      tv: { where: "wechselt zur Siegerehrung", seconds: null, sound: { kind: "drumFanfare", label: "Trommelwirbel + Fanfare" } },
    },
  },
  {
    id: "timer",
    icon: "⏱️",
    title: "Round-the-Pinball-Timer: Ansagen & End-Ton",
    when: "Vorlauf, Halbzeit, letzte Minute, Countdown, Zeit um – einstellbar über ⚙️ im Rotation Timer",
    devices: {
      admin: { where: "Sprachansage + End-Ton", seconds: null, sound: { kind: "speech", label: "Sprache + End-Ton" } },
    },
  },
];

export const DEVICE_LABEL: Record<NotifDevice, string> = { tv: "📺 TV", admin: "🖥️ Admin", phone: "📱 Handy" };

// ─────────────────────────────────────────────────────────────────────────────
// ⚙️ Schritt 2: global einstellbar (app_settings, key "notification_settings")
//   je Mitteilung + Gerät: an/aus, Dauer (s), Lautstärke (% vom heutigen Ton, 100 = wie bisher)

export const NOTIFICATION_SETTINGS_KEY = "notification_settings";

/** Sound-ID (lib/soundCatalog.ts) des heutigen Tons einer Platzierung */
export function defaultSoundId(s: NotifSound): string {
  switch (s.kind) {
    case "none":
    case "speech":
      return "none";
    case "file":
      return s.stopAfterMs ? "fanfare5" : "fanfare";
    case "ding":
      return "ding";
    case "rivalry":
      return "evt:" + s.event;
    case "drumFanfare":
      return "drumFanfare";
  }
}

export type NotifDeviceSetting = { enabled: boolean; seconds: number | null; volume: number; sound: string };
export type NotificationSettings = Record<string, Partial<Record<NotifDevice, NotifDeviceSetting>>>;

export function defaultNotificationSettings(): NotificationSettings {
  const out: NotificationSettings = {};
  for (const n of NOTIFICATIONS) {
    const per: Partial<Record<NotifDevice, NotifDeviceSetting>> = {};
    (Object.keys(n.devices) as NotifDevice[]).forEach((d) => {
      const p = n.devices[d]!;
      per[d] = { enabled: true, seconds: p.seconds, volume: 1, sound: defaultSoundId(p.sound) };
    });
    out[n.id] = per;
  }
  return out;
}

const clamp = (v: unknown, min: number, max: number, def: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
};

/** nur bekannte Mitteilungen/Geräte, Zahlen in sinnvollen Grenzen (Dauer 2–60 s, Lautstärke 0–150 %) */
export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const def = defaultNotificationSettings();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  for (const n of NOTIFICATIONS) {
    for (const d of Object.keys(def[n.id]) as NotifDevice[]) {
      const base = def[n.id][d]!;
      const v = r?.[n.id]?.[d] ?? {};
      def[n.id][d] = {
        enabled: typeof v.enabled === "boolean" ? v.enabled : base.enabled,
        seconds: base.seconds == null ? null : Math.round(clamp(v.seconds, 2, 60, base.seconds)),
        volume: Math.round(clamp(v.volume, 0, 1.5, base.volume) * 100) / 100,
        sound: isValidSound(v.sound) ? v.sound : base.sound,
      };
    }
  }
  return def;
}

/** Einstellung für eine Mitteilung auf einem Gerät (Standard, falls nicht vorhanden) */
export function notifSetting(
  settings: NotificationSettings | null | undefined,
  id: string,
  device: NotifDevice
): { enabled: boolean; ms: number | null; volume: number; sound: string } {
  const s = settings?.[id]?.[device] ?? defaultNotificationSettings()[id]?.[device];
  if (!s) return { enabled: true, ms: null, volume: 1, sound: "none" };
  return {
    enabled: s.enabled,
    ms: s.seconds == null ? null : s.seconds * 1000,
    volume: s.volume,
    sound: s.sound ?? "none",
  };
}
