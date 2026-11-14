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
import { personalForMachine, recordsForMachine, type ShownRecord } from "@/lib/matchRecords";
import { liveEntriesFrom } from "@/lib/recordWatch";
import { topIds, tournamentWinrates } from "@/lib/matchInsights";
import { computeStreaks, streakMode } from "@/lib/winStreaks";
import StreakFire from "@/components/StreakFire";
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

  const records = useMachineRecords(code, !finished);
  const mwrRows = useMachineWinrates(code);

  const live = useMemo(() => liveEntriesFrom(data), [data]);
  const twr = useMemo(() => tournamentWinrates(data), [data]);

  const profileOf = (pid: string) => {
    const p = data.players.find((x) => String(x.id) === String(pid));
    return p?.profile_id ? String(p.profile_id) : null;
  };
  const nameOf = (pid: string) => String(data.players.find((x) => String(x.id) === String(pid))?.name ?? "?");

  // Round the Pinball: alle spielen jeden Flipper → nur die eigene Zeile zeigen
  const rows = isRotation ? info.players.filter((mp) => String(mp.player_id) === String(meId)) : info.players;

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
  const showCompare = !isRotation && !info.done && info.players.length > 1;
  const tTop = showCompare ? topIds(tVals) : new Set<string>();
  const mTop = showCompare ? topIds(mVals) : new Set<string>();
  let favorite: string | null = null;
  if (showCompare) {
    const greens = info.players.map((mp) => {
      const pid = String(mp.player_id);
      return { pid, n: (tTop.has(pid) ? 1 : 0) + (mTop.has(pid) ? 1 : 0) };
    });
    const max = Math.max(0, ...greens.map((g) => g.n));
    const best = greens.filter((g) => g.n === max);
    if (max > 0 && best.length === 1) favorite = best[0].pid;
  }

  const recs = records?.enabled && machineName ? recordsForMachine(machineName, records.prior, live) : null;
  // 🔥 On fire – dieselbe Rechnung wie im Handy-Leaderboard (aus den ohnehin geladenen Daten)
  const sMode = streakMode(data.tournament?.format);
  const streaks = useMemo(() => (finished ? {} : computeStreaks(data, sMode)), [data, sMode, finished]);

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
          {!finished && recs ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <RecordItem icon="🏆" label="Highscore" rec={recs.best} />
              <RecordItem icon="📅" label="30 Tage" rec={recs.month} />
            </div>
          ) : null}
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
                <span className="truncate">{nameOf(pid)}</span>
                {isMe ? (
                  <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                    du
                  </span>
                ) : null}
                <StreakFire n={streaks[pid]} mode={sMode} />
                {favorite === pid ? (
                  <span
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-300"
                    title="Favorit – beste Winrates in diesem Match"
                  >
                    ★ Favorit
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                <span>
                  Turnier-Winrate{" "}
                  <span className={tTop.has(pid) ? "font-semibold text-emerald-600" : ""}>{pct(t?.winrate)}</span>
                </span>
                {machineName ? (
                  <span>
                    Flipper-Winrate{" "}
                    <span className={mTop.has(pid) ? "font-semibold text-emerald-600" : ""}>{pct(m?.winrate)}</span>
                    {m && m.matchesPlayed > 0 ? ` (${m.matchesPlayed})` : ""}
                  </span>
                ) : null}
              </div>
              {pb ? (
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs tabular-nums text-neutral-500">
                  <span>💪 Pers. Highscore</span>
                  {pb.before != null ? (
                    <span className="font-semibold text-indigo-600">{fmt.format(pb.before)}</span>
                  ) : (
                    <span className="text-neutral-400">noch keiner</span>
                  )}
                  {pb.today != null ? (
                    <span className={beaten ? "font-semibold text-emerald-600" : ""}>
                      · heute {fmt.format(pb.today)}
                      {beaten ? " 🎉 übertroffen" : ""}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
