"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, Pill, Select } from "@/components/ui";

type Round = { id: string; number: number; format: string; status?: string | null };
type Match = { id: string; round_id: string; machine_id: string | null; game_number?: number | null };
type MP = { match_id: string; player_id: string; position: number | null };

export function RoundMatches(props: {
  code: string;
  rounds: Round[];
  matches: Match[];
  matchPlayers: MP[];
  playersById: Record<string, string>;
  machinesById: Record<string, string>;
  focusPlayerId?: string; // optional highlight
  canEdit?: boolean; // default true
  title?: string; // optional
}) {
  const {
    code,
    rounds,
    matches,
    matchPlayers,
    playersById,
    machinesById,
    focusPlayerId,
    canEdit = true,
    title = "Runden & Spiele",
  } = props;

  const [openRoundId, setOpenRoundId] = useState<string | null>(null);

  // optimistic UI
  const [posOverride, setPosOverride] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const groupedByRound = useMemo(() => {
    const mByRound: Record<string, Match[]> = {};
    for (const m of matches) {
      (mByRound[m.round_id] ||= []).push(m);
    }
    for (const rid of Object.keys(mByRound)) {
      mByRound[rid] = mByRound[rid]
        .slice()
        .sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0));
    }
    return mByRound;
  }, [matches]);

  const mpByMatch = useMemo(() => {
    const map: Record<string, MP[]> = {};
    for (const mp of matchPlayers) {
      (map[mp.match_id] ||= []).push(mp);
    }
    return map;
  }, [matchPlayers]);

  function keyFor(mp: MP) {
    return `${mp.match_id}:${mp.player_id}`;
  }
  function getPosition(mp: MP) {
    const k = keyFor(mp);
    return Object.prototype.hasOwnProperty.call(posOverride, k) ? posOverride[k] : mp.position;
  }

  async function setPosition(match_id: string, player_id: string, position: number | null) {
    const k = `${match_id}:${player_id}`;
    setPosOverride((prev) => ({ ...prev, [k]: position }));
    setSaving((prev) => ({ ...prev, [k]: true }));

    try {
      const res = await fetch("/api/match_players/set-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // WICHTIG: snake_case, so wie deine Route es erwartet
        body: JSON.stringify({ code, match_id, player_id, position }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // revert
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
    <Card>
      <CardHeader>{title}</CardHeader>
      <CardBody>
        <div className="space-y-3">
          {rounds.map((r) => {
            const ms = groupedByRound[r.id] ?? [];
            const isOpen = openRoundId === r.id;

            return (
              <div key={r.id} className="rounded-2xl border bg-white overflow-hidden">
                <button
                  className="w-full flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-left hover:bg-neutral-50"
                  onClick={() => setOpenRoundId(isOpen ? null : r.id)}
                >
                  <div className="font-semibold">
                    R{r.number} • {r.format}
                    {r.status ? (
                      <span className="ml-2 text-sm text-neutral-500">({r.status})</span>
                    ) : null}
                  </div>
                  <div className="text-sm text-neutral-500">
                    {ms.length} Spiele <span className="ml-2">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen ? (
                  <div className="divide-y">
                    {ms.map((m) => {
                      const mps = (mpByMatch[m.id] ?? []).slice();

                      // sort: positions first, then name
                      mps.sort((a, b) => {
                        const ap = getPosition(a) ?? 999;
                        const bp = getPosition(b) ?? 999;
                        if (ap !== bp) return ap - bp;
                        return (playersById[a.player_id] ?? "").localeCompare(playersById[b.player_id] ?? "");
                      });

                      const highlightMatch =
                        focusPlayerId && mps.some((x) => x.player_id === focusPlayerId);

                      const n = Math.max(2, mps.length || 4);

                      return (
                        <div key={m.id} className={"px-4 py-3 " + (highlightMatch ? "bg-amber-50" : "")}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-neutral-800">
                              {m.machine_id ? machinesById[m.machine_id] : "—"}
                              {m.game_number ? ` • Spiel ${m.game_number}` : ""}
                            </div>
                            <div className="text-xs text-neutral-500">Match-ID: {m.id.slice(0, 8)}…</div>
                          </div>

                          {mps.length ? (
                            <div className="mt-2 flex flex-col gap-2">
                              {mps.map((mp) => {
                                const name = playersById[mp.player_id] ?? "—";
                                const pos = getPosition(mp);
                                const isWinner = pos === 1;
                                const isSaving = saving[keyFor(mp)] === true;

                                return (
                                  <div
                                    key={keyFor(mp)}
                                    className={
                                      "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 " +
                                      (isWinner ? "bg-amber-200 border-amber-300" : "bg-white")
                                    }
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="font-medium">{name}</div>
                                      {pos ? <Pill>#{pos}</Pill> : <Pill>—</Pill>}
                                      {isWinner ? <Pill>🏆 Sieger</Pill> : null}
                                      {isSaving ? <span className="text-xs text-neutral-500">speichere…</span> : null}
                                    </div>

                                    <div className="w-44">
                                      <Select
                                        disabled={!canEdit}
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
                          ) : (
                            <div className="mt-2 text-sm text-neutral-500">Noch keine Spielerzuordnung.</div>
                          )}
                        </div>
                      );
                    })}

                    {ms.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-neutral-500">Noch keine Spiele.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {rounds.length === 0 ? <div className="text-sm text-neutral-500">Noch keine Runden.</div> : null}
        </div>
      </CardBody>
    </Card>
  );
}