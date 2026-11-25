"use client";

// 🛡️ Titelverteidiger (lib/titleDefender.ts):
//  - DefenderBadge: Abzeichen am Namen (Admin, TV, Handy) – nur solange das Match läuft
//  - defenderFor: Titelverteidiger eines Matches, aber nur wenn die Daten zum aktuellen Flipper passen
//  - TitleDefenderWatcher (nur Admin-Seite): Ticker-Meldungen
//      1) Ankündigung: Matchplay & Co. sobald die Runde da ist, Round the Pinball sobald am Flipper jemand blau ist
//      2) Flipper geändert → alte Ankündigung ausblenden, ggf. neue (auch für ⚔️ Gegner-Hinweise mit Flipper-Namen)
//      3) Ergebnis: "verteidigt" / "gestoppt" (RtP: wenn alle am Flipper einen Score haben, 10 s unverändert)
//    Angekündigte Matches merkt sich das Gerät (localStorage je Turnier), damit das Ergebnis auch nach Neuladen kommt.

import { useEffect, useRef } from "react";
import type { RivalryData } from "@/components/RivalryBadge";
import { bestInsightForMatch, insightFeedItem } from "@/lib/rivalryInsights";
import { rotationActiveMap } from "@/lib/rotationTurn";
import type { FeedItemInput } from "@/lib/feed";
import {
  defenderAnnounceItem,
  defenderAnnouncePrefix,
  defenderDate,
  defenderResultItem,
  liveMachineSigFromData,
} from "@/lib/titleDefender";

/** Titelverteidiger (players.id) eines Matches – nur wenn für genau diesen Flipper gerechnet */
export function defenderFor(
  riv: Pick<RivalryData, "defenders"> | null | undefined,
  matchId: unknown,
  machineId: unknown
): { playerId: string; at: string | null } | null {
  const d = riv?.defenders?.[String(matchId ?? "")];
  if (!d) return null;
  if (String(d.machineId ?? "") !== String(machineId ?? "")) return null;
  return { playerId: d.playerId, at: d.at };
}

