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

export type NotifDevice = "tv" | "admin" | "phone" | "ticker";

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
/** 📱 Handy-Einblendung oben, bleibt bis Antippen */
const PHONE_ME: NotifPlacement = { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur Beteiligte · bleibt bis Antippen" };
const PHONE_ALL: NotifPlacement = { where: "Einblendung oben", seconds: null, sound: SILENT, note: "für alle · bleibt bis Antippen" };
/** 📣 Live-Ticker: Eintrag (bleibt stehen, ohne Ton) */
const TICKER: NotifPlacement = { where: "Eintrag im Ticker", seconds: null, sound: SILENT, note: "Ton: am TV (Ton aktiv) + im Admin" };

export const NOTIFICATIONS: readonly NotificationDef[] = [
  {
    id: "record",
    icon: "🏆",
    title: "Allzeit-Highscore",
    when: "Neuer Allzeit-Rekord an einem Flipper (Location + Flipper, nur beendete Turniere, ohne Timeplay/DYP)",
    devices: {
      phone: PHONE_ALL,
      ticker: TICKER,
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
      phone: PHONE_ALL,
      ticker: TICKER,
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
      phone: PHONE_ME,
      ticker: TICKER,
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
      phone: PHONE_ME,
      ticker: TICKER,
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
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Karte", seconds: 5, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 5, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "streakEnd",
    icon: "🧯",
    title: "Turnier-Serie beendet",
    when: "Eine Siegesserie im Turnier (ab 3 in Folge) reißt – gemeldet wird, wer sie beendet hat (Matchsieger; nicht bei Round the Pinball)",
    devices: {
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur wer die Serie beendet hat · bleibt bis Antippen" },
      ticker: TICKER,
      tv: { where: "Karte", seconds: 6, sound: { kind: "rivalry", label: "Absteigende Töne", event: "streakBroken" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "streakBroken",
    icon: "💥",
    title: "Serie gerissen",
    when: "Jemand beendet eine Serie gegen sich – Ticker ab 3 Siegen in Folge, Einblendung ab 5",
    devices: {
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Absteigende Töne", event: "streakBroken" } },
      admin: { where: "Einblendung rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur Beteiligte · bleibt bis Antippen" },
    },
  },
  {
    id: "nemesisBeaten",
    icon: "😈",
    title: "Erzfeind besiegt",
    when: "Jemand schlägt seinen Erzfeind (klare Bilanz, höchstens 40 %)",
    devices: {
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Arcade-Triumph", event: "nemesisBeaten" } },
      admin: { where: "Einblendung rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur Beteiligte · bleibt bis Antippen" },
    },
  },
  {
    id: "leadChange",
    icon: "⚖️",
    title: "Führungswechsel / Gleichstand",
    when: "Rivalität mit mind. 20 Duellen: der Hintere zieht gleich, oder aus dem Gleichstand übernimmt jemand die Führung",
    devices: {
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Wippe", event: "leadChange" } },
      admin: { where: "Einblendung rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur Beteiligte · bleibt bis Antippen" },
    },
  },
  {
    id: "streakGrow",
    icon: "🔥",
    title: "Serie wächst (Duelle)",
    when: "Serie gegen denselben Gegner: Ticker bei jedem Sieg ab 3, Einblendung bei 3, 5, 10, 15 …",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Einblendung rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
    },
  },
  {
    id: "newNemesis",
    icon: "😈",
    title: "Neuer Erzfeind",
    when: "Jemand wird zum (schlimmsten) Erzfeind eines Spielers (ab 10 Duellen, ≤ 40 %)",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Absteigende Töne", event: "streakBroken" } },
      admin: { where: "Einblendung rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
    },
  },
  {
    id: "evenReached",
    icon: "⚖️",
    title: "Ebenbürtig (20 Duelle)",
    when: "Zwei Spieler erreichen ihr 20. Duell mit ausgeglichener Bilanz (45–55 %)",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Wippe", event: "leadChange" } },
      admin: { where: "Einblendung rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
    },
  },
  {
    id: "rivalryInsight",
    icon: "⚔️",
    title: "Vor dem Match: Gegner-Hinweis",
    when: "Das Gegner-Badge eines laufenden Matches (Serie, Erzfeind-Duell, Ebenbürtig, Jubiläum) – einmal pro Turnier, neu nur bei geänderter Aussage",
    devices: {
      ticker: TICKER,
    },
  },
  {
    id: "jubilee",
    icon: "🤝",
    title: "Duell-Jubiläum",
    when: "50., 100., 150. … Duell zwischen zwei Spielern",
    devices: {
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 7, sound: { kind: "rivalry", label: "Glockenspiel", event: "jubilee" } },
      admin: { where: "Einblendung rechts unten", seconds: 6, sound: SILENT, note: "stapelbar, Antippen schließt" },
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur Beteiligte · bleibt bis Antippen" },
    },
  },
  {
    id: "roundStart",
    icon: "🎲",
    title: "Runde generiert",
    when: "Matchplay & Co.: nach jedem Erzeugen einer Runde (Runde N, Matches, Flipper)",
    devices: {
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 4, sound: SILENT },
      admin: { where: "Einblendung Mitte", seconds: 4, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "roundDone",
    icon: "✅",
    title: "Runde abgeschlossen / Durchgang geschafft + Rückblick",
    when: "Wenn alle Plätze einer Runde vergeben sind bzw. ein Durchgang (Round the Pinball) fertig ist – mit Rundensiegern, höchstem Score, Tabellenführer",
    devices: {
      ticker: TICKER,
      tv: { where: "Vollbild Mitte", seconds: 10, sound: SILENT },
      admin: { where: "Einblendung Mitte", seconds: 10, sound: SILENT, note: "Antippen schließt" },
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
    when: "Turnier wird beendet (bzw. Superfinale entschieden) – im Ticker mit Platz 1 – 3",
    devices: {
      ticker: TICKER,
      tv: { where: "wechselt zur Siegerehrung", seconds: null, sound: { kind: "drumFanfare", label: "Trommelwirbel + Fanfare" } },
    },
  },
  {
    id: "superfinalStart",
    icon: "🏆",
    title: "Superfinale gestartet",
    when: "Superfinale wird gestartet – Finalisten mit Vorpunkten",
    devices: {
      ticker: TICKER,
    },
  },
  {
    id: "superfinalGame",
    icon: "🎯",
    title: "Superfinale: Finalspiel",
    when: "Nach jedem Finalspiel – Sieger und Zwischenstand",
    devices: {
      ticker: TICKER,
    },
  },
  {
    id: "superfinalChampion",
    icon: "👑",
    title: "Super Grand Champion",
    when: "Superfinale entschieden",
    devices: {
      ticker: TICKER,
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

// ─────────────────────────────────────────────────────────────────────────────
// 🏷️ Dauerhafte Anzeigen (Badges) – keine Mitteilungen: bleiben stehen, solange der Zustand gilt.
// Einstellbar nur an/aus je Gerät (gleicher Speicher wie die Mitteilungen).

const BADGE = (where: string): NotifPlacement => ({ where, seconds: null, sound: SILENT });

export const BADGES: readonly NotificationDef[] = [
  {
    id: "badge:rivalryBar",
    icon: "⚔️",
    title: "Duelle des Abends",
    when: "Round the Pinball: die 3 spannendsten Gegner-Hinweise des Turniers",
    devices: { tv: BADGE("unter der Tabelle"), admin: BADGE("unter dem Durchgangs-Balken") },
  },
  {
    id: "badge:rivalry",
    icon: "⚔️",
    title: "Gegner-Badge im Match",
    when: "Laufende Serie / Erzfeind-Duell / Ebenbürtig / Jubiläum bei laufenden Matches",
    devices: { tv: BADGE("Matchkarte"), admin: BADGE("Match-Kopf"), phone: BADGE("Mein Match (nur eigene Gegner)") },
  },
  {
    id: "badge:favorite",
    icon: "★",
    title: "Favorit-Abzeichen",
    when: "Favorit im laufenden Match (Siegquoten, sonst Elo mit Vorsprung)",
    devices: { tv: BADGE("Matchkarte am Namen"), admin: BADGE("am Namen im Match"), phone: BADGE("Mein Match am Namen") },
  },
  {
    id: "badge:onFire",
    icon: "🔥",
    title: "On-fire-Badge",
    when: "Siegesserie im Turnier (ab 3, 🔥🔥 ab 5) am Spielernamen",
    devices: { tv: BADGE("am Namen"), admin: BADGE("am Namen"), phone: BADGE("am Namen") },
  },
  {
    id: "badge:records",
    icon: "🏆",
    title: "Highscore-Zeile im Match",
    when: "Allzeit- und 30-Tage-Highscore des Flippers beim Match",
    devices: { tv: BADGE("Matchkarte"), admin: BADGE("Match-Kopf"), phone: BADGE("Kasten „Rekorde auf diesem Flipper“") },
  },
];

/** Mitteilungen + dauerhafte Anzeigen (für Standardwerte/Speichern) */
const ALL_DEFS: readonly NotificationDef[] = [...NOTIFICATIONS, ...BADGES];

export const DEVICE_LABEL: Record<NotifDevice, string> = { tv: "📺 TV", admin: "🖥️ Admin", phone: "📱 Handy", ticker: "📣 Ticker" };

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
  for (const n of ALL_DEFS) {
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
  for (const n of ALL_DEFS) {
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
  if (!s) return { enabled: false, ms: null, volume: 1, sound: "none" }; // auf diesem Gerät gibt es sie nicht
  return {
    enabled: s.enabled,
    ms: s.seconds == null ? null : s.seconds * 1000,
    volume: s.volume,
    sound: s.sound ?? "none",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏷️ Bereich einer Mitteilung – worauf bezieht sie sich? (Plakette in Ticker, Einblendung, Einstellungen)

export type NotifScope = "turnier" | "30tage" | "allzeit" | "duell";

export const SCOPE_INFO: Record<NotifScope, { icon: string; label: string; long: string }> = {
  turnier: { icon: "🏟️", label: "Turnier", long: "in diesem Turnier" },
  "30tage": { icon: "📅", label: "30 Tage", long: "in den letzten 30 Tagen" },
  allzeit: { icon: "♾️", label: "Allzeit", long: "über alle Turniere" },
  // Duelle zählen über alle Turniere → eine Allzeit-Variante (eigene Farbe, damit man sie erkennt)
  duell: { icon: "♾️", label: "Allzeit · Duell", long: "Duell-Bilanz über alle Turniere" },
};

const SCOPE_OF: Record<string, NotifScope> = {
  record: "allzeit",
  month: "30tage",
  personal: "allzeit",
  wins: "allzeit",
  streak: "turnier",
  streakEnd: "turnier",
  rotationSplash: "turnier",
  roundStart: "turnier",
  superfinalStart: "turnier",
  superfinalGame: "turnier",
  superfinalChampion: "turnier",
  roundDone: "turnier",
  tournamentEnd: "turnier",
  timer: "turnier",
  streakBroken: "duell",
  streakGrow: "duell",
  nemesisBeaten: "duell",
  newNemesis: "duell",
  leadChange: "duell",
  evenReached: "duell",
  jubilee: "duell",
  rivalryInsight: "duell",
};

export function scopeOf(kind: string): NotifScope | null {
  return SCOPE_OF[kind] ?? null;
}
