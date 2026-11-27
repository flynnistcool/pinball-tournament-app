"use client";

// 📈 Karte "Bilanz" auf der Admin-Turnierseite: je Spieler seine Scores in diesem Turnier im Vergleich
// zu seinem persönlichen Ø und Bestwert auf dem Flipper (nur Turniere VOR diesem – cutoff=start).
// Standardmäßig zugeklappt (Zustand je Gerät gemerkt); Vergleichswerte werden erst beim Aufklappen geladen.
// Rechnung wie Handy/TV: lib/scoreBalance.ts

import { forwardRef, useEffect, useMemo, useState } from "react";
import { useBalanceRefs } from "@/components/useBalanceRefs";
import { computeAllBalances, type BalanceRow, type PlayerBalance } from "@/lib/scoreBalance";

const OPEN_KEY = "pb_open_balance";
const MAX_ROWS = 5;
const fmt = new Intl.NumberFormat("de-DE");

type AdminData = {
  players?: readonly { id: string; name?: string | null; profile_id?: string | null }[];
  machines?: readonly { id: string; name: string | null; icon_emoji?: string | null }[];
  rounds?: readonly { id: string; number: number | null }[];
  matches?: readonly { id: string; round_id: string; machine_id: string | null }[];
  match_players?: readonly { match_id: string; player_id: string; score: number | string | null }[];
};

function pctTxt(p: number) {
  return `${p > 0 ? "+" : ""}${p} %`;
}

function Bar({ label, value, max, cls, strong }: { label: string; value: number | null; max: number; cls: string; strong?: boolean }) {
  const pct = value != null && max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
      <span className="text-neutral-500">{label}</span>
      <div className="h-2.5 rounded-full bg-neutral-100">
        {value != null ? <div className={"h-2.5 rounded-full " + cls} style={{ width: `${pct}%` }} /> : null}
      </div>
      <span className={"tabular-nums " + (strong ? "font-bold text-neutral-900" : "text-neutral-600")}>
        {value != null ? fmt.format(value) : "–"}
      </span>
    </div>
  );
}

function MatchBlock({ r }: { r: BalanceRow }) {
  const max = Math.max(r.score, r.avg ?? 0, r.best ?? 0);
  const above = r.avg != null ? r.score > r.avg : null;
  const noRef = r.avg == null && r.best == null;
  return (
    <div className="border-t border-neutral-100 pt-1.5">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <div className="min-w-0 truncate font-semibold">
          {r.icon ? <span className="mr-1">{r.icon}</span> : null}
          {r.machineName}
          {r.roundNumber != null ? <span className="ml-1.5 text-xs font-normal text-neutral-400">R{r.roundNumber}</span> : null}
        </div>
        <div className="shrink-0 text-xs font-semibold">
          {r.newBest ? (
            <span className="text-emerald-600">🎉 neuer Bestwert</span>
          ) : r.vsAvgPct != null ? (
            <span className={above ? "text-emerald-600" : "text-red-500"}>{pctTxt(r.vsAvgPct)} zum Ø</span>
          ) : null}
        </div>
      </div>
      <div className="space-y-0.5">
        <Bar
          label="Heute"
          value={r.score}
          max={max}
          strong
          cls={above == null ? "bg-indigo-500" : above ? "bg-emerald-500" : "bg-red-400"}
        />
        {noRef ? (
          <div className="text-xs text-neutral-500">🆕 noch kein Vergleichswert an diesem Flipper</div>
        ) : (
          <>
            <Bar label="Ø" value={r.avg} max={max} cls="bg-neutral-400" />
            <Bar label="Bestwert" value={r.best} max={max} cls="bg-indigo-400" />
          </>
        )}
      </div>
    </div>
  );
}

function PlayerCard({ e, rank }: { e: PlayerBalance; rank: number }) {
  const [all, setAll] = useState(false);
  const s = e.summary;
  const rows = all ? e.rows : e.rows.slice(0, MAX_ROWS);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 truncate text-base font-bold">
          <span className="mr-1.5 font-mono text-sm text-neutral-400">#{rank}</span>
          {e.name}
        </div>
        <div
          className={
            "shrink-0 text-base font-black tabular-nums " +
            (s.meanPct == null ? "text-neutral-400" : s.meanPct >= 0 ? "text-emerald-600" : "text-red-500")
          }
          title="mittlere Abweichung vom eigenen Ø (nur Scores mit Vergleichswert)"
        >
          {s.meanPct == null ? "–" : pctTxt(s.meanPct)}
        </div>
      </div>
      <div className="text-xs text-neutral-500">
        {s.aboveAvg} von {s.withAvg} über Ø{s.newBests ? ` · 💪 ${s.newBests} neue${s.newBests === 1 ? "r" : ""} Bestwert${s.newBests === 1 ? "" : "e"}` : ""}
      </div>
      {rows.map((r) => (
        <MatchBlock key={r.matchId} r={r} />
      ))}
      {e.rows.length > MAX_ROWS ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-0.5 text-xs font-semibold text-indigo-600 hover:underline">
          {all ? "weniger anzeigen" : `alle ${e.rows.length} Matches anzeigen`}
        </button>
      ) : null}
    </div>
  );
}

const ScoreBalanceAdmin = forwardRef<
  HTMLDivElement,
  {
    code: string;
    data: AdminData | null;
    profiles?: readonly { id: string; is_bot?: boolean | null }[];
    /** wird hochgezählt (Sprungknopf) → Karte aufklappen */
    openNonce?: number;
  }
>(function ScoreBalanceAdmin({ code, data, profiles, openNonce = 0 }, ref) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!openNonce) return;
    setOpen(true);
    try {
      window.localStorage.setItem(OPEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [openNonce]);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () =>
    setOpen((v) => {
      try {
        window.localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });

  const { ref: refs, error } = useBalanceRefs(code, open);
  const entries = useMemo(
    () =>
      open && refs?.enabled && data
        ? computeAllBalances({
            players: data.players ?? [],
            profiles,
            machines: data.machines ?? [],
            rounds: data.rounds ?? [],
            matches: data.matches ?? [],
            match_players: data.match_players ?? [],
            personal: refs.personal,
            personalAvg: refs.personalAvg,
          })
        : [],
    [open, refs, data, profiles]
  );

  return (
    <div ref={ref} className="mt-6 rounded-2xl border bg-white">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <div>
          <div className="font-semibold">📈 Bilanz</div>
          <div className="text-xs text-neutral-500">Scores heute im Vergleich zum eigenen Ø und Bestwert (aus Turnieren vor diesem)</div>
        </div>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="border-t px-4 py-3">
          {!refs ? (
            <div className="text-sm text-neutral-500">{error ? "Vergleichswerte konnten nicht geladen werden." : "Lade …"}</div>
          ) : !refs.enabled ? (
            <div className="text-sm text-neutral-500">
              Die Bilanz gibt es nur bei Turnieren mit Location und echten Scores (nicht bei Timeplay oder DYP).
            </div>
          ) : !entries.length ? (
            <div className="text-sm text-neutral-500">Noch keine Scores eingetragen.</div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded bg-emerald-500" /> über Ø
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded bg-red-400" /> unter Ø
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded bg-neutral-400" /> Ø
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded bg-indigo-400" /> Bestwert
                </span>
                <span>· Reihenfolge: am stärksten über dem eigenen Ø zuerst</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((e, i) => (
                  <PlayerCard key={e.playerId} e={e} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
});

export default ScoreBalanceAdmin;
