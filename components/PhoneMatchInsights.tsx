"use client";

// 📊 Infos zum Match auf der Handy-Seite (Reiter "Mein Match"), wie im Admin-Match-Kopf:
// 🏆 Highscore / 📅 30 Tage des Flippers, wie oft Flipper und Paarung im Turnier dran waren,
// je Spieler Turnier-Winrate, Flipper-Winrate (an dieser Location) und 💪 persönlicher Highscore.
// Quellen (alle öffentlich, nur lesend):
// - /api/public/machine-records (geteilter Cache aus MatchRecordsLine, alle 5 Min.)
// - /api/public/machine-winrates (hier, alle 5 Min.)
// - Turnierdaten der Handy-Seite (MmData) für alles Live

import { useEffect, useMemo, useState } from "react";
import { useMachineRecords } from "@/components/MatchRecordsLine";
import { isPremiere, personalForMachine, recordsForMachine, type ShownRecord } from "@/lib/matchRecords";
import { liveEntriesFrom, machineKey, personalKey } from "@/lib/recordWatch";
import PlayerMachineHistory, { OpponentBalance } from "@/components/PlayerMachineHistory";
import { levelText } from "@/lib/scoreForm";
import { bottomIds, topIds, tournamentWinrates } from "@/lib/matchInsights";
import { computeStreaks, streakMode } from "@/lib/winStreaks";
import StreakFire from "@/components/StreakFire";
import { useBadgeOn } from "@/components/DisplayDevice";
import RivalryBadge, { rtpRefreshKey, useRivalry, useRivalryDataShared } from "@/components/RivalryBadge";
import { liveMachineSigFromData } from "@/lib/titleDefender";
import { DefenderBadge, LastWinnerBadge, defenderFor, lastWinnerFor } from "@/components/TitleDefender";
import { pairKey, type RivalryInsight } from "@/lib/rivalryInsights";
import BotEloBadge from "@/components/BotEloBadge";
import { chanceShortTitle, favoriteBreakdown, favoriteTitle, h2hFromPairMachine, pickFavorite, type FavoriteResult } from "@/lib/favorite";
import ChanceChip, { chanceTone } from "@/components/ChanceChip";
import { formatLabel } from "@/lib/formatLabel";
import { getChanceSnapshot, saveChanceSnapshot } from "@/lib/chanceSnapshots";
import type { MmData, MyMatchInfo } from "@/lib/myMatch";

const WINRATE_REFRESH_MS = 5 * 60_000;
const fmt = new Intl.NumberFormat("de-DE");

type MwrRow = { profileId: string; machineName: string; matchesPlayed: number; wins: number; winrate: number | null };

// geteilter Cache je Turniercode (mehrere Karten / Neu-Rendern → nur eine Abfrage)
const mwrCache = new Map<string, { at: number; rows: MwrRow[] | null; promise: Promise<MwrRow[] | null> | null }>();

function loadMachineWinrates(code: string): Promise<MwrRow[] | null> {
  const hit = mwrCache.get(code);
  if (hit?.promise) return hit.promise;
  if (hit?.rows && Date.now() - hit.at < WINRATE_REFRESH_MS) return Promise.resolve(hit.rows);
  const promise = fetch(`/api/public/machine-winrates?code=${encodeURIComponent(code)}&_ts=${Date.now()}`, {
    cache: "no-store",
  })
    .then((r) => r.json())
    .then((j) => (Array.isArray(j?.rows) ? (j.rows as MwrRow[]) : hit?.rows ?? null))
    .catch(() => hit?.rows ?? null)
    .then((rows) => {
      mwrCache.set(code, { at: Date.now(), rows, promise: null });
      return rows;
    });
  mwrCache.set(code, { at: hit?.at ?? 0, rows: hit?.rows ?? null, promise });
  return promise;
}

