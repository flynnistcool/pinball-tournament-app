"use client";

// Zeile im Match-Kopf (Admin): 🏆 Highscore und 📅 30-Tage-Highscore des Flippers mit Haltern.
// Die bisherigen Rekorde werden pro Turnier nur EINMAL geladen (geteilt von allen Matches)
// und alle 5 Minuten aufgefrischt. Scores des laufenden Turniers zählen sofort mit.
// Bei Timeplay/DYP oder Turnieren ohne Location wird nichts angezeigt.

import { useBadgeOn } from "@/components/DisplayDevice";
import { useEffect, useState } from "react";
import { machineKey, personalKey, type LiveEntry, type PriorRecords } from "@/lib/recordWatch";
import { personalRecordTitle as personalTitle } from "@/lib/personalRecordTitle";
import { levelText } from "@/lib/scoreForm";
import { isPremiere, personalForMachine, recordsForMachine, type ShownRecord } from "@/lib/matchRecords";

type Loaded = {
  enabled: boolean;
  prior: Pick<PriorRecords, "records" | "monthly" | "excludedProfiles">;
  personal: PriorRecords["personal"];
  /** woher der persönliche Bestwert stammt (Mouseover) */
  personalInfo: NonNullable<PriorRecords["personalInfo"]>;
  /** Ø-Score + Anzahl Spiele je Profil|Flipper */
  personalAvg: NonNullable<PriorRecords["personalAvg"]>;
  /** alle bisherigen Scores je Profil|Flipper (Verlauf beim Aufklappen) */
  personalHistory: NonNullable<PriorRecords["personalHistory"]>;
  /** Punkteniveau, nach dem der Ø gebildet wird ("normal" | "high") */
  avgLevel: string | null;
  /** 🎰 an dieser Location schon gespielt (Profil|Flipper) */
  played: ReadonlySet<string>;
  /** für diese Profile wurde gerechnet (fehlt eins → neu laden) */
  profiles: ReadonlySet<string>;
};
/** schon erzwungene Nachlade-Versuche (Code|fehlende Profile) – damit es keine Endlosschleife gibt */
const forcedFor = new Set<string>();

const REFRESH_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: Loaded | null; promise: Promise<Loaded | null> | null }>();

function loadRecords(code: string, force = false): Promise<Loaded | null> {
  const hit = cache.get(code);
  if (hit?.promise) return hit.promise;
  if (!force && hit && hit.value && Date.now() - hit.at < REFRESH_MS) return Promise.resolve(hit.value);

  const promise = fetch(`/api/public/machine-records?code=${encodeURIComponent(code)}&ts=${Date.now()}`, {
    cache: "no-store",
  })
    .then((res) => res.json().then((j) => ({ res, j })))
    .then(({ res, j }) => {
      if (!res.ok || !j?.ok) return hit?.value ?? null;
      return {
        enabled: !!j.enabled,
        prior: { records: j.records ?? {}, monthly: j.monthly ?? {}, excludedProfiles: j.excludedProfiles ?? [] },
        personal: j.personal ?? {},
        personalInfo: j.personalInfo ?? {},
        personalAvg: j.personalAvg ?? {},
        personalHistory: j.personalHistory ?? {},
        avgLevel: j.avgLevel ?? null,
        played: new Set<string>(Array.isArray(j.played) ? j.played.map(String) : []),
        profiles: new Set<string>(Array.isArray(j.profiles) ? j.profiles.map(String) : []),
      };
    })
    .catch(() => hit?.value ?? null)
    .then((value) => {
      cache.set(code, { at: Date.now(), value, promise: null });
      return value;
    });
  cache.set(code, { at: hit?.at ?? 0, value: hit?.value ?? null, promise });
  return promise;
}

export function useMachineRecords(
  code: string,
  active = true,
  /** Profile, die gebraucht werden – fehlt eins in den geladenen Daten (Spieler später hinzugefügt), sofort neu laden */
  needProfiles?: readonly (string | null | undefined)[]
): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded | null>(() => cache.get(code)?.value ?? null);
  const needKey = Array.from(new Set((needProfiles ?? []).filter(Boolean).map(String)))
    .sort()
    .join(",");
  useEffect(() => {
    if (!active || !loaded || !loaded.enabled || !needKey) return;
    const missing = needKey.split(",").filter((id) => !loaded.profiles.has(id));
    if (!missing.length) return;
    const tryKey = `${code}|${missing.join(",")}`;
    if (forcedFor.has(tryKey)) return; // schon versucht (z. B. Profil ohne Daten) → nicht endlos neu laden
    forcedFor.add(tryKey);
    void loadRecords(code, true).then((v) => {
      if (v) setLoaded(v);
    });
  }, [needKey, loaded, active, code]);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    const run = () => {
      void loadRecords(code).then((v) => {
        if (!disposed && v) setLoaded(v);
      });
    };
    run();
    const id = window.setInterval(run, REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [code, active]);
  return loaded;
}

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}

