// 📜 Ticker-Vorschau: je Meldungsart ein Beispiel-Eintrag (nur Anzeige, wird nirgends gespeichert).
// Texte möglichst aus denselben Bausteinen wie im echten Turnier (momentText, eventText),
// sonst im gleichen Format wie die Stellen, die die Meldung eintragen.

import type { FeedItem } from "@/lib/feed";
import { MOMENT_ICON, MOMENT_TITLE, momentText, type MatchMoment } from "@/lib/matchMoments";
import { eventText, type RivalryEvent } from "@/lib/rivalryInsights";

const NAMES: Record<string, string> = { a: "Janos", b: "Marco", c: "Andre", d: "Christian" };
const nameOf = (id: string) => NAMES[id] ?? id;

type Sample = Omit<FeedItem, "id" | "at" | "players"> & { players?: string[] };

function moment(kind: MatchMoment["kind"], extra: Record<string, unknown>): Sample {
  const m = { kind, winnerId: "a", loserId: "b", machine: "🦖 Godzilla Premium", ...extra } as unknown as MatchMoment;
  return {
    key: `${kind}|preview`,
    kind,
    icon: MOMENT_ICON[kind],
    title: MOMENT_TITLE[kind],
    body: momentText(m, "Janos", "Marco"),
    data: { player: "Janos", other: "Marco", machine: "Godzilla Premium" },
  };
}

function rivalry(kind: RivalryEvent["kind"], n: number, ww: number, lw: number): Sample {
  const ev: RivalryEvent = { id: `preview|${kind}`, kind, winner: "a", loser: "b", n, winnerWins: ww, loserWins: lw, score: 0 };
  const t = eventText(ev, nameOf);
  return { key: `rivalry|${kind}|preview`, kind, icon: t.icon, title: t.title, body: t.text, data: { player: "Janos", other: "Marco" } };
}

