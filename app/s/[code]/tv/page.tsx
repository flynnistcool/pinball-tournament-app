"use client";

// 📺 Infobildschirm für ein laufendes Turnier (öffentlich, ohne Login – liegt unter /s).
// Aufruf: /s/<CODE>/tv  → auf zweitem PC/TV im Vollbild (F11) anzeigen.
//
// Aufbau: gemeinsamer Rahmen (Kopfzeile, Auto-Refresh, Einpassen) + modus-spezifische Ansicht.
// - rotation ("Round the Pinball"): Tabelle Spieler × Flipper inkl. vorläufigem Stand
// - alle anderen Modi: vorerst nur Leaderboard (eigene Ansichten können später ergänzt werden)
//
// Punkte kommen aus lib/points.ts – identisch zum Live-Leaderboard im Admin.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { matchPoints, computeProvisionalRotationPoints } from "@/lib/points";
import { calcRoundsPerCycle, mainRoundBars, type MainRoundBar } from "@/lib/roundProgress";
import { RoundPointsBars } from "@/components/charts";
import { computeFinalRanking } from "@/lib/finals";
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert
import { flushSync } from "react-dom";
import { buildRaceData, type RaceData } from "@/lib/raceChart";
import RaceChart, { type RacePlayer } from "@/components/RaceChart";
import { PointsSystemTvChips } from "@/components/PointsSystemInfo";
import KeepAwake from "@/components/KeepAwake";

// Modi mit "Runden aus mehreren Matches" -> Match-Ansicht (aktuelle Runde + Archiv)
const MATCH_FORMATS = new Set(["matchplay", "swiss", "round_robin"]);
// Ansichten (Tabs) mit Auto-Wechsel; Dauer je Ansicht
type TvTab = "current" | "archive" | "table" | "podium" | "superfinal" | "series" | "race";
const TAB_DURATION_MS: Record<TvTab, number> = {
  current: 10000, // Aktuelle Runde (laufendes Turnier: ⇄ Verlauf)
  archive: 15000, // Alle Runden
  table: 20000, // Tabelle (Rotation) / Leaderboard
  podium: 20000, // Siegerehrung
  superfinal: 20000, // 🔥 Superfinale
  series: 16000, // 📊 Turnierserie (innen: Serie ⇄ Turniername)
  race: 10000, // 📈 Verlauf (Matchplay & Co.)
};
// Nach Turnierende schneller wechseln (Siegerehrung -> Superfinale -> Runden/Tabelle)
const FINISHED_TAB_MS = 6000;
const TAB_LABEL: Record<TvTab, string> = {
  current: "Aktuelle Runde",
  archive: "Alle Runden",
  table: "Tabelle",
  podium: "🏆 Siegerehrung",
  superfinal: "🔥 Superfinale",
  series: "📊 Turnierserie",
  race: "📈 Verlauf",
};

const MACHINE_WR_REFRESH_MS = 60000; // Flipper-Winraten (über alle Turniere) nur 1x pro Minute laden

type MatchCardPlayer = {
  id: string;
  position: number | null;
  score: number | null;
  active: boolean; // spielt gerade (nur wenn im Match schon Scores eingetragen werden)
  // Gewinnchancen (wie in der Admin-Ansicht)
  tWin: number | null; // Turnier-Winrate in %
  mWin: number | null; // Flipper-Winrate (dieser Flipper, diese Location, alle Turniere) in %
  mCount: number; // Anzahl Matches für die Flipper-Winrate
  tTop: boolean; // höchster Wert im (laufenden) Match -> grün
  mTop: boolean;
  favorite: boolean; // ★ meiste Bestwerte im laufenden Match (eindeutig)
};
type MachineWr = { winrate: number | null; matchesPlayed: number };
type MatchCard = {
  matchId: string;
  machineName: string;
  machineIcon: string | null;
  finished: boolean;
  players: MatchCardPlayer[];
};
type RoundBlock = {
  roundId: string;
  number: number;
  finished: boolean;
  matches: MatchCard[];
};

// ── Weiche Übergänge zwischen den Ansichten ───────────────────────────────
// Chrome/Edge (& neuere Android-TV-Browser): echtes Überblenden alt → neu (View Transitions).
// Andere Browser: neue Ansicht blendet nur weich ein (Fallback per CSS, siehe useViewTransitionSupport).
function smoothSwitch(update: () => void) {
  const d = (typeof document !== "undefined" ? document : null) as
    | (Document & { startViewTransition?: (cb: () => void) => unknown })
    | null;
  const reduce =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (d?.startViewTransition && !reduce && d.visibilityState === "visible") {
    try {
      d.startViewTransition(() => flushSync(update));
      return;
    } catch {
      /* Fallback unten */
    }
  }
  update();
}
/** true, wenn der Browser echtes Überblenden kann (erst nach dem Laden bekannt) */
function useViewTransitionSupport() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(typeof document !== "undefined" && "startViewTransition" in document), []);
  return ok;
}
const TRANSITION_CSS = `
::view-transition-old(root) { animation: tvVtOut 0.6s ease both; }
::view-transition-new(root) { animation: tvVtIn 0.6s ease both; }
@keyframes tvVtOut { to { opacity: 0; transform: scale(1.015); } }
@keyframes tvVtIn { from { opacity: 0; transform: scale(0.985); } }
@keyframes tvFadeIn { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: none; } }
`;

const REFRESH_MS = 5000;
const FIT_PAD = 20; // Rand um den Inhalt (px)
const MIN_SCALE = 0.45; // kleiner wird es nicht (Lesbarkeit), dann wird gescrollt
const MAX_SCALE = 2; // bei wenigen Spielern darf vergrößert werden

type Player = { id: string; name: string | null; active?: boolean; profile_id?: string | null };
type Machine = { id: string; name: string | null; icon_emoji?: string | null };
type Profile = { id: string; icon?: string | null; color?: string | null; rating?: number | null };
type Round = {
  id: string;
  number: number;
  format: string | null;
  status: string | null;
  elo_enabled?: boolean | null;
};
type StartRating = { profile_id: string; rating_before: number | null };
type Match = { id: string; round_id: string; machine_id: string | null };
type MatchPlayer = {
  match_id: string;
  player_id: string;
  position: number | null;
  score: number | string | null;
  start_position?: number | null;
};
type PublicTournament = {
  tournament?: {
    name?: string | null;
    code?: string | null;
    format?: string | null;
    status?: string | null;
    match_size?: number | null;
    category?: string | null;
  };
  players?: Player[];
  profiles?: Profile[];
  start_ratings?: StartRating[];
  final?: {
    status: string | null;
    target_points: number | null;
    players: { player_id: string; seed: number; start_points: number; points: number }[];
  } | null;
  machines?: Machine[];
  rounds?: Round[];
  matches?: Match[];
  match_players?: MatchPlayer[];
  error?: string;
};

type Cell = { place: number; score: number | null; provisional: boolean };
type Column = {
  matchId: string;
  roundNo: number;
  machineName: string;
  machineIcon: string | null;
  finished: boolean;
  activePlayerId: string | null; // spielt gerade an diesem Flipper
  highscore: number | null;
  holder: string;
  cells: Record<string, Cell>;
};
type Row = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  real: number;
  extra: number;
  total: number;
  place: number;
  eloStart: number | null; // Elo vor dem Turnier (tournament_ratings)
  eloNow: number | null; // aktuelle Elo im Profil (wird nach jeder fertigen Runde neu berechnet)
  tp?: number | null; // Turnierpunkte heute (erst nach "Turnier beenden"), inkl. Superfinale-Bonus
  tpBonus?: number; // davon Superfinale-Bonus (für "+6 TP +2 🔥")
};

// Turnierserie (gleiche Kategorie) – aus /api/public/series
type SeriesRow = {
  profileId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  tournamentsPlayed: number;
  firstPlaces: number;
  tournamentPoints: number;
};
type SeriesData = {
  category: string;
  rows: SeriesRow[];
  name?: string; // Turniername
  nameRows?: SeriesRow[]; // alle beendeten Turniere mit exakt gleichem Namen
  today: {
    playerId: string;
    profileId: string | null;
    tournamentPoints: number; // inkl. Superfinale-Bonus
    finalRank: number | null;
    superFinalBonus?: number;
  }[];
};
const SERIES_REFRESH_MS = 30000;

const scoreFmt = new Intl.NumberFormat("de-DE");

