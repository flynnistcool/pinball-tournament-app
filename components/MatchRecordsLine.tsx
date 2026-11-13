"use client";

// Zeile im Match-Kopf (Admin): 🏆 Highscore und 📅 30-Tage-Highscore des Flippers mit Haltern.
// Die bisherigen Rekorde werden pro Turnier nur EINMAL geladen (geteilt von allen Matches)
// und alle 5 Minuten aufgefrischt. Scores des laufenden Turniers zählen sofort mit.
// Bei Timeplay/DYP oder Turnieren ohne Location wird nichts angezeigt.

import { useEffect, useState } from "react";
import type { LiveEntry, PriorRecords } from "@/lib/recordWatch";
import { personalForMachine, recordsForMachine, type ShownRecord } from "@/lib/matchRecords";

type Loaded = { enabled: boolean; prior: Pick<PriorRecords, "records" | "monthly">; personal: PriorRecords["personal"] };

const REFRESH_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: Loaded | null; promise: Promise<Loaded | null> | null }>();

function loadRecords(code: string): Promise<Loaded | null> {
  const hit = cache.get(code);
  if (hit?.promise) return hit.promise;
  if (hit && hit.value && Date.now() - hit.at < REFRESH_MS) return Promise.resolve(hit.value);

  const promise = fetch(`/api/public/machine-records?code=${encodeURIComponent(code)}&ts=${Date.now()}`, {
    cache: "no-store",
  })
    .then((res) => res.json().then((j) => ({ res, j })))
    .then(({ res, j }) => {
      if (!res.ok || !j?.ok) return hit?.value ?? null;
      return {
        enabled: !!j.enabled,
        prior: { records: j.records ?? {}, monthly: j.monthly ?? {} },
        personal: j.personal ?? {},
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

export function useMachineRecords(code: string, active = true): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded | null>(() => cache.get(code)?.value ?? null);
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
  if (props.hidden) return null;
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
}) {
  if (props.hidden) return null;
  return <PersonalBestLineInner {...props} />;
}

function PersonalBestLineInner({
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
  const loaded = useMachineRecords(code);
  if (!profileId || !machineName || !loaded?.enabled) return null;

  const { before, today } = personalForMachine(profileId, machineName, loaded.personal, liveEntries);
  const beaten = before != null && today != null && today > before;
  return (
    <div className="pb-personal flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-neutral-500">
      <span>💪 Pers. Highscore</span>
      {/* leer = noch nie an dieser Location auf dem Flipper gespielt */}
      {before != null ? <span className="font-semibold text-indigo-600">{fmt(before)}</span> : null}
      {today != null ? (
        <span className={beaten ? "font-semibold text-emerald-600" : ""}>
          · heute {fmt(today)}
          {beaten ? " 🎉 übertroffen" : ""}
        </span>
      ) : null}
    </div>
  );
}
