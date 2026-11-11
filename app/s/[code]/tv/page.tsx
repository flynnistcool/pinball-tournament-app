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

const REFRESH_MS = 5000;
const FIT_PAD = 20; // Rand um den Inhalt (px)
const MIN_SCALE = 0.45; // kleiner wird es nicht (Lesbarkeit), dann wird gescrollt
const MAX_SCALE = 2; // bei wenigen Spielern darf vergrößert werden

type Player = { id: string; name: string | null; active?: boolean; profile_id?: string | null };
type Machine = { id: string; name: string | null; icon_emoji?: string | null };
type Profile = { id: string; icon?: string | null; color?: string | null };
type Round = { id: string; number: number; format: string | null; status: string | null };
type Match = { id: string; round_id: string; machine_id: string | null };
type MatchPlayer = {
  match_id: string;
  player_id: string;
  position: number | null;
  score: number | string | null;
};
type PublicTournament = {
  tournament?: { name?: string | null; code?: string | null; format?: string | null; status?: string | null };
  players?: Player[];
  profiles?: Profile[];
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
};

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

        columns.push({
          matchId: m.id,
          roundNo: roundById[m.round_id]?.number ?? 0,
          machineName: String(machine?.name ?? "—"),
          machineIcon: (machine?.icon_emoji ?? "").trim() || null,
          finished: list.length > 0 && list.every((x) => x.position != null),
          highscore,
          holder,
          cells,
        });
      }
    }

    return { rows, columns };
  }, [data, isRotation]);

  const tournamentName = data?.tournament?.name ?? "Turnier";

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
              </div>
              {/* leading-normal + py: verhindert abgeschnittene Ober-/Unterlängen */}
              <div className="max-w-[36ch] truncate py-1 text-5xl font-extrabold leading-normal tracking-tight">
                {tournamentName}
              </div>
            </div>
            <div className="whitespace-nowrap pb-2 text-right text-sm text-white/50">
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
            </div>
          </div>

          {!data && !error ? (
            <div className="py-24 text-center text-2xl text-white/50">Lade Turnier …</div>
          ) : isRotation ? (
            <RotationTable rows={view.rows} columns={view.columns} />
          ) : (
            <LeaderboardOnly rows={view.rows} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bausteine ────────────────────────────────────────────────────────────────

function PlayerAvatar({ row, size = "h-9 w-9 text-lg" }: { row: Row; size?: string }) {
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

function RotationTable({ rows, columns }: { rows: Row[]; columns: Column[] }) {
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
              <th key={c.matchId} className="px-2 pb-3 pt-4 text-center font-normal">
                <div className="mx-auto flex w-[8.5em] flex-col items-center gap-1">
                  {/* Flipper-Icon */}
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ring-1 ${
                      c.finished ? "bg-white/10 ring-white/20" : "bg-indigo-500/20 ring-indigo-300/40"
                    }`}
                  >
                    {c.machineIcon ?? (
                      <span className="text-xl font-bold text-white/80">{initials(c.machineName)}</span>
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
                    <div className="mt-1 w-full rounded-xl bg-amber-400/10 px-2 py-1 ring-1 ring-amber-300/30">
                      <div className="text-[0.8em] font-bold tabular-nums text-amber-300">
                        🏆 {scoreFmt.format(c.highscore)}
                      </div>
                      <div className="truncate text-xs text-amber-100/80" title={c.holder}>
                        {c.holder}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 w-full rounded-xl bg-white/5 px-2 py-1 text-xs leading-[2.2] text-white/30">
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
                  <div className="flex max-w-[13em] items-center gap-3">
                    <PlayerAvatar row={r} />
                    <span className="truncate font-bold">{r.name}</span>
                  </div>
                </td>
                {columns.map((c) => {
                  const cell = c.cells[r.id];
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

function LeaderboardOnly({ rows }: { rows: Row[] }) {
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
                    <span className="truncate font-bold">{r.name}</span>
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
