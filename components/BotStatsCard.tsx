"use client";

// 🤖 Profil-Statistik rund um KI-Bots:
// - bei Menschen: Bilanz gegen jeden Bot
// - bei Bots:     Bilanz gegen jeden menschlichen Gegner (die einzige Statistik eines Bots)

import { useEffect, useState } from "react";

type Row = {
  profileId: string;
  name: string;
  icon: string | null;
  color: string | null;
  elo: number | null;
  isBot: boolean;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number | null;
};

type Total = { matches: number; wins: number; losses: number; winrate: number | null };

const pctText = (v: number | null) => (v == null ? "–" : `${String(v).replace(".", ",")} %`);

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function BotStatsCard({ profileId }: { profileId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState<Total | null>(null);
  const [mode, setMode] = useState<"bots" | "humans">("bots");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setErr(null);
    fetch(`/api/players/bot-stats?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.ok) {
          setErr(j?.error ?? "Bot-Statistik konnte nicht geladen werden");
          setRows([]);
          return;
        }
        setMode(j.mode === "humans" ? "humans" : "bots");
        setRows(j.rows ?? []);
        setTotal(j.total ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setErr("Netzwerkfehler");
        setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [profileId]);

  const isBotView = mode === "humans";

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-neutral-900">
            {isBotView ? "🤖 Bilanz gegen Menschen" : "🤖 Bot-Statistik"}
          </div>
          <div className="text-xs text-neutral-500">
            {isBotView
              ? "Gegen welche Spieler dieser Bot schon gespielt hat – Siege aus Sicht des Bots."
              : "Bilanz gegen die KI-Bots – zählt nicht für Elo, Siege und Winrate in den anderen Statistiken."}
          </div>
        </div>
        {total && total.matches > 0 ? (
          <div className="shrink-0 text-right text-xs text-neutral-500">
            gesamt <b className="text-emerald-700">{total.wins}</b> : <b className="text-rose-700">{total.losses}</b>
            <span className="ml-1">({pctText(total.winrate)})</span>
          </div>
        ) : null}
      </div>
      {rows == null ? (
        <div className="text-sm text-neutral-500">Lade …</div>
      ) : err ? (
        <div className="text-sm text-red-600">⚠️ {err}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-neutral-500">
          {isBotView ? "Noch keine Matches gegen Menschen." : "Noch keine Matches gegen Bots."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const wr = r.winrate ?? 0;
            return (
              <div key={r.profileId} className="flex items-center gap-2.5 rounded-lg bg-neutral-50 px-2.5 py-1.5">
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                  style={{ background: r.color ?? (r.isBot ? "#ede9fe" : "#e5e5e5") }}
                >
                  {r.icon ?? (r.isBot ? "🤖" : <span className="text-xs font-bold text-neutral-600">{initials(r.name)}</span>)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{r.name}</span>
                    {r.isBot ? (
                      <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                        🤖 Bot{r.elo != null ? ` · ${Math.round(r.elo)}` : ""}
                      </span>
                    ) : r.elo != null ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">{Math.round(r.elo)}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200" title="Siegquote">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, wr))}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums text-neutral-600">
                  <div>
                    <b className="text-emerald-700">{r.wins}</b> Siege · <b className="text-rose-700">{r.losses}</b> Niederl.
                    {r.draws ? ` · ${r.draws} unent.` : ""}
                  </div>
                  <div className="text-neutral-400">
                    {r.matches} Matches · {pctText(r.winrate)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