function Item({ icon, label, rec }: { icon: string; label: string; rec: ShownRecord | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
      <span>{icon}</span>
      <span className="text-neutral-500">{label}:</span>
      {rec ? (
        <>
          <span className="font-semibold tabular-nums text-indigo-600">{fmt(rec.score)}</span>
          {rec.holder ? <span className="truncate text-neutral-600">· {rec.holder}</span> : null}
        </>
      ) : (
        <span className="text-neutral-400">—</span>
      )}
    </span>
  );
}

export default function MatchRecordsLine(props: {
  /** true = nichts laden/anzeigen (z. B. beendetes Turnier) */
  hidden?: boolean;
  code: string;
  machineName: string | null | undefined;
  liveEntries: readonly LiveEntry[];
}) {
  const on = useBadgeOn("badge:records"); // 🏷️ an/aus je Gerät
  if (props.hidden || !on) return null;
  return <MatchRecordsLineInner {...props} />;
}

function MatchRecordsLineInner({
  code,
  machineName,
  liveEntries,
}: {
  code: string;
  machineName: string | null | undefined;
  liveEntries: readonly LiveEntry[];
}) {
  const loaded = useMachineRecords(code);
  if (!machineName || !loaded?.enabled) return null;

  const { best, month } = recordsForMachine(machineName, loaded.prior, liveEntries);
  return (
    <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-[#e8cfae] pt-1 text-[11px]">
      <Item icon="🏆" label="Highscore" rec={best} />
      <Item icon="📅" label="30 Tage" rec={month} />
    </div>
  );
}

/**
 * Zeile unter einem Spieler im Match: persönlicher Highscore auf diesem Flipper.
 * Zum Nachvollziehen des 💪-Jubels: der kommt nur, wenn es einen Wert aus früheren Turnieren gibt
 * und ein neuer Score diesen (und die eigenen Scores von heute) übertrifft.
 */
export function PersonalBestLine(props: {
  /** true = nichts laden/anzeigen (z. B. beendetes Turnier) */
  hidden?: boolean;
  code: string;
  profileId: string | null | undefined;
  machineName: string | null | undefined;
  liveEntries: readonly LiveEntry[];
  /** dieses Match (für 🎰 Premiere: Scores aus genau diesem Match zählen nicht als "schon gespielt") */
  matchId?: string | null;
}) {
  if (props.hidden) return null;
  return <PersonalBestLineInner {...props} />;
}

function PersonalBestLineInner({
  code,
  profileId,
  machineName,
  liveEntries,
  matchId,
}: {
  code: string;
  profileId: string | null | undefined;
  machineName: string | null | undefined;
  liveEntries: readonly LiveEntry[];
  matchId?: string | null;
}) {
  const loaded = useMachineRecords(code, true, [profileId]);
  const premiereOn = useBadgeOn("badge:premiere"); // 🏷️ an/aus je Gerät
  if (!profileId || !machineName || !loaded?.enabled) return null;

  const { before, today } = personalForMachine(profileId, machineName, loaded.personal, liveEntries);
  const avg = loaded.personalAvg?.[personalKey(String(profileId), machineKey(machineName))];
  const beaten = before != null && today != null && today > before;
  const premiere = premiereOn && isPremiere(profileId, machineName, loaded.personal, liveEntries, matchId, loaded.played);
  return (
    <div className="pb-personal flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-neutral-500">
      {premiere ? (
        <span
          className="rounded-full border border-pink-200 bg-pink-50 px-1.5 py-px font-semibold text-pink-700"
          title="Erstes Spiel an diesem Flipper (an dieser Location)"
        >
          🎰 Premiere
        </span>
      ) : null}
      <span title="Persönlicher Highscore an diesem Flipper (diese Location)">💪 Bestwert</span>
      {/* leer = noch nie an dieser Location auf dem Flipper gespielt */}
      {before != null ? (
        <span
          className="cursor-help font-semibold text-indigo-600"
          title={personalTitle(loaded.personalInfo[personalKey(String(profileId), machineKey(machineName))])}
        >
          {fmt(before)}
        </span>
      ) : null}
      {avg && avg.n > 0 ? (
        <span
          className="cursor-help"
          title={`Durchschnittsscore aus ${avg.n} ${avg.n === 1 ? "Spiel" : "Spielen"} an diesem Flipper (${levelText(loaded.avgLevel)}, beendete Turniere hier, ohne heute)`}
        >
          · Ø <span className="font-semibold text-neutral-700">{fmt(avg.avg)}</span>
        </span>
      ) : null}
      {/* "heute" steht schon im Punkte-Feld daneben – nur noch das Übertroffen-Zeichen */}
      {beaten ? <span className="font-semibold text-emerald-600">🎉 übertroffen</span> : null}
    </div>
  );
}
