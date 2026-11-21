// 📟 LED-Display am Flipper (Adafruit Matrix Portal, 64×32) – was soll gerade angezeigt werden? Reine Logik.
//
// Jedes Display kennt nur seinen Flipper-Namen (+ Location) und fragt /api/public/display.
// Der Server entscheidet hier die Situation, das Display zeigt nur zwei Zeilen an:
//   oben = Lauftext, unten = kurzer Wert (Score / Name).
//
// Situationen (zunächst nur Round the Pinball – andere Formate zeigen den Allzeit-Highscore):
//   alltime  – kein laufendes Turnier (bzw. anderes Format / Flipper nicht im Turnier) → Allzeit-Highscore
//   lobby    – Turnier angelegt, noch keine Runden → "ROUND THE PINBALL – GLEICH GEHT'S LOS" + Turniername
//   turn     – Timer NICHT gestartet, an diesem Flipper ist jemand dran (blau) → Spruch + Name
//   highscore– Start gedrückt (Countdown), Timer läuft oder pausiert (oder niemand dran) → Turnier-Highscore
//
//   blockdone– alle Durchgänge fertig (Turnier läuft noch) → Highscores dieses Flippers je Block
//   final    – Turnier gerade beendet (≤ 10 Min. nach "Turnier beenden", kein neues angelegt) → Siegerliste
//
// Die eingebaute Display-Schrift kennt nur ASCII → Umlaute werden zu AE/OE/UE, Emojis fallen weg.

import { matchPoints } from "@/lib/points";

export type DisplayRecord = { score: number; holder: string | null };

export type DisplayTimer = {
  state?: string | null;
  endAt?: number | null;
  /** nur bei "prestart": wann der Timer losgeht (Server-Uhr) */
  startAt?: number | null;
  remainingMs?: number | null;
  at?: number | null;
} | null;

/** Timer fürs Display: Phase + Sekunden bis Start/Ende (relativ – das Display zählt mit eigener Uhr weiter) */
export type DisplayTimerInfo = {
  phase: "off" | "prestart" | "running" | "paused";
  /** Sekunden bis LOS (nur prestart) */
  toStart: number | null;
  /** Sekunden bis Schluss (nur running) */
  toEnd: number | null;
};

export type DisplayInput = {
  flipper: string;
  /** laufendes Turnier (null = keins) */
  tournament: { name: string | null; format: string | null } | null;
  /** Flipper ist im laufenden Turnier (aktiv) */
  inTournament: boolean;
  /** Turnier hat schon Runden */
  hasRounds: boolean;
  timer: DisplayTimer;
  /** Name des Spielers, der an diesem Flipper gerade dran ist (blau) */
  activePlayer: string | null;
  /** bester Score an diesem Flipper im laufenden Turnier */
  tournamentBest: DisplayRecord | null;
  /** Allzeit-Highscore des Flippers an der Location (beendete Turniere) */
  allTime: DisplayRecord | null;
  now: number;
  /** 🧱 alle Durchgänge fertig (Turnier läuft noch): Highscores dieses Flippers je Block */
  blocksDone?: BlockHighscore[] | null;
  /** 🏁 gerade beendetes Turnier (Round the Pinball): Name + Platzierungen */
  final?: { name: string | null; ranking: RankingEntry[] } | null;
};

/** 📟 app_settings-Schlüssel: zuletzt am Admin-iPad geöffnetes laufendes Turnier (je Location, null = allgemein) */
export function displayTournamentKey(locationId: string | null): string {
  return locationId ? `display_tournament:${locationId}` : "display_tournament";
}

/** so viele zuletzt geöffnete Turniere merken (je Location) */
export const DISPLAY_PIN_MAX = 6;

/** gemerkte Turniere aus app_settings.value (neuestes vorne; ältere Einträge hatten nur { code }) */
export function displayPinList(value: unknown): { code: string; at: string | null }[] {
  const v = (value ?? {}) as { code?: unknown; at?: unknown; list?: unknown };
  const raw = Array.isArray(v.list) ? v.list : v.code ? [{ code: v.code, at: v.at }] : [];
  const out: { code: string; at: string | null }[] = [];
  for (const e of raw as { code?: unknown; at?: unknown }[]) {
    const code = String(e?.code ?? "").trim().toUpperCase();
    if (code && !out.some((x) => x.code === code)) out.push({ code, at: e?.at ? String(e.at) : null });
  }
  return out;
}

export type DisplayMode =
  | "alltime"
  | "lobby"
  | "turn"
  | "highscore"
  | "blockdone"
  | "final"
  // Matchplay / Swiss / Round Robin
  | "mplay"
  | "mwin"
  | "slides";

/** 🎯 Formate mit Runden + Paarungen (je Flipper ein Match pro Runde) */
export const MATCH_DISPLAY_FORMATS = new Set(["matchplay", "swiss", "round_robin"]);

