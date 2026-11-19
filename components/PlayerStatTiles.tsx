"use client";

// 🧱 Kennzahlen-Leiste in der Spielerzeile (Admin-Match): kleine beschriftete Kästchen
//    Siegchance · Turnier · Flipper · Pers. Highscore · Ø
// Höchster Wert im Match grün, niedrigster dezent rot (Töne kommen vom Aufrufer).
// Große Zahlen gekürzt (59,0 Mio), volle Zahl im Mouseover. Highscore/Ø wie PersonalBestLine (useMachineRecords).

import type { ReactNode } from "react";
import { useMachineRecords } from "@/components/MatchRecordsLine";
import { useBadgeOn } from "@/components/DisplayDevice";
import { isPremiere, personalForMachine } from "@/lib/matchRecords";
import { machineKey, personalKey, type LiveEntry } from "@/lib/recordWatch";
import { personalRecordTitle } from "@/lib/personalRecordTitle";
import { levelText } from "@/lib/scoreForm";
import { shortScore } from "@/lib/shortScore";

export { shortScore };

export type Tone = "top" | "low" | "mid";

const toneCls = (t: Tone | undefined) =>
  t === "top" ? "text-emerald-600" : t === "low" ? "text-rose-500" : "text-neutral-700";

const full = (n: number) => Math.round(n).toLocaleString("de-DE");
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(Math.round(v * 10) / 10).toLocaleString("de-DE")} %`);

function Tile({ label, children, title, accent }: { label: string; children: ReactNode; title?: string; accent?: boolean }) {
  return (
    <div
      className={
        "min-w-[4.6rem] flex-1 rounded-lg px-2 py-1 ring-1 " +
        (accent ? "bg-amber-50/70 ring-amber-200" : "bg-white/70 ring-neutral-200") +
        (title ? " cursor-help" : "")
      }
      title={title}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-[12px] font-semibold tabular-nums leading-tight">{children}</div>
    </div>
  );
}

export default function PlayerStatTiles({
  chance,
  t,
  tTone,
  m,
  mCount,
  mTone,
  winrateLoading,
  code,
  profileId,
  machineName,
  liveEntries,
  matchId,
  finished,
  showChance = true,
}: {
  /** Siegchance (0..1) + Ton + Mouseover; null = keine */
  chance: { value: number; tone: Tone; title: string; favorite?: boolean } | null;
  t: number | null;
  tTone?: Tone;
  m: number | null;
  mCount: number;
  mTone?: Tone;
  winrateLoading?: boolean;
  code: string;
  profileId: string | null | undefined;
  machineName: string | null | undefined;
  liveEntries: readonly LiveEntry[];
  matchId?: string | null;
  finished?: boolean;
  /** Variante "Mischung": Siegchance steht als Balken darüber → hier weglassen */
  showChance?: boolean;
}) {
  const loaded = useMachineRecords(code, !finished, [profileId]);
  const premiereOn = useBadgeOn("badge:premiere");
  const rec = !finished && loaded?.enabled && profileId && machineName ? loaded : null;
  const pb = rec ? personalForMachine(profileId, machineName, rec.personal, liveEntries) : null;
  const pk = profileId && machineName ? personalKey(String(profileId), machineKey(machineName)) : "";
  const avg = rec && pk ? rec.personalAvg?.[pk] : null;
  const beaten = pb && pb.before != null && pb.today != null && pb.today > pb.before;
  const premiere = !!rec && premiereOn && isPremiere(profileId, machineName, rec.personal, liveEntries, matchId, rec.played);

  return (
    <div className="pl-9 flex flex-wrap gap-1.5 pt-0.5">
      {showChance && chance ? (
        <Tile label={chance.favorite ? "Siegchance ★" : "Siegchance"} title={chance.title} accent={chance.favorite}>
          <span className={toneCls(chance.tone)}>{Math.round(chance.value * 100)} %</span>
        </Tile>
      ) : null}
      <Tile label="Turnier" title="Turnier-Winrate (Siege in diesem Turnier)">
        <span className={toneCls(tTone)}>{winrateLoading && t == null ? "…" : pct(t)}</span>
      </Tile>
      <Tile label="Flipper" title={`Flipper-Winrate an diesem Flipper (diese Location)${mCount ? ` – ${mCount} Spiele` : ""}`}>
        <span className={toneCls(mTone)}>{winrateLoading && m == null ? "…" : pct(m)}</span>
        {mCount ? <span className="font-normal text-neutral-400"> ({mCount})</span> : null}
      </Tile>
      {rec ? (
        <>
          <Tile
            label={premiere ? "Bestwert · 🎰 Premiere" : "Bestwert"}
            title={pb?.before != null ? `${full(pb.before)} – ${personalRecordTitle(rec.personalInfo?.[pk])}` : "noch kein Score auf diesem Flipper hier"}
          >
            {pb?.before != null ? <span className="text-indigo-600">{shortScore(pb.before)}</span> : <span className="text-neutral-300">—</span>}
            {beaten ? <span className="ml-1 text-emerald-600">🎉</span> : null}
          </Tile>
          <Tile
            label="Ø"
            title={avg && avg.n ? `${full(avg.avg)} – Durchschnitt aus ${avg.n} ${avg.n === 1 ? "Spiel" : "Spielen"} (${levelText(rec.avgLevel)})` : "noch kein Durchschnitt"}
          >
            {avg && avg.n ? shortScore(avg.avg) : <span className="text-neutral-300">—</span>}
          </Tile>
        </>
      ) : null}
    </div>
  );
}
