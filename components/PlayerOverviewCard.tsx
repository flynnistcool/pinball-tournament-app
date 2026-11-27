"use client";

// 📊 Überblick-Karte ganz oben im Spieler-Tab "Statistiken":
// fasst das Wichtigste aus den Blöcken darunter zusammen (Elo, Matches, Turniere, Super-Finale,
// Platzierungen, Form, Lieblingsflipper, Erzfeind/Lieblingsgegner, Serien).
// Gegner + Form/Serien: /api/players/rivals (lib/rivals.ts, lib/matchStreaks.ts).

import { useEffect, useState, type ReactNode } from "react";
import type { RivalStat } from "@/lib/rivals";
import type { OverallForm, StreakInfo } from "@/lib/matchStreaks";

type Placements = { "1": number; "2": number; "3": number; "4": number; other?: number };

export type OverviewStats = {
  matchesPlayed: number;
  matchWinRate: number | null; // 0–1
  placements: Placements;
  tournamentsPlayed: number;
  tournamentPlacements: Placements;
  finalsPlayed: number;
  finalsPlacements: Placements;
};

export type OverviewMachineStat = {
  machineName: string | null;
  matchesPlayed: number;
  wins: number;
};

type RivalsResp = {
  ok: boolean;
  nemesis?: RivalStat[];
  favorite?: RivalStat[];
  streak?: RivalStat[];
  lossStreak?: RivalStat[];
  profiles?: Record<string, { name: string }>;
  overall?: OverallForm | null;
};

const fmtPct = (v: number) => `${Math.round(v)} %`;
const fmtDec = (v: number) => v.toFixed(2).replace(".", ",");
const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "?");
const fmtRange = (s: StreakInfo) =>
  `${fmtDay(s.from)}${s.to && fmtDay(s.to) !== fmtDay(s.from) ? ` – ${fmtDay(s.to)}` : ""}` +
  (s.tournaments > 1 ? ` · ${s.tournaments} Turniere` : "");

/** Lieblingsflipper: beste Siegquote über alle Locations (mind. 10 Spiele, sonst mind. 5) */
export function favoriteMachine(list: readonly OverviewMachineStat[]) {
  const by = new Map<string, { name: string; plays: number; wins: number }>();
  for (const m of list) {
    const name = String(m.machineName ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const a = by.get(key) ?? { name, plays: 0, wins: 0 };
    a.plays += Number(m.matchesPlayed ?? 0);
    a.wins += Number(m.wins ?? 0);
    by.set(key, a);
  }
  const all = Array.from(by.values());
  for (const min of [10, 5]) {
    const cand = all.filter((a) => a.plays >= min);
    if (!cand.length) continue;
    cand.sort((a, b) => b.wins / b.plays - a.wins / a.plays || b.plays - a.plays);
    return { ...cand[0], rate: (cand[0].wins / cand[0].plays) * 100 };
  }
  return null;
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className={"text-lg font-bold tabular-nums leading-tight " + (tone ?? "text-neutral-900")}>{value}</div>
      {sub ? <div className="text-[11px] text-neutral-500">{sub}</div> : null}
    </div>
  );
}

const PLACE_COLORS = ["bg-emerald-500", "bg-slate-400", "bg-amber-600", "bg-slate-600", "bg-neutral-300"];

