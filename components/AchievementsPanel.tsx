"use client";

// 🏅 Auszeichnungen im Spielerprofil (Daten: /api/players/achievements, Rechnung: lib/flawless.ts)
// Start: 🥋 Flawless Victory (ein Turnier ohne einzige Niederlage). Weitere Auszeichnungen folgen.

import { useEffect, useState } from "react";
import type { FlawlessAward } from "@/app/api/players/achievements/route";

type Resp = { ok: boolean; error?: string; flawless?: FlawlessAward[] };

const FORMAT_LABEL: Record<string, string> = {
  matchplay: "Matchplay",
  swiss: "Swiss",
  round_robin: "Round Robin",
  dyp_round_robin: "DYP",
  timeplay: "Timeplay",
  rotation: "Round the Pinball",
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("de-DE") : "";
};

export default function AchievementsPanel({ profileId }: { profileId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetch(`/api/players/achievements?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Resp) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData({ ok: false, error: "Auszeichnungen konnten nicht geladen werden" });
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const list = data?.flawless ?? [];
  const shown = showAll ? list : list.slice(0, 3);

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-3">
        <div className="text-sm font-semibold">🏅 Auszeichnungen</div>
        <div className="text-[11px] text-neutral-500">Besondere Leistungen aus beendeten Turnieren</div>
      </div>

      {!data ? (
        <div className="text-xs text-neutral-500">Lade Auszeichnungen…</div>
      ) : !data.ok ? (
        <div className="text-xs text-red-600">{data.error ?? "Fehler"}</div>
      ) : (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-full bg-gradient-to-r from-amber-200 to-yellow-300 px-2.5 py-0.5 text-sm font-bold text-amber-950">
              🥋 Flawless Victory{list.length ? ` ×${list.length}` : ""}
            </span>
            <span className="text-[11px] text-neutral-400">
              ganzes Turnier ohne einzige Niederlage (mind. 3 Siege)
            </span>
          </div>

          {!list.length ? (
            <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 p-2 text-xs text-neutral-500">
              Noch keine – wer ein Turnier ohne Niederlage gewinnt, bekommt sie.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {shown.map((a) => (
                <div
                  key={a.tournamentId}
                  className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-100 p-2.5"
                >
                  <div className="truncate text-sm font-bold text-amber-950" title={a.name}>
                    🥋 {a.name}
                  </div>
                  <div className="text-[11px] text-amber-900/70">
                    {fmtDate(a.at)}
                    {FORMAT_LABEL[a.format] ? ` · ${FORMAT_LABEL[a.format]}` : ""}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-amber-900">
                    {a.mode === "leads"
                      ? `an allen ${a.wins} Flippern vorn`
                      : `${a.wins} Siege ohne Niederlage (${a.matches} ${a.matches === 1 ? "Match" : "Matches"})`}
                  </div>
                </div>
              ))}
            </div>
          )}
          {list.length > 3 ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 w-full rounded-lg border bg-neutral-50 px-2 py-1 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100"
            >
              {showAll ? "▴ weniger anzeigen" : `▾ alle ${list.length} anzeigen`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
