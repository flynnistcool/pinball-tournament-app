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
import PlayerMachineHistory from "@/components/PlayerMachineHistory";
import { levelText } from "@/lib/scoreForm";
import { bottomIds, topIds, tournamentWinrates } from "@/lib/matchInsights";
import { computeStreaks, streakMode } from "@/lib/winStreaks";
import StreakFire from "@/components/StreakFire";
import { useBadgeOn } from "@/components/DisplayDevice";
import RivalryBadge, { rtpRefreshKey, useRivalry } from "@/components/RivalryBadge";
import { pairKey, type RivalryInsight } from "@/lib/rivalryInsights";
import BotEloBadge from "@/components/BotEloBadge";
import { favoriteTitle, pickFavorite, type FavoriteResult } from "@/lib/favorite";
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
  // ★ Favorit: gleiche Regel wie Admin/TV (lib/favorite.ts) – echte Winrate-Bestwerte, sonst Elo mit Vorsprung
  let favRes: FavoriteResult | null = null;
  if (showCompare) {
    favRes = pickFavorite(
      info.players
        .filter((mp) => !!profileOf(String(mp.player_id)))
        .map((mp) => {
          const pid = String(mp.player_id);
          const pr = (data.profiles ?? []).find((x) => String(x.id) === profileOf(pid));
          return {
            key: pid,
            t: tVals[pid],
            m: mVals[pid],
            elo: pr?.rating != null && Number.isFinite(Number(pr.rating)) ? Number(pr.rating) : null,
            placeholder: pr?.exclude_from_stats === true,
          };
        })
    );
  }
  const favorite: string | null = favRes ? favRes.key : null;
  // 🏷️ dauerhafte Anzeigen an/aus (🔔 Meldungen & Sounds)
  const favOn = useBadgeOn("badge:favorite");
  const recordsOn = useBadgeOn("badge:records");
  const premiereOn = useBadgeOn("badge:premiere"); // 🎰

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
    isRotation ? rtpRefreshKey(data as any) : `${data.rounds?.length ?? 0}-${finishedMps}`,
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
                {isMe ? (
                  <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                    du
                  </span>
                ) : null}
                <StreakFire n={streaks[pid]} mode={sMode} />
                {favorite === pid && favOn ? (
                  <span
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-300"
                    title={favRes ? favoriteTitle(favRes) : "Favorit"}
                  >
                    ★ Favorit
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                <span>
                  Turnier-Winrate{" "}
                  <span className={tTop.has(pid) ? "font-semibold text-emerald-600" : tLow.has(pid) ? "font-semibold text-rose-400" : ""}>{pct(t?.winrate)}</span>
                </span>
                {machineName ? (
                  <span>
                    Flipper-Winrate{" "}
                    <span className={mTop.has(pid) ? "font-semibold text-emerald-600" : mLow.has(pid) ? "font-semibold text-rose-400" : ""}>{pct(m?.winrate)}</span>
                    {m && m.matchesPlayed > 0 ? ` (${m.matchesPlayed})` : ""}
                  </span>
                ) : null}
              </div>
              {pb ? (
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs tabular-nums text-neutral-500">
                  {premiereOn && isPremiere(profileOf(pid), machineName, records!.personal, live, info.match.id, records!.played) ? (
                    <span className="rounded-full border border-pink-200 bg-pink-50 px-1.5 py-px font-semibold text-pink-700">
                      🎰 Premiere
                    </span>
                  ) : null}
                  <span>💪 Pers. Highscore</span>
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
              {histOpen[pid] ? (
                <div className="mt-2 border-t border-neutral-200/70 pt-2">
                  <PlayerMachineHistory
                    code={code}
                    profileId={profileOf(pid)}
                    machineName={machineName}
                    liveEntries={live}
                    playerId={pid}
                    opponents={info.players
                      .filter((o) => String(o.player_id) !== pid)
                      .map((o) => ({ id: String(o.player_id), name: nameOf(String(o.player_id)) }))}
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