/** Beispiele, gruppiert wie im Ticker-Badge (Reihenfolge = Anzeige von oben nach unten) */
export function tickerPreviewSamples(): Sample[] {
  return [
    // 🏟️ Turnier
    { key: "p|roundStart", kind: "roundStart", icon: "🎬", title: "Runde 2 generiert", body: "3 Matches an 3 Flippern – viel Spaß!" },
    {
      key: "p|roundDone",
      kind: "roundDone",
      icon: "✅",
      title: "Runde 2 abgeschlossen",
      body:
        "Rundensieger: Gerald (Jaws Premium), Mario (Royal Flash), Marco (Black Knight LE) · Höchster Score: Marco an Black Knight LE – 200.000 · Führend: Andre (2 Pkt.) · Gerald rückt auf Platz 1 vor",
    },
    { key: "p|rotationSplash", kind: "rotationSplash", icon: "🎱", title: "Durchgang 2 / 3 startet", body: "Weiter geht's – viel Spaß! 🍀" },
    { key: "p|superfinalStart", kind: "superfinalStart", icon: "🏆", title: "Superfinale gestartet", body: "Janos (3) · Marco (2) · Andre (1) · Christian (0) – Ziel 4 Punkte" },
    { key: "p|superfinalGame", kind: "superfinalGame", icon: "🕹️", title: "Finalspiel 2: Marco gewinnt", body: "Stand: Janos 3 · Marco 3 · Andre 1 · Christian 0 (Ziel 4)" },
    { key: "p|superfinalChampion", kind: "superfinalChampion", icon: "👑", title: "Super Grand Champion!", body: "Janos gewinnt das Superfinale – Endstand: Janos 4 · Marco 3 · Andre 1 · Christian 0" },
    { key: "p|tournamentEnd", kind: "tournamentEnd", icon: "🏁", title: "Turnier beendet", body: "🏆 Janos · 🥈 Marco · 🥉 Andre" },
    moment("photo", { gapPct: 1.2, winnerScore: 25_300_000, loserScore: 25_000_000 }),
    moment("blowout", { factor: 12.4, winnerScore: 124_000_000, loserScore: 10_000_000 }),

    // 👤 Spieler
    { key: "p|record", kind: "record", icon: "🏆", title: "Allzeit-Highscore!", body: "Janos an Godzilla Premium – 412.300.000", data: { player: "Janos" } },
    { key: "p|personal", kind: "personal", icon: "💪", title: "Persönlicher Highscore", body: "Marco an Elvira – 98.450.000", data: { player: "Marco" } },
    { key: "p|wins", kind: "wins", icon: "🎉", title: "25. Matchsieg", body: "Marco feiert den 25. Matchsieg", data: { player: "Marco", n: 25 } },
    { key: "p|eloMark", kind: "eloMark", icon: "📈", title: "Elo-Meilenstein", body: "Andre knackt die 1600 – jetzt 1604 Elo", data: { player: "Andre" } },
    { key: "p|premiere", kind: "premiere", icon: "🎰", title: "Flipper-Premiere", body: "Andre spielt gleich zum ersten Mal 🧙🏻 Elvira!", data: { player: "Andre" } },
    { key: "p|premiereWin", kind: "premiereWin", icon: "🌟", title: "Premieren-Sieg", body: "Mario spielt zum ersten Mal 🎰 Royal Flash und gewinnt sofort!", data: { player: "Mario" } },
    { key: "p|streak", kind: "streak", icon: "🔥", title: "On fire!", body: "Janos: 3 Siege in Folge im Turnier", data: { player: "Janos" } },
    { key: "p|streakEnd", kind: "streakEnd", icon: "🧯", title: "Serie beendet", body: "Andre beendet die Siegesserie von Marco (3 Siege in Folge)", data: { player: "Andre", victim: "Marco" } },
    {
      key: "p|unbeaten",
      kind: "unbeaten",
      icon: "🛡️",
      title: "Noch unbesiegt",
      body: "Janos: 4 Siege ohne Niederlage (4 Matches) – schafft er die Flawless Victory oder wird er noch gestoppt?",
      data: { player: "Janos" },
    },
    {
      key: "p|unbeatenEnd",
      kind: "unbeatenEnd",
      icon: "💔",
      title: "Traum geplatzt",
      body: "Christian stoppt Janos nach 4 Siegen – der Traum von der Flawless Victory ist geplatzt",
      data: { player: "Christian", victim: "Janos" },
    },
    { key: "p|leader", kind: "leader", icon: "👑", title: "Neuer Tabellenführer", body: "Marco übernimmt die Spitze von Janos (7 Pkt.)", data: { player: "Marco", other: "Janos" } },
    { key: "p|flawless", kind: "flawless", icon: "🥋", title: "Flawless Victory", body: "Janos – 5 von 5 Matches gewonnen – kein einziges Duell verloren", data: { player: "Janos" } },
    {
      key: "p|closeMatch",
      kind: "closeMatch",
      icon: "⚖️",
      title: "Auf Messers Schneide",
      body: "Siegchancen im 🦍 King Kong LE-Match: Gerald 46 % vs Christian 54 % – völlig offen, hier ist alles drin!",
      data: {
        machine: "King Kong LE",
        machineIcon: "🦍",
        chances: [
          { name: "Gerald", pct: 46 },
          { name: "Christian", pct: 54 },
        ],
      },
    },
    {
      key: "p|closeRtp",
      kind: "closeMatch",
      icon: "⚖️",
      title: "Auf Messers Schneide",
      body: "Janos legt an 🦖 Godzilla Premium 45.000.000 vor – Marco ist gleich stark (24 % vs 23 %). Kann Marco kontern?",
      data: {
        machine: "Godzilla Premium",
        machineIcon: "🦖",
        rtp: true,
        head: "Siegchancen der Favoriten an 🦖 Godzilla Premium",
        line: "Janos legt 45.000.000 vor – kann Marco kontern?",
        player: "Janos",
        other: "Marco",
        chances: [
          { name: "Janos", pct: 24 },
          { name: "Marco", pct: 23 },
        ],
      },
    },
    {
      key: "p|closeRtpResult",
      kind: "closeMatch",
      icon: "⚖️",
      title: "Auf Messers Schneide – gekontert!",
      body: "Marco kontert an 🦖 Godzilla Premium: 48.100.000 gegen 45.000.000 von Janos!",
      data: { machine: "Godzilla Premium", machineIcon: "🦖", player: "Marco", other: "Janos" },
    },
    moment("upset", { winnerChance: 0.23, loserChance: 0.77 }),
    moment("revenge", { prevRound: 1 }),
    {
      key: "p|scoreForm",
      kind: "scoreForm",
      icon: "🙈",
      title: "Christian · 🛡️ Black Knight LE: 46",
      body: "6.799.954 unter dem bisherigen Score (−100 %) – 🙈 Streichergebnis. Abhaken – das war die Aufwärmrunde.",
      data: { player: "Christian" },
    },

    // ♾️ Allzeit · Duell
    rivalry("streakGrow", 4, 9, 5),
    rivalry("streakBroken", 5, 6, 9),
    rivalry("newNemesis", 0, 8, 2),
    rivalry("nemesisBeaten", 0, 3, 9),
    rivalry("evenReached", 12, 6, 6),
    rivalry("leadChange", 0, 8, 8),
    rivalry("jubilee", 50, 26, 24),
    {
      key: "p|rivalryInsight",
      kind: "rivalryInsight",
      icon: "⚖️",
      title: "Ebenbürtiges Duell",
      body: "Ebenbürtig: Janos – Marco 6 : 6 – gleich wieder an Godzilla Premium",
      data: { player: "Janos", other: "Marco" },
    },

    // 📅 30 Tage
    { key: "p|month", kind: "month", icon: "📅", title: "30-Tage-Highscore", body: "Christian an Black Knight LE – 228.000.000", data: { player: "Christian" } },

    // 📰 Ergebnis
    {
      key: "p|matchShort",
      kind: "matchShort",
      icon: "🏁",
      title: "Ergebnis auf 🎰 Royal Flash",
      body: "1. Mario · 2. Janos",
      data: {
        machine: "Royal Flash",
        machineIcon: "🎰",
        lines: [
          { pos: 1, name: "Mario", score: null },
          { pos: 2, name: "Janos", score: null },
        ],
      },
    },
    {
      key: "p|matchShortClose",
      kind: "matchShort",
      icon: "🏁",
      title: "Ergebnis auf 🦍 King Kong LE",
      body: "1. Christian · 2. Gerald",
      data: {
        machine: "King Kong LE",
        machineIcon: "🦍",
        lines: [
          { pos: 1, name: "Christian", score: 117_000_000 },
          { pos: 2, name: "Gerald", score: 98_500_000 },
        ],
        close: "⚖️ Auf Messers Schneide – Christian setzt sich durch",
      },
    },
    {
      key: "p|waveShort",
      kind: "waveShort",
      icon: "🎱",
      title: "Durchgang 1 / 3: alle Scores",
      body: "Janos – Elvira: Platz 1 mit 45.200.000 · Marco – Godzilla Premium: Platz 2 mit 31.000.000",
      data: {
        lines: [
          { name: "Janos", machine: "Elvira", machineIcon: "🧙🏻", score: 45_200_000, place: 1 },
          { name: "Marco", machine: "Godzilla Premium", machineIcon: "🦖", score: 31_000_000, place: 2 },
        ],
      },
    },
  ];
}

/** Als Ticker-Einträge (feste Uhrzeit, fortlaufende ids) */
export function tickerPreviewItems(): FeedItem[] {
  const base = Date.parse("2026-01-01T12:00:00Z");
  return tickerPreviewSamples().map((s, i) => ({
    ...s,
    id: -(i + 1),
    at: new Date(base - i * 60_000).toISOString(),
    players: s.players ?? [],
  }));
}
