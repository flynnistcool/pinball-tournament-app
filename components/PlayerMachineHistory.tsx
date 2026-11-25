"use client";

// 📈 Aufklapp-Bereich im Match (Admin): alle bisherigen Scores eines Spielers auf diesem Flipper
// an dieser Location – als Verlauf (Säulen, älteste links) mit Ø-Linie, darunter die Liste.
// Grundlage wie beim 💪 Pers. Highscore: beendete Turniere hier (ohne Timeplay/DYP); "heute" kommt live dazu.
// Darüber (wenn Gegner übergeben werden): ⚔️ Bilanz gegen jeden Gegner im Match – Allzeit, an diesem Flipper,
// an diesem Flipper nur im Format des laufenden Turniers (Daten: /api/public/rivalry).

import { useMachineRecords } from "@/components/MatchRecordsLine";
import { useRivalryDataShared } from "@/components/RivalryBadge";
import { pairKey } from "@/lib/rivalryInsights";
import { formatLabel } from "@/lib/formatLabel";
import { machineKey, personalKey, type LiveEntry, type PersonalHistoryEntry } from "@/lib/recordWatch";

const fmt = (n: number) => Math.round(n).toLocaleString("de-DE");
const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

type Point = PersonalHistoryEntry & { today?: boolean };

const W = 560;
const H = 140;
const PAD_T = 14;
const PAD_B = 18;

