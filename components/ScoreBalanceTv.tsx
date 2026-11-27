"use client";

// 📈 Reiter "Bilanz" am Infobildschirm (/s/<code>/tv): je Spieler seine Scores in diesem Turnier
// im Vergleich zu seinem persönlichen Ø und Bestwert auf dem Flipper (nur Turniere VOR diesem –
// cutoff=start). 4 Spieler je Seite, blättert alle 10 s. Reihenfolge: wer heute am stärksten über
// seinem Ø spielt, zuerst. Rechnung wie auf dem Handy: lib/scoreBalance.ts

import { useEffect, useMemo, useRef, useState } from "react";
import { useBalanceRefs } from "@/components/useBalanceRefs";
import { computeAllBalances, type BalanceRow, type PlayerBalance } from "@/lib/scoreBalance";

const PAGE_SIZE = 4;
const PAGE_MS = 10_000;
const MAX_ROWS = 5;
const fmt = new Intl.NumberFormat("de-DE");

type TvData = {
  players?: readonly { id: string; name?: string | null; profile_id?: string | null }[];
  profiles?: readonly { id: string; is_bot?: boolean | null }[];
  machines?: readonly { id: string; name: string | null; icon_emoji?: string | null }[];
  rounds?: readonly { id: string; number: number | null }[];
  matches?: readonly { id: string; round_id: string; machine_id: string | null }[];
  match_players?: readonly { match_id: string; player_id: string; score: number | string | null }[];
};

type Entry = PlayerBalance;

function pctTxt(p: number) {
  return `${p > 0 ? "+" : ""}${p} %`;
}

function Bar({ label, value, max, cls, strong }: { label: string; value: number | null; max: number; cls: string; strong?: boolean }) {
  const pct = value != null && max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[3.6rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-sm">
      <span className="text-white/50">{label}</span>
      <div className="h-2.5 rounded-full bg-white/10">
        {value != null ? <div className={"h-2.5 rounded-full " + cls} style={{ width: `${pct}%` }} /> : null}
      </div>
      <span className={"text-right tabular-nums " + (strong ? "font-bold text-white" : "text-white/60")}>
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
    <div className="border-t border-white/10 pt-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="min-w-0 truncate font-semibold text-white">
          {r.icon ? <span className="mr-1">{r.icon}</span> : null}
          {r.machineName}
        </div>
        <div className="shrink-0 text-sm font-bold">
          {r.newBest ? (
            <span className="text-emerald-300">🎉 Bestwert</span>
          ) : r.vsAvgPct != null ? (
            <span className={above ? "text-emerald-300" : "text-red-300"}>{pctTxt(r.vsAvgPct)}</span>
          ) : null}
        </div>
      </div>
      <div className="space-y-1">
        <Bar
          label="Heute"
          value={r.score}
          max={max}
          strong
          cls={above == null ? "bg-indigo-400" : above ? "bg-emerald-400" : "bg-red-400"}
        />
        {noRef ? (
          <div className="text-sm text-white/40">🆕 noch kein Vergleichswert</div>
        ) : (
          <>
            <Bar label="Ø" value={r.avg} max={max} cls="bg-white/40" />
            <Bar label="Best" value={r.best} max={max} cls="bg-indigo-400" />
          </>
        )}
      </div>
    </div>
  );
}

function PlayerBalanceCard({ e }: { e: Entry }) {
  const s = e.summary;
  const rows = e.rows.slice(0, MAX_ROWS);
  return (
    <div className="flex w-[350px] flex-col gap-2 rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/15">
      <div className="truncate text-2xl font-black text-white">{e.name}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-2xl font-black tabular-nums text-white">
            {s.aboveAvg}
            <span className="text-base font-semibold text-white/40"> / {s.withAvg}</span>
          </div>
          <div className="text-xs text-white/50">über Ø</div>
        </div>
        <div>
          <div
            className={
              "text-2xl font-black tabular-nums " +
              (s.meanPct == null ? "text-white/60" : s.meanPct >= 0 ? "text-emerald-300" : "text-red-300")
            }
          >
            {s.meanPct == null ? "–" : pctTxt(s.meanPct)}
          </div>
          <div className="text-xs text-white/50">im Mittel</div>
        </div>
        <div>
          <div className="text-2xl font-black tabular-nums text-white">{s.newBests}</div>
          <div className="text-xs text-white/50">💪 Bestwerte</div>
        </div>
      </div>
      {rows.map((r) => (
        <MatchBlock key={r.matchId} r={r} />
      ))}
      {e.rows.length > MAX_ROWS ? (
        <div className="text-center text-xs text-white/40">+ {e.rows.length - MAX_ROWS} weitere Matches</div>
      ) : null}
    </div>
  );
}

export default function ScoreBalanceTv({ code, data }: { code: string; data: TvData | null }) {
  const { ref, error } = useBalanceRefs(code);
  const [page, setPage] = useState(0);

  const entries: Entry[] = useMemo(
    () =>
      ref?.enabled && data
        ? computeAllBalances({
            players: data.players ?? [],
            profiles: data.profiles,
            machines: data.machines ?? [],
            rounds: data.rounds ?? [],
            matches: data.matches ?? [],
            match_players: data.match_players ?? [],
            personal: ref.personal,
            personalAvg: ref.personalAvg,
          })
        : [],
    [ref, data]
  );

  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  useEffect(() => {
    if (pages < 2) return;
    const t = window.setTimeout(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => window.clearTimeout(t);
  }, [pages, page]);
  const go = (delta: number) => setPage((p) => ((((p % pages) + delta) % pages) + pages) % pages);
  const swipeX = useRef<number | null>(null);

  const msg = (t: string) => <div className="w-[1500px] py-24 text-center text-2xl text-white/50">{t}</div>;
  if (!ref) return msg(error ? "Bilanz gerade nicht verfügbar – neuer Versuch gleich …" : "Lade Bilanz …");
  if (!ref.enabled) return msg("Die Bilanz gibt es nur bei Turnieren mit Location und echten Scores (nicht bei Timeplay oder DYP).");
  if (!entries.length) return msg("Noch keine Scores – die Bilanz erscheint mit den ersten Ergebnissen.");

  const p = page % pages;
  const visible = entries.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  return (
    <div
      className="flex w-[1500px] touch-pan-y select-none flex-col items-center gap-5 py-4"
      onPointerDown={(ev) => {
        swipeX.current = ev.clientX;
      }}
      onPointerUp={(ev) => {
        const x0 = swipeX.current;
        swipeX.current = null;
        if (x0 == null || pages < 2) return;
        const dx = ev.clientX - x0;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        swipeX.current = null;
      }}
    >
      <div key={p} className="flex items-start justify-center gap-6" style={{ animation: "tvFadeIn 0.6s ease both" }}>
        {visible.map((e) => (
          <PlayerBalanceCard key={e.playerId} e={e} />
        ))}
      </div>
      <div className="flex items-center gap-6 text-sm text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded bg-emerald-400" /> über Ø
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded bg-red-400" /> unter Ø
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded bg-white/40" /> Ø
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded bg-indigo-400" /> Bestwert
        </span>
        <span>· Ø und Bestwert aus Turnieren vor diesem</span>
      </div>
      {pages > 1 ? (
        <div className="flex gap-2">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Seite ${i + 1}`}
              onClick={() => setPage(i)}
              className="flex h-8 w-8 items-center justify-center rounded-full"
            >
              <span className={`h-3 w-3 rounded-full ${i === p ? "bg-white" : "bg-white/25"}`} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
