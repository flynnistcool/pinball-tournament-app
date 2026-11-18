"use client";

// 📈 Aufklapp-Bereich im Match (Admin): alle bisherigen Scores eines Spielers auf diesem Flipper
// an dieser Location – als Verlauf (Säulen, älteste links) mit Ø-Linie, darunter die Liste.
// Grundlage wie beim 💪 Pers. Highscore: beendete Turniere hier (ohne Timeplay/DYP); "heute" kommt live dazu.

import { useMachineRecords } from "@/components/MatchRecordsLine";
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
}: {
  code: string;
  profileId: string | null | undefined;
  machineName: string | null | undefined;
  liveEntries: readonly LiveEntry[];
}) {
  const loaded = useMachineRecords(code, true, [profileId]);
  if (!profileId || !machineName) return null;
  if (!loaded) return <div className="text-[11px] text-neutral-400">lädt…</div>;
  if (!loaded.enabled) {
    return <div className="text-[11px] text-neutral-400">Kein Verlauf (Turnier ohne Location oder Timeplay/DYP).</div>;
  }

  const mKey = machineKey(machineName);
  const past: Point[] = loaded.personalHistory?.[personalKey(String(profileId), mKey)] ?? [];
  const today: Point[] = liveEntries
    .filter((e) => e.profileId === String(profileId) && e.machineKey === mKey && e.score > 0)
    .map((e) => ({ score: e.score, at: null, tournament: "dieses Turnier", format: null, today: true }));
  const points = [...past, ...today];

  if (!points.length) {
    return <div className="text-[11px] text-neutral-400">Noch keine Scores auf diesem Flipper an dieser Location.</div>;
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
