"use client";

// 🏆 Handy (Reiter "Mein Match") nach Turnierende: Siegerpodest wie am Infobildschirm,
// im hellen Handy-Stil. Darunter alle weiteren Plätze (ab Platz 4), der eigene Platz hervorgehoben.
// Platzierung = gleiche Rechnung wie Handy-Leaderboard und TV (lib/myMatch.ts → liveLeaderboard).

import { useMemo } from "react";
import { liveLeaderboard, type LiveRow, type MmData } from "@/lib/myMatch";
import BotEloBadge from "@/components/BotEloBadge";

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

function Avatar({ row, size }: { row: LiveRow; size: string }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-white " +
        size +
        " " +
        (row.color ? "" : "bg-neutral-200")
      }
      style={row.color ? { background: row.color } : undefined}
    >
      {row.icon ? row.icon : <span className="text-[0.45em] font-bold text-neutral-600">{initials(row.name)}</span>}
    </span>
  );
}

const STEP = {
  1: { block: "h-28 from-amber-300 to-amber-500 text-amber-950", ring: "ring-amber-400", avatar: "h-16 w-16 text-3xl" },
  2: { block: "h-20 from-slate-200 to-slate-400 text-slate-800", ring: "ring-slate-400", avatar: "h-12 w-12 text-2xl" },
  3: { block: "h-14 from-orange-200 to-orange-400 text-orange-950", ring: "ring-orange-400", avatar: "h-12 w-12 text-2xl" },
} as const;

function Step({ place, rows, meId }: { place: 1 | 2 | 3; rows: LiveRow[]; meId: string }) {
  const st = STEP[place];
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="mb-2 flex min-h-[96px] w-full flex-col items-center justify-end gap-2">
        {place === 1 ? <div className="text-3xl">🏆</div> : null}
        {rows.length === 0 ? (
          <div className="text-neutral-300">–</div>
        ) : (
          rows.map((r) => {
            const isMe = r.id === String(meId);
            return (
              <div key={r.id} className="flex w-full min-w-0 flex-col items-center text-center">
                <span className={"rounded-full " + (isMe ? `ring-4 ${st.ring}` : "")}>
                  <Avatar row={r} size={st.avatar} />
                </span>
                <div className={"mt-1 w-full truncate px-1 text-sm " + (isMe ? "font-black text-indigo-700" : "font-bold")}>
                  {r.name}
                </div>
                {isMe ? (
                  <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">du</span>
                ) : null}
                {r.isBot ? <BotEloBadge elo={r.eloNow ?? r.eloStart} kind={r.botKind} owner={r.botOwner} className="text-[10px]" /> : null}
                <div className="text-xs font-semibold tabular-nums text-neutral-500">{r.total} Punkte</div>
              </div>
            );
          })
        )}
      </div>
      <div
        className={
          "flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b pt-2 text-3xl font-black shadow-inner " +
          st.block
        }
      >
        {place}
      </div>
    </div>
  );
}

export default function PhonePodium({ data, meId }: { data: MmData; meId: string }) {
  const { rows } = useMemo(() => liveLeaderboard(data), [data]);
  // Sobald irgendwer Punkte hat, stehen auch Plätze mit 0 Punkten auf dem Podest
  const anyScored = rows.some((r) => r.total > 0);
  const onPodium = (r: LiveRow) => r.place <= 3 && (r.total > 0 || anyScored);
  const byPlace = (pl: number) => rows.filter((r) => r.place === pl && onPodium(r));
  const rest = rows.filter((r) => !onPodium(r));
  const me = rows.find((r) => r.id === String(meId)) ?? null;
  const meOnPodium = !!me && onPodium(me);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-amber-50 to-white px-3 pb-0 pt-4 shadow-sm ring-1 ring-amber-200">
        <div className="text-center">
          <div className="text-xl font-black tracking-tight text-amber-700">🏆 Siegerehrung 🏆</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-600/70">
            Das Turnier ist beendet
          </div>
          {me ? (
            <div className="mt-2 text-sm font-semibold text-neutral-700">
              {meOnPodium ? `🎉 Glückwunsch – du bist Platz ${me.place}!` : `Du bist Platz ${me.place} von ${rows.length}.`}
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <Step place={2} rows={byPlace(2)} meId={meId} />
          <Step place={1} rows={byPlace(1)} meId={meId} />
          <Step place={3} rows={byPlace(3)} meId={meId} />
        </div>
      </div>

      {rest.length ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
            Weitere Platzierungen
          </div>
          {rest.map((r) => {
            const isMe = r.id === String(meId);
            return (
              <div
                key={r.id}
                className={
                  "flex items-center gap-2.5 border-t border-neutral-100 px-3 py-2 " +
                  (isMe ? "bg-indigo-50 ring-2 ring-inset ring-indigo-300" : "")
                }
              >
                <span
                  className={
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums " +
                    (isMe ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-500")
                  }
                >
                  {r.place}
                </span>
                <Avatar row={r} size="h-9 w-9 text-lg" />
                <span className={"min-w-0 flex-1 truncate " + (isMe ? "font-black text-indigo-800" : "font-bold")}>
                  {r.name}
                </span>
                {r.isBot ? <BotEloBadge elo={r.eloNow ?? r.eloStart} kind={r.botKind} owner={r.botOwner} className="text-[10px]" /> : null}
                {isMe ? (
                  <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                    du
                  </span>
                ) : null}
                <span className="w-9 shrink-0 text-right text-lg font-black tabular-nums">{r.total}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