function useMachineWinrates(code: string): MwrRow[] | null {
  const [rows, setRows] = useState<MwrRow[] | null>(() => mwrCache.get(code)?.rows ?? null);
  useEffect(() => {
    let disposed = false;
    const run = () => {
      void loadMachineWinrates(code).then((r) => {
        if (!disposed && r) setRows(r);
      });
    };
    run();
    const id = window.setInterval(run, WINRATE_REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [code]);
  return rows;
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1).replace(".", ",")} %` : "—";
}

function RecordItem({ icon, label, rec }: { icon: string; label: string; rec: ShownRecord | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-white px-3 py-2 ring-1 ring-[#e8cfae]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {icon} {label}
      </div>
      {rec ? (
        <>
          <div className="truncate text-base font-black tabular-nums text-indigo-600">{fmt.format(rec.score)}</div>
          {rec.holder ? <div className="truncate text-xs text-neutral-600">{rec.holder}</div> : null}
        </>
      ) : (
        <div className="text-base font-bold text-neutral-400">—</div>
      )}
    </div>
  );
}

export default function PhoneMatchInsights({
  code,
  data,
  info,
  meId,
}: {
  code: string;
  data: MmData;
  info: MyMatchInfo;
  meId: string;
}) {
  const finished = String(data.tournament?.status ?? "") === "finished";
  const format = String(data.tournament?.format ?? "").toLowerCase();
  const isRotation = format === "rotation";
  const machineName = info.machine?.name ?? null;

  const records = useMachineRecords(
    code,
    !finished,
    (data.players ?? []).map((p) => (p.profile_id ? String(p.profile_id) : null)) // später hinzugefügte → neu laden
  );
  const mwrRows = useMachineWinrates(code);

  const live = useMemo(() => liveEntriesFrom(data), [data]);
  // 📈 Name antippen = alle Scores dieses Spielers auf dem Flipper hier auf-/zuklappen (wie im Admin)
  const [histOpen, setHistOpen] = useState<Record<string, boolean>>({});
  const twr = useMemo(() => tournamentWinrates(data), [data]);

  const profileOf = (pid: string) => {
    const p = data.players.find((x) => String(x.id) === String(pid));
    return p?.profile_id ? String(p.profile_id) : null;
  };
  const nameOf = (pid: string) => String(data.players.find((x) => String(x.id) === String(pid))?.name ?? "?");

  // Round the Pinball: alle spielen jeden Flipper → alle zeigen, die eigene Zeile ganz oben
  const rows = isRotation
    ? [
        ...info.players.filter((mp) => String(mp.player_id) === String(meId)),
        ...info.players.filter((mp) => String(mp.player_id) !== String(meId)),
      ]
    : info.players;

  const mwrFor = (pid: string): MwrRow | null => {
    const prof = profileOf(pid);
    if (!prof || !machineName || !mwrRows) return null;
    return mwrRows.find((r) => r.profileId === prof && r.machineName === machineName.trim()) ?? null;
  };

  // grüne Hervorhebung + ⭐ Favorit wie im Admin (nur bei mehreren Spielern im laufenden Match)
  const tVals: Record<string, number | null> = {};
  const mVals: Record<string, number | null> = {};
  for (const mp of info.players) {
    const pid = String(mp.player_id);
    tVals[pid] = twr[pid]?.winrate ?? null;
    mVals[pid] = mwrFor(pid)?.winrate ?? null;
  }
  // wie im Admin: auch bei Round the Pinball (alle am Flipper) höchste Winrate grün + ★ Favorit
  const showCompare = !info.done && info.players.length > 1;
  const tTop = showCompare ? topIds(tVals) : new Set<string>();
  const mTop = showCompare ? topIds(mVals) : new Set<string>();
  // niedrigster Wert dezent rot (wie im Admin)
  const tLow = showCompare ? bottomIds(tVals) : new Set<string>();
  const mLow = showCompare ? bottomIds(mVals) : new Set<string>();
  // ★ Favorit: gleiche Regel wie Admin/TV (lib/favorite.ts) – gemeinsame Gewinnchance aus Elo, Flipper-Winrate,
  // Turnierform und direkter Bilanz an diesem Flipper
  const rivFav = useRivalryDataShared(code, showCompare);
  let favRes: FavoriteResult | null = null;
  let favBd: ReturnType<typeof favoriteBreakdown> | null = null;
  if (showCompare) {
    const favCands = info.players
        .filter((mp) => !!profileOf(String(mp.player_id)))
        .map((mp) => {
          const pid = String(mp.player_id);
          const pr = (data.profiles ?? []).find((x) => String(x.id) === profileOf(pid));
          return {
            key: pid,
            pid,
            name: nameOf(pid),
            t: tVals[pid],
            m: mVals[pid],
            mCount: mwrFor(pid)?.matchesPlayed ?? 0,
            elo: pr?.rating != null && Number.isFinite(Number(pr.rating)) ? Number(pr.rating) : null,
            placeholder: pr?.exclude_from_stats === true,
          };
        });
    const favH2h = h2hFromPairMachine(rivFav.pairMachine, machineName, format, formatLabel(format));
    favRes = pickFavorite(favCands, { h2h: favH2h });
    favBd = favoriteBreakdown(favCands, { h2h: favH2h });
  }
  const favorite: string | null = favRes ? favRes.key : null;
  // 🧊 Siegchancen einfrieren, solange das Match unberührt ist (wie Admin/TV) → nach dem Spiel "Siegchance" blass
  const matchId = String(info.match?.id ?? "");
  const untouched = info.players.every((mp) => mp.position == null && (mp.score == null || String(mp.score) === ""));
  const snapSig = favBd && untouched ? favBd.rows.map((r) => `${r.cand.key}:${r.chance.toFixed(3)}`).join(",") : "";
  useEffect(() => {
    if (!favBd || !snapSig || !matchId || favBd.rows.length < 2 || !rivFav.loaded) return; // erst mit Duell-Bilanz
    saveChanceSnapshot(code, matchId, {
      favoriteKey: favBd.favoriteKey,
      chances: Object.fromEntries(favBd.rows.map((r) => [String(r.cand.key), r.chance])),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, matchId, snapSig, rivFav.loaded]);
  // 🏷️ dauerhafte Anzeigen an/aus (🔔 Meldungen & Sounds)
  const favOn = useBadgeOn("badge:favorite");
  const chanceOn = useBadgeOn("badge:chance"); // 📈 Siegchance
  const recordsOn = useBadgeOn("badge:records");
  const premiereOn = useBadgeOn("badge:premiere"); // 🎰
  const defenderOn = useBadgeOn("badge:defender"); // 🛡️ Titelverteidiger
  const defender = showCompare ? defenderFor(rivFav, info.match?.id, info.match?.machine_id) : null;
  const lastWinnerOn = useBadgeOn("badge:lastWinner"); // 🏅 Letzter Sieger
  const lastWinner = showCompare ? lastWinnerFor(rivFav, info.match?.id, info.match?.machine_id) : null;

  const recs = records?.enabled && machineName ? recordsForMachine(machineName, records.prior, live) : null;
  // 🔥 On fire – dieselbe Rechnung wie im Handy-Leaderboard (aus den ohnehin geladenen Daten)
  const sMode = streakMode(data.tournament?.format);
  const streaks = useMemo(() => (finished ? {} : computeStreaks(data, sMode)), [data, sMode, finished]);

  // ⚔️ Gegner-Duell-Hinweise: nur eigene Gegner im laufenden Match (nicht Round the Pinball/Timeplay/DYP)
  const rivalryOn = !finished && !info.done && !["timeplay", "dyp_round_robin"].includes(format);
  // Round the Pinball: alle gegen alle → einmal pro Runde laden, nur die 2 spannendsten zeigen
  // neu laden je Runde UND nach jedem fertigen Match (damit "letzte X Duelle" nach dem Spiel aktuell ist)
  const finishedMps = (data.match_players ?? []).filter((mp) => mp.position != null).length;
  const rivalry = useRivalry(
    code,
    `${isRotation ? rtpRefreshKey(data as any) : `${data.rounds?.length ?? 0}-${finishedMps}`}|${liveMachineSigFromData(data as any)}`,
    rivalryOn
  );
  const myRivalries = rivalryOn
    ? info.players
        .map((mp) => String(mp.player_id))
        .filter((pid) => pid !== String(meId))
        .map((pid) => rivalry[pairKey(String(meId), pid)])
        .filter((x): x is RivalryInsight => !!x)
        .sort((a, b) => b.score - a.score)
        .slice(0, isRotation ? 2 : 3)
    : [];

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-sm font-black uppercase tracking-wide text-neutral-500">📊 Infos zum Match</div>

      {machineName ? (
        <div className="rounded-xl bg-[#f8ecdc] p-3 ring-1 ring-[#e8cfae]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Rekorde auf diesem Flipper
          </div>
          <div className="flex items-center gap-2 text-lg font-black">
            <span>{info.machine?.icon_emoji || "🎰"}</span>
            <span className="truncate">{machineName}</span>
          </div>
          {!finished && recs && recordsOn ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <RecordItem icon="🏆" label="Highscore" rec={recs.best} />
              <RecordItem icon="📅" label="30 Tage" rec={recs.month} />
            </div>
          ) : null}
        </div>
      ) : null}

      {myRivalries.length ? (
        <div className="flex flex-col items-start gap-1.5">
          {myRivalries.map((ins) => (
            <RivalryBadge key={ins.a + ins.b} insight={ins} nameOf={nameOf} className="text-xs" />
          ))}
        </div>
      ) : null}

      <div className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
        {rows.map((mp) => {
          const pid = String(mp.player_id);
          const isMe = pid === String(meId);
          const t = twr[pid];
          const m = mwrFor(pid);
          const pb =
            !finished && records?.enabled ? personalForMachine(profileOf(pid), machineName, records.personal, live) : null;
          const beaten = pb && pb.before != null && pb.today != null && pb.today > pb.before;
          return (
            <div key={pid} className={"px-3 py-2 " + (isMe ? "bg-indigo-50/60" : "")}>
              <div className="flex items-center gap-1.5 font-bold">
                <button
                  type="button"
                  className="truncate text-left active:opacity-70"
                  onClick={() => setHistOpen((prev) => ({ ...prev, [pid]: !prev[pid] }))}
                  aria-expanded={!!histOpen[pid]}
                  title="Alle Scores auf diesem Flipper hier anzeigen"
                >
                  {nameOf(pid)} <span className="text-xs font-normal text-neutral-400">{histOpen[pid] ? "▴" : "▾"}</span>
                </button>
                {(() => {
                  // dezent: aktuelle Elo hinter dem Namen (Bots: lila Abzeichen)
                  const pr = (data.profiles ?? []).find((x) => String(x.id) === profileOf(pid));
                  const elo = pr?.rating != null && Number.isFinite(Number(pr.rating)) ? Math.round(Number(pr.rating)) : null;
                  if (pr?.is_bot) return <BotEloBadge elo={elo} className="text-[10px]" />;
                  return elo != null ? (
                    <span className="shrink-0 text-[11px] font-normal tabular-nums text-neutral-400">Elo {elo}</span>
                  ) : null;
                })()}
                {/* 🎰 Premiere direkt hinter der Elo (wie auf TV/Admin) */}
                {pb && premiereOn && isPremiere(profileOf(pid), machineName, records!.personal, live, info.match.id, records!.played) ? (
                  <span className="shrink-0 rounded-full border border-pink-200 bg-pink-50 px-1.5 py-px text-[11px] font-semibold text-pink-700">
                    🎰 Premiere
                  </span>
                ) : null}
                {isMe ? (
                  <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                    du
                  </span>
                ) : null}
                <StreakFire n={streaks[pid]} mode={sMode} />
                {defenderOn && defender?.playerId === pid ? (
                  <DefenderBadge at={defender.at} machine={machineName ?? null} />
                ) : null}
                {lastWinnerOn && lastWinner?.playerId === pid ? (
                  <LastWinnerBadge at={lastWinner.at} machine={lastWinner.machine} />
                ) : null}
                {favorite === pid && favOn ? (
                  <span
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-300"
                    title={favRes ? favoriteTitle(favRes) : "Favorit"}
                  >
                    ★ Favorit
                  </span>
                ) : null}
              </div>
              {/* 📈 Siegchance als Balken (wie im Admin) */}
              {(() => {
                if (!chanceOn) return null;
                const row = favBd?.rows.find((r) => String(r.cand.key) === pid);
                // fertig: eingefrorener Stand VOR dem Spiel (nur wenn dieses Handy ihn sich gemerkt hat) → blass
                const snap = !row && matchId ? getChanceSnapshot(code, matchId) : null;
                const frozenVal = snap?.chances?.[pid];
                if (!row && frozenVal == null) return null;
                const val = row ? row.chance : (frozenVal as number);
                const tone = row ? chanceTone(favBd!.rows.map((r) => r.chance), row.chance) : chanceTone(Object.values(snap!.chances), val);
                const wasFav = !row && snap?.favoriteKey === pid;
                return (
                  <div
                    className={"mt-1 flex items-center gap-2 text-xs tabular-nums " + (row ? "" : "opacity-60")}
                    title={
                      row
                        ? chanceShortTitle(row, favBd!.favoriteKey === pid)
                        : `Siegchance vor dem Spiel: ${Math.round(val * 100)} %${wasFav ? " – war ★ Favorit" : ""}`
                    }
                  >
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-neutral-200">
                      <div
                        className={"h-full rounded-full " + (tone === "top" ? "bg-emerald-500" : tone === "low" ? "bg-rose-300" : "bg-neutral-400")}
                        style={{ width: `${Math.round(val * 100)}%` }}
                      />
                    </div>
                    <span className={tone === "top" ? "font-semibold text-emerald-600" : tone === "low" ? "font-semibold text-rose-500" : "text-neutral-500"}>
                      {Math.round(val * 100)} %
                    </span>
                    <span className="text-neutral-400">Siegchance{wasFav ? " · war ★ Favorit" : ""}</span>
                  </div>
                );
              })()}
              {/* Siege in drei Zeilen (Zahlen zuerst, wie im Admin): Turnier · dieser Flipper · dieser Flipper nur im Format */}
              {(() => {
                const fmtName = formatLabel(format).split(" ").slice(1).join(" ") || format;
                const cls = (top: boolean, low: boolean) => (top ? "font-semibold text-emerald-600" : low ? "font-semibold text-rose-500" : "font-semibold text-neutral-700");
                // Format-Quote je Spieler (für grün/rot)
                const fq = (x: string) => {
                  const r = mwrFor(x) as (MwrRow & { matchesFormat?: number; winsFormat?: number }) | null;
                  return r && r.matchesFormat ? ((r.winsFormat ?? 0) / r.matchesFormat) * 100 : null;
                };
                const fVals: Record<string, number | null> = {};
                for (const mp2 of info.players) fVals[String(mp2.player_id)] = fq(String(mp2.player_id));
                const fTop = showCompare ? topIds(fVals) : new Set<string>();
                const fLow = showCompare ? bottomIds(fVals) : new Set<string>();
                const mf = m as (MwrRow & { matchesFormat?: number; winsFormat?: number }) | null;
                const line = (pctTxt: string, pctCls: string, cnt: string, label: string, title: string) => (
                  <div className="whitespace-nowrap" title={title}>
                    <span className={"inline-block w-14 text-right " + pctCls}>{pctTxt}</span>
                    <span className="inline-block w-12 pl-1.5">{cnt}</span>
                    <span>{label}</span>
                  </div>
                );
                return (
                  <div className="mt-0.5 flex flex-col text-xs leading-snug tabular-nums text-neutral-500">
                    {line(
                      pct(t?.winrate),
                      cls(tTop.has(pid), tLow.has(pid)),
                      t && t.played > 0 ? `${t.wins}/${t.played}` : "",
                      "Siege im Turnier",
                      "Siegquote in diesem Turnier (Siege/Spiele)"
                    )}
                    {machineName
                      ? line(
                          m && m.matchesPlayed > 0 ? pct(m.winrate) : "—",
                          cls(mTop.has(pid), mLow.has(pid)),
                          m && m.matchesPlayed > 0 ? `${m.wins}/${m.matchesPlayed}` : "",
                          `Siege ${machineName}`,
                          "an diesem Flipper an dieser Location, alle Formate (Siege/Spiele)"
                        )
                      : null}
                    {machineName && mf && mf.matchesFormat
                      ? line(
                          pct(((mf.winsFormat ?? 0) / mf.matchesFormat) * 100),
                          cls(fTop.has(pid), fLow.has(pid)),
                          `${mf.winsFormat ?? 0}/${mf.matchesFormat}`,
                          `Siege ${machineName} ${fmtName}`,
                          `an diesem Flipper an dieser Location, nur ${fmtName} (Siege/Spiele)`
                        )
                      : null}
                  </div>
                );
              })()}
              {pb ? (
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs tabular-nums text-neutral-500">
                  <span title="Persönlicher Highscore an diesem Flipper (diese Location)">💪 Bestwert</span>
                  {pb.before != null ? (
                    <span className="font-semibold text-indigo-600">{fmt.format(pb.before)}</span>
                  ) : (
                    <span className="text-neutral-400">noch keiner</span>
                  )}
                  {(() => {
                    // Ø wie im Admin (gleiche Basis wie der Highscore)
                    const prof = profileOf(pid);
                    const a = prof && machineName ? records?.personalAvg?.[personalKey(prof, machineKey(machineName))] : null;
                    return a && a.n > 0 ? (
                      <span title={`Ø aus ${a.n} ${a.n === 1 ? "Spiel" : "Spielen"} (${levelText(records?.avgLevel)})`}>
                        · Ø <span className="font-semibold text-neutral-700">{fmt.format(a.avg)}</span>
                      </span>
                    ) : null;
                  })()}
                  {/* "heute" steht schon in der Eingabe – nur noch das Übertroffen-Zeichen (wie im Admin) */}
                  {beaten ? <span className="font-semibold text-emerald-600">🎉 übertroffen</span> : null}
                </div>
              ) : null}
              {/* ⚔️ Bilanz aus MEINER Sicht gegen diesen Spieler (bei mir selbst keine):
                  Allzeit · dieser Flipper · dieser Flipper nur im Format */}
              {machineName && !isMe && meId && info.players.some((o) => String(o.player_id) === String(meId)) ? (
                <div className="mt-1.5">
                  <OpponentBalance
                    code={code}
                    playerId={String(meId)}
                    opponents={[{ id: pid, name: nameOf(pid) }]}
                    machineName={machineName}
                    format={format}
                    title="⚔️ Deine Bilanz gegen"
                    accent
                  />
                </div>
              ) : null}
              {histOpen[pid] ? (
                <div className="mt-2 border-t border-neutral-200/70 pt-2">
                  <PlayerMachineHistory
                    code={code}
                    profileId={profileOf(pid)}
                    machineName={machineName}
                    liveEntries={live}
                    format={format}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
