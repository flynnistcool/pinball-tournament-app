"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, Pill, Select } from "@/components/ui";
import { BarChart, Sparkline } from "@/components/charts";

type MP = { match_id: string; player_id: string; position: number | null };
type Match = { id: string; round_id: string; machine_id: string | null; game_number?: number | null };

export default function PublicTournament({ params }: any) {
  const code = String(params?.code ?? "").toUpperCase();

  const [data, setData] = useState<any>(null);
  const [stats, setStats] = useState<any[]>([]);
  const [playerFocus, setPlayerFocus] = useState<string>("");

  // local overrides (optimistic UI)
  const [posOverride, setPosOverride] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function load() {
    const res = await fetch(`/api/public/tournament?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const j = await res.json();
    setData(j);
  }

  async function loadStats() {
    const res = await fetch(`/api/public/stats?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const j = await res.json();
    setStats(j.stats ?? []);
  }

  useEffect(() => {
    load();
    loadStats();
    const t = setInterval(() => {
      load();
      loadStats();
    }, 8000);
    return () => clearInterval(t);
  }, [code]);

  const tournament = data?.tournament;
  const players = data?.players ?? [];
  const rounds = data?.rounds ?? [];
  const matches: Match[] = data?.matches ?? [];
  const matchPlayers: MP[] = data?.match_players ?? [];

  const currentRound = useMemo(() => {
    if (!rounds.length) return null;
    const open = rounds.filter((r: any) => r.status === "open");
    const list = open.length ? open : rounds;
    return list.reduce((mx: any, r: any) => Math.max(mx, r.number ?? 0), 0) || null;
  }, [rounds]);

  const machines = useMemo(
    () => Object.fromEntries((data?.machines ?? []).map((m: any) => [m.id, m.name])),
    [data?.machines]
  );

  const playersById = useMemo(() => Object.fromEntries(players.map((p: any) => [p.id, p.name])), [players]);

  const groupedByRound = useMemo(() => {
    const mByRound: Record<string, Match[]> = {};
    for (const m of matches) {
      mByRound[m.round_id] = mByRound[m.round_id] || [];
      mByRound[m.round_id].push(m);
    }
    for (const rid of Object.keys(mByRound)) {
      mByRound[rid] = mByRound[rid].slice().sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0));
    }
    return mByRound;
  }, [matches]);

  const mpByMatch = useMemo(() => {
    const map: Record<string, MP[]> = {};
    for (const mp of matchPlayers) {
      map[mp.match_id] = map[mp.match_id] || [];
      map[mp.match_id].push(mp);
    }
    return map;
  }, [matchPlayers]);

  const topPoints = stats.slice(0, 8).map((r: any) => ({ label: r.name, value: r.points }));
  const topWins = stats
    .slice()
    .sort((a: any, b: any) => b.wins - a.wins)
    .slice(0, 8)
    .map((r: any) => ({ label: r.name, value: r.wins }));

  const focus = playerFocus ? stats.find((s: any) => s.id === playerFocus) : null;

  function keyFor(mp: MP) {
    return `${mp.match_id}:${mp.player_id}`;
  }

  function getPosition(mp: MP) {
    const k = keyFor(mp);
    return Object.prototype.hasOwnProperty.call(posOverride, k) ? posOverride[k] : mp.position;
  }

  async function setPosition(matchId: string, playerId: string, position: number | null) {
    const k = `${matchId}:${playerId}`;

    setPosOverride((prev) => ({ ...prev, [k]: position }));
    setSaving((prev) => ({ ...prev, [k]: true }));

    try {
      const res = await fetch("/api/match_players/set-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // camelCase ist ok, wenn deine Route beides akzeptiert (camel + snake)
        body: JSON.stringify({ code, matchId, playerId, position }),
      });

      const j = await res.json();
      if (!res.ok) {
        setPosOverride((prev) => {
          const copy = { ...prev };
          delete copy[k];
          return copy;
        });
        alert(j?.error ?? "Speichern fehlgeschlagen");
      }
    } catch {
      setPosOverride((prev) => {
        const copy = { ...prev };
        delete copy[k];
        return copy;
      });
      alert("Speichern fehlgeschlagen (Netzwerk)");
    } finally {
      setSaving((prev) => ({ ...prev, [k]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {/* DEBUG-BALKEN (erstmal drin lassen) */}
      <div style={{ background: "red", color: "white", padding: 10 }}>
        /t/[code] AKTIV – CODE: {code}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">Turnier</div>
              <div className="text-lg font-semibold">{tournament?.name ?? "…"}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {currentRound ? (
                  <Pill>
                    Aktuelle Runde <span className="ml-2 font-semibold">#{currentRound}</span>
                  </Pill>
                ) : null}
                <Pill>
                  Code: <span className="ml-2 font-semibold">{code}</span>
                </Pill>
                {tournament?.category === "league" ? (
                  <Pill>Liga {tournament?.season_year ?? ""}</Pill>
                ) : (
                  <Pill>Normal</Pill>
                )}
                <Pill>Spieler/Match {tournament?.match_size ?? 4}</Pill>
                <Pill>Best-of {tournament?.best_of ?? 1}</Pill>
                {tournament?.locations?.name ? <Pill>📍 {tournament.locations.name}</Pill> : null}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <a className="underline" href={`/s/${encodeURIComponent(code)}`}>
                Zusammenfassung
              </a>
              <span>•</span>
              <span>Auto-Update</span>
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
              <div className="text-2xl font-semibold">{Object.keys(machines).length}</div>
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
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Spieler-Fokus</div>
            <div className="w-72">
              <Select value={playerFocus} onChange={(e) => setPlayerFocus(e.target.value)}>
                <option value="">Alle</option>
                {stats.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {!focus ? (
            <div className="text-sm text-neutral-600">Wähle oben einen Spieler, um nur seine Spiele/Stats hervorzuheben.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs text-neutral-500">Punkte</div>
                <div className="text-2xl font-semibold">{focus.points}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs text-neutral-500">Winrate</div>
                <div className="text-2xl font-semibold">{focus.winrate}%</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs text-neutral-500">Ø-Platz</div>
                <div className="text-2xl font-semibold">{focus.avgPos ?? "—"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs text-neutral-500">Verlauf</div>
                <div className="mt-1">
                  <Sparkline values={(focus.history ?? []).map((h: any) => h.points)} />
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Runden & Spiele</CardHeader>
        <CardBody>
          <div className="space-y-3">
            {rounds.map((r: any) => {
              const ms = groupedByRound[r.id] ?? [];
              return (
                <div key={r.id} className="rounded-2xl border bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="font-semibold">
                      R{r.number} • {r.format}
                    </div>
                    <div className="text-sm text-neutral-500">{ms.length} Matches</div>
                  </div>

                  <div className="divide-y">
                    {ms.map((m: any) => {
                      const mps = (mpByMatch[m.id] ?? []).slice();

                      mps.sort((a: any, b: any) => {
                        const ap = getPosition(a) ?? 999;
                        const bp = getPosition(b) ?? 999;
                        if (ap !== bp) return ap - bp;
                        const an = playersById[a.player_id] ?? "";
                        const bn = playersById[b.player_id] ?? "";
                        return an.localeCompare(bn);
                      });

                      const highlightMatch = focus && mps.some((x: any) => x.player_id === focus.id);
                      const n = mps.length || 4;

                      return (
                        <div key={m.id} className={"px-4 py-3 " + (highlightMatch ? "bg-amber-50" : "")}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-neutral-800">
                              {m.machine_id ? machines[m.machine_id] : "—"}
                              {m.game_number ? ` • Spiel ${m.game_number}` : ""}
                            </div>
                            <div className="text-xs text-neutral-500">Match-ID: {m.id.slice(0, 8)}…</div>
                          </div>

                          <div className="mt-2 flex flex-col gap-2">
                            {mps.map((mp: any) => {
                              const name = playersById[mp.player_id] ?? "—";
                              const pos = getPosition(mp);
                              const isWinner = pos === 1;
                              const isSaving = saving[keyFor(mp)] === true;

                              const rowHighlight = isWinner ? "bg-amber-200 border-amber-300" : "bg-white";

                              return (
                                <div
                                  key={keyFor(mp)}
                                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${rowHighlight}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="font-medium">{name}</div>
                                    {pos ? <Pill>#{pos}</Pill> : <Pill>—</Pill>}
                                    {isWinner ? <Pill>🏆 Sieger</Pill> : null}
                                    {isSaving ? <span className="text-xs text-neutral-500">speichere…</span> : null}
                                  </div>

                                  <div className="w-44">
                                    <Select
                                      value={pos ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setPosition(m.id, mp.player_id, v === "" ? null : Number(v));
                                      }}
                                    >
                                      <option value="">Platz —</option>
                                      {Array.from({ length: n }, (_, i) => i + 1).map((p) => (
                                        <option key={p} value={p}>
                                          Platz {p}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {mps.length === 0 ? <div className="mt-2 text-sm text-neutral-500">Noch keine Spielerzuordnung.</div> : null}
                        </div>
                      );
                    })}

                    {ms.length === 0 && <div className="px-4 py-3 text-sm text-neutral-500">Noch keine Spiele.</div>}
                  </div>
                </div>
              );
            })}

            {rounds.length === 0 && <div className="text-sm text-neutral-500">Noch keine Runden.</div>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}