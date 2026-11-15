"use client";

// ⚔️ Gegner-Bilanz im Spielerprofil (Daten: /api/players/rivals, Rechnung: lib/rivals.ts)
// Je Kategorie eine Zeile mit Platz 1 – 3.

import { useEffect, useState } from "react";
import type { DuelLogEntry, RivalKind, RivalStat } from "@/lib/rivals";

type ProfileInfo = { name: string; icon: string | null; color: string | null };
type Resp = Record<RivalKind, RivalStat[]> & {
  ok: boolean;
  error?: string;
  minDuels: number;
  minStreak: number;
  profiles: Record<string, ProfileInfo>;
};

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

function Avatar({ p, size = 36 }: { p: ProfileInfo; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border"
      style={{ width: size, height: size, fontSize: size * 0.5, ...(p.color ? { background: p.color } : {}) }}
    >
      {p.icon ?? <span className="text-[11px] font-bold text-neutral-600">{initials(p.name)}</span>}
    </span>
  );
}

const pct = (n: number) => `${Math.round(n)} %`;
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("de-DE", { dateStyle: "medium" }) : "?");

const ROWS: { kind: RivalKind; title: string; hint: string; box: string; head: string; text: string; empty: string; rankBox: [string, string] }[] = [
  {
    kind: "frequent",
    title: "🤝 Stammgegner",
    hint: "die meisten Duelle",
    box: "border-sky-100 bg-sky-50/20",
    head: "bg-sky-100 text-sky-800",
    rankBox: ["border-sky-200 bg-sky-50/70", "border-sky-100 bg-sky-50/40"],
    text: "text-sky-700",
    empty: "Noch kein Gegner mit genug gemeinsamen Duellen",
  },
  {
    kind: "even",
    title: "⚖️ Ebenbürtig",
    hint: "Bilanz am nächsten an 50 %",
    box: "border-amber-100 bg-amber-50/20",
    head: "bg-amber-100 text-amber-800",
    rankBox: ["border-amber-200 bg-amber-50/70", "border-amber-100 bg-amber-50/40"],
    text: "text-amber-700",
    empty: "Noch kein Gegner mit genug gemeinsamen Duellen",
  },
  {
    kind: "nemesis",
    title: "😈 Erzfeind",
    hint: "schlechteste Bilanz",
    box: "border-rose-100 bg-rose-50/20",
    head: "bg-rose-100 text-rose-800",
    rankBox: ["border-rose-200 bg-rose-50/70", "border-rose-100 bg-rose-50/40"],
    text: "text-rose-700",
    empty: "Niemand hat eine bessere Bilanz gegen dich",
  },
  {
    kind: "favorite",
    title: "😎 Lieblingsgegner",
    hint: "beste Bilanz",
    box: "border-emerald-100 bg-emerald-50/20",
    head: "bg-emerald-100 text-emerald-800",
    rankBox: ["border-emerald-200 bg-emerald-50/70", "border-emerald-100 bg-emerald-50/40"],
    text: "text-emerald-700",
    empty: "Noch kein Gegner mit klar positiver Bilanz",
  },
  {
    kind: "streak",
    title: "🔥 Längste Siegesserie",
    hint: "die meisten gewonnenen Duelle am Stück",
    box: "border-orange-100 bg-orange-50/20",
    head: "bg-orange-100 text-orange-800",
    rankBox: ["border-orange-200 bg-orange-50/70", "border-orange-100 bg-orange-50/40"],
    text: "text-orange-700",
    empty: "Noch keine Siegesserie",
  },
];

type LogRow = DuelLogEntry & { tournament?: string; machine?: string | null; round?: number | null };

const FORMAT_SHORT: Record<string, string> = {
  matchplay: "Matchplay",
  swiss: "Swiss",
  round_robin: "Round Robin",
  dyp_round_robin: "DYP",
  elimination: "Elimination",
  rotation: "Round the Pinball",
  timeplay: "Timeplay",
};