export default function PlayerMachineHistory({
  code,
  profileId,
  machineName,
  liveEntries,
  playerId,
  opponents,
  format,
}: {
  code: string;
  profileId: string | null | undefined;
  machineName: string | null | undefined;
  liveEntries: readonly LiveEntry[];
  /** ⚔️ für die Gegner-Bilanz: dieser Spieler (players.id) + die anderen im Match */
  playerId?: string | null;
  opponents?: readonly { id: string; name: string }[];
  /** Format des laufenden Turniers (für die Spalte "Flipper – nur dieses Format") */
  format?: string | null;
}) {
  const loaded = useMachineRecords(code, true, [profileId]);
  if (!profileId || !machineName) return null;
  const duels =
    playerId && opponents?.length ? (
      <OpponentBalance code={code} playerId={playerId} opponents={opponents} machineName={machineName} format={format ?? null} />
    ) : null;
  if (!loaded)
    return (
      <div className="space-y-2">
        {duels}
        <div className="text-[11px] text-neutral-400">lädt…</div>
      </div>
    );
  if (!loaded.enabled) {
    return (
      <div className="space-y-2">
        {duels}
        <div className="text-[11px] text-neutral-400">Kein Score-Verlauf (Turnier ohne Location oder Timeplay/DYP).</div>
      </div>
    );
  }

  const mKey = machineKey(machineName);
  const past: Point[] = loaded.personalHistory?.[personalKey(String(profileId), mKey)] ?? [];
  const today: Point[] = liveEntries
    .filter((e) => e.profileId === String(profileId) && e.machineKey === mKey && e.score > 0)
    .map((e) => ({ score: e.score, at: null, tournament: "dieses Turnier", format: null, today: true }));
  const points = [...past, ...today];

  if (!points.length) {
    return (
      <div className="space-y-2">
        {duels}
        <div className="text-[11px] text-neutral-400">Noch keine Scores auf diesem Flipper an dieser Location.</div>
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.score));
  const best = past.length ? Math.max(...past.map((p) => p.score)) : null;
  const avg = past.length ? past.reduce((s, p) => s + p.score, 0) / past.length : null;
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const slot = W / points.length;
  const barW = Math.max(3, Math.min(36, slot * 0.7));

  return (
    <div className="space-y-2">
      {duels}
      <div className="flex flex-wrap items-baseline gap-x-3 text-[11px] text-neutral-500">
        <span className="font-semibold text-neutral-700">📈 {machineName} – alle Scores hier</span>
        <span>{past.length} {past.length === 1 ? "Spiel" : "Spiele"} bisher</span>
        {best != null ? (
          <span>
            Bestwert <b className="text-indigo-600">{fmt(best)}</b>
          </span>
        ) : null}
        {avg != null ? (
          <span>
            Ø <b className="text-neutral-700">{fmt(avg)}</b>
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[140px] w-full min-w-[280px]" preserveAspectRatio="none" role="img" aria-label="Verlauf der Scores">
          {points.map((p, i) => {
            const x = i * slot + (slot - barW) / 2;
            const top = y(p.score);
            const isBest = best != null && !p.today && p.score === best;
            const fill = p.today ? "#10b981" : isBest ? "#4f46e5" : "#a5b4fc";
            const label = p.today
              ? `Heute: ${fmt(p.score)}`
              : `${fmtDate(p.at)} · ${p.tournament ? `„${p.tournament}“` : "?"}${p.format ? ` · ${formatLabel(p.format)}` : ""}: ${fmt(p.score)}`;
            return (
              <rect key={i} x={x} y={top} width={barW} height={PAD_T + plotH - top} rx={2} fill={fill}>
                <title>{label}</title>
              </rect>
            );
          })}
          {avg != null ? (
            <>
              <line x1={0} x2={W} y1={y(avg)} y2={y(avg)} stroke="#525252" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              <text x={W - 2} y={y(avg) - 3} textAnchor="end" fontSize={10} fill="#525252">
                Ø
              </text>
            </>
          ) : null}
          <line x1={0} x2={W} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="#d4d4d4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={2} y={H - 4} fontSize={10} fill="#a3a3a3">
            älter
          </text>
          <text x={W - 2} y={H - 4} fontSize={10} fill="#a3a3a3" textAnchor="end">
            neuer
          </text>
        </svg>
      </div>

      {/* Liste: neueste zuerst */}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-[11px] tabular-nums">
          <tbody>
            {[...points].reverse().map((p, i) => (
              <tr key={i} className={"border-b border-neutral-100 last:border-0 " + (p.today ? "bg-emerald-50" : "")}>
                <td className="whitespace-nowrap px-2 py-1 text-neutral-500">{p.today ? "heute" : fmtDate(p.at)}</td>
                <td className="px-2 py-1 text-neutral-700">
                  {p.tournament ?? "?"}
                  {p.format ? <span className="text-neutral-400"> · {formatLabel(p.format)}</span> : null}
                </td>
                <td
                  className={
                    "whitespace-nowrap px-2 py-1 text-right font-semibold " +
                    (p.today ? "text-emerald-600" : best != null && p.score === best ? "text-indigo-600" : "text-neutral-700")
                  }
                >
                  {fmt(p.score)}
                  {!p.today && best != null && p.score === best ? " 🏆" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Bilanz aus Sicht von "me": Siege, Niederlagen, Unentschieden, Quote (Unentschieden halb) */
function balance(meWins: number, otherWins: number, duels: number) {
  const draws = Math.max(0, duels - meWins - otherWins);
  const pct = duels ? ((meWins + draws / 2) / duels) * 100 : null;
  return { w: meWins, l: otherWins, d: draws, duels, pct };
}

function BalanceCell({ b }: { b: ReturnType<typeof balance> | null }) {
  if (!b || !b.duels) return <span className="text-neutral-300">—</span>;
  const tone = b.pct == null ? "" : b.pct > 50 ? "text-emerald-600" : b.pct < 50 ? "text-rose-600" : "text-neutral-600";
  return (
    <span className="whitespace-nowrap" title={`${b.duels} Duelle: ${b.w} Siege, ${b.l} Niederlagen${b.d ? `, ${b.d} unentschieden` : ""}`}>
      <b className="text-neutral-700">
        {b.w} : {b.l}
      </b>
      {b.d ? <span className="text-neutral-400"> ({b.d} =)</span> : null}{" "}
      <b className={tone}>{Math.round(b.pct ?? 0)} %</b>
    </span>
  );
}

/** ⚔️ Bilanz gegen jeden Gegner im Match: Allzeit (alle Matches), an diesem Flipper, an diesem Flipper nur im Format */
export function OpponentBalance({
  code,
  playerId,
  opponents,
  machineName,
  format,
  title = "⚔️ Bilanz gegen",
  accent = false,
}: {
  code: string;
  playerId: string;
  opponents: readonly { id: string; name: string }[];
  machineName: string;
  format: string | null;
  /** Überschrift der ersten Spalte */
  title?: string;
  /** dezent hervorgehoben (Handy: geht sonst unter) – leichter Violett-Ton, kräftigere Überschrift */
  accent?: boolean;
}) {
  const fmtKey = String(format ?? "").toLowerCase();
  const riv = useRivalryDataShared(code);
  const mk = machineKey(machineName);
  const rows = opponents.map((o) => {
    const key = pairKey(playerId, o.id);
    const meIsX = playerId < o.id;
    const side = (s: { xWins: number; yWins: number; duels: number } | undefined) =>
      s ? balance(meIsX ? s.xWins : s.yWins, meIsX ? s.yWins : s.xWins, s.duels) : null;
    return {
      o,
      all: side(riv.pairs[key]),
      here: side(riv.pairMachine?.[key]?.[mk]),
      hereFmt: fmtKey ? side(riv.pairMachine?.[key]?.[`${mk}@${fmtKey}`]) : null,
    };
  });
  return (
    <div
      className={
        "overflow-x-auto rounded-lg border " +
        (accent ? "border-violet-200 bg-violet-50/60 shadow-sm ring-1 ring-violet-100" : "border-neutral-200 bg-white")
      }
    >
      <table className="w-full text-[11px] tabular-nums">
        <thead>
          <tr
            className={
              "border-b align-bottom " +
              (accent ? "border-violet-200 bg-violet-100/70 text-violet-500" : "border-neutral-100 text-neutral-400")
            }
          >
            <th className={"px-2 py-1 text-left " + (accent ? "font-bold text-violet-900" : "font-semibold text-neutral-700")}>
              {title}
            </th>
            <th className="px-2 py-1 text-left font-normal">
              Allzeit
              <span className="block text-[10px] leading-tight">alle Matches</span>
            </th>
            <th className="px-2 py-1 text-left font-normal" title="dieser Flipper an dieser Location, alle Formate">
              {machineName}
              <span className="block text-[10px] leading-tight">alle Formate</span>
            </th>
            {fmtKey ? (
              <th className="px-2 py-1 text-left font-normal" title="dieser Flipper an dieser Location, nur dieses Format">
                {machineName}
                <span className="block text-[10px] leading-tight">nur {formatLabel(fmtKey)}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ o, all, here, hereFmt }) => (
            <tr key={o.id} className={"border-b last:border-0 " + (accent ? "border-violet-100" : "border-neutral-100")}>
              <td className={"px-2 py-1 " + (accent ? "font-semibold text-violet-900" : "text-neutral-700")}>{o.name}</td>
              <td className="px-2 py-1">
                <BalanceCell b={all} />
              </td>
              <td className="px-2 py-1">
                <BalanceCell b={here} />
              </td>
              {fmtKey ? (
                <td className="px-2 py-1">
                  <BalanceCell b={hereFmt} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