function toScore(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// Farben für Platz 1–3 (Gold, Silber, Bronze)
const PODIUM = {
  1: { badge: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_14px_rgba(251,191,36,0.55)]", row: "from-amber-400/15", bar: "bg-amber-400" },
  2: { badge: "bg-gradient-to-b from-slate-100 to-slate-400 text-slate-900 shadow-[0_0_10px_rgba(226,232,240,0.35)]", row: "from-slate-300/10", bar: "bg-slate-300" },
  3: { badge: "bg-gradient-to-b from-orange-300 to-orange-600 text-orange-950 shadow-[0_0_10px_rgba(251,146,60,0.4)]", row: "from-orange-400/10", bar: "bg-orange-400" },
} as const;

function podium(place: number) {
  return place === 1 || place === 2 || place === 3 ? PODIUM[place] : null;
}

const FORMAT_LABEL: Record<string, string> = {
  rotation: "Round the Pinball",
  matchplay: "Matchplay",
  timeplay: "Timeplay",
  swiss: "Swiss",
  round_robin: "Round Robin",
  dyp_round_robin: "DYP Round Robin",
  elimination: "Elimination",
};

export default function TournamentTvPage({ params }: { params: { code: string } }) {
  const code = String(params?.code ?? "").toUpperCase();

  const [data, setData] = useState<PublicTournament | null>(null);
  const [error, setError] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/public/tournament?code=${encodeURIComponent(code)}&_ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j: PublicTournament = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(j?.error ?? "Turnier konnte nicht geladen werden");
          return;
        }
        setError("");
        setData(j);
        setUpdatedAt(new Date());
      } catch {
        if (!cancelled) setError("Keine Verbindung – neuer Versuch in wenigen Sekunden …");
      }
    }

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [code]);

  const format = String(data?.tournament?.format ?? "");
  const isRotation = format === "rotation";
  const isFinished = data?.tournament?.status === "finished";

  const view = useMemo(() => {
    const players = data?.players ?? [];
    const profiles = data?.profiles ?? [];
    const machines = data?.machines ?? [];
    const rounds = data?.rounds ?? [];
    const matches = data?.matches ?? [];
    const mps = data?.match_players ?? [];

    const profileById: Record<string, Profile> = {};
    for (const p of profiles) profileById[p.id] = p;
    const startEloByProfile: Record<string, number> = {};
    for (const sr of data?.start_ratings ?? []) {
      const v = Number(sr.rating_before);
      if (sr.profile_id && Number.isFinite(v)) startEloByProfile[sr.profile_id] = v;
    }
    // Elo im Turnier an? (Schalter gilt fürs ganze Turnier; ohne Runden: an)
    const eloOn = rounds.length === 0 || rounds.some((r) => r.elo_enabled !== false);
    const playerName: Record<string, string> = {};
    for (const p of players) playerName[p.id] = String(p.name ?? "?");
    const machineById: Record<string, Machine> = {};
    for (const m of machines) machineById[m.id] = m;
    const roundById: Record<string, Round> = {};
    for (const r of rounds) roundById[r.id] = r;

    const mpsByMatch: Record<string, MatchPlayer[]> = {};
    for (const mp of mps) (mpsByMatch[mp.match_id] ||= []).push(mp);

    // Echte Punkte (wie /api/stats): jede gesetzte Position zählt
    const real: Record<string, number> = {};
    for (const m of matches) {
      const list = mpsByMatch[m.id] ?? [];
      const fmt = roundById[m.round_id]?.format ?? null;
      for (const mp of list) {
        if (mp.position == null) continue;
        real[mp.player_id] = (real[mp.player_id] ?? 0) + matchPoints(mp.position, list.length, fmt);
      }
    }

    // Vorläufige Zusatzpunkte (nur Rotation)
    const extra = isRotation ? computeProvisionalRotationPoints(matches, mps) : {};

    // Leaderboard-Zeilen
    const rowsUnsorted = players.map((p) => {
      const prof = p.profile_id ? profileById[p.profile_id] : undefined;
      const r = real[p.id] ?? 0;
      const e = extra[p.id] ?? 0;
      return {
        id: p.id,
        name: playerName[p.id],
        icon: (prof?.icon ?? "").trim() || null,
        color: prof?.color ?? null,
        real: r,
        extra: e,
        total: r + e,
        place: 0,
        eloStart: p.profile_id != null ? startEloByProfile[p.profile_id] ?? null : null,
        eloNow:
          prof?.rating != null && Number.isFinite(Number(prof.rating)) ? Number(prof.rating) : null,
      };
    });
    rowsUnsorted.sort((a, b) => b.total - a.total || b.real - a.real || a.name.localeCompare(b.name));
    const rows: Row[] = [];
    rowsUnsorted.forEach((r, i) => {
      const prev = rows[i - 1];
      const place = prev && prev.total === r.total ? prev.place : i + 1;
      rows.push({ ...r, place });
    });

    // Spalten pro Flipper (nur Rotation), sortiert nach Rundennummer
    const columns: Column[] = [];
    if (isRotation) {
      const sorted = [...matches].sort(
        (a, b) => (roundById[a.round_id]?.number ?? 0) - (roundById[b.round_id]?.number ?? 0)
      );
      for (const m of sorted) {
        const list = mpsByMatch[m.id] ?? [];
        const scored = list
          .map((mp) => ({ mp, s: toScore(mp.score) }))
          .filter((x): x is { mp: MatchPlayer; s: number } => x.s != null)
          .sort((a, b) => b.s - a.s);

        // Virtueller Platz nach Score (gleicher Score = gleicher Platz)
        const virtualPlace: Record<string, number> = {};
        let place = 0;
        let prevScore: number | null = null;
        scored.forEach((x, i) => {
          if (prevScore === null || x.s < prevScore) place = i + 1;
          prevScore = x.s;
          virtualPlace[x.mp.player_id] = place;
        });

        const cells: Record<string, Cell> = {};
        for (const mp of list) {
          const s = toScore(mp.score);
          if (mp.position != null) {
            cells[mp.player_id] = { place: mp.position, score: s, provisional: false };
          } else if (s != null) {
            cells[mp.player_id] = { place: virtualPlace[mp.player_id], score: s, provisional: true };
          }
        }

        const highscore = scored.length ? scored[0].s : null;
        const holder = scored
          .filter((x) => x.s === highscore)
          .map((x) => playerName[x.mp.player_id] ?? "?")
          .join(" & ");
        const machine = m.machine_id ? machineById[m.machine_id] : undefined;

        // Aktiver Spieler = erster in Startreihenfolge ohne Score (wie in der Admin-Ansicht)
        const activePlayerId =
          data?.tournament?.status === "finished"
            ? null
            : [...list]
                .sort((a, b) => (a.start_position ?? 9999) - (b.start_position ?? 9999))
                .find((mp) => toScore(mp.score) == null)?.player_id ?? null;

        columns.push({
          matchId: m.id,
          roundNo: roundById[m.round_id]?.number ?? 0,
          machineName: String(machine?.name ?? "—"),
          machineIcon: (machine?.icon_emoji ?? "").trim() || null,
          finished: list.length > 0 && list.every((x) => x.position != null),
          activePlayerId,
          highscore,
          holder,
          cells,
        });
      }
    }

    return { rows, columns, eloOn };
  }, [data, isRotation]);

  const tournamentName = data?.tournament?.name ?? "Turnier";
  const isMatchFormat = MATCH_FORMATS.has(format);

  // Turnierserie (gleiche Kategorie) + Turnierpunkte von heute
  const [series, setSeries] = useState<SeriesData | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function loadSeries() {
      try {
        const res = await fetch(`/api/public/series?code=${encodeURIComponent(code)}&_ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setSeries(j as SeriesData);
      } catch {
        /* nicht kritisch */
      }
    }
    loadSeries();
    const t = setInterval(loadSeries, SERIES_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [code]);

  // Bei Turnierende sofort neu laden (Turnierpunkte gibt es erst danach)
  useEffect(() => {
    if (!isFinished) return;
    fetch(`/api/public/series?code=${encodeURIComponent(code)}&_ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setSeries(j as SeriesData))
      .catch(() => {});
  }, [isFinished, code]);

  // Leaderboard-Zeilen + Turnierpunkte von heute (nur nach Turnierende)
  const rowsTp: Row[] = useMemo(() => {
    if (!isFinished || !series?.today?.length) return view.rows;
    const tpBy: Record<string, number> = {};
    const bonusBy: Record<string, number> = {};
    for (const x of series.today) {
      tpBy[x.playerId] = x.tournamentPoints;
      bonusBy[x.playerId] = x.superFinalBonus ?? 0;
    }
    return view.rows.map((r) => ({ ...r, tp: tpBy[r.id] ?? null, tpBonus: bonusBy[r.id] ?? 0 }));
  }, [view.rows, series, isFinished]);

  // Flipper-Winraten (öffentliche Schnittstelle, 1x pro Minute)
  const [machineWr, setMachineWr] = useState<Record<string, MachineWr>>({});
  useEffect(() => {
    if (!isMatchFormat) return;
    let cancelled = false;
    async function loadWr() {
      try {
        const res = await fetch(`/api/public/machine-winrates?code=${encodeURIComponent(code)}&_ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const map: Record<string, MachineWr> = {};
        for (const r of (j?.rows ?? []) as any[]) {
          map[`${r.profileId}__${r.machineName}`] = {
            winrate: typeof r.winrate === "number" ? r.winrate : null,
            matchesPlayed: Number(r.matchesPlayed) || 0,
          };
        }
        setMachineWr(map);
      } catch {
        /* nicht kritisch – Anzeige ohne Flipper-Winrate */
      }
    }
    loadWr();
    const t = setInterval(loadWr, MACHINE_WR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [code, isMatchFormat]);

  // ── Match-Ansicht (Matchplay / Swiss / Round Robin) ───────────────────────
  const matchView = useMemo(() => {
    if (!isMatchFormat) return null;
    const players = data?.players ?? [];
    const machines = data?.machines ?? [];
    const rounds = [...(data?.rounds ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    const matches = data?.matches ?? [];
    const mps = data?.match_players ?? [];

    const machineById: Record<string, Machine> = {};
    for (const m of machines) machineById[m.id] = m;
    const mpsByMatch: Record<string, MatchPlayer[]> = {};
    for (const mp of mps) (mpsByMatch[mp.match_id] ||= []).push(mp);
    const profileOf: Record<string, string> = {};
    for (const p of players) if (p.profile_id) profileOf[p.id] = p.profile_id;

    // Turnier-Winrate je Spieler (wie /api/stats: Siege / gewertete Matches)
    const played: Record<string, number> = {};
    const wins: Record<string, number> = {};
    for (const mp of mps) {
      if (mp.position == null) continue;
      played[mp.player_id] = (played[mp.player_id] ?? 0) + 1;
      if (mp.position === 1) wins[mp.player_id] = (wins[mp.player_id] ?? 0) + 1;
    }
    const tWinOf = (pid: string) =>
      played[pid] ? Math.round(((wins[pid] ?? 0) / played[pid]) * 1000) / 10 : 0;

    // Punkte pro Runde je Spieler (für "Verlauf" im Leaderboard, wie im Admin)
    const history: Record<string, { round: number; points: number }[]> = {};
    let roundPointsMax = 0;
    for (const r of rounds) {
      const perPlayer: Record<string, number> = {};
      for (const m of matches.filter((x) => x.round_id === r.id)) {
        const list = mpsByMatch[m.id] ?? [];
        for (const mp of list) {
          if (mp.position == null) continue;
          perPlayer[mp.player_id] =
            (perPlayer[mp.player_id] ?? 0) + matchPoints(mp.position, list.length, r.format);
        }
      }
      for (const [pid, pts] of Object.entries(perPlayer)) {
        (history[pid] ||= []).push({ round: Number(r.number) || 0, points: pts });
        if (pts > roundPointsMax) roundPointsMax = pts;
      }
    }

    const blocks: RoundBlock[] = rounds.map((r) => {
      const cards: MatchCard[] = matches
        .filter((m) => m.round_id === r.id)
        .map((m) => {
          const list = [...(mpsByMatch[m.id] ?? [])].sort(
            (a, b) => (a.start_position ?? 9999) - (b.start_position ?? 9999)
          );
          const finished = list.length > 0 && list.every((x) => x.position != null);
          // "▶ spielt" nur, wenn in diesem Match schon Scores eingetragen werden
          const usesScores = list.some((x) => toScore(x.score) != null);
          const activeId =
            !finished && usesScores
              ? list.find((x) => toScore(x.score) == null && x.position == null)?.player_id ?? null
              : null;
          const machine = m.machine_id ? machineById[m.machine_id] : undefined;
          const machineName = String(machine?.name ?? "").trim();

          // Gewinnchancen je Spieler + Bestwerte im Match (nur im laufenden Match hervorheben)
          const base = list.map((x) => {
            const prof = profileOf[x.player_id];
            const wr = prof && machineName ? machineWr[`${prof}__${machineName}`] : undefined;
            return {
              x,
              hasProfile: !!prof,
              tWin: prof ? tWinOf(x.player_id) : null,
              mWin: wr?.winrate ?? null,
              mCount: wr?.matchesPlayed ?? 0,
            };
          });
          const tVals = base.map((b) => b.tWin).filter((v): v is number => v != null);
          const mVals = base.map((b) => b.mWin).filter((v): v is number => v != null);
          const maxT = tVals.length ? Math.max(...tVals) : null;
          const maxM = mVals.length ? Math.max(...mVals) : null;
          const withTop = base.map((b) => {
            const tTop = !finished && b.tWin != null && b.tWin === maxT;
            const mTop = !finished && b.mWin != null && b.mWin === maxM;
            return { ...b, tTop, mTop, greens: (tTop ? 1 : 0) + (mTop ? 1 : 0) };
          });
          // ★ Favorit: meiste grüne Werte, nur wenn eindeutig (wie Admin)
          const maxGreens = withTop.length ? Math.max(...withTop.map((b) => b.greens)) : 0;
          const favCount = withTop.filter((b) => b.greens === maxGreens).length;

          return {
            matchId: m.id,
            machineName: machineName || "Flipper",
            machineIcon: (machine?.icon_emoji ?? "").trim() || null,
            finished,
            players: withTop.map((b) => ({
              id: b.x.player_id,
              position: b.x.position,
              score: toScore(b.x.score),
              active: b.x.player_id === activeId,
              tWin: b.tWin,
              mWin: b.mWin,
              mCount: b.mCount,
              tTop: b.tTop,
              mTop: b.mTop,
              favorite: !finished && maxGreens > 0 && favCount === 1 && b.greens === maxGreens,
            })),
          };
        });
      return {
        roundId: r.id,
        number: Number(r.number) || 0,
        finished: String(r.status ?? "").toLowerCase() === "finished",
        matches: cards,
      };
    });

    const current = blocks.length ? blocks[blocks.length - 1] : null;

    // Aussetzer der aktuellen Runde: aktive Spieler, die in keinem Match stehen
    const inCurrent = new Set<string>();
    for (const c of current?.matches ?? []) for (const p of c.players) inCurrent.add(p.id);
    const sitOut = current
      ? players.filter((p) => p.active !== false && !inCurrent.has(p.id)).map((p) => p.id)
      : [];

    const perCycle = calcRoundsPerCycle(format, data?.tournament?.match_size ?? null, players.length);
    const bars = mainRoundBars(rounds, perCycle);

    return {
      current,
      archive: blocks.slice().reverse(), // neueste zuerst
      sitOut,
      perCycle,
      bars,
      matchSize: Math.max(2, Number(data?.tournament?.match_size ?? 2) || 2),
      playersCount: players.length,
      history,
      roundPointsMax,
    };
  }, [data, isMatchFormat, format, machineWr]);

  // ── Superfinale (nur wenn wirklich gespielt + abgeschlossen) ────────────────
  const superFinal = useMemo(() => {
    const f = data?.final;
    if (!f || f.status !== "finished" || !f.players?.length) return null;
    const target = Number(f.target_points ?? 0);
    const players = f.players.map((p) => ({
      playerId: p.player_id,
      name: "",
      seed: Number(p.seed) || 0,
      startPoints: Number(p.start_points) || 0,
      points: Number(p.points) || 0,
    }));
    const champion = players.find((p) => target > 0 && p.points >= target);
    // gleiche Logik wie Admin (lib/finals.ts)
    return computeFinalRanking({
      players,
      targetPoints: target,
      championId: champion?.playerId ?? null,
      finished: true,
    });
  }, [data]);

  // ── Ansichten (Tabs) je nach Modus + Turnierstatus ─────────────────────────
  // laufend:  Matchplay & Co: Aktuelle Runde ⇄ Alle Runden
  // beendet:  Siegerehrung ⇄ Alle Runden / Tabelle (⇄ 🔥 Superfinale, falls gespielt)
  const hasArchive = (matchView?.archive.length ?? 0) > 1;
  // Turnierserie anzeigen, sobald es Daten gibt (Serie oder heutige Turnierpunkte)
  const hasToday = isFinished && (series?.today?.length ?? 0) > 0;
  const hasSeries = (series?.rows?.length ?? 0) > 0 || (series?.nameRows?.length ?? 0) > 0 || hasToday;
  // beide inneren Reiter (Serie + Turniername) vorhanden → nach Turnierende doppelt so lange zeigen
  const seriesHasBoth = !!series?.category && !!series?.name;

  // 📈 Verlauf ("Rennen"): kumulierte Rundenpunkte je Spieler (Rotation inkl. vorläufiger Punkte)
  const raceData: RaceData = useMemo(
    () =>
      buildRaceData(
        (data?.players ?? []).map((p) => p.id),
        data?.rounds ?? [],
        data?.matches ?? [],
        data?.match_players ?? [],
        isRotation
      ),
    [data, isRotation]
  );
  const hasRace = raceData.rounds.length > 0;
  const racePlayers: RacePlayer[] = useMemo(
    () => view.rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon, color: r.color })),
    [view.rows]
  );
  // Rotation: Flippername unter der Rundennummer
  const raceRoundLabels: Record<number, string> | undefined = useMemo(() => {
    if (!isRotation) return undefined;
    const out: Record<number, string> = {};
    for (const c of view.columns) if (!out[c.roundNo]) out[c.roundNo] = c.machineName;
    return out;
  }, [isRotation, view.columns]);
  const tabs: TvTab[] = useMemo(() => {
    if (!data) return [];
    if (isFinished) {
      // Siegerehrung und Superfinale direkt hintereinander, dann Turnierpunkte/Serie, dann Runden/Tabelle
      const t: TvTab[] = ["podium"];
      if (superFinal) t.push("superfinal");
      if (hasSeries) t.push("series");
      t.push(isMatchFormat ? "archive" : "table");
      if (isMatchFormat && hasRace) t.push("race");
      return t;
    }
    const t: TvTab[] = [isMatchFormat ? "current" : "table"];
    if (isMatchFormat && hasArchive) t.push("archive");
    if (isMatchFormat && hasRace) t.push("race");
    if (hasSeries) t.push("series");
    return t.length > 1 ? t : [];
  }, [data, isFinished, isMatchFormat, hasArchive, superFinal, hasSeries, hasRace]);

  const [tvTab, setTvTab] = useState<TvTab>("current");
  const vtSupported = useViewTransitionSupport();
  const [autoTab, setAutoTab] = useState(true);

  // ── Ton: Trommelwirbel + Fanfare beim Turnierende (hier am TV statt am Admin-PC) ──
  // Browser erlauben Ton erst nach einem Klick auf der Seite -> einmalig "🔊 Ton aktivieren".
  const [soundOn, setSoundOn] = useState(false);
  const drumRef = useRef<HTMLAudioElement | null>(null);
  const fanfareRef = useRef<HTMLAudioElement | null>(null);

  async function enableSound() {
    try {
      const drum = new Audio("/sounds/drumroll.mp3");
      const fanfare = new Audio("/sounds/winner-fanfare.mp3");
      // stumm kurz abspielen = Ton für diese Seite freischalten
      for (const a of [drum, fanfare]) {
        a.muted = true;
        await a.play().catch(() => {});
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      }
      drum.volume = 0.8;
      fanfare.volume = 0.9;
      drumRef.current = drum;
      fanfareRef.current = fanfare;
      setSoundOn(true);
    } catch {
      setSoundOn(false);
    }
  }

  function playCelebration() {
    const drum = drumRef.current;
    const fanfare = fanfareRef.current;
    if (!drum || !fanfare) return;
    try {
      drum.currentTime = 0;
      drum.play().catch(() => {});
      setTimeout(() => {
        fanfare.currentTime = 0;
        fanfare.play().catch(() => {});
      }, 2200);
    } catch {
      /* ignore */
    }
  }

  // Übergang "läuft" -> "beendet" erkennen (nicht beim ersten Laden eines alten Turniers)
  const prevFinishedRef = useRef<boolean | null>(null);
  const prevSuperFinalRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!data) return;
    const sfDone = !!superFinal;
    const wasFinished = prevFinishedRef.current;
    const wasSf = prevSuperFinalRef.current;
    prevFinishedRef.current = isFinished;
    prevSuperFinalRef.current = sfDone;
    if (wasFinished === null) return; // erstes Laden: nur merken

    const justFinished = isFinished && !wasFinished;
    const sfJustFinished = sfDone && !wasSf;
    if (justFinished || sfJustFinished) {
      // direkt zur passenden Siegerehrung springen und Auto-Wechsel wieder an
      // aus einem Effekt heraus: kurz verschieben (flushSync darf nicht während des Renderns laufen)
      setTimeout(() => smoothSwitch(() => setTvTab(sfJustFinished ? "superfinal" : "podium")), 0);
      setAutoTab(true);
      if (soundOn) playCelebration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isFinished, superFinal]);
  // Tab gültig halten (z. B. wenn das Turnier gerade beendet wurde)
  const tabsKey = tabs.join("|");
  const activeTab: TvTab = tabs.includes(tvTab) ? tvTab : tabs[0] ?? (isMatchFormat ? "current" : "table");
  // Fortschrittsbalken bis zum nächsten automatischen Wechsel
  const [mainTimer, setMainTimer] = useState<TabTimer>(null);
  // Auto-Wechsel: solange das Turnier läuft, die Turnierserie überspringen
  // (wichtig ist dann die Tabelle / wer wo spielt) – per Klick bleibt sie erreichbar
  //   Matchplay & Co.: nur Aktuelle Runde ⇄ Verlauf (je 10 s) – "Alle Runden" + Serie per Klick
  const autoTabs: TvTab[] = isFinished
    ? tabs
    : isMatchFormat
    ? tabs.filter((t) => t === "current" || t === "race")
    : tabs.filter((t) => t !== "series");
  useEffect(() => {
    if (!autoTab || autoTabs.length < 2) {
      setMainTimer(null);
      return;
    }
    const ms = isFinished
      ? FINISHED_TAB_MS * ((activeTab === "series" && seriesHasBoth) || (activeTab === "table" && hasRace) ? 2 : 1)
      : TAB_DURATION_MS[activeTab];
    setMainTimer({ start: Date.now(), ms });
    const t = setTimeout(() => {
      const i = autoTabs.indexOf(activeTab);
      // steht man gerade auf einem übersprungenen Reiter (z. B. Serie angeklickt): zum ersten zurück
      smoothSwitch(() => setTvTab(i < 0 ? autoTabs[0] : autoTabs[(i + 1) % autoTabs.length]));
    }, ms);
    return () => clearTimeout(t);
    // ⚠️ nicht von "tabs" (neues Array bei jedem 5-s-Neuladen) abhängen, sonst startet der
    //    Zähler ständig neu und der Wechsel passiert nie → stabiler Schlüssel tabsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTab, tabsKey, activeTab, isFinished, seriesHasBoth, hasRace]);

  // Reiter "Tabelle" (Rotation & Co.): innen 📋 Tabelle ⇄ 📈 Verlauf – Umschalter sitzt oben in der Kopfzeile
  const showTableSub = !isMatchFormat && hasRace && activeTab === "table";
  const [tableSub, setTableSub] = useState<"table" | "race">("table");
  const [tableSubAuto, setTableSubAuto] = useState(true);
  useEffect(() => {
    if (activeTab === "table") setTableSub("table"); // jede Runde mit der Tabelle beginnen
  }, [activeTab]);
  const [subTimer, setSubTimer] = useState<TabTimer>(null);
  useEffect(() => {
    if (!showTableSub || !tableSubAuto) {
      setSubTimer(null);
      return;
    }
    // laufendes Turnier: Tabelle 15 s, Verlauf 10 s · nach Turnierende je 6 s
    const ms = isFinished ? FINISHED_TAB_MS : tableSub === "table" ? 15000 : 10000;
    setSubTimer({ start: Date.now(), ms });
    const t = setTimeout(() => smoothSwitch(() => setTableSub((v) => (v === "table" ? "race" : "table"))), ms);
    return () => clearTimeout(t);
  }, [showTableSub, tableSubAuto, tableSub, isFinished]);

  // ── Automatisch auf Bildschirmgröße einpassen ─────────────────────────────
  // Inhalt wird in fester Basisgröße gerendert, gemessen und dann per scale()
  // so verkleinert/vergrößert, dass alles ohne Scrollen auf einen Bildschirm passt.
  // Unter MIN_SCALE wird nicht weiter verkleinert (Lesbarkeit) – dann darf gescrollt werden.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = contentRef.current;
    const vp = viewportRef.current;
    if (!el || !vp) return;

    const measure = () => {
      // offsetWidth/-Height = Layoutgröße, unabhängig vom transform
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const availW = vp.clientWidth - 2 * FIT_PAD;
      const availH = vp.clientHeight - 2 * FIT_PAD;
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, availW / w, availH / h));
      setNatural((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      setScale((prev) => (Math.abs(prev - s) < 0.002 ? prev : s));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isRotation, !!data]);

  return (
    // fixed: eigene Vollfläche, unabhängig vom schmalen Standard-Layout der App
    <div
      ref={viewportRef}
      className="fixed inset-0 z-50 overflow-auto bg-[radial-gradient(ellipse_at_top,#1e1b4b_0%,#0b1020_55%,#05070d_100%)] text-white"
    >
      {/* Platzhalter in skalierter Größe (für Zentrierung + Scrollen nur im Notfall) */}
      <div
        style={{
          position: "relative",
          width: natural.w ? natural.w * scale : "100%",
          height: natural.h ? natural.h * scale : "auto",
          margin: `${FIT_PAD}px auto`,
        }}
      >
        {/* Inhalt in natürlicher Größe, per scale() auf Bildschirmgröße eingepasst */}
        <div
          ref={contentRef}
          style={{
            position: natural.w ? "absolute" : "static",
            top: 0,
            left: 0,
            width: "max-content",
            minWidth: 720,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* Kopfzeile */}
          <div className="mb-5 flex items-end justify-between gap-10">
            <div className="min-w-0">
              <div className="flex items-center gap-3 text-base font-semibold uppercase tracking-[0.2em] text-indigo-300">
                <span>{FORMAT_LABEL[format] ?? format}</span>
                {isFinished ? (
                  <span className="rounded-full bg-white/10 px-3 py-0.5 text-sm tracking-wider text-white/70">
                    abgeschlossen
                  </span>
                ) : (
                  <span className="flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-0.5 text-sm tracking-wider text-rose-300">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                    </span>
                    LIVE
                  </span>
                )}
                {data ? (
                  <PointsSystemTvChips
                    format={format}
                    matchSize={data?.tournament?.match_size ?? null}
                    nPlayers={Array.isArray(data?.players) ? data.players.length : 0}
                    showSuperFinal
                  />
                ) : null}
              </div>
              {/* leading-normal + py: verhindert abgeschnittene Ober-/Unterlängen */}
              <div className="flex min-w-0 items-center gap-5">
                <div className="max-w-[36ch] truncate py-1 text-5xl font-extrabold leading-normal tracking-tight">
                  {tournamentName}
                </div>
                {data?.tournament?.category ? (
                  <span className="max-w-[40ch] shrink-0 truncate rounded-full bg-indigo-400/15 px-3.5 py-0.5 text-xl font-semibold leading-snug text-indigo-200 ring-1 ring-indigo-300/30">
                    🏷️ {data.tournament.category}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="whitespace-nowrap pb-2 text-right text-sm text-white/50">
              {/* Ton einmalig freischalten (Browser-Vorgabe) */}
              <div className="mb-2 flex justify-end gap-2">
                {/* ☀️ Bildschirmschoner verhindern (Wake Lock + Mini-Video) */}
                <KeepAwake />
                {soundOn ? (
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300/80 ring-1 ring-emerald-300/30">
                    🔊 Ton an
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={enableSound}
                    className="animate-pulse rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-300/50 hover:bg-amber-400/25"
                    title="Einmal klicken, damit bei Turnierende Trommelwirbel + Fanfare abgespielt werden"
                  >
                    🔇 Ton aktivieren
                  </button>
                )}
              </div>
              {error ? (
                <span className="text-rose-300">{error}</span>
              ) : updatedAt ? (
                <>Stand {updatedAt.toLocaleTimeString("de-DE")}</>
              ) : (
                <>Lade …</>
              )}
              {isRotation ? (
                <div className="mt-2 flex items-center justify-end gap-2 text-white/60">
                  <span className="inline-block h-3.5 w-3.5 rounded bg-emerald-400/25 ring-1 ring-emerald-300/60" />
                  vorläufig – Flipper läuft noch
                </div>
              ) : null}
              {tabs.length > 1 || showTableSub ? (
                <div className="mt-2 flex items-center justify-end gap-2">
                  {showTableSub ? (
                    <div className="inline-flex overflow-hidden rounded-full bg-white/5 ring-1 ring-white/15">
                      {(
                        [
                          ["table", "📋 Tabelle"],
                          ["race", "📈 Verlauf"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            smoothSwitch(() => {
                              setTableSub(v);
                              setTableSubAuto(false);
                            });
                          }}
                          className={
                            "relative overflow-hidden px-3 py-1 text-sm font-semibold transition " +
                            (tableSub === v ? "bg-emerald-500 text-white" : "text-white/60 hover:bg-white/10")
                          }
                        >
                          {label}
                          {tableSub === v ? <TabProgress timer={subTimer} /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {tabs.length > 1 ? (
                  <>
                  <div className="inline-flex overflow-hidden rounded-full bg-white/5 ring-1 ring-white/15">
                    {tabs.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          smoothSwitch(() => {
                            setTvTab(t);
                            setAutoTab(false);
                          });
                        }}
                        className={
                          "relative overflow-hidden px-3 py-1 text-sm font-semibold transition " +
                          (activeTab === t
                            ? t === "superfinal"
                              ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white"
                              : "bg-indigo-500 text-white"
                            : "text-white/60 hover:bg-white/10")
                        }
                      >
                        {TAB_LABEL[t]}
                        {activeTab === t ? <TabProgress timer={mainTimer} /> : null}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoTab((a) => !a)}
                    title="Automatisch zwischen den Ansichten wechseln"
                    className={
                      "rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition " +
                      (autoTab
                        ? "bg-emerald-400/15 text-emerald-300 ring-emerald-300/40"
                        : "text-white/40 ring-white/15 hover:bg-white/10")
                    }
                  >
                    ⟳ Auto{autoTab ? <AutoCountdown timer={mainTimer ?? subTimer} /> : null}
                  </button>
                  </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <style>{TRANSITION_CSS}</style>
          {/* Fallback-Einblenden (nur ohne echtes Überblenden): neuer key = neue Ansicht */}
          <div
            key={`${activeTab}|${showTableSub ? tableSub : ""}`}
            style={vtSupported === false ? { animation: "tvFadeIn 0.6s ease both" } : undefined}
          >
          {!data && !error ? (
            <div className="py-24 text-center text-2xl text-white/50">Lade Turnier …</div>
          ) : isMatchFormat && matchView ? (
            // Match-Formate: rechte Spalte (Leaderboard + Fortschritt) bleibt immer stehen
            <MatchTvView
              mv={matchView}
              rows={rowsTp}
              eloOn={view.eloOn}
              tab={activeTab}
              superFinal={superFinal}
              series={series}
              isFinished={isFinished}
              race={hasRace ? <RaceChart data={raceData} players={racePlayers} width={1156} height={640} /> : null}
            />
          ) : activeTab === "podium" ? (
            <div className="w-[1500px]">
              <PodiumView rows={rowsTp} eloOn={view.eloOn} />
            </div>
          ) : activeTab === "superfinal" && superFinal ? (
            <div className="w-[1500px]">
              <SuperFinalView ranking={superFinal} rows={rowsTp} />
            </div>
          ) : activeTab === "series" && series ? (
            <div className="w-[1500px]">
              <SeriesView series={series} rows={rowsTp} isFinished={isFinished} />
            </div>
          ) : (
            // Tabelle ⇄ 📈 Verlauf (Umschalter oben in der Kopfzeile)
            showTableSub && tableSub === "race" ? (
              <RaceChart
                data={raceData}
                players={racePlayers}
                width={1500}
                height={Math.max(560, Math.min(760, 260 + racePlayers.length * 44))}
                roundLabels={raceRoundLabels}
              />
            ) : isRotation ? (
              <RotationTable rows={rowsTp} columns={view.columns} eloOn={view.eloOn} />
            ) : (
              <LeaderboardOnly rows={rowsTp} eloOn={view.eloOn} />
            )
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bausteine ────────────────────────────────────────────────────────────────

function PlayerAvatar({
  row,
  size = "h-9 w-9 text-lg",
}: {
  row: { name: string; icon: string | null; color: string | null };
  size?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-white/20 ${size} ${
        row.color ? "" : "bg-white/10"
      }`}
      style={row.color ? { backgroundColor: row.color } : undefined}
    >
      {row.icon ? row.icon : <span className="text-[0.6em] font-bold text-white/80">{initials(row.name)}</span>}
    </span>
  );
}

// Elo unter dem Spielernamen:
// - immer die Elo vom Turnierstart
// - bei Elo an und Veränderung: Start → aktuell (+/-Differenz), live nach jeder fertigen Runde
function EloLine({ row, eloOn }: { row: Row; eloOn: boolean }) {
  const start = row.eloStart != null ? Math.round(row.eloStart) : null;
  const now = row.eloNow != null ? Math.round(row.eloNow) : null;
  const base = start ?? now; // vor der ersten Runde gibt es evtl. noch keinen Startwert
  if (base == null) return null;

  const delta = eloOn && start != null && now != null ? now - start : 0;

  return (
    <div className="mt-0.5 text-[0.65em] font-medium tabular-nums text-white/45">
      Elo {base}
      {delta !== 0 ? (
        <>
          <span className="mx-1 text-white/30">→</span>
          <span className="text-white/80">{now}</span>
          <span className={`ml-1.5 font-bold ${delta > 0 ? "text-emerald-300" : "text-rose-300"}`}>
            ({delta > 0 ? "+" : ""}
            {delta})
          </span>
        </>
      ) : null}
    </div>
  );
}

function PlaceBadge({ place, total }: { place: number; total: number }) {
  const p = total > 0 ? podium(place) : null;
  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-lg font-extrabold tabular-nums ${
        p ? p.badge : "bg-white/10 text-white/70"
      }`}
    >
      {place}
    </span>
  );
}

// ── Fortschritt bis zum nächsten automatischen Wechsel ─────────────────────
type TabTimer = { start: number; ms: number } | null;

/** dünner Balken unten im aktiven Reiter, füllt sich bis zum Wechsel (reine CSS-Animation) */
function TabProgress({ timer }: { timer: TabTimer }) {
  if (!timer) return null;
  return <TabProgressBar key={timer.start} start={timer.start} ms={timer.ms} />;
}
function TabProgressBar({ start, ms }: { start: number; ms: number }) {
  // nur EINMAL pro Durchlauf berechnen (sonst springt der Balken bei jedem Neuladen)
  const [elapsed] = useState(() => Math.max(0, Math.min(ms, Date.now() - start)));
  const timer = { ms };
  return (
    <>
      <style>{`@keyframes tvTabProgress { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/20" />
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left bg-white"
        style={{
          animation: `tvTabProgress ${timer.ms}ms linear forwards`,
          animationDelay: `-${elapsed}ms`,
          boxShadow: "0 0 6px rgba(255,255,255,0.8)",
        }}
      />
    </>
  );
}

/** Restsekunden im "⟳ Auto"-Knopf */
function AutoCountdown({ timer }: { timer: TabTimer }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timer]);
  if (!timer) return null;
  const left = Math.max(0, Math.ceil((timer.start + timer.ms - now) / 1000));
  return <span className="ml-1.5 inline-block min-w-[2.2em] tabular-nums text-emerald-200/80">{left}s</span>;
}

