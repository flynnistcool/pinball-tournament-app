"use client";

// ⚖️ Auf Messers Schneide – Round the Pinball (je Flipper):
//  1) Die beiden Favoriten am Flipper liegen höchstens 10 Prozentpunkte auseinander (eingefrorene Siegchancen,
//     lib/chanceSnapshots.ts). Hat einer der beiden gespielt, liegt allein vorn und der andere war noch nicht dran
//     → "Janos legt … vor – kann Marco kontern?"
//  2) Hat danach auch der zweite gespielt → "Marco kontert!" bzw. "Janos hält stand" (nur wenn einer der beiden
//     am Flipper vorn liegt; führt ein Dritter, entfällt die Folgemeldung).
// Erst eintragen, wenn die Scores am Flipper 10 s lang unverändert sind. Nur die Admin-Seite trägt ein (onFeed).
// Angekündigte Flipper merkt sich das Gerät (localStorage je Turnier), damit die Folgemeldung auch nach Neuladen kommt.

import { useEffect, useRef } from "react";
import type { FeedItemInput } from "@/lib/feed";
import type { MmData } from "@/lib/myMatch";
import { getChanceSnapshot } from "@/lib/chanceSnapshots";
import { rotationCloseFeedItem, rotationCloseLead, rotationCloseOutcome, rotationCloseResultItem } from "@/lib/closeMatch";

const STABLE_MS = 10_000;
const TICK_MS = 2_000;

type Announced = Record<string, { first: string; second: string; done?: boolean }>;
const KEY = (code: string) => `pb_closeRtp_${String(code).toUpperCase()}`;

function loadAnnounced(code: string): Announced {
  try {
    return JSON.parse(window.localStorage.getItem(KEY(code)) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function saveAnnounced(code: string, a: Announced) {
  try {
    window.localStorage.setItem(KEY(code), JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export default function RotationCloseWatcher({
  code,
  data,
  onFeed,
}: {
  code: string;
  data: MmData | null | undefined;
  onFeed?: (items: FeedItemInput[]) => void;
}) {
  const dataRef = useRef<MmData | null>(null);
  dataRef.current = data ?? null;
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;
  const pendingRef = useRef<Map<string, { since: number; sig: string }>>(new Map());

  useEffect(() => {
    pendingRef.current = new Map();
    const announced: Announced = loadAnnounced(code);
    const check = () => {
      const d = dataRef.current;
      if (!d || !Array.isArray(d.matches) || !Array.isArray(d.match_players) || !Array.isArray(d.rounds)) return;
      const dCode = (d.tournament as { code?: string | null } | null)?.code;
      if (dCode && String(dCode).toUpperCase() !== String(code).toUpperCase()) return;
      if (String(d.tournament?.status ?? "") === "finished") return;
      const openRounds = new Set(d.rounds.filter((r) => String(r.status ?? "") === "open").map((r) => String(r.id)));
      const player = new Map(d.players.map((p) => [String(p.id), String(p.name ?? "?")]));
      const mach = new Map((d.machines ?? []).map((m) => [String(m.id), m]));
      const now = Date.now();
      const ready: FeedItemInput[] = [];
      const pend = pendingRef.current;
      let changed = false;
      for (const m of d.matches) {
        const mid = String(m.id);
        if (!openRounds.has(String(m.round_id))) continue;
        const a = announced[mid];
        if (a?.done) continue;
        const scores: Record<string, number> = {};
        for (const x of d.match_players) {
          if (String(x.match_id) !== mid) continue;
          const s = num(x.score);
          if (s != null) scores[String(x.player_id)] = s;
        }
        if (!Object.keys(scores).length) continue;
        // Scores am Flipper 10 s unverändert?
        const sig = Object.keys(scores)
          .sort()
          .map((k) => `${k}:${scores[k]}`)
          .join(",");
        const p = pend.get(mid);
        if (!p || p.sig !== sig) {
          pend.set(mid, { since: now, sig });
          continue;
        }
        if (now - p.since < STABLE_MS) continue;

        const machine = mach.get(String(m.machine_id ?? ""));
        const machineName = machine?.name ? String(machine.name) : null;
        const machineIcon = String((machine as { icon_emoji?: string | null } | undefined)?.icon_emoji ?? "").trim() || null;

        if (!a) {
          // 1) Ankündigung: einer der beiden Favoriten legt vor
          const lead = rotationCloseLead(getChanceSnapshot(code, mid), scores);
          if (!lead) continue;
          announced[mid] = { first: lead.first, second: lead.second };
          changed = true;
          ready.push(
            rotationCloseFeedItem({
              matchId: mid,
              machine: machineName,
              machineIcon,
              firstName: player.get(lead.first) ?? "?",
              secondName: player.get(lead.second) ?? "?",
              duo: lead,
              score: scores[lead.first],
            })
          );
        } else if (scores[a.second] != null) {
          // 2) Folgemeldung: der zweite hat gespielt
          announced[mid] = { ...a, done: true };
          changed = true;
          const out = rotationCloseOutcome(a, scores);
          if (!out) continue; // ein Dritter führt → nichts
          ready.push(
            rotationCloseResultItem({
              matchId: mid,
              machine: machineName,
              machineIcon,
              winnerName: player.get(out.winner) ?? "?",
              loserName: player.get(out.loser) ?? "?",
              winnerScore: scores[out.winner],
              loserScore: scores[out.loser],
              countered: out.countered,
              winnerId: out.winner,
            })
          );
        }
      }
      if (changed) saveAnnounced(code, announced);
      if (ready.length && onFeedRef.current) onFeedRef.current(ready);
    };
    check();
    const t = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(t);
  }, [code]);

  return null;
}