export function DefenderBadge({
  at,
  machine,
  variant = "light",
  className = "",
}: {
  at?: string | null;
  machine?: string | null;
  variant?: "light" | "tv";
  className?: string;
}) {
  const when = defenderDate(at ?? null);
  const style =
    variant === "tv"
      ? "bg-indigo-400/20 px-2.5 text-sm text-indigo-100 ring-indigo-300/50"
      : "bg-indigo-50 px-2 text-[11px] text-indigo-800 ring-indigo-200";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full py-0.5 font-bold ring-1 ${style} ${className}`}
      title={`Hat in genau dieser Besetzung${machine ? ` an ${machine}` : ""} zuletzt gewonnen${when ? ` (${when})` : ""}`}
    >
      🛡️ Titelverteidiger
    </span>
  );
}

// ── Wächter für den Ticker ─────────────────────────────────────────────────

const STABLE_MS = 10_000;
const TICK_MS = 2_000;

type Announced = Record<string, { key: string; defenderId: string; machineId: string; done?: boolean }>;
const LS_KEY = (code: string) => `pb_defender_${String(code).toUpperCase()}`;

function loadAnnounced(code: string): Announced {
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY(code)) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function saveAnnounced(code: string, a: Announced) {
  try {
    window.localStorage.setItem(LS_KEY(code), JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

async function hideByPrefix(code: string, keyPrefix: string, exceptKey: string | null) {
  try {
    await fetch("/api/feed/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ code, keyPrefix, exceptKey }),
    });
  } catch {
    /* nächster Versuch beim nächsten Wechsel */
  }
}

type AnyData = {
  tournament?: { format?: string | null; status?: string | null; code?: string | null } | null;
  players?: { id: unknown; name?: string | null }[] | null;
  machines?: { id: unknown; name?: string | null; icon_emoji?: string | null }[] | null;
  rounds?: { id: unknown; status?: unknown }[] | null;
  matches?: { id: unknown; round_id?: unknown; machine_id?: unknown; status?: unknown }[] | null;
  match_players?: { match_id: unknown; player_id: unknown; position?: number | null; score?: unknown; start_position?: number | null }[] | null;
};

export function TitleDefenderWatcher({
  code,
  data,
  riv,
  onFeed,
}: {
  code: string;
  data: AnyData | null | undefined;
  riv: RivalryData;
  onFeed: (items: FeedItemInput[]) => void;
}) {
  const dataRef = useRef<AnyData | null>(null);
  dataRef.current = data ?? null;
  const rivRef = useRef<RivalryData>(riv);
  rivRef.current = riv;
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;

  useEffect(() => {
    const announced: Announced = loadAnnounced(code);
    const lastMachine = new Map<string, string>(); // Match → Flipper (für ⚔️-Hinweise bei Flipper-Wechsel)
    const pending = new Map<string, { since: number; sig: string }>(); // RtP: Scores stabil?
    let busy = false;

    const check = async () => {
      if (busy) return;
      const d = dataRef.current;
      const riv = rivRef.current;
      if (!d || !Array.isArray(d.matches) || !Array.isArray(d.match_players) || !Array.isArray(d.rounds)) return;
      const dCode = d.tournament?.code;
      if (dCode && String(dCode).toUpperCase() !== String(code).toUpperCase()) return;
      if (String(d.tournament?.status ?? "") === "finished") return;
      const format = String(d.tournament?.format ?? "");
      const rtp = format === "rotation";
      if (!["matchplay", "swiss", "round_robin", "rotation"].includes(format)) return;

      busy = true;
      try {
        const name = new Map((d.players ?? []).map((p) => [String(p.id), String(p.name ?? "?")]));
        const mach = new Map((d.machines ?? []).map((m) => [String(m.id), m]));
        const openRounds = new Set(d.rounds.filter((r) => String(r.status ?? "") === "open").map((r) => String(r.id)));
        const mpsOf = (mid: string) => d.match_players!.filter((x) => String(x.match_id) === mid);
        const active = rtp
          ? rotationActiveMap(
              d.matches.map((m) => String(m.id)),
              d.match_players.map((x) => ({
                match_id: String(x.match_id),
                player_id: String(x.player_id),
                start_position: x.start_position ?? null,
                score: (x.score as number | string | null | undefined) ?? null,
              }))
            )
          : {};
        // Titelverteidiger-Daten passen zu den Flippern, die gerade laufen?
        const fresh = riv.loaded === true && riv.defendersSig != null && riv.defendersSig === liveMachineSigFromData(d);
        const now = Date.now();
        const ready: FeedItemInput[] = [];
        let changed = false;

        for (const m of d.matches) {
          const mid = String(m.id);
          const machineId = String(m.machine_id ?? "");
          const mps = mpsOf(mid);
          const machine = mach.get(machineId);
          const machineName = machine?.name ? String(machine.name) : null;
          const machineIcon = String(machine?.icon_emoji ?? "").trim() || null;

          // fertig?
          let winnerId: string | null = null;
          let finished = false;
          if (rtp) {
            const scores = mps.map((x) => ({ pid: String(x.player_id), s: num(x.score) }));
            if (scores.length && scores.every((x) => x.s != null)) {
              const sig = scores.map((x) => `${x.pid}:${x.s}`).sort().join(",");
              const p = pending.get(mid);
              if (!p || p.sig !== sig) pending.set(mid, { since: now, sig });
              else if (now - p.since >= STABLE_MS) {
                finished = true;
                const best = Math.max(...scores.map((x) => x.s as number));
                const top = scores.filter((x) => x.s === best);
                winnerId = top.length === 1 ? top[0].pid : null;
              }
            }
          } else if (mps.length && mps.every((x) => x.position != null)) {
            finished = true;
            const top = mps.filter((x) => Number(x.position) === 1);
            winnerId = top.length === 1 ? String(top[0].player_id) : null;
          }

          const a = announced[mid];

          // 3) Ergebnis
          if (finished) {
            if (a && !a.done) {
              announced[mid] = { ...a, done: true };
              changed = true;
              if (winnerId && a.machineId === machineId) {
                ready.push(
                  defenderResultItem({
                    matchId: mid,
                    machineId,
                    machine: machineName,
                    machineIcon,
                    defenderId: a.defenderId,
                    defenderName: name.get(a.defenderId) ?? "?",
                    winnerId,
                    winnerName: name.get(winnerId) ?? "?",
                  })
                );
              }
            }
            continue;
          }
          if (!openRounds.has(String(m.round_id))) continue;
          if (mps.some((x) => x.position != null || num(x.score) != null) && !rtp && !a) {
            // Matchplay: schon Ergebnisse drin, aber nie angekündigt (z. B. Seite erst jetzt geöffnet) → nicht mehr ankündigen
            continue;
          }

          // ⚔️ Gegner-Hinweis nennt den Flipper → bei Flipper-Wechsel neu (alte Meldung ausblenden)
          const prevMachine = lastMachine.get(mid);
          lastMachine.set(mid, machineId);
          if (!rtp && prevMachine != null && prevMachine !== machineId && machineName) {
            const ins = bestInsightForMatch(
              mps.map((x) => String(x.player_id)),
              riv.insights ?? {}
            );
            if (ins) {
              const base = insightFeedItem(ins, (pid) => name.get(pid) ?? "?", machineName);
              const item = { ...base, key: `${base.key}|m:${machineId}` };
              await hideByPrefix(code, base.key, item.key);
              ready.push(item);
            }
          }

          // 1) + 2) Titelverteidiger
          if (!fresh) continue; // Daten noch nicht zum aktuellen Flipper gerechnet → warten
          const def = defenderFor(riv, mid, machineId);
          const expectedKey = def ? `${defenderAnnouncePrefix(mid)}${machineId}|${def.playerId}` : null;
          if (a && !a.done && a.key !== expectedKey) {
            // Flipper (oder Besetzung) geändert → alte Ankündigung weg
            await hideByPrefix(code, defenderAnnouncePrefix(mid), expectedKey);
            delete announced[mid];
            changed = true;
          }
          if (def && expectedKey && announced[mid]?.key !== expectedKey) {
            if (rtp && !active[mid]) continue; // RtP: erst wenn am Flipper jemand blau ist
            announced[mid] = { key: expectedKey, defenderId: def.playerId, machineId };
            changed = true;
            ready.push(
              defenderAnnounceItem({
                matchId: mid,
                machineId,
                machine: machineName,
                machineIcon,
                defenderId: def.playerId,
                defenderName: name.get(def.playerId) ?? "?",
                at: def.at,
              })
            );
          }
        }
        if (changed) saveAnnounced(code, announced);
        if (ready.length) onFeedRef.current(ready);
      } finally {
        busy = false;
      }
    };

    void check();
    const t = window.setInterval(() => void check(), TICK_MS);
    return () => window.clearInterval(t);
  }, [code]);

  return null;
}
