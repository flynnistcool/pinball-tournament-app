"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import { BarChart } from "@/components/charts";

type AnyObj = Record<string, any>;

export default function SummaryPage({ params }: any) {
  const code = String(params?.code ?? "").toUpperCase();

  const [tData, setTData] = useState<any>(null);
  const [stats, setStats] = useState<any[]>([]);

  async function loadTournament() {
    const res = await fetch(`/api/public/tournament?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const j = await res.json();
    setTData(j);
  }

  async function loadStats() {
    const res = await fetch(`/api/public/stats?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const j = await res.json();
    setStats(j.stats ?? []);
  }

  useEffect(() => {
    loadTournament();
    loadStats();
    const t = setInterval(() => {
      loadTournament();
      loadStats();
    }, 8000);
    return () => clearInterval(t);
  }, [code]);

  const tournament = tData?.tournament;
  const players = tData?.players ?? [];
  const machines = tData?.machines ?? [];
  const rounds = tData?.rounds ?? [];
  const matches = tData?.matches ?? [];
  const matchPlayers = tData?.match_players ?? [];

  const playersById = useMemo(() => {
    const m: AnyObj = {};
    for (const p of players) m[p.id] = p.name ?? "?";
    return m;
  }, [players]);

  const machinesById = useMemo(() => {
    const m: AnyObj = {};
    for (const mc of machines) m[mc.id] = mc.name ?? "—";
    return m;
  }, [machines]);

  const matchPlayersByMatchId = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const mp of matchPlayers) {
      if (!m[mp.match_id]) m[mp.match_id] = [];
      m[mp.match_id].push(mp);
    }
    return m;
  }, [matchPlayers]);

  const matchesByRoundId = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const mt of matches) {
      if (!m[mt.round_id]) m[mt.round_id] = [];
      m[mt.round_id].push(mt);
    }
    for (const rid of Object.keys(m)) {
      m[rid] = m[rid].slice().sort((a, b) => {
        const ga = Number(a.game_number ?? 0);
        const gb = Number(b.game_number ?? 0);
        if (ga !== gb) return ga - gb;
        return String(a.id).localeCompare(String(b.id));
      });
    }
    return m;
  }, [matches]);

  function isMatchComplete(matchId: string) {
    const mps = matchPlayersByMatchId[matchId] ?? [];
    if (mps.length < 2) return false;
    return mps.every((x: any) => x.position !== null && x.position !== undefined);
  }

  const topPoints = useMemo(
    () => (stats ?? []).slice(0, 8).map((r: any) => ({ label: r.name, value: r.points })),
    [stats]
  );

  const topWins = useMemo(() => {
    return (stats ?? [])
      .slice()
      .sort((a: any, b: any) => (b.wins ?? 0) - (a.wins ?? 0))
      .slice(0, 8)
      .map((r: any) => ({ label: r.name, value: r.wins ?? 0 }));
  }, [stats]);

  const roundsSorted = useMemo(() => {
    return rounds.slice().sort((a: any, b: any) => {
      const fa = String(a.format ?? "");
      const fb = String(b.format ?? "");
      if (fa !== fb) return fa.localeCompare(fb);
      return Number(a.number ?? 0) - Number(b.number ?? 0);
    });
  }, [rounds]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">Zusammenfassung</div>
              <div className="text-lg font-semibold">{tournament?.name ?? "…"}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Pill>
                  Code: <span className="ml-2 font-semibold">{code}</span>
                </Pill>
                <Pill>
                  Spieler/Match <span className="ml-2 font-semibold">{tournament?.match_size ?? 4}</span>
                </Pill>
                <Pill>
                  Best-of <span className="ml-2 font-semibold">{tournament?.best_of ?? 1}</span>
                </Pill>
                {tournament?.locations?.name ? <Pill>📍 {tournament.locations.name}</Pill> : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => (window.location.href = `/t/${encodeURIComponent(code)}`)}>
                Admin-Ansicht öffnen
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-neutral-500">Spieler</div>
              <div className="text-2xl font-semibold">{players.length}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-neutral-500">Maschinen</div>
              <div className="text-2xl font-semibold">{machines.length}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-neutral-500">Runden</div>
              <div className="text-2xl font-semibold">{rounds.length}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <BarChart title="Top Punkte" items={topPoints} valueLabel="Punkte" />
        <BarChart title="Top Siege" items={topWins} valueLabel="Siege" />
      </div>

      <Card>
        <CardHeader>Runden-Protokoll</CardHeader>
        <CardBody>
          <div className="space-y-3">
            {roundsSorted.map((r: any) => {
              const ms = matchesByRoundId[r.id] ?? [];
              const completed = ms.filter((m: any) => isMatchComplete(m.id)).length;

              return (
                <details key={r.id} className="rounded-2xl border bg-white overflow-hidden">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                      <div className="font-semibold">
                        #{r.number} <span className="text-neutral-400">•</span> {r.format}
                          {r.status === "open" || r.status === "running" ? (
                            <span className="ml-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                              </span>
                              Aktiv
                            </span>
                          ) : r.status === "finished" ? (
                            <span className="ml-3 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700 ring-1 ring-inset ring-green-200">
                              <span className="h-2 w-2 rounded-full bg-green-500" />
                              Finished
                            </span>
                          ) : (
                            <span className="ml-3 inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600 ring-1 ring-inset ring-neutral-200">
                              <span className="h-2 w-2 rounded-full bg-neutral-400" />
                              {r.status ?? "—"}
                            </span>
                          )}

                      </div>
                      <div className="flex items-center gap-2 text-sm text-neutral-500">
                        <span>{completed}/{ms.length} fertig</span>
                        <span className="text-neutral-300">•</span>
                        <span className="select-none">▼</span>
                      </div>
                    </div>
                  </summary>

                  <div className="divide-y">
                    {ms.map((m: any) => {
                    const mps = (matchPlayersByMatchId[m.id] ?? []).slice();
                    mps.sort((a: any, b: any) => {
                      const sa = (a.start_position ?? 99) as number;
                      const sb = (b.start_position ?? 99) as number;
                      return sa - sb;
                    });
                    const complete = isMatchComplete(m.id);

                      return (
                        <div key={m.id} className={"px-4 py-3 " + (complete ? "" : "bg-neutral-50")}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium">
                              {machinesById[m.machine_id] ?? "—"}
                              {m.game_number ? <span className="ml-2 text-neutral-500">• Spiel {m.game_number}</span> : null}
                              {!complete ? <span className="ml-2 text-xs text-neutral-500">(noch offen)</span> : null}
                            </div>
                            <div className="text-sm text-neutral-600">Status: {m.status ?? "—"}</div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {mps.length ? (
                              mps.map((x: any) => {
                                const name = playersById[x.player_id] ?? "?";
                                const pos = x.position ? `#${x.position}` : "—";
                                const isWinner = x.position === 1;

                                return (
                                  <span
                                    key={`${m.id}-${x.player_id}`}
                                    className={
                                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm " +
                                      (isWinner ? "bg-amber-100 border-amber-200" : "bg-white")
                                    }
                                  >
                                    <span className="font-medium">{name}</span>
                                    <span className="text-neutral-500">{pos}</span>
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-sm text-neutral-500">Keine Spieler-Zuordnung.</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {ms.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-neutral-500">Noch keine Matches in dieser Runde.</div>
                    ) : null}
                  </div>
                </details>
              );
            })}

            {roundsSorted.length === 0 ? <div className="text-sm text-neutral-500">Noch keine Runden.</div> : null}
          </div>
        </CardBody>
      </Card>

      <div className="text-xs text-neutral-500">
        Teilen-Link (read-only): <b>/s/{code}</b>
      </div>
    </div>
  );
}