// 🔍 alle gemeinsamen Matches mit einem Gegner – auch nicht gezählte (mit Grund)
function DuelLogList({ profileId, vsId, vsName }: { profileId: string; vsId: string; vsName: string }) {
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLog(null);
    setErr(null);
    fetch(`/api/players/rivals?profileId=${encodeURIComponent(profileId)}&vs=${encodeURIComponent(vsId)}&ts=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok || !j?.ok) setErr(j?.error ?? "Duelle konnten nicht geladen werden");
        else setLog(j.log ?? []);
      })
      .catch(() => !cancelled && setErr("Netzwerkfehler"));
    return () => {
      cancelled = true;
    };
  }, [profileId, vsId]);

  if (err) return <div className="text-xs text-red-600">{err}</div>;
  if (!log) return <div className="text-xs text-neutral-500">Lade Duelle…</div>;
  const counted = log.filter((e) => e.result).length;
  return (
    <div className="rounded-xl border bg-white p-2">
      <div className="mb-1 text-xs font-semibold text-neutral-700">
        🔍 Alle gemeinsamen Matches mit {vsName} ({counted} gezählt, {log.length - counted} nicht gezählt) – älteste zuerst
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-white text-left text-neutral-500">
            <tr>
              <th className="px-1 py-0.5">Datum</th>
              <th className="px-1 py-0.5">Turnier</th>
              <th className="px-1 py-0.5">Format</th>
              <th className="px-1 py-0.5">Runde / Flipper</th>
              <th className="px-1 py-0.5 text-right">Du</th>
              <th className="px-1 py-0.5 text-right">{vsName}</th>
              <th className="px-1 py-0.5">Ergebnis</th>
              <th className="px-1 py-0.5 text-right">Serie</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr
                key={e.matchId}
                className={
                  "border-t " +
                  (e.result === "W"
                    ? "bg-emerald-50/60"
                    : e.result === "L"
                    ? "bg-rose-50/60"
                    : e.result === "D"
                    ? "bg-amber-50/60"
                    : "text-neutral-400")
                }
              >
                <td className="whitespace-nowrap px-1 py-0.5 tabular-nums">
                  {e.at ? new Date(e.at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "?"}
                </td>
                <td className="px-1 py-0.5">{e.tournament ?? "?"}</td>
                <td className="whitespace-nowrap px-1 py-0.5">{FORMAT_SHORT[String(e.format ?? "")] ?? e.format ?? "?"}</td>
                <td className="px-1 py-0.5">
                  {e.round != null ? `R${e.round}` : ""}
                  {e.machine ? ` · ${e.machine}` : ""}
                </td>
                <td className="px-1 py-0.5 text-right tabular-nums">{e.myPos ?? "–"}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{e.oppPos ?? "–"}</td>
                <td className="whitespace-nowrap px-1 py-0.5">
                  {e.result === "W"
                    ? "✅ gewonnen"
                    : e.result === "L"
                    ? "❌ verloren"
                    : e.result === "D"
                    ? "➖ gleich"
                    : `nicht gezählt: ${e.skipped}`}
                </td>
                <td className="px-1 py-0.5 text-right tabular-nums">{e.result ? e.run : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RivalCard({
  rank,
  stat,
  p,
  kind,
  box,
  text,
  open,
  onToggle,
}: {
  rank: number;
  stat: RivalStat;
  p: ProfileInfo | undefined;
  kind: RivalKind;
  box: string;
  text: string;
  open: boolean;
  onToggle: () => void;
}) {
  const name = p?.name ?? "?";
  return (
    <div className={"relative rounded-xl border px-2.5 py-2 " + box + (open ? " ring-2 ring-neutral-400" : "")}>
      <span className={"absolute right-2 top-2 text-[11px] font-bold " + text}>#{rank}</span>
      <div className="flex items-center gap-2">
        {p ? <Avatar p={p} size={30} /> : null}
        <div className="min-w-0">
          <div className="truncate pr-6 text-sm font-medium text-neutral-800">{name}</div>
          {kind === "streak" ? (
            <div className={"text-[13px] font-semibold " + text}>
              <span className="tabular-nums">{stat.bestStreak}</span> Siege in Folge
            </div>
          ) : kind === "frequent" ? (
            <div className={"text-[13px] font-semibold " + text}>
              <span className="tabular-nums">{stat.duels}</span> Duelle
            </div>
          ) : (
            <div className={"text-[13px] font-semibold " + text}>
              <span className="tabular-nums">{pct(stat.winrate)}</span> gewonnen
            </div>
          )}
          <div className="text-xs text-neutral-600">
            Bilanz <b className="tabular-nums">{stat.wins} : {stat.losses}</b>
            {stat.draws ? <span className="tabular-nums"> · {stat.draws} gleich</span> : null}
            {kind === "frequent" || kind === "streak" ? <span className="tabular-nums"> · {pct(stat.winrate)}</span> : null}
          </div>
          {kind === "streak" ? (
            <div className="text-[11px] text-neutral-500">
              📅 {day(stat.streakFrom)}
              {day(stat.streakTo) !== day(stat.streakFrom) ? ` – ${day(stat.streakTo)}` : ""} · {stat.streakTournaments}{" "}
              {stat.streakTournaments === 1 ? "Turnier" : "Turniere"}
            </div>
          ) : null}
          <button type="button" onClick={onToggle} className="mt-1 text-[11px] font-semibold text-blue-700 hover:underline">
            {open ? "▲ Duelle ausblenden" : "🔍 Duelle anzeigen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RivalsPanel({ profileId }: { profileId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // aufgeklappte Duell-Liste: Zeile + Gegner
  const [openLog, setOpenLog] = useState<{ kind: RivalKind; vsId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOpenLog(null);
    setData(null);
    setErr(null);
    fetch(`/api/players/rivals?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok || !j?.ok) setErr(j?.error ?? "Konnte Gegner-Bilanz nicht laden");
        else setData(j as Resp);
      })
      .catch(() => !cancelled && setErr("Netzwerkfehler"));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-3">
        <div className="text-sm font-semibold">⚔️ Gegner-Bilanz</div>
        <div className="text-[11px] text-neutral-500">
          Direkte Duelle im selben Match (wer den besseren Platz hat) – alle Formate außer DYP, bei Round the Pinball jeder
          Flipper. Ohne Bots und Platzhalter.
          {data ? ` Gegner zählen ab ${data.minDuels} Duellen, Serien ab ${data.minStreak} Siegen.` : null}
        </div>
      </div>
      {err ? (
        <div className="text-xs text-red-600">{err}</div>
      ) : !data ? (
        <div className="text-xs text-neutral-500">Lade Gegner-Bilanz…</div>
      ) : (
        <div className="space-y-4">
          {ROWS.map((row) => {
            const list = data[row.kind] ?? [];
            return (
              <div key={row.kind}>
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={"rounded-full px-2.5 py-0.5 text-sm font-bold " + row.head}>{row.title}</span>
                  <span className="text-[11px] text-neutral-400">{row.hint}</span>
                </div>
                {list.length ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {list.map((s, i) => (
                      <RivalCard
                        key={s.profileId}
                        rank={i + 1}
                        stat={s}
                        p={data.profiles[s.profileId]}
                        kind={row.kind}
                        box={i < 2 ? row.rankBox[i] : row.box}
                        text={row.text}
                        open={openLog?.kind === row.kind && openLog.vsId === s.profileId}
                        onToggle={() =>
                          setOpenLog((o) =>
                            o?.kind === row.kind && o.vsId === s.profileId ? null : { kind: row.kind, vsId: s.profileId }
                          )
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className={"rounded-xl border border-dashed p-2 text-xs text-neutral-500 " + row.box}>{row.empty}.</div>
                )}
                {openLog?.kind === row.kind ? (
                  <div className="mt-2">
                    <DuelLogList
                      profileId={profileId}
                      vsId={openLog.vsId}
                      vsName={data.profiles[openLog.vsId]?.name ?? "Gegner"}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