const FORMAT_LABEL: Record<string, string> = {
  matchplay: "MATCHPLAY",
  swiss: "SWISS",
  round_robin: "ROUND ROBIN",
  rotation: "ROUND THE PINBALL",
};

/** Aufbauende Worte vor dem Spiel – je Spieler, Flipper und Runde ein anderer */
export const MATCH_SAYINGS = [
  "VIEL ERFOLG",
  "DU SCHAFFST DAS",
  "ZEIG WAS DU KANNST",
  "VOLLE KONZENTRATION",
  "JETZT GILT'S",
  "HOL DIR DEN SIEG",
  "RUHIG BLEIBEN",
  "GUTE KUGELN",
  "LASS ES KRACHEN",
  "DEIN MOMENT",
  "AUF GEHT'S",
  "GIB ALLES",
];

/** Ein Bildschirm der Wechselanzeige (Rahmen; oben Text, unten Zahl/Name) */
export type DisplaySlide = { top: string; bottom: string };

/** Match dieses Flippers in der aktuellen Runde */
export type DisplayMatch = {
  matchId: string;
  round: number;
  /** Spieler in Startreihenfolge (Display-Text) */
  players: string[];
  /** wer gerade spielt (erster in der Startreihenfolge ohne Score/Platz) */
  active: string | null;
  /** persönlicher Bestwert des Spielenden an diesem Flipper (Location, alle Turniere inkl. diesem) */
  activeBest: number | null;
  finished: boolean;
  /** Sieger (bei Gleichstand "A & B") + sein Score */
  winner: { name: string; score: number | null } | null;
};

export type MatchDisplayInput = {
  flipper: string;
  format: string;
  tournamentName: string | null;
  hasRounds: boolean;
  /** Match an diesem Flipper in der aktuellen Runde (null = Flipper diese Runde frei) */
  match: DisplayMatch | null;
  /** aktuelle Runde komplett fertig → Tabelle */
  roundDone: boolean;
  roundNo: number;
  /** Tabelle (Platz, Name, Punkte) – Top 3 werden gezeigt */
  standings: RankingEntry[];
  /** bester Score an diesem Flipper im Turnier */
  tournamentBest: DisplayRecord | null;
  allTime: DisplayRecord | null;
};

export function matchSayingFor(flipper: string, player: string, round: number): string {
  return MATCH_SAYINGS[hash(`${flipper.toLowerCase()}|${player.toLowerCase()}|${round}`) % MATCH_SAYINGS.length];
}

/**
 * Matchplay / Swiss / Round Robin: was zeigt das Display an diesem Flipper?
 *   lobby  – noch keine Runde
 *   slides – Runde komplett fertig: Sieger hier + Tabelle Top 3 (Wechselanzeige mit Rahmen)
 *   mplay  – Match läuft: wer spielt + Spruch + pers. Bestwert, Runde + Paarung
 *   mwin   – Match hier fertig (andere spielen noch): Sieger
 *   highscore/alltime – Flipper diese Runde frei
 */
export function matchDisplay(input: MatchDisplayInput): DisplayOutput & { slides?: DisplaySlide[] } {
  const label = FORMAT_LABEL[input.format] ?? "TURNIER";
  if (!input.hasRounds) {
    return {
      mode: "lobby",
      top: `${label} - GLEICH GEHT'S LOS`,
      bottom: displayText(input.tournamentName) || "TURNIER",
      topColor: PINK,
      bottomColor: GREEN,
    };
  }
  const m = input.match;
  if (input.roundDone && input.standings.length) {
    const slides: DisplaySlide[] = [];
    if (m?.winner) {
      slides.push({
        top: `RUNDE ${m.round} - SIEGER ${m.winner.name}!`,
        bottom: m.winner.score != null ? displayScore(m.winner.score) : m.winner.name,
      });
    }
    slides.push({ top: `TABELLE NACH RUNDE ${input.roundNo}`, bottom: "" });
    for (const e of input.standings.slice(0, 3)) {
      slides.push({ top: `${e.place}. ${e.name}`, bottom: `${e.points} PKT` });
    }
    return { mode: "slides", top: slides[0].top, bottom: slides[0].bottom, topColor: ORANGE, bottomColor: BLUE, slides };
  }
  if (m && !m.finished && m.active) {
    const best = m.activeBest != null ? `PERS. BESTWERT ${displayScore(m.activeBest)}` : "HIER NOCH KEIN BESTWERT";
    return {
      mode: "mplay",
      top: `${matchSayingFor(input.flipper, m.active, m.round)} ${m.active}!  ${best}  -  RUNDE ${m.round}: ${m.players.join(" - ")}`,
      bottom: m.active,
      topColor: GREEN,
      bottomColor: BLUE,
    };
  }
  if (m && m.finished && m.winner) {
    return {
      mode: "mwin",
      top: `SIEGER ${m.winner.name}!  -  RUNDE ${m.round}: ${m.players.join(" - ")}`,
      bottom: m.winner.score != null ? displayScore(m.winner.score) : m.winner.name,
      topColor: YELLOW,
      bottomColor: YELLOW,
    };
  }
  // Flipper diese Runde frei → Turnier-Highscore (sonst Allzeit)
  if (input.tournamentBest) {
    const holder = displayText(input.tournamentBest.holder);
    return {
      mode: "highscore",
      top: `FREI - TURNIER HIGHSCORE${holder ? `  ${holder}` : ""}`,
      bottom: displayScore(input.tournamentBest.score),
      topColor: ORANGE,
      bottomColor: BLUE,
    };
  }
  return allTimeView(input.flipper, input.allTime);
}

