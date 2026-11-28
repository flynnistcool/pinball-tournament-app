"use client";

// 🏆 Arcade-Rangliste + 🏛️ Hall of Fame (Admin, Reiter "Erstellen" unter "Arcade starten").
// Je Modus mit Rangliste: bester Lauf je Spieler (mehr Stufen, dann mehr übrige Leben, dann früher).
// Hall of Fame: wer den Modus geschafft hat – in der Reihenfolge des ersten Schaffens.

import { useEffect, useState } from "react";
import { ARCADE_MODES } from "@/lib/arcade";

type Row = {
  profileId: string;
  playerName: string;
  wins: number;
  stagesTotal: number;
  livesLeft: number;
  livesStart: number;
  status: string;
  at: string | null;
  runs: number;
};
type ModeData = { mode: string; rows: Row[]; hallOfFame: { profileId: string; playerName: string; at: string | null; stagesTotal: number }[] };

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("de-DE") : "–");

export default function ArcadeLeaderboard() {
  const [data, setData] = useState<ModeData[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState("easy");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch(`/api/arcade/leaderboard?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.ok ? setData(j.modes ?? []) : setErr(j?.error ?? "Rangliste nicht verfügbar")))
      .catch(() => setErr("Netzwerkfehler"));
  }, []);

  const ranked = ARCADE_MODES.filter((m) => m.ranked);
  const cur = data?.find((d) => d.mode === mode) ?? null;
  const def = ranked.find((m) => m.mode === mode);

  return (
    <div className="mt-4 rounded-2xl border bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="font-semibold">🏆 Arcade-Rangliste & 🏛️ Hall of Fame</span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="border-t px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {ranked.map((m) => {
              const n = data?.find((d) => d.mode === m.mode)?.hallOfFame.length ?? 0;
              return (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => setMode(m.mode)}
                  className={
                    "rounded-full border px-2.5 py-1 text-xs font-semibold " +
                    (mode === m.mode ? "border-fuchsia-500 bg-fuchsia-600 text-white" : "bg-white hover:bg-fuchsia-50")
                  }
                >
                  {m.icon} {m.label}
                  {n ? <span className="ml-1 opacity-80">· 🏛️ {n}</span> : null}
                </button>
              );
            })}
          </div>

          {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : !data ? <div className="mt-3 text-sm text-neutral-500">Lade …</div> : null}

          {cur ? (
            <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div>
                <div className="mb-1 text-xs font-semibold text-neutral-500">
                  🏆 Rangliste {def?.icon} {def?.label}
                </div>
                {cur.rows.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500">
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Spieler</th>
                        <th className="py-1 pr-2">bester Lauf</th>
                        <th className="py-1 pr-2">Leben</th>
                        <th className="py-1 pr-2 text-right">Läufe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cur.rows.map((r, i) => (
                        <tr key={r.profileId} className="border-t">
                          <td className="py-1.5 pr-2 font-mono text-neutral-400">{i + 1}</td>
                          <td className="py-1.5 pr-2 font-semibold">{r.playerName}</td>
                          <td className="py-1.5 pr-2">
                            {r.status === "cleared" ? (
                              <span className="font-bold text-emerald-700">🏆 geschafft</span>
                            ) : (
                              <span>
                                Stufe {r.wins + 1} / {r.stagesTotal}
                                {r.status === "playing" ? <span className="ml-1 text-xs text-sky-600">(läuft)</span> : null}
                              </span>
                            )}
                            <span className="ml-1 text-xs text-neutral-400">{fmtDate(r.at)}</span>
                          </td>
                          <td className="py-1.5 pr-2">
                            {r.status === "cleared" ? "❤️".repeat(r.livesLeft) || "–" : r.status === "gameover" ? "💀" : "❤️".repeat(r.livesLeft)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-neutral-500">{r.runs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-neutral-500">Noch kein Lauf in diesem Modus.</div>
                )}
                {mode === "monster_rush" ? (
                  <div className="mt-1 text-[11px] text-neutral-400">
                    Monster-Rush wird mit neuen Bots länger – gewertet wird der Anteil geschaffter Stufen.
                  </div>
                ) : null}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-neutral-500">🏛️ Hall of Fame – geschafft von</div>
                {cur.hallOfFame.length ? (
                  <ol className="space-y-1 text-sm">
                    {cur.hallOfFame.map((h, i) => (
                      <li key={h.profileId} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1">
                        <span>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "⭐"} <b>{h.playerName}</b>
                          {mode === "monster_rush" ? <span className="ml-1 text-xs text-neutral-500">({h.stagesTotal} Gegner)</span> : null}
                        </span>
                        <span className="text-xs text-neutral-500">{fmtDate(h.at)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="text-sm text-neutral-500">Noch niemand – wer schafft es als Erstes?</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
