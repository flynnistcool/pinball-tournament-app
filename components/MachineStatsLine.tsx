"use client";

// Statistik unter einem Location-Flipper (Locations-Tab):
// 4 Kacheln (Matches · zuletzt · Highscore · Flipper-König) + aufklappbar "mehr"
// (Ø-Score, Beliebtheit, Single Play, Matches/Monat, Timeplay-Tasks).

import { useState } from "react";
import type { ReactNode } from "react";
import type { MachineStat } from "@/lib/machineStats";

const num = new Intl.NumberFormat("de-DE");

function relDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 30) return `vor ${days} Tagen`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function shortScore(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mrd.`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio.`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tsd.`;
  return num.format(n);
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DIFF: Record<string, { label: string; cls: string }> = {
  easy: { label: "leicht", cls: "bg-emerald-100 text-emerald-800" },
  medium: { label: "mittel", cls: "bg-amber-100 text-amber-800" },
  hard: { label: "schwer", cls: "bg-rose-100 text-rose-800" },
};

function Tile({
  icon,
  label,
  main,
  sub,
  extra,
}: {
  icon: string;
  label: string;
  main: ReactNode;
  sub?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-neutral-50 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {icon} {label}
      </div>
      <div className="truncate text-base font-semibold text-neutral-900 tabular-nums">{main}</div>
      {sub ? <div className="truncate text-xs text-neutral-500">{sub}</div> : null}
      {extra ? <div className="mt-0.5 space-y-0.5 text-[11px] leading-tight text-neutral-400">{extra}</div> : null}
    </div>
  );
}

export default function MachineStatsLine({
  stat,
  loading,
  onEditTasks,
  canEditTasks = true,
}: {
  stat: MachineStat | undefined;
  loading?: boolean;
  /** öffnet den bestehenden Task-Editor */
  onEditTasks?: () => void;
  canEditTasks?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!stat) {
    return <div className="text-xs text-neutral-400">{loading ? "Statistik lädt …" : ""}</div>;
  }

  const never = stat.matches === 0;
  const maxMonth = Math.max(1, ...stat.monthly.map((m) => m.count));

  return (
    <div className="space-y-2">
      {never ? (
        <div className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-500">🎮 Noch kein Match in einem beendeten Turnier</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile icon="🎮" label="Gespielt" main={`${stat.matches} Matches`} sub={`in ${stat.tournaments} Turnieren`} />
          <Tile
            icon="🕒"
            label="Zuletzt"
            main={relDate(stat.lastPlayed)}
            extra={
              <>
                {stat.lastTournament ? (
                  <div className="truncate" title={stat.lastTournament}>🏷️ {stat.lastTournament}</div>
                ) : null}
                {stat.lastCategory ? (
                  <div className="truncate" title={stat.lastCategory}>📂 {stat.lastCategory}</div>
                ) : null}
                {stat.lastPlayed ? (
                  <div>
                    📅{" "}
                    {new Date(stat.lastPlayed).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </div>
                ) : null}
              </>
            }
          />
          <Tile
            icon="🏆"
            label="Highscore"
            main={stat.highscore != null ? num.format(stat.highscore) : "—"}
            sub={stat.highscoreBy ?? undefined}
            extra={
              stat.highscore != null ? (
                <>
                  {stat.highscoreTournament ? (
                    <div className="truncate" title={stat.highscoreTournament}>🏷️ {stat.highscoreTournament}</div>
                  ) : null}
                  {stat.highscoreCategory ? (
                    <div className="truncate" title={stat.highscoreCategory}>📂 {stat.highscoreCategory}</div>
                  ) : null}
                  {stat.highscoreAt ? (
                    <div>
                      📅{" "}
                      {new Date(stat.highscoreAt).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>
                  ) : null}
                </>
              ) : undefined
            }
          />
          <Tile
            icon="🔥"
            label="Beliebtheit"
            main={stat.rank != null ? `Platz ${stat.rank}` : "—"}
            sub={stat.rank != null ? `von ${stat.rankOf} Flippern` : undefined}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-blue-700 hover:underline"
      >
        {open ? "weniger ▲" : `mehr ▼  (Ø-Score, Flipper-König, Single Play, Timeplay Tasks: ${stat.tasksActive})`}
      </button>

      {open ? (
        <div className="space-y-3 rounded-xl border bg-white p-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Tile icon="📊" label="Ø-Score" main={stat.avgScore != null ? shortScore(stat.avgScore) : "—"} />
            <Tile
              icon="👑"
              label="Flipper-König"
              main={
                stat.king ? (
                  <>
                    {stat.king.icon ? <span className="mr-1">{stat.king.icon}</span> : null}
                    {stat.king.name}
                  </>
                ) : (
                  "—"
                )
              }
              sub={stat.king ? `${stat.king.wins} Siege · ${stat.king.winrate} %` : undefined}
            />
            <Tile icon="🕹️" label="Single Play" main={`${stat.singlePlayRuns} Läufe`} />
            <div className="rounded-xl bg-neutral-50 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">📈 Matches / Monat</div>
              <div className="mt-1 flex h-10 items-end gap-1">
                {stat.monthly.map((m) => (
                  <div
                    key={m.month}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
                    title={`${m.month}: ${m.count}`}
                  >
                    <div
                      className="w-full rounded-t bg-blue-500/80"
                      style={{
                        height: `${Math.max(m.count ? 12 : 3, (m.count / maxMonth) * 100)}%`,
                        opacity: m.count ? 1 : 0.25,
                      }}
                    />
                    <span className="text-[9px] leading-none text-neutral-400">
                      {MONTHS[Number(m.month.slice(5, 7)) - 1]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeplay-Tasks */}
          <div className="rounded-xl bg-neutral-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-800">
                🎯 Timeplay Tasks{" "}
                <span className="font-normal text-neutral-500">
                  ({stat.tasksActive} aktiv{stat.tasksTotal !== stat.tasksActive ? ` · ${stat.tasksTotal} gesamt` : ""})
                </span>
              </div>
              {onEditTasks ? (
                <button
                  type="button"
                  disabled={!canEditTasks}
                  onClick={onEditTasks}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-100 disabled:opacity-40"
                >
                  ✏️ Bearbeiten
                </button>
              ) : null}
            </div>
            {stat.tasks.length === 0 ? (
              <div className="text-xs text-neutral-500">
                Noch keine Aufgaben – nur nötig, wenn dieser Flipper im Format Timeplay vorkommen soll.
              </div>
            ) : (
              <ul className="space-y-1">
                {stat.tasks.map((t, i) => {
                  const d = DIFF[t.difficulty ?? ""];
                  return (
                    <li key={i} className={`flex items-center gap-2 text-sm ${t.active ? "" : "opacity-45"}`}>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d?.cls ?? "bg-neutral-200 text-neutral-700"}`}>
                        {d?.label ?? t.difficulty ?? "—"}
                      </span>
                      <span className="truncate">{t.title}</span>
                      {!t.active ? <span className="text-xs text-neutral-500">(inaktiv)</span> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