/** 🧱 Block fertig: bester Score an diesem Flipper je Block */
export type BlockHighscore = { block: number; name: string; score: number };
/** 🏁 Turnier beendet: Platzierung (Punkte wie TV/Leaderboard) */
export type RankingEntry = { place: number; name: string; points: number };

/**
 * Platzierungen eines Turniers: Punkte je gesetzter Position (lib/points.ts matchPoints, wie TV/Statistik),
 * gleiche Punkte = gleicher Platz (1, 1, 3 …). Namen schon fürs Display umgeschrieben.
 */
export function tournamentRanking(
  players: readonly { id: string; name: string | null }[],
  rounds: readonly { id: string; format?: string | null }[],
  matches: readonly { id: string; round_id: string }[],
  mps: readonly { match_id: string; player_id: string; position: number | null }[]
): RankingEntry[] {
  const fmtOfRound = new Map(rounds.map((r) => [String(r.id), r.format ?? null]));
  const roundOfMatch = new Map(matches.map((m) => [String(m.id), String(m.round_id)]));
  const sizeOf = new Map<string, number>();
  for (const mp of mps) sizeOf.set(String(mp.match_id), (sizeOf.get(String(mp.match_id)) ?? 0) + 1);
  const pts = new Map<string, number>();
  for (const mp of mps) {
    if (mp.position == null) continue;
    const fmt = fmtOfRound.get(roundOfMatch.get(String(mp.match_id)) ?? "") ?? null;
    const p = matchPoints(Number(mp.position), sizeOf.get(String(mp.match_id)) ?? 0, fmt);
    pts.set(String(mp.player_id), (pts.get(String(mp.player_id)) ?? 0) + p);
  }
  const list = players
    .map((p) => ({ name: displayText(p.name) || "?", points: pts.get(String(p.id)) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const out: RankingEntry[] = [];
  list.forEach((e, i) => {
    const prev = out[i - 1];
    out.push({ ...e, place: prev && prev.points === e.points ? prev.place : i + 1 });
  });
  return out;
}

export type DisplayOutput = {
  mode: DisplayMode;
  top: string;
  bottom: string;
  /** Farben als Zahl (0xRRGGBB) – direkt in CircuitPython nutzbar */
  topColor: number;
  bottomColor: number;
};

const ORANGE = 0xff6600;
const BLUE = 0x0088ff;
const GREEN = 0x00cc44;
const YELLOW = 0xffcc00;
const PINK = 0xff3399;
const GRAY = 0x666666;

/** Sprüche vor dem Spielen – je Flipper (und Spieler) ein anderer */
export const TURN_SAYINGS = [
  "VIEL ERFOLG",
  "ZEIG'S IHNEN",
  "AUF GEHT'S",
  "HOL DIR DEN HIGHSCORE",
  "KEINE TILTS",
  "VOLLE KONZENTRATION",
  "MACH DAS DING",
  "GUTE KUGELN",
];

/** Text für die eingebaute ASCII-Schrift: Umlaute umschreiben, alles andere Nicht-ASCII weg, GROSS */
export function displayText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** 12345670 → "12.345.670" */
export function displayScore(n: number): string {
  const v = Math.round(Math.max(0, n));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** FNV-1a – fester "Zufall", damit jeder Flipper seinen eigenen Spruch hat (und er nicht bei jeder Abfrage wechselt) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function sayingFor(flipper: string, player: string): string {
  return TURN_SAYINGS[hash(`${flipper.toLowerCase()}|${player.toLowerCase()}`) % TURN_SAYINGS.length];
}

/**
 * Durchgang "läuft" fürs Display: schon ab dem Druck auf Start (15-s-Countdown "prestart"),
 * während des Timers und auch in der Pause → Highscore zeigen (der neue Spieler kann ihn in Ruhe ansehen).
 */
export function timerRunning(timer: DisplayTimer, now: number): boolean {
  if (!timer) return false;
  if (timer.state === "prestart" || timer.state === "paused") return true;
  if (timer.state !== "running") return false;
  const end = Number(timer.endAt);
  return Number.isFinite(end) && end > now;
}

const round1 = (ms: number) => Math.round(ms / 100) / 10;

export function displayTimerInfo(timer: DisplayTimer, now: number): DisplayTimerInfo {
  const off: DisplayTimerInfo = { phase: "off", toStart: null, toEnd: null };
  if (!timer) return off;
  if (timer.state === "paused") return { phase: "paused", toStart: null, toEnd: null };
  if (timer.state === "prestart") {
    // ältere Einträge ohne startAt: at + remainingMs
    const start = Number.isFinite(Number(timer.startAt)) && timer.startAt != null
      ? Number(timer.startAt)
      : Number(timer.at) + Number(timer.remainingMs);
    if (!Number.isFinite(start)) return { phase: "prestart", toStart: null, toEnd: null };
    return { phase: "prestart", toStart: round1(Math.max(0, start - now)), toEnd: null };
  }
  if (timer.state === "running") {
    const end = Number(timer.endAt);
    if (!Number.isFinite(end) || end <= now) return off;
    return { phase: "running", toStart: null, toEnd: round1(end - now) };
  }
  return off;
}

function allTimeView(flipper: string, allTime: DisplayRecord | null): DisplayOutput {
  if (!allTime) {
    return { mode: "alltime", top: displayText(flipper) || "FLIPPER", bottom: "NOCH FREI", topColor: ORANGE, bottomColor: GRAY };
  }
  const holder = displayText(allTime.holder);
  return {
    mode: "alltime",
    top: `ALLZEIT HIGHSCORE${holder ? `  ${holder}` : ""}`,
    bottom: displayScore(allTime.score),
    topColor: YELLOW,
    bottomColor: BLUE,
  };
}

export function flipperDisplay(input: DisplayInput): DisplayOutput {
  const { tournament } = input;
  // 🏁 Turnier beendet → Siegerliste (das Gerät spielt sie animiert ab; top/bottom = einfache Anzeige)
  if (input.final && input.final.ranking.length) {
    const w = input.final.ranking[0];
    return {
      mode: "final",
      top: `TURNIER BEENDET - SIEGER ${w.name}`,
      bottom: String(w.points),
      topColor: YELLOW,
      bottomColor: YELLOW,
    };
  }
  // 🧱 alle Durchgänge fertig → Highscores je Block (das Gerät wechselt alle 5 s)
  if (input.blocksDone && input.blocksDone.length && tournament?.format === "rotation") {
    const b = input.blocksDone[input.blocksDone.length - 1];
    return {
      mode: "blockdone",
      top: `BLOCK ${b.block} HIGHSCORE  ${b.name}`,
      bottom: displayScore(b.score),
      topColor: ORANGE,
      bottomColor: BLUE,
    };
  }
  // zunächst nur Round the Pinball – alles andere: Allzeit-Highscore
  if (!tournament || tournament.format !== "rotation" || !input.inTournament) {
    return allTimeView(input.flipper, input.allTime);
  }

  if (!input.hasRounds) {
    return {
      mode: "lobby",
      top: "ROUND THE PINBALL - GLEICH GEHT'S LOS",
      bottom: displayText(tournament.name) || "TURNIER",
      topColor: PINK,
      bottomColor: GREEN,
    };
  }

  // 🔵 neuer Durchgang, Timer läuft noch nicht → Spieler an diesem Flipper anfeuern
  if (!timerRunning(input.timer, input.now) && input.activePlayer) {
    const name = displayText(input.activePlayer);
    return {
      mode: "turn",
      top: `${sayingFor(input.flipper, input.activePlayer)}  ${name}!`,
      bottom: name,
      topColor: GREEN,
      bottomColor: BLUE,
    };
  }

  // ⏱️ Timer läuft (oder niemand dran) → Turnier-Highscore an diesem Flipper
  if (input.tournamentBest) {
    const holder = displayText(input.tournamentBest.holder);
    return {
      mode: "highscore",
      top: `HIGHSCORE${holder ? `  ${holder}` : ""}`,
      bottom: displayScore(input.tournamentBest.score),
      topColor: ORANGE,
      bottomColor: BLUE,
    };
  }
  const at = input.allTime;
  return {
    mode: "highscore",
    top: at
      ? `NOCH KEIN HIGHSCORE - ALLZEIT${displayText(at.holder) ? `  ${displayText(at.holder)}` : ""}`
      : "NOCH KEIN HIGHSCORE",
    bottom: at ? displayScore(at.score) : "---",
    topColor: ORANGE,
    bottomColor: GRAY,
  };
}