export default function PlayerOverviewCard({
  profileId,
  name,
  rating,
  rank,
  gap,
  peak,
  sinceStart,
  lastDelta,
  stats,
  machineStats,
}: {
  profileId: string;
  name: string;
  rating: number | null;
  /** Platz in der Elo-Rangliste */
  rank: { pos: number; total: number } | null;
  /** Elo-Abstand: als #1 zum Zweiten (positiv), sonst zum Platz davor (negativ) */
  gap?: { diff: number; otherName: string; otherPos: number } | null;
  peak: number | null;
  /** Elo-Änderung seit dem Start-Elo */
  sinceStart: number | null;
  /** Elo-Änderung im letzten Turnier */
  lastDelta: number | null;
  stats: OverviewStats | null;
  machineStats: readonly OverviewMachineStat[];
}) {
  const [riv, setRiv] = useState<RivalsResp | null>(null);
  const [rivErr, setRivErr] = useState(false);
  // 🥊 Rivalen-Bot dieses Spielers (falls angelegt)
  const [rivalBots, setRivalBots] = useState<
    { botId: string; name: string; start: number; strength: number; wins: number; losses: number }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setRivalBots(null);
    fetch(`/api/players/rival-bot?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setRivalBots(j?.ok && Array.isArray(j.rivals) ? j.rivals : []))
      .catch(() => !cancelled && setRivalBots([]));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    setRiv(null);
    setRivErr(false);
    fetch(`/api/players/rivals?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: RivalsResp) => {
        if (cancelled) return;
        if (j?.ok) setRiv(j);
        else setRivErr(true);
      })
      .catch(() => !cancelled && setRivErr(true));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Matches / Platzierungen
  const pl = stats?.placements;
  const counts = pl ? [pl["1"] ?? 0, pl["2"] ?? 0, pl["3"] ?? 0, pl["4"] ?? 0, pl.other ?? 0] : [0, 0, 0, 0, 0];
  const placedTotal = counts.reduce((a, b) => a + b, 0);
  const avgPlace =
    placedTotal - counts[4] > 0
      ? (1 * counts[0] + 2 * counts[1] + 3 * counts[2] + 4 * counts[3]) / (placedTotal - counts[4])
      : null;
  const winRate = stats?.matchWinRate != null ? stats.matchWinRate * 100 : null;

  const tWins = stats?.tournamentPlacements?.["1"] ?? 0;
  const fWins = stats?.finalsPlacements?.["1"] ?? 0;

  const favM = favoriteMachine(machineStats);

  const nameOf = (id: string | undefined) => (id ? riv?.profiles?.[id]?.name ?? "?" : "?");
  const nemesis = riv?.nemesis?.[0] ?? null;
  const favorite = riv?.favorite?.[0] ?? null;
  const duelStreak = riv?.streak?.[0] ?? null;
  const duelLossStreak = riv?.lossStreak?.[0] ?? null;
  const overall = riv?.overall ?? null;

  const deltaTxt = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(Math.round(d))}`;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span>📊 Überblick</span>
        <span className="truncate text-neutral-500">– {name}</span>
      </div>

      {/* Elo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat
          label="Elo"
          value={rating != null ? Math.round(rating) : "–"}
          tone="text-emerald-700"
          sub={rank ? `#${rank.pos} von ${rank.total}` : undefined}
        />
        <Stat label="Peak-Elo" value={peak != null ? Math.round(peak) : "–"} />
        <Stat
          label="seit Beginn"
          value={sinceStart != null ? deltaTxt(sinceStart) : "–"}
          tone={sinceStart == null || sinceStart === 0 ? "text-neutral-700" : sinceStart > 0 ? "text-emerald-700" : "text-red-600"}
        />
        <Stat
          label="Abstand"
          value={gap ? deltaTxt(gap.diff) : "–"}
          tone={!gap || gap.diff === 0 ? "text-neutral-700" : gap.diff > 0 ? "text-emerald-700" : "text-red-600"}
          sub={gap ? `${gap.diff >= 0 ? "vor" : "hinter"} #${gap.otherPos} (${gap.otherName})` : undefined}
        />
        <Stat
          label="letztes Turnier"
          value={lastDelta != null ? `${lastDelta > 0 ? "▲" : lastDelta < 0 ? "▼" : "•"} ${deltaTxt(lastDelta)}` : "–"}
          tone={lastDelta == null || lastDelta === 0 ? "text-neutral-700" : lastDelta > 0 ? "text-emerald-700" : "text-red-600"}
        />
      </div>

      <div className="my-3 h-px bg-neutral-200/70" />

      {/* Matches / Turniere / Super-Finale */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Matches" value={stats?.matchesPlayed ?? "–"} />
        <Stat
          label="Winrate"
          value={winRate != null ? fmtPct(winRate) : "–"}
          tone={winRate == null ? undefined : winRate > 50 ? "text-emerald-700" : winRate < 50 ? "text-red-600" : undefined}
        />
        <Stat label="Ø-Platz" value={avgPlace != null ? fmtDec(avgPlace) : "–"} />
        <Stat label="🏆 Turniersiege" value={stats ? `${tWins} / ${stats.tournamentsPlayed}` : "–"} />
        <Stat label="👑 Super-Finale" value={stats ? `${fWins} / ${stats.finalsPlayed}` : "–"} />
      </div>

      {/* Matchplatzierungen */}
      {placedTotal > 0 ? (
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-neutral-500">Matchplatzierungen</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
            {counts.map((c, i) =>
              c > 0 ? (
                <div key={i} className={PLACE_COLORS[i]} style={{ width: `${(c / placedTotal) * 100}%` }} title={`${i < 4 ? `${i + 1}. Platz` : "weitere"}: ${c}`} />
              ) : null
            )}
          </div>
          <div className="mt-2 divide-y divide-neutral-100 text-[13px] text-neutral-700">
            {counts.map((c, i) =>
              i < 4 || c > 0 ? (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="inline-flex items-center gap-2">
                    <span className={"inline-block h-2.5 w-2.5 rounded-full " + PLACE_COLORS[i]} />
                    {i < 4 ? `${i + 1}. Platz` : "weitere Plätze"}
                  </span>
                  <span className="tabular-nums">
                    <span className="font-semibold text-neutral-900">{c}</span>
                    <span className="ml-2 inline-block w-14 text-right text-[12px] text-neutral-500">
                      {((c / placedTotal) * 100).toFixed(1).replace(".", ",")} %
                    </span>
                  </span>
                </div>
              ) : null
            )}
          </div>
        </div>
      ) : null}

      <div className="my-3 h-px bg-neutral-200/70" />

      {/* Form, Flipper, Gegner, Serien */}
      <div className="space-y-1.5 text-[13px] text-neutral-700">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">Form (letzte 10)</span>
          {overall && overall.form.length ? (
            <span className="inline-flex items-center gap-1">
              {overall.form.map((w, i) => (
                <span
                  key={i}
                  className={
                    "inline-block h-3 w-3 rounded-full " + (w ? "bg-emerald-500" : "border-2 border-red-400 bg-white")
                  }
                  title={w ? "Sieg" : "Niederlage"}
                />
              ))}
              <span className="ml-1 text-[11px] text-neutral-400">alt → neu</span>
            </span>
          ) : (
            <span className="text-neutral-400">{riv || rivErr ? "–" : "lädt…"}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">❤️ Lieblingsflipper</span>
          {favM ? (
            <span>
              <span className="font-semibold text-neutral-900">{favM.name}</span> – {fmtPct(favM.rate)} gewonnen ({favM.plays} Spiele)
            </span>
          ) : (
            <span className="text-neutral-400">–</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">😈 Erzfeind</span>
          {nemesis ? (
            <span>
              <span className="font-semibold text-neutral-900">{nameOf(nemesis.profileId)}</span> – Bilanz {nemesis.wins} : {nemesis.losses}
            </span>
          ) : (
            <span className="text-neutral-400">{riv ? "keiner – niemand hat eine bessere Bilanz gegen dich" : "–"}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">😎 Lieblingsgegner</span>
          {favorite ? (
            <span>
              <span className="font-semibold text-neutral-900">{nameOf(favorite.profileId)}</span> – Bilanz {favorite.wins} :{" "}
              {favorite.losses} ({fmtPct(favorite.winrate)})
            </span>
          ) : (
            <span className="text-neutral-400">–</span>
          )}
        </div>

        {rivalBots && rivalBots.length
          ? rivalBots.map((rb) => (
              <div key={rb.botId} className="flex flex-wrap items-center gap-2">
                <span className="w-52 shrink-0 text-neutral-500">🥊 Rivale</span>
                <span>
                  <span className="font-semibold text-neutral-900">{rb.name}</span> – Bilanz{" "}
                  <span className={"font-semibold " + (rb.wins > rb.losses ? "text-emerald-700" : rb.wins < rb.losses ? "text-red-600" : "")}>
                    {rb.wins} : {rb.losses}
                  </span>{" "}
                  · Stärke <span className="font-semibold tabular-nums">{rb.strength}</span>{" "}
                  <span className="text-[11px] text-neutral-500">(Start {rb.start})</span>
                </span>
              </div>
            ))
          : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">🔥 Längste Siegesserie</span>
          {overall?.longestWin ? (
            <span>
              <span className="font-semibold text-emerald-700">{overall.longestWin.length} Matches</span>{" "}
              <span className="text-[11px] text-neutral-500">({fmtRange(overall.longestWin)})</span>
            </span>
          ) : (
            <span className="text-neutral-400">–</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">🥶 Längste Niederlagenserie</span>
          {overall?.longestLoss ? (
            <span>
              <span className="font-semibold text-red-600">{overall.longestLoss.length} Matches</span>{" "}
              <span className="text-[11px] text-neutral-500">({fmtRange(overall.longestLoss)})</span>
            </span>
          ) : (
            <span className="text-neutral-400">{overall ? "noch keine Niederlage" : "–"}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">⚔️ Beste Serie gegen</span>
          {duelStreak ? (
            <span>
              <span className="font-semibold text-neutral-900">{nameOf(duelStreak.profileId)}</span> –{" "}
              {duelStreak.bestStreak} Siege in Folge
            </span>
          ) : (
            <span className="text-neutral-400">–</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 text-neutral-500">🥶 Schlechteste Serie gegen</span>
          {duelLossStreak ? (
            <span>
              <span className="font-semibold text-neutral-900">{nameOf(duelLossStreak.profileId)}</span> –{" "}
              <span className="text-red-600">{duelLossStreak.worstLossStreak} Niederlagen in Folge</span>
            </span>
          ) : (
            <span className="text-neutral-400">{riv ? "nie 3× in Folge gegen denselben verloren" : "–"}</span>
          )}
        </div>

        {overall && overall.current !== 0 && Math.abs(overall.current) >= 2 ? (
          <div className="pt-1 text-[12px] text-neutral-500">
            Aktuell:{" "}
            <span className={"font-semibold " + (overall.current > 0 ? "text-emerald-700" : "text-red-600")}>
              {Math.abs(overall.current)} {overall.current > 0 ? "Siege" : "Niederlagen"} in Folge
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
