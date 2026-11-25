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
    id: "unbeaten",
    icon: "🛡️",
    title: "Noch unbesiegt",
    when: "Noch keine Niederlage – bei 4, 8, 12 … Siegen (4er-Match gewonnen = 3 Siege; Round the Pinball: an allen bisherigen Flippern vorn, bei 3, 6, 9 …); nicht bei Elimination",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Karte", seconds: 7, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "unbeatenEnd",
    icon: "💔",
    title: "Traum geplatzt",
    when: "Ein bisher Unbesiegter (ab 4 Siegen bzw. 3 Flippern) verliert zum ersten Mal – ersetzt dann \"Serie beendet\"",
    devices: {
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur wer ihn gestoppt hat · bleibt bis Antippen" },
      ticker: TICKER,
      tv: { where: "Karte", seconds: 7, sound: { kind: "rivalry", label: "Absteigende Töne", event: "streakBroken" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "flawless",
    icon: "🥋",
    title: "Flawless Victory",
    when: "Turnierende (Round the Pinball: alle Durchgänge fertig): jemand hat JEDES seiner Matches gewonnen (mind. 3 Siege, 4er-Match = 3 Siege; RtP an jedem Flipper vorn); nicht bei Elimination",
    devices: {
      phone: PHONE_ALL,
      ticker: TICKER,
      tv: { where: "Vollbild Gold", seconds: 14, sound: { kind: "file", label: "Fanfare", src: FANFARE } },
      admin: { where: "Vollbild Gold", seconds: 10, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "leader",
    icon: "👑",
    title: "Neuer Tabellenführer",
    when: "Ein anderer Spieler übernimmt allein die Spitze vom bisherigen alleinigen Führenden (Live-Leaderboard, nach 10 s stabil; Gleichstand zählt nicht)",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Karte", seconds: 6, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 5, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "upset",
    icon: "🧊",
    title: "Favoritensturz",
    when:
      "Der ★ Favorit verliert gegen einen Spieler mit höchstens 30 % Siegchance (Siegchance vor dem Match: Elo + Flipper-Winrate + Turnierform + Bilanz am Flipper). Round the Pinball: je Flipper, sobald ein Score den Favoriten übertrifft – jeder Außenseiter, der ihn schlägt, bekommt seine Meldung (auch wenn der Favorit erst zuletzt spielt). Nicht bei DYP.",
    devices: {
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur der Sieger · bleibt bis Antippen" },
      ticker: TICKER,
      tv: { where: "Karte", seconds: 7, sound: { kind: "rivalry", label: "Erzfeind-Fanfare", event: "nemesisBeaten" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "photo",
    icon: "📸",
    title: "Fotofinish",
    when: "Sieger-Score höchstens 2 % über dem Zweitbesten (Round the Pinball: am Flipper, wenn alle gespielt haben; nicht bei Timeplay und DYP)",
    devices: {
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur der Sieger · bleibt bis Antippen" },
      ticker: TICKER,
      tv: { where: "Karte", seconds: 7, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "blowout",
    icon: "💣",
    title: "Kantersieg",
    when: "Sieger-Score mindestens 3× so hoch wie der Zweitbeste (Round the Pinball: am Flipper, wenn alle gespielt haben; nicht bei Timeplay und DYP)",
    devices: {
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur der Sieger · bleibt bis Antippen" },
      ticker: TICKER,
      tv: { where: "Karte", seconds: 7, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "revenge",
    icon: "🔄",
    title: "Revanche",
    when: "Wer das letzte direkte Duell im selben Turnier gegen jemanden verloren hat, gewinnt jetzt gegen ihn (nicht bei Round the Pinball und DYP)",
    devices: {
      phone: { where: "Einblendung oben", seconds: null, sound: SILENT, note: "nur der Sieger · bleibt bis Antippen" },
      ticker: TICKER,
      tv: { where: "Karte", seconds: 6, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 5, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "premiere",
    icon: "🌟",
    title: "Flipper-Premiere",
    when: "Ankündigung: jemand spielt gleich zum ersten Mal an einem Flipper (Location: alle Turniere dort, egal welches Format) – sobald die Runde erzeugt ist bzw. bei Round the Pinball sein Durchgang beginnt",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Karte", seconds: 6, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 5, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "premiereWin",
    icon: "🌟",
    title: "Premieren-Sieg",
    when: "Wer zum ersten Mal an einem Flipper spielt, gewinnt dort gleich (Platz 1; Round the Pinball: bester Score am Flipper, wenn alle gespielt haben)",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Karte", seconds: 7, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "eloMark",
    icon: "📈",
    title: "Elo-Meilenstein",
    when: "Die Live-Elo (wie im Leaderboard) knackt eine Hunderter-Marke nach oben – 1500, 1600 …; im Turnier schon mal darüber gewesen = \"erneut geknackt\"",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "Karte", seconds: 6, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 5, sound: SILENT, note: "Antippen schließt" },
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
    when: "Rivalität mit mind. 10 Duellen: der Hintere zieht gleich, oder aus dem Gleichstand übernimmt jemand die Führung",
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
    title: "Ebenbürtig (ab 10 Duellen)",
    when: "Zwei Spieler werden ebenbürtig: ab 10 Duellen liegt die Bilanz jetzt zwischen 45 und 55 % (vorher nicht)",
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
    title: "Gegner-Hinweis (vor dem Match)",
    when: "Das Gegner-Badge eines laufenden Matches (Serie, Erzfeind-Duell, Ebenbürtig, Jubiläum) – einmal pro Turnier, neu nur bei geänderter Aussage",
    devices: {
      ticker: TICKER,
    },
  },
  {
    id: "titleDefender",
    icon: "🛡️",
    title: "Titelverteidiger",
    when: "Genau dieselbe Besetzung schon einmal am selben Flipper (Matchplay/Swiss/Round Robin zusammen, Round the Pinball nur RtP): beim Erzeugen der Runde bzw. beim Start des Durchgangs am Flipper „zuletzt hat X gewonnen – gelingt die Titelverteidigung?“, zusammengefasst mit dem Sieger des letzten Aufeinandertreffens (egal welcher Flipper, 🏅); nach dem Match „verteidigt“ / „gestoppt“ / „Spieß umgedreht“. Flipper geändert → alte Meldung wird ausgeblendet",
    devices: {
      phone: { ...PHONE_ME, note: "alle Spieler im Match · bleibt bis Antippen" },
      ticker: TICKER,
      tv: { where: "kleine Karte unten links", seconds: 7, sound: SILENT },
      admin: { where: "kleine Karte unten links", seconds: 5, sound: SILENT, note: "Antippen schließt" },
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
      tv: { where: "wechselt zur Siegerehrung + große Karte (Mitte, 10 s)", seconds: null, sound: { kind: "drumFanfare", label: "Trommelwirbel + Fanfare" } },
      admin: { where: "große Karte (Mitte)", seconds: 8, sound: SILENT, note: "Antippen schließt" },
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
    icon: "🕹️",
    title: "Superfinale: Finalspiel",
    when: "Nach jedem Finalspiel – Sieger und Zwischenstand",
    devices: {
      ticker: TICKER,
      tv: { where: "Karte", seconds: 8, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "Karte", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "superfinalChampion",
    icon: "👑",
    title: "Super Grand Champion",
    when: "Superfinale entschieden",
    devices: {
      ticker: TICKER,
      tv: { where: "große Karte (Mitte)", seconds: 10, sound: SILENT, note: "Fanfare kommt mit der Siegerehrung" },
      admin: { where: "große Karte (Mitte)", seconds: 8, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "closeMatch",
    icon: "⚖️",
    title: "Auf Messers Schneide",
    when: "Match der laufenden Runde noch unberührt, Siegchancen höchstens 10 Prozentpunkte auseinander (z. B. 46 % vs 54 %) – einmal pro Match; nach dem Ergebnis eigene Meldung „… setzt sich durch“ (entschieden). Round the Pinball: die beiden Favoriten am Flipper höchstens 10 Punkte auseinander – wenn einer vorlegt und vorn liegt („kann X kontern?“), danach „kontert!“ / „hält stand“",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "kleine Karte unten links", seconds: 7, sound: SILENT },
      admin: { where: "kleine Karte unten links", seconds: 5, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "matchShort",
    icon: "🏁",
    title: "Shortnews: Match-Ergebnis",
    when: "Matchplay & Co.: alle Plätze eines Matches stehen fest (10 s Tippfehler-Schutz)",
    devices: {
      ticker: TICKER,
      tv: { where: "kleine Karte unten links", seconds: 5, sound: SILENT },
      admin: { where: "kleine Karte unten links", seconds: 4, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "waveShort",
    icon: "🎱",
    title: "Shortnews: Scores des Durchgangs",
    when: "Round the Pinball: Durchgang fertig – alle Scores mit aktuellem Platz am Flipper",
    devices: {
      ticker: TICKER,
      tv: { where: "kleine Karte unten links", seconds: 8, sound: SILENT },
      admin: { where: "kleine Karte unten links", seconds: 6, sound: SILENT, note: "Antippen schließt" },
    },
  },
  {
    id: "scoreThanks",
    icon: "📊",
    title: "Lob fürs Score-Eintragen (1. und 3. Score)",
    when: "Matchplay & Co.: jemand trägt am Handy Scores ein (eigene oder die der Mitspieler) – beim 1. und 3. Score im Turnier",
    devices: { phone: PHONE_ME },
  },
  {
    id: "scoreHelper",
    icon: "📊",
    title: "Score-Profi (ab 5 Scores)",
    when: "Matchplay & Co.: jemand hat am Handy schon 5, 10, 15 … Scores im Turnier eingetragen",
    devices: {
      ticker: TICKER,
      phone: PHONE_ME,
      tv: { where: "kleine Karte unten links", seconds: 6, sound: { kind: "ding", label: "Ding" } },
      admin: { where: "kleine Karte unten links", seconds: 4, sound: { kind: "ding", label: "Ding" }, note: "Antippen schließt" },
    },
  },
  {
    id: "scoreTip",
    icon: "💡",
    title: "Tipp: Scores eintragen",
    when: "Matchplay & Co.: jemand trägt am Handy ein Match nur mit Plätzen ein (ohne Scores) – einmal pro Turnier",
    devices: { phone: PHONE_ME },
  },
  {
    id: "scoreForm",
    icon: "📊",
    title: "Shortnews: Score im Vergleich zum eigenen Schnitt",
    when:
      "Nach jedem Score (10 s Tippfehler-Schutz): Vergleich mit dem eigenen Schnitt auf diesem Flipper an dieser Location (gleiches Punkteniveau, ab 1 früheren Spiel – bei nur einem: „bisheriger Score“) – 🚀 Ultra · 🔥 Mega · 💪 Stark · 😌 Solide · 😬 Ausbaufähig · 🙈 Streichergebnis. Bei neuem Highscore hängt der Satz an der Highscore-Meldung. Nicht bei Timeplay/DYP.",
    devices: {
      phone: PHONE_ME,
      ticker: TICKER,
      tv: { where: "kleine Karte unten links", seconds: 5, sound: SILENT },
      admin: { where: "kleine Karte unten rechts", seconds: 4, sound: SILENT, note: "Antippen schließt" },
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
    when: "Favorit im laufenden Match: höchste Siegchance (Elo + Flipper-Winrate + Turnierform + Bilanz am Flipper) mit mindestens 10 Prozentpunkten Vorsprung",
    devices: { tv: BADGE("Matchkarte am Namen"), admin: BADGE("am Namen im Match"), phone: BADGE("Mein Match am Namen") },
  },
  {
    id: "badge:defender",
    icon: "🛡️",
    title: "Titelverteidiger-Badge",
    when: "Hat in genau dieser Besetzung am selben Flipper zuletzt gewonnen – nur solange das Match läuft",
    devices: { tv: BADGE("Matchkarte am Namen"), admin: BADGE("am Namen im Match"), phone: BADGE("Mein Match am Namen") },
  },
  {
    id: "badge:lastWinner",
    icon: "🏅",
    title: "Letzter-Sieger-Badge",
    when: "Hat das letzte Aufeinandertreffen in genau dieser Besetzung gewonnen (egal an welchem Flipper) – war das auch das 🛡️-Match, stehen beide Symbole da; Admin nur Symbol",
    devices: { tv: BADGE("Matchkarte am Namen"), admin: BADGE("am Namen im Match (nur 🏅)"), phone: BADGE("Mein Match am Namen") },
  },
  {
    id: "badge:chance",
    icon: "📈",
    title: "Siegchance",
    when: "Siegchance jedes Spielers im laufenden Match (wie beim ★ Favorit berechnet) – höchste grün, niedrigste rot",
    devices: { tv: BADGE("Matchkarte am Namen"), admin: BADGE("am Namen im Match"), phone: BADGE("Mein Match am Namen") },
  },
  {
    id: "badge:premiere",
    icon: "🎰",
    title: "Premiere-Badge",
    when: "Spieler hat diesen Flipper an der Location noch nie gespielt (alle Turniere dort, egal welches Format) – sichtbar, sobald die Runde erzeugt ist",
    devices: { tv: BADGE("Matchkarte beim Spieler"), admin: BADGE("beim Spieler im Match"), phone: BADGE("Mein Match") },
  },
  {
    id: "badge:onFire",
    icon: "🔥",
    title: "On-fire-Badge",
    when: "Siegesserie im Turnier (ab 3, 🔥🔥 ab 5) am Spielernamen – Round the Pinball: an 3 Flippern gerade den besten Score",
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
  // 📡 Schalter "Ticker über Server" (kein Gerät, nur an/aus; Standard: aus)
  const sf = r?.[SERVER_FEED_ID]?.ticker;
  def[SERVER_FEED_ID] = { ticker: { enabled: sf?.enabled === true, seconds: null, volume: 1, sound: "none" } };
  return def;
}

// ─────────────────────────────────────────────────────────────────────────────
// 📡 Live-Ticker über den Server (/api/public/feed/sync): der Server rechnet aus den Turnierdaten nach,
// was im Ticker stehen muss – unabhängig davon, ob die Admin-Seite offen ist.

/** Einstellungs-Eintrag für den Schalter (gespeichert wie eine Mitteilung, Gerät "ticker") */
export const SERVER_FEED_ID = "system:serverFeed";

/** Ist "Ticker über Server" eingeschaltet? */
export function serverFeedOn(settings: NotificationSettings | null | undefined): boolean {
  return settings?.[SERVER_FEED_ID]?.ticker?.enabled === true;
}

/**
 * Welche Arten rechnet der Server nach? (Sicherheitsnetz – die Admin-Seite trägt sie weiterhin sofort ein)
 * Round the Pinball: Serien zählen dort "gehaltene Highscores" (keine Reihenfolge) → nur über die Admin-Seite.
 */
export function serverHandlesKind(kind: string, rotation: boolean): boolean {
  if (
    [
      "roundStart",
      "roundDone",
      "tournamentEnd",
      "flawless",
      // Schritt 2
      "record",
      "month",
      "personal",
      "premiere",
      "premiereWin",
      "wins",
      "photo",
      "blowout",
      "revenge",
      "scoreForm",
      // "upset" bewusst nicht: braucht die eingefrorenen Siegchancen vom Gerät (lib/chanceSnapshots.ts)
    ].includes(kind)
  )
    return true;
  if (rotation) return false;
  return ["streak", "streakEnd", "unbeaten", "unbeatenEnd"].includes(kind);
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

export type NotifScope = "turnier" | "30tage" | "allzeit" | "duell" | "short" | "spieler" | "team";

export const SCOPE_INFO: Record<NotifScope, { icon: string; label: string; long: string }> = {
  turnier: { icon: "🏟️", label: "Turnier", long: "in diesem Turnier" },
  "30tage": { icon: "📅", label: "30 Tage", long: "in den letzten 30 Tagen" },
  allzeit: { icon: "♾️", label: "Allzeit", long: "über alle Turniere" },
  // Duelle zählen über alle Turniere → eine Allzeit-Variante (eigene Farbe, damit man sie erkennt)
  duell: { icon: "♾️", label: "Allzeit · Duell", long: "Duell-Bilanz über alle Turniere" },
  // Spieler-Meldung: dreht sich um einen Spieler (Serie beendet …)
  spieler: { icon: "👤", label: "Spieler", long: "über einen Spieler in diesem Turnier" },
  // Team: Lob/Tipp fürs Mithelfen beim Eintragen (Scores am Handy)
  team: { icon: "🤝", label: "Team", long: "Mithelfen beim Eintragen der Scores" },
  short: { icon: "📰", label: "Ergebnis", long: "kurzes Ergebnis aus diesem Turnier (Shortnews)" },
};

const SCOPE_OF: Record<string, NotifScope> = {
  record: "spieler",
  month: "30tage",
  personal: "spieler",
  wins: "spieler",
  streak: "spieler",
  streakEnd: "spieler",
  unbeaten: "spieler",
  unbeatenEnd: "spieler",
  flawless: "spieler",
  leader: "spieler",
  upset: "spieler",
  photo: "spieler",
  blowout: "spieler",
  revenge: "spieler",
  premiere: "spieler",
  premiereWin: "spieler",
  eloMark: "spieler",
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
  titleDefender: "duell",
  closeMatch: "spieler",
  matchShort: "short",
  waveShort: "short",
  scoreForm: "spieler",
  scoreThanks: "team",
  scoreHelper: "team",
  scoreTip: "team",
};

export function scopeOf(kind: string): NotifScope | null {
  return SCOPE_OF[kind] ?? null;
}
