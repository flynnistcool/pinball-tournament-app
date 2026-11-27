"use client";

// 📈 Reiter "Bilanz" auf der Handy-Seite: meine Scores in diesem Turnier im Vergleich zu meinem
// persönlichen Ø und Bestwert auf dem jeweiligen Flipper (frühere Turniere an dieser Location,
// nur solche VOR diesem Turnier – cutoff=start). Rechnung: lib/scoreBalance.ts

import { useEffect, useMemo, useState } from "react";
import { computeScoreBalance, type BalanceRow } from "@/lib/scoreBalance";
import type { MmData } from "@/lib/myMatch";

const REFRESH_MS = 5 * 60_000;
const fmt = new Intl.NumberFormat("de-DE");

type Ref = {
  enabled: boolean;
  personal: Record<string, number>;
  personalAvg: Record<string, { avg: number; n: number }>;
};

function useBalanceRefs(code: string): { ref: Ref | null; error: boolean } {
  const [ref, setRef] = useState<Ref | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const run = () =>
      fetch(`/api/public/machine-records?code=${encodeURIComponent(code)}&cutoff=start&ts=${Date.now()}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          if (!j?.ok) {
            setError(true);
            return;
          }
          setError(false);
          setRef({ enabled: !!j.enabled, personal: j.personal ?? {}, personalAvg: j.personalAvg ?? {} });
        })
        .catch(() => alive && setError(true));
    run();
    const id = window.setInterval(run, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [code]);
  return { ref, error };
}

function Bar({ label, value, max, cls, strong }: { label: string; value: number | null; max: number; cls: string; strong?: boolean }) {
  const pct = value != null && max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
      <span className="text-neutral-500">{label}</span>
      <div className="h-3 rounded-full bg-neutral-100">
        {value != null ? <div className={"h-3 rounded-full " + cls} style={{ width: `${pct}%` }} /> : null}
      </div>
      <span className={"tabular-nums " + (strong ? "font-bold text-neutral-900" : "text-neutral-600")}>
        {value != null ? fmt.format(value) : "–"}
      </span>
    </div>
  );
}

function RowCard({ r }: { r: BalanceRow }) {
  const max = Math.max(r.score, r.avg ?? 0, r.best ?? 0);
  const above = r.avg != null ? r.score > r.avg : null;
  const noRef = r.avg == null && r.best == null;
  return (
    <div className="rounded-2xl bg-white px-3 py-2.5 shadow-sm">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="min-w-0 truncate font-bold">
          {r.icon ? <span className="mr-1">{r.icon}</span> : null}
          {r.machineName}
          {r.roundNumber != null ? <span className="ml-1.5 text-xs font-normal text-neutral-400">Runde {r.roundNumber}</span> : null}
        </div>
        <div className="shrink-0 text-xs font-semibold">
          {r.newBest ? (
            <span className="text-emerald-600">🎉 neuer Bestwert</span>
          ) : r.vsAvgPct != null ? (
            <span className={above ? "text-emerald-600" : "text-red-500"}>
              {r.vsAvgPct > 0 ? "+" : ""}
              {r.vsAvgPct} % zum Ø
            </span>
          ) : null}
        </div>
      </div>
      <div className="space-y-1">
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
      {r.avg != null ? (
        <div className="mt-1 text-[11px] text-neutral-400">
          Ø aus {r.avgN} {r.avgN === 1 ? "Spiel" : "Spielen"} vor diesem Turnier
        </div>
      ) : null}
    </div>
  );
}

export default function PhoneScoreBalance({ code, data, meId }: { code: string; data: MmData; meId: string }) {
  const { ref, error } = useBalanceRefs(code);
  const bal = useMemo(
    () =>
      ref
        ? computeScoreBalance({
            playerId: meId,
            players: data.players,
            machines: data.machines,
            rounds: data.rounds,
            matches: data.matches,
            match_players: data.match_players,
            personal: ref.personal,
            personalAvg: ref.personalAvg,
          })
        : null,
    [ref, data, meId]
  );

  if (!ref) {
    return (
      <div className="py-10 text-center text-sm text-neutral-500">
        {error ? "Vergleichswerte konnten gerade nicht geladen werden – gleich nochmal versuchen." : "Lade …"}
      </div>
    );
  }
  if (!ref.enabled) {
    return (
      <div className="rounded-2xl bg-white p-5 text-center text-sm text-neutral-600 shadow-sm">
        Die Bilanz gibt es nur bei Turnieren mit Location und echten Scores (nicht bei Timeplay oder DYP).
      </div>
    );
  }
  if (!bal || !bal.rows.length) {
    return (
      <div className="rounded-2xl bg-white p-5 text-center text-sm text-neutral-600 shadow-sm">
        Sobald du deinen ersten Score hast, siehst du hier, wie er im Vergleich zu deinem Ø und Bestwert liegt.
      </div>
    );
  }
  const s = bal.summary;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
        <div className="text-sm font-black uppercase tracking-wide text-neutral-500">📈 Meine Bilanz</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-black tabular-nums">
              {s.aboveAvg}
              <span className="text-sm font-semibold text-neutral-400"> / {s.withAvg}</span>
            </div>
            <div className="text-[11px] text-neutral-500">über Ø</div>
          </div>
          <div>
            <div
              className={
                "text-xl font-black tabular-nums " +
                (s.meanPct == null ? "" : s.meanPct >= 0 ? "text-emerald-600" : "text-red-500")
              }
            >
              {s.meanPct == null ? "–" : `${s.meanPct > 0 ? "+" : ""}${s.meanPct} %`}
            </div>
            <div className="text-[11px] text-neutral-500">im Mittel zum Ø</div>
          </div>
          <div>
            <div className="text-xl font-black tabular-nums">{s.newBests}</div>
            <div className="text-[11px] text-neutral-500">💪 neue Bestwerte</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
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
        </div>
      </div>
      {bal.rows.map((r) => (
        <RowCard key={r.matchId} r={r} />
      ))}
      <div className="px-1 text-[11px] text-neutral-400">
        Ø und Bestwert: deine Scores an diesem Flipper in früheren, beendeten Turnieren hier – nur Turniere vor diesem.
      </div>
    </div>
  );
}