function RotationTable({ rows, columns, eloOn }: { rows: Row[]; columns: Column[]; eloOn: boolean }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white/[0.04] ring-1 ring-white/10 shadow-2xl backdrop-blur">
      {/* feste Basisgröße – das Einpassen auf den Bildschirm übernimmt scale() */}
      <table className="w-full border-collapse text-[20px]">
        <thead>
          <tr className="align-bottom">
            <th className="px-3 pb-3 pt-4" />
            <th className="px-3 pb-3 pt-4 text-left text-sm font-semibold uppercase tracking-widest text-white/40">
              Spieler
            </th>
            {columns.map((c) => (
              <th key={c.matchId} className="px-2 pb-2 pt-3 text-center font-normal">
                <div className="mx-auto flex w-[8.5em] flex-col items-center gap-0.5">
                  {/* Flipper-Icon */}
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl text-2xl ring-1 ${
                      c.finished ? "bg-white/10 ring-white/20" : "bg-indigo-500/20 ring-indigo-300/40"
                    }`}
                  >
                    {c.machineIcon ?? (
                      <span className="text-base font-bold text-white/80">{initials(c.machineName)}</span>
                    )}
                  </span>
                  <div className="w-full truncate text-[0.95em] font-bold text-white" title={c.machineName}>
                    {c.machineName}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-white/40">
                    Runde {c.roundNo}
                    {c.finished ? " · fertig" : ""}
                  </div>
                  {/* Highscore */}
                  {c.highscore != null ? (
                    <div className="mt-0.5 w-full rounded-xl bg-amber-400/10 px-2 py-0.5 ring-1 ring-amber-300/30">
                      <div className="text-[0.8em] font-bold tabular-nums text-amber-300">
                        🏆 {scoreFmt.format(c.highscore)}
                      </div>
                      <div className="truncate text-xs text-amber-100/80" title={c.holder}>
                        {c.holder}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-0.5 w-full rounded-xl bg-white/5 px-2 py-0.5 text-xs leading-[2.2] text-white/30">
                      noch offen
                    </div>
                  )}
                </div>
              </th>
            ))}
            <th className="border-l border-white/10 px-4 pb-3 pt-4 text-right text-sm font-semibold uppercase tracking-widest text-white/40">
              Pkt
            </th>
            <th className="bg-white/[0.04] px-5 pb-3 pt-4 text-right text-sm font-semibold uppercase tracking-widest text-emerald-300/80">
              vorl.
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.total > 0 ? podium(r.place) : null;
            return (
              <tr
                key={r.id}
                className={`border-t border-white/[0.07] ${p ? `bg-gradient-to-r ${p.row} to-transparent` : ""}`}
              >
                <td className="relative py-2 pl-4 pr-2">
                  {p ? <span className={`absolute inset-y-1 left-0 w-1.5 rounded-r ${p.bar}`} /> : null}
                  <PlaceBadge place={r.place} total={r.total} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex max-w-[17em] items-center gap-3">
                    <PlayerAvatar row={r} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold leading-tight">{r.name}</span>
                        <TpChip tp={r.tp} bonus={r.tpBonus} />
                      </div>
                      <EloLine row={r} eloOn={eloOn} />
                    </div>
                  </div>
                </td>
                {columns.map((c) => {
                  const cell = c.cells[r.id];
                  if (!cell && c.activePlayerId === r.id) {
                    // ▶ spielt gerade an diesem Flipper
                    return (
                      <td key={c.matchId} className="px-1.5 py-1.5 text-center">
                        <div className="mx-auto flex w-[7.5em] flex-col items-center justify-center rounded-xl bg-sky-500/20 px-2 py-1 ring-2 ring-sky-400/80 shadow-[0_0_16px_rgba(56,189,248,0.45)]">
                          <span className="animate-pulse text-[1.1em] font-extrabold text-sky-300">▶</span>
                          <span className="text-[0.65em] font-semibold uppercase tracking-wider text-sky-200">
                            spielt
                          </span>
                        </div>
                      </td>
                    );
                  }
                  if (!cell) {
                    return (
                      <td key={c.matchId} className="px-2 py-2 text-center text-white/15">
                        ·
                      </td>
                    );
                  }
                  const cp = podium(cell.place);
                  return (
                    <td key={c.matchId} className="px-1.5 py-1.5 text-center">
                      <div
                        className={`mx-auto w-[7.5em] rounded-xl px-2 py-1 ${
                          cell.provisional
                            ? "bg-emerald-400/15 ring-1 ring-emerald-300/50"
                            : "bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[0.8em] font-extrabold tabular-nums ${
                              cp ? cp.badge : "bg-white/10 text-white/80"
                            }`}
                          >
                            {cell.place}.
                          </span>
                        </div>
                        {cell.score != null ? (
                          <div
                            className={`mt-0.5 text-[0.7em] tabular-nums ${
                              cell.provisional ? "text-emerald-200/90" : "text-white/55"
                            }`}
                          >
                            {scoreFmt.format(cell.score)}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
                <td className="border-l border-white/10 px-4 py-2 text-right text-[1.05em] tabular-nums text-white/45">
                  {r.real}
                </td>
                <td
                  className={`bg-white/[0.04] px-5 py-2 text-right text-[1.6em] font-extrabold tabular-nums ${
                    r.extra > 0 ? "text-emerald-300" : "text-white"
                  }`}
                >
                  {r.total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Match-Ansicht (Matchplay / Swiss / Round Robin) ─────────────────────────

type MatchViewData = {
  current: RoundBlock | null;
  archive: RoundBlock[];
  sitOut: string[];
  perCycle: number | null;
  bars: MainRoundBar[];
  matchSize: number;
  playersCount: number;
  history: Record<string, { round: number; points: number }[]>;
  roundPointsMax: number;
};

const pctFmt = (v: number | null) =>
  v == null ? "–" : `${v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

function MatchTvView({
  mv,
  rows,
  eloOn,
  tab,
  superFinal,
  series,
  isFinished,
  race,
}: {
  mv: MatchViewData;
  rows: Row[];
  eloOn: boolean;
  tab: TvTab;
  superFinal: SuperFinalRank[] | null;
  series: SeriesData | null;
  isFinished: boolean;
  /** 📈 Verlauf-Graph (fertig gerendert) */
  race?: React.ReactNode;
}) {
  const rowById: Record<string, Row> = {};
  for (const r of rows) rowById[r.id] = r;
  const cur = mv.current;

  return (
    <div className="grid w-[1640px] grid-cols-[minmax(0,1fr)_460px] gap-6">
      {/* LINKS: Siegerehrung / Superfinale / Archiv / aktuelle Runde */}
      <div className="min-w-0">
        {tab === "podium" ? (
          <PodiumView rows={rows} eloOn={eloOn} />
        ) : tab === "superfinal" && superFinal ? (
          <SuperFinalView ranking={superFinal} rows={rows} />
        ) : tab === "series" && series ? (
          <SeriesView series={series} rows={rows} isFinished={isFinished} />
        ) : tab === "race" && race ? (
          race
        ) : tab === "archive" ? (
          <ArchiveView blocks={mv.archive} rowById={rowById} />
        ) : !cur ? (
          <div className="rounded-3xl bg-white/[0.04] p-16 text-center text-2xl text-white/50 ring-1 ring-white/10">
            Noch keine Runde gestartet
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-end justify-between">
              <div className="text-4xl font-extrabold tracking-tight">
                Runde {cur.number}
                {mv.perCycle ? (
                  <span className="ml-3 text-xl font-semibold text-white/40">
                    · Hauptrunde {Math.ceil(cur.number / mv.perCycle)}
                  </span>
                ) : null}
              </div>
              <div
                className={`rounded-full px-4 py-1 text-base font-semibold ${
                  cur.finished ? "bg-emerald-400/15 text-emerald-300" : "bg-sky-400/15 text-sky-300"
                }`}
              >
                {cur.finished
                  ? "✓ Runde abgeschlossen – nächste Runde folgt"
                  : `${cur.matches.filter((m) => m.finished).length} / ${cur.matches.length} Matches fertig`}
              </div>
            </div>

            <div className={`grid gap-4 ${cur.matches.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {cur.matches.map((m) => (
                <MatchCardView key={m.matchId} m={m} rowById={rowById} />
              ))}
            </div>

            {mv.sitOut.length > 0 ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.04] px-5 py-3 text-lg ring-1 ring-white/10">
                <span className="text-white/50">setzt aus:</span>
                {mv.sitOut.map((id) => {
                  const r = rowById[id];
                  return r ? (
                    <span key={id} className="flex items-center gap-2 font-semibold">
                      <PlayerAvatar row={r} size="h-8 w-8 text-base" />
                      {r.name}
                    </span>
                  ) : null;
                })}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* RECHTS: Leaderboard + Rundenfortschritt (immer sichtbar) */}
      <div className="flex flex-col gap-5">
        <div className="overflow-hidden rounded-3xl bg-white/[0.04] shadow-2xl ring-1 ring-white/10">
          <div className="flex items-center justify-between px-5 pb-2 pt-4 text-sm font-semibold uppercase tracking-widest text-white/40">
            <span>Leaderboard</span>
            <span>Pkt</span>
          </div>
          {rows.map((r) => {
            const p = r.real > 0 ? podium(r.place) : null;
            return (
              <div
                key={r.id}
                className={`relative flex items-center gap-3 border-t border-white/[0.07] px-4 py-2 ${
                  p ? `bg-gradient-to-r ${p.row} to-transparent` : ""
                }`}
              >
                {p ? <span className={`absolute inset-y-1 left-0 w-1.5 rounded-r ${p.bar}`} /> : null}
                <PlaceBadge place={r.place} total={r.real} />
                <PlayerAvatar row={r} />
                <div className="min-w-0 flex-1 text-[20px]">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold leading-tight">{r.name}</span>
                    <TpChip tp={r.tp} bonus={r.tpBonus} />
                  </div>
                  <EloLine row={r} eloOn={eloOn} />
                </div>
                {/* Verlauf: Punkte pro Runde (wie im Admin-Leaderboard) */}
                <div className="shrink-0" title="Punkte pro Runde">
                  <RoundPointsBars
                    items={mv.history[r.id] ?? []}
                    scaleMax={mv.roundPointsMax}
                    width={96}
                    height={28}
                  />
                </div>
                <div className="w-12 text-right text-[28px] font-extrabold tabular-nums">{r.real}</div>
              </div>
            );
          })}
        </div>

        <RoundProgressCard mv={mv} />
      </div>
    </div>
  );
}

function MatchCardView({ m, rowById }: { m: MatchCard; rowById: Record<string, Row> }) {
  return (
    <div
      className={`overflow-hidden rounded-3xl ring-1 ${
        m.finished ? "bg-white/[0.04] ring-white/10" : "bg-indigo-500/[0.08] ring-indigo-300/30"
      }`}
    >
      {/* Kopf: Flipper */}
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl ring-1 ring-white/15">
          {m.machineIcon ?? <span className="text-base font-bold text-white/80">{initials(m.machineName)}</span>}
        </span>
        <div className="min-w-0 flex-1 truncate text-xl font-bold">{m.machineName}</div>
        <span
          className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${
            m.finished ? "bg-emerald-400/15 text-emerald-300" : "bg-sky-400/15 text-sky-300"
          }`}
        >
          {m.finished ? "fertig" : "läuft"}
        </span>
      </div>

      {/* Spieler in Startreihenfolge */}
      <div className="space-y-1.5 p-3">
        {m.players.map((p) => {
          const r = rowById[p.id];
          if (!r) return null;
          const pod = p.position != null ? podium(p.position) : null;
          const isWinner = m.finished && p.position === 1;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                p.active
                  ? "bg-sky-500/20 ring-2 ring-sky-400/80 shadow-[0_0_16px_rgba(56,189,248,0.35)]"
                  : isWinner
                  ? "bg-amber-400/10 ring-1 ring-amber-300/40"
                  : "bg-white/[0.04]"
              }`}
            >
              <PlayerAvatar row={r} size="h-9 w-9 text-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-lg font-bold">{r.name}</span>
                  {p.favorite ? (
                    <span className="text-lg text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" title="Favorit">
                      ★
                    </span>
                  ) : null}
                </div>
                {/* Gewinnchancen wie im Admin: Turnier-Winrate + Flipper-Winrate (Bestwerte grün) */}
                {p.tWin != null || p.mWin != null ? (
                  <div className="flex flex-wrap gap-x-3 text-[13px] tabular-nums text-white/45">
                    <span>
                      Turnier{" "}
                      <span className={p.tTop ? "font-bold text-emerald-300" : "text-white/70"}>{pctFmt(p.tWin)}</span>
                    </span>
                    <span>
                      Flipper{" "}
                      <span className={p.mTop ? "font-bold text-emerald-300" : "text-white/70"}>{pctFmt(p.mWin)}</span>
                      {p.mCount > 0 ? <span className="text-white/35"> ({p.mCount})</span> : null}
                    </span>
                  </div>
                ) : null}
              </div>
              {p.active ? (
                <span className="animate-pulse rounded-full bg-sky-500 px-3 py-0.5 text-sm font-bold text-white">
                  ▶ spielt
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  {p.score != null ? (
                    <span className="text-base tabular-nums text-white/60">{scoreFmt.format(p.score)}</span>
                  ) : null}
                  {p.position != null ? (
                    <span
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-base font-extrabold tabular-nums ${
                        pod ? pod.badge : "bg-white/10 text-white/80"
                      }`}
                    >
                      {p.position}.
                    </span>
                  ) : p.score == null ? (
                    <span className="text-white/25">–</span>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArchiveView({ blocks, rowById }: { blocks: RoundBlock[]; rowById: Record<string, Row> }) {
  return (
    <div>
      <div className="mb-4 text-4xl font-extrabold tracking-tight">Alle Runden</div>
      <div className="grid grid-cols-3 gap-4">
        {blocks.map((b) => (
          <div key={b.roundId} className="rounded-3xl bg-white/[0.04] p-4 ring-1 ring-white/10">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xl font-extrabold">Runde {b.number}</span>
              <span className={`text-xs font-semibold uppercase tracking-wider ${b.finished ? "text-emerald-300" : "text-sky-300"}`}>
                {b.finished ? "fertig" : "läuft"}
              </span>
            </div>
            <div className="space-y-2">
              {b.matches.map((m) => {
                const ordered = [...m.players].sort(
                  (a, c) => (a.position ?? 99) - (c.position ?? 99)
                );
                return (
                  <div key={m.matchId} className="rounded-2xl bg-white/[0.04] px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-sm text-white/60">
                      <span>{m.machineIcon ?? "🎰"}</span>
                      <span className="truncate font-semibold">{m.machineName}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-base">
                      {ordered.map((p) => {
                        const r = rowById[p.id];
                        const pod = p.position != null ? podium(p.position) : null;
                        return (
                          <span key={p.id} className="inline-flex items-center gap-1.5">
                            <span
                              className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-extrabold ${
                                pod ? pod.badge : "bg-white/10 text-white/70"
                              }`}
                            >
                              {p.position ?? "–"}
                            </span>
                            <span className="font-semibold">{r?.name ?? "?"}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundProgressCard({ mv }: { mv: MatchViewData }) {
  return (
    <div className="rounded-3xl bg-white/[0.04] p-5 shadow-2xl ring-1 ring-white/10">
      <div className="text-sm font-semibold uppercase tracking-widest text-white/40">Fortschritt Runden</div>
      <div className="mt-1 text-base text-white/60">
        {mv.playersCount} Spieler · {mv.matchSize} pro Match
        {mv.perCycle ? ` · ${mv.perCycle} Runden pro Hauptrunde` : ""}
      </div>
      {mv.bars.length === 0 ? (
        <div className="mt-3 text-base text-white/40">Noch keine Runden</div>
      ) : (
        <div className="mt-4 space-y-3">
          {mv.bars.map((b) => (
            <div key={b.label}>
              <div className="mb-1 flex items-baseline justify-between text-lg">
                <span className="font-bold">{b.label}</span>
                <span className="tabular-nums text-white/60">
                  {b.done}/{b.total} · {b.pct}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, b.pct)}%`, backgroundColor: b.color, boxShadow: `0 0 12px ${b.color}` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Siegerehrung ────────────────────────────────────────────────────────────

// Konfetti (rein dekorativ, deterministisch verteilt)
function Confetti({ count = 46 }: { count?: number }) {
  const colors = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb923c"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`@keyframes tvConfettiFall{0%{transform:translateY(-40px) rotate(0deg);opacity:0}10%{opacity:1}100%{transform:translateY(760px) rotate(540deg);opacity:0}}`}</style>
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 37) % 100;
        const delay = ((i * 53) % 70) / 10;
        const dur = 5 + ((i * 29) % 40) / 10;
        const size = 6 + ((i * 17) % 7);
        return (
          <span
            key={i}
            className="absolute top-0 rounded-sm"
            style={{
              left: `${left}%`,
              width: size,
              height: size * 0.45,
              backgroundColor: colors[i % colors.length],
              animation: `tvConfettiFall ${dur}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// Funkelnde Sterne im Hintergrund (rein dekorativ, deterministisch verteilt)
function Sparkles({ count = 22 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <style>{`@keyframes tvTwinkle{0%,100%{opacity:0;transform:scale(.4)}50%{opacity:1;transform:scale(1)}}`}</style>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute text-amber-200"
          style={{
            left: `${(i * 41 + 7) % 100}%`,
            top: `${(i * 23 + 11) % 70}%`,
            fontSize: 10 + ((i * 7) % 12),
            animation: `tvTwinkle ${2 + ((i * 13) % 30) / 10}s ease-in-out ${((i * 17) % 30) / 10}s infinite`,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

type PodiumEntry = { key: string; row: Row | null; name: string; value: string; sub?: React.ReactNode };

// Eine Podeststufe: Spieler oben drauf (bei Gleichstand mehrere), Sockel darunter
function PodiumStep({
  place,
  entries,
  height,
  accent,
}: {
  place: 1 | 2 | 3;
  entries: PodiumEntry[];
  height: number;
  accent: "gold" | "silver" | "bronze" | "fire";
}) {
  const sockel = {
    gold: "from-amber-300/90 via-amber-500/80 to-amber-700/70 ring-amber-200/60 shadow-[0_0_40px_rgba(251,191,36,0.45)]",
    silver: "from-slate-100/90 via-slate-300/80 to-slate-500/70 ring-slate-100/50 shadow-[0_0_28px_rgba(226,232,240,0.3)]",
    bronze: "from-orange-300/90 via-orange-500/80 to-orange-800/70 ring-orange-200/50 shadow-[0_0_28px_rgba(251,146,60,0.35)]",
    fire: "from-orange-400/90 via-rose-500/80 to-fuchsia-700/70 ring-orange-200/60 shadow-[0_0_50px_rgba(249,115,22,0.55)]",
  }[accent];
  const avatarSize = place === 1 ? "h-24 w-24 text-5xl" : "h-20 w-20 text-4xl";

  return (
    <div className="flex w-[300px] flex-col items-center">
      <div className="mb-3 flex min-h-[160px] flex-col items-center justify-end gap-3">
        {place === 1 ? <div className="text-6xl drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">🏆</div> : null}
        {entries.length === 0 ? (
          <div className="text-xl text-white/25">–</div>
        ) : (
          entries.map((e) => (
            <div key={e.key} className="flex flex-col items-center text-center">
              {e.row ? (
                <span
                  className={
                    place === 1
                      ? `relative rounded-full ${
                          accent === "fire"
                            ? "shadow-[0_0_36px_rgba(249,115,22,0.75)] ring-4 ring-orange-400/70"
                            : "shadow-[0_0_36px_rgba(251,191,36,0.75)] ring-4 ring-amber-300/70"
                        }`
                      : "relative rounded-full"
                  }
                >
                  {place === 1 ? (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-4xl drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]">
                      👑
                    </span>
                  ) : null}
                  <PlayerAvatar row={e.row} size={avatarSize} />
                </span>
              ) : null}
              <div className={`mt-2 max-w-[280px] truncate font-extrabold ${place === 1 ? "text-3xl" : "text-2xl"}`}>
                {e.name}
              </div>
              <div className="text-xl font-bold tabular-nums text-white/80">{e.value}</div>
              {e.sub ? <div className="text-[20px]">{e.sub}</div> : null}
            </div>
          ))
        )}
      </div>
      <div
        className={`flex w-full items-start justify-center rounded-t-3xl bg-gradient-to-b pt-4 ring-1 ${sockel}`}
        style={{ height }}
      >
        <span className="text-7xl font-black text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">{place}</span>
      </div>
    </div>
  );
}

/** Siegerpodest Hauptturnier: Top 3 nach Punkten (wie Leaderboard), darunter Platz 4–6 */
function PodiumView({ rows, eloOn }: { rows: Row[]; eloOn: boolean }) {
  const byPlace = (pl: number): PodiumEntry[] =>
    rows
      .filter((r) => r.place === pl && r.real > 0)
      .map((r) => ({
        key: r.id,
        row: r,
        name: r.name,
        value: `${r.real} Punkte`,
        sub: (
          <div className="flex flex-col items-center gap-1">
            <EloLine row={r} eloOn={eloOn} />
            <TpChip tp={r.tp} bonus={r.tpBonus} big />
          </div>
        ),
      }));
  const rest = rows.filter((r) => r.place >= 4 && r.place <= 6);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_bottom,rgba(251,191,36,0.28)_0%,rgba(99,102,241,0.14)_45%,rgba(0,0,0,0)_75%)] px-8 pb-8 pt-6 ring-1 ring-amber-300/30">
      {/* Scheinwerfer von oben auf das Podest */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[620px] w-[520px] -translate-x-1/2 bg-[conic-gradient(from_180deg_at_50%_0%,transparent_160deg,rgba(253,230,138,0.16)_180deg,transparent_200deg)]" />
      <Sparkles />
      <Confetti />
      <div className="relative text-center">
        <div className="bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-7xl font-black tracking-tight text-transparent drop-shadow-[0_0_24px_rgba(251,191,36,0.55)]">
          🏆 SIEGEREHRUNG 🏆
        </div>
        <div className="mt-1 text-sm font-semibold uppercase tracking-[0.4em] text-amber-200/70">
          Die Champions des Turniers
        </div>
      </div>
      <div className="relative mt-6 flex items-end justify-center gap-6">
        <PodiumStep place={2} entries={byPlace(2)} height={190} accent="silver" />
        <PodiumStep place={1} entries={byPlace(1)} height={260} accent="gold" />
        <PodiumStep place={3} entries={byPlace(3)} height={140} accent="bronze" />
      </div>
      {rest.length > 0 ? (
        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          {rest.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-2 ring-1 ring-white/10">
              <span className="text-xl font-extrabold text-white/50">{r.place}.</span>
              <PlayerAvatar row={r} size="h-9 w-9 text-lg" />
              <span className="text-xl font-bold">{r.name}</span>
              <span className="text-lg tabular-nums text-white/60">{r.real} P</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type SuperFinalRank = { playerId: string; seed: number; points: number; rank: number };

/** 🔥 Superfinale-Podest (nur wenn gespielt): Platz 1–3 auf dem Podest, Platz 4 darunter */
function SuperFinalView({ ranking, rows }: { ranking: SuperFinalRank[]; rows: Row[] }) {
  const rowById: Record<string, Row> = {};
  for (const r of rows) rowById[r.id] = r;
  const entry = (rank: number): PodiumEntry[] =>
    ranking
      .filter((x) => x.rank === rank)
      .map((x) => ({
        key: x.playerId,
        row: rowById[x.playerId] ?? null,
        name: rowById[x.playerId]?.name ?? "?",
        value: `${x.points} Final-Punkte`,
        sub: <span className="text-base text-white/50">Seed {x.seed}</span>,
      }));
  const rest = ranking.filter((x) => x.rank >= 4);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_bottom,rgba(249,115,22,0.35)_0%,rgba(190,18,60,0.18)_45%,rgba(0,0,0,0)_75%)] px-8 pb-8 pt-6 ring-1 ring-orange-400/30">
      <Confetti count={56} />
      <div className="relative text-center">
        <div className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 bg-clip-text text-7xl font-black italic tracking-tight text-transparent drop-shadow-[0_0_24px_rgba(249,115,22,0.6)]">
          🔥 SUPERFINALE 🔥
        </div>
        <div className="mt-1 text-sm font-semibold uppercase tracking-[0.4em] text-orange-200/70">Champion of Champions</div>
      </div>
      <div className="relative mt-6 flex items-end justify-center gap-6">
        <PodiumStep place={2} entries={entry(2)} height={190} accent="silver" />
        <PodiumStep place={1} entries={entry(1)} height={260} accent="fire" />
        <PodiumStep place={3} entries={entry(3)} height={140} accent="bronze" />
      </div>
      {rest.length > 0 ? (
        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          {rest.map((x) => (
            <div key={x.playerId} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-2 ring-1 ring-white/10">
              <span className="text-xl font-extrabold text-white/50">{x.rank}.</span>
              {rowById[x.playerId] ? <PlayerAvatar row={rowById[x.playerId]} size="h-9 w-9 text-lg" /> : null}
              <span className="text-xl font-bold">{rowById[x.playerId]?.name ?? "?"}</span>
              <span className="text-lg tabular-nums text-white/60">{x.points} Final-Punkte</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Goldener Hinweis "+6 TP" (Turnierpunkte heute, erst nach Turnierende)
// + separater oranger Hinweis "+2 🔥", wenn ein Superfinale-Bonus enthalten ist
function TpChip({ tp, bonus = 0, big = false }: { tp?: number | null; bonus?: number; big?: boolean }) {
  if (tp == null) return null;
  const size = big ? "px-3 py-0.5 text-lg" : "px-2 py-0.5 text-[0.7em]";
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span
        className={`inline-flex items-center rounded-full bg-amber-400/15 font-bold tabular-nums text-amber-300 ring-1 ring-amber-300/40 ${size}`}
        title="Turnierpunkte für die Turnierserie"
      >
        +{tp - bonus} TP
      </span>
      {bonus > 0 ? (
        <span
          className={`inline-flex items-center rounded-full bg-orange-500/20 font-bold tabular-nums text-orange-300 ring-1 ring-orange-400/50 ${size}`}
          title="Bonus-Turnierpunkte für den Sieg im Superfinale"
        >
          +{bonus} 🔥
        </span>
      ) : null}
    </span>
  );
}

// "+6 +2 🔥" als Text (Serien-Tabelle / Heute-Liste)
function TpText({ tp, bonus = 0 }: { tp: number; bonus?: number }) {
  return (
    <>
      +{tp - bonus}
      {bonus > 0 ? <span className="ml-1 text-[0.8em] text-orange-300">+{bonus}🔥</span> : null}
    </>
  );
}

const SERIES_MAX_ROWS = 16;

/** 📊 Turnierserie (gleiche Kategorie) – nach Turnierende zusätzlich "Heute" + Auf-/Abstieg */
function SeriesView({ series: seriesIn, rows, isFinished }: { series: SeriesData; rows: Row[]; isFinished: boolean }) {
  // Innere Reiter: 🏆 Serie (exakt gleiche Kategorie) ⇄ 🏷️ Turniername (exakt gleicher Name)
  const hasCat = !!seriesIn.category;
  const hasName = !!seriesIn.name;
  const [sub, setSub] = useState<"category" | "name">(hasCat ? "category" : "name");
  const [subAuto, setSubAuto] = useState(true);
  const [subTimer, setSubTimer] = useState<TabTimer>(null);
  // am TV klickt niemand: zur Hälfte der Anzeigezeit automatisch umschalten
  useEffect(() => {
    if (!subAuto || !hasCat || !hasName) return;
    const ms = isFinished ? FINISHED_TAB_MS : TAB_DURATION_MS.series / 2;
    setSubTimer({ start: Date.now(), ms });
    const t = setTimeout(() => smoothSwitch(() => setSub((v) => (v === "category" ? "name" : "category"))), ms);
    return () => clearTimeout(t);
  }, [sub, subAuto, hasCat, hasName, isFinished]);
  useEffect(() => {
    if (!subAuto) setSubTimer(null);
  }, [subAuto]);
  const byName = !hasCat || (hasName && sub === "name");

  // gleiche Darstellung, nur andere Zeilen/Überschrift
  const series: SeriesData = byName
    ? { ...seriesIn, category: seriesIn.name ?? "", rows: seriesIn.nameRows ?? [] }
    : seriesIn;
  const subBtn = (v: "category" | "name", label: string, value: string) => {
    const active = (v === "name") === byName;
    return (
      <button
        type="button"
        onClick={() => {
          smoothSwitch(() => {
            setSub(v);
            setSubAuto(false);
          });
        }}
        className={
          "relative min-w-0 max-w-[420px] overflow-hidden rounded-xl px-4 py-1.5 text-left transition " +
          (active ? "bg-indigo-500 text-white shadow-lg" : "text-white/55 hover:bg-white/10")
        }
      >
        <span className="block text-sm font-semibold uppercase tracking-widest">{label}</span>
        <span className={"block truncate text-xl font-extrabold " + (active ? "text-white" : "text-white/60")}>
          {value || "—"}
        </span>
        {active && hasCat && hasName ? <TabProgress timer={subTimer} /> : null}
      </button>
    );
  };
  const rowByPlayer: Record<string, Row> = {};
  for (const r of rows) rowByPlayer[r.id] = r;

  // Turnierpunkte heute je Profil (für "+X heute" und Auf-/Abstieg)
  const todayByProfile: Record<string, number> = {};
  const todayBonusByProfile: Record<string, number> = {};
  if (isFinished)
    for (const t of series.today)
      if (t.profileId) {
        todayByProfile[t.profileId] = t.tournamentPoints;
        todayBonusByProfile[t.profileId] = t.superFinalBonus ?? 0;
      }

  // Platz jetzt (Competition-Ranking nach Turnierpunkten)
  const placeOf = (list: { pts: number }[]) => {
    const out: number[] = [];
    list.forEach((x, i) => out.push(i > 0 && x.pts === list[i - 1].pts ? out[i - 1] : i + 1));
    return out;
  };
  const now = series.rows.map((r) => ({ r, pts: r.tournamentPoints }));
  const nowPlaces = placeOf(now);

  // Platz vor heute (nur sinnvoll nach Turnierende)
  const beforeRank: Record<string, number> = {};
  if (isFinished) {
    const before = series.rows
      .map((r) => ({ key: r.profileId ?? r.name, pts: r.tournamentPoints - (r.profileId ? todayByProfile[r.profileId] ?? 0 : 0) }))
      .filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts);
    const bp = placeOf(before);
    before.forEach((x, i) => (beforeRank[x.key] = bp[i]));
  }

  const shown = series.rows.slice(0, SERIES_MAX_ROWS);
  const hidden = series.rows.length - shown.length;
  const today = isFinished
    ? [...series.today].sort((a, b) => b.tournamentPoints - a.tournamentPoints)
    : [];

  return (
    <div className={`grid gap-6 ${today.length ? "grid-cols-[420px_minmax(0,1fr)]" : "grid-cols-1"}`}>
      {/* Heute */}
      {today.length ? (
        <div className="overflow-hidden rounded-3xl bg-amber-400/[0.06] shadow-2xl ring-1 ring-amber-300/30">
          <div className="px-5 pb-2 pt-4">
            <div className="text-sm font-semibold uppercase tracking-widest text-amber-300/80">Heute</div>
            <div className="text-2xl font-extrabold">Turnierpunkte</div>
          </div>
          {today.map((t) => {
            const r = rowByPlayer[t.playerId];
            const pod = t.finalRank != null ? podium(t.finalRank) : null;
            return (
              <div key={t.playerId} className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-2 text-[20px]">
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${
                    pod ? pod.badge : "bg-white/10 text-white/70"
                  }`}
                >
                  {t.finalRank ?? "–"}
                </span>
                {r ? <PlayerAvatar row={r} size="h-9 w-9 text-lg" /> : null}
                <span className="min-w-0 flex-1 truncate font-bold">{r?.name ?? "?"}</span>
                <span className="text-2xl font-extrabold tabular-nums text-amber-300">
                  <TpText tp={t.tournamentPoints} bonus={t.superFinalBonus ?? 0} />
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Serien-Tabelle */}
      <div className="overflow-hidden rounded-3xl bg-white/[0.04] shadow-2xl ring-1 ring-white/10">
        <div className="flex items-end justify-between px-6 pb-2 pt-4">
          <div className="flex min-w-0 gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10">
            {hasCat ? subBtn("category", "🏆 Serie", seriesIn.category) : null}
            {hasName ? subBtn("name", "🏷️ Turniername", seriesIn.name ?? "") : null}
          </div>
          <div className="text-sm text-white/40">
            {isFinished ? "inkl. heute" : "Stand vor heute"} · nur beendete Turniere
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="px-6 pb-6 text-lg text-white/40">Noch keine beendeten Turniere {byName ? "mit diesem Namen" : "in dieser Kategorie"}.</div>
        ) : (
          <table className="w-full border-collapse text-[20px]">
            <thead>
              <tr className="text-sm uppercase tracking-widest text-white/40">
                <th className="px-4 py-2 text-left font-semibold">#</th>
                <th className="px-2 py-2 text-left font-semibold">Spieler</th>
                <th className="px-3 py-2 text-right font-semibold">Turniere</th>
                <th className="px-3 py-2 text-right font-semibold">Siege</th>
                {isFinished ? <th className="px-3 py-2 text-right font-semibold">Heute</th> : null}
                <th className="px-6 py-2 text-right font-semibold">TP</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const place = nowPlaces[i];
                const p = podium(place);
                const key = r.profileId ?? r.name;
                const todayTp = r.profileId ? todayByProfile[r.profileId] : undefined;
                const prev = beforeRank[key];
                const move = isFinished && prev != null ? prev - place : null;
                const isNew = isFinished && prev == null && (todayTp ?? 0) > 0;
                return (
                  <tr key={key} className={`border-t border-white/[0.07] ${p ? `bg-gradient-to-r ${p.row} to-transparent` : ""}`}>
                    <td className="px-4 py-1.5">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-extrabold ${
                          p ? p.badge : "bg-white/10 text-white/70"
                        }`}
                      >
                        {place}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar row={r} size="h-9 w-9 text-lg" />
                        <span className="truncate font-bold">{r.name}</span>
                        {move != null && move !== 0 ? (
                          <span className={`text-base font-bold ${move > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {move > 0 ? `▲${move}` : `▼${-move}`}
                          </span>
                        ) : null}
                        {isNew ? <span className="text-xs font-bold text-sky-300">NEU</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-white/50">{r.tournamentsPlayed}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-white/50">{r.firstPlaces}</td>
                    {isFinished ? (
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold text-amber-300">
                        {todayTp != null ? (
                          <TpText tp={todayTp} bonus={r.profileId ? todayBonusByProfile[r.profileId] ?? 0 : 0} />
                        ) : (
                          ""
                        )}
                      </td>
                    ) : null}
                    <td className="px-6 py-1.5 text-right text-[1.3em] font-extrabold tabular-nums">{r.tournamentPoints}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {hidden > 0 ? (
          <div className="border-t border-white/[0.07] px-6 py-2 text-base text-white/40">+ {hidden} weitere Spieler</div>
        ) : null}
      </div>
    </div>
  );
}

function LeaderboardOnly({ rows, eloOn }: { rows: Row[]; eloOn: boolean }) {
  return (
    <div className="w-[52rem] overflow-hidden rounded-3xl bg-white/[0.04] ring-1 ring-white/10 shadow-2xl">
      <table className="w-full border-collapse text-[26px]">
        <thead>
          <tr>
            <th className="px-4 pb-3 pt-4" />
            <th className="px-3 pb-3 pt-4 text-left text-sm font-semibold uppercase tracking-widest text-white/40">
              Spieler
            </th>
            <th className="px-6 pb-3 pt-4 text-right text-sm font-semibold uppercase tracking-widest text-white/40">
              Punkte
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.real > 0 ? podium(r.place) : null;
            return (
              <tr
                key={r.id}
                className={`border-t border-white/[0.07] ${p ? `bg-gradient-to-r ${p.row} to-transparent` : ""}`}
              >
                <td className="relative py-2.5 pl-5 pr-2">
                  {p ? <span className={`absolute inset-y-1 left-0 w-1.5 rounded-r ${p.bar}`} /> : null}
                  <PlaceBadge place={r.place} total={r.real} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar row={r} size="h-11 w-11 text-xl" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold leading-tight">{r.name}</span>
                        <TpChip tp={r.tp} bonus={r.tpBonus} />
                      </div>
                      <EloLine row={r} eloOn={eloOn} />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-2.5 text-right text-[1.2em] font-extrabold tabular-nums">{r.real}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
