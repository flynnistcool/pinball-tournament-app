"use client";

// ⚖️ Auf Messers Schneide: ein Match der laufenden Runde ist noch unberührt (keine Plätze/Scores) und die
// Siegchancen liegen höchstens 10 Prozentpunkte auseinander → einmal pro Match in den Live-Ticker.
// Grundlage: eingefrorene Siegchancen dieses Geräts (lib/chanceSnapshots.ts, gespeichert von der Match-Karte).
// Erst eintragen, wenn sich die Chancen 10 s lang nicht mehr geändert haben (Winrates laden nach).
// Nicht eng? Weiter beobachten, solange das Match unberührt ist – es kann später noch eng werden.
// Nur die Admin-Seite trägt ein (onFeed). Nicht bei Round the Pinball, Timeplay, DYP.

import { useEffect, useRef } from "react";
import type { FeedItemInput } from "@/lib/feed";
import type { MmData } from "@/lib/myMatch";
import { getChanceSnapshot } from "@/lib/chanceSnapshots";
import { closeMatchFeedItem, isCloseSnapshot } from "@/lib/closeMatch";

const STABLE_MS = 10_000;
const TICK_MS = 2_000;
const SKIP_FORMATS = new Set(["rotation", "timeplay", "dyp_round_robin"]);

export default function CloseMatchWatcher({
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
  const seenRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Map<string, { since: number; sig: string }>>(new Map());

  useEffect(() => {
    seenRef.current = new Set();
    pendingRef.current = new Map();
    const check = () => {
      const d = dataRef.current;
      if (!d || !Array.isArray(d.matches) || !Array.isArray(d.match_players) || !Array.isArray(d.rounds)) return;
      const dCode = (d.tournament as { code?: string | null } | null)?.code;
      if (dCode && String(dCode).toUpperCase() !== String(code).toUpperCase()) return;
      if (String(d.tournament?.status ?? "") === "finished") return;
      const tFormat = String(d.tournament?.format ?? "");
      const openRounds = new Map(
        d.rounds
          .filter((r) => String(r.status ?? "") === "open")
          .map((r) => [String(r.id), String(r.format ?? tFormat)])
      );
      const player = new Map(d.players.map((p) => [String(p.id), String(p.name ?? "?")]));
      const mach = new Map((d.machines ?? []).map((m) => [String(m.id), m]));
      const now = Date.now();
      const ready: FeedItemInput[] = [];
      const pend = pendingRef.current;
      const live = new Set<string>();
      for (const m of d.matches) {
        const mid = String(m.id);
        const fmt = openRounds.get(String(m.round_id));
        if (fmt == null || SKIP_FORMATS.has(fmt) || SKIP_FORMATS.has(tFormat)) continue;
        if (seenRef.current.has(mid)) continue;
        const mps = d.match_players.filter((x) => String(x.match_id) === mid);
        if (mps.length < 2) continue;
        const untouched = mps.every((x) => (x.position == null || Number(x.position) <= 0) && (x.score == null || x.score === ""));
        if (!untouched) continue;
        const snap = getChanceSnapshot(code, mid);
        if (!snap) continue;
        // Snapshot muss genau zu den Spielern dieses Matches passen
        const ids = mps.map((x) => String(x.player_id)).sort();
        const keys = Object.keys(snap.chances).sort();
        if (ids.join(",") !== keys.join(",")) continue;
        live.add(mid);
        const sig = keys.map((k) => `${k}:${Math.round(snap.chances[k] * 1000)}`).join(",");
        const p = pend.get(mid);
        if (!p || p.sig !== sig) {
          pend.set(mid, { since: now, sig });
          continue;
        }
        if (now - p.since < STABLE_MS) continue;
        // nicht (mehr) eng → weiter beobachten: Chancen ändern sich, solange das Match wartet
        // (z. B. Turnier-Winrate, wenn andere Matches der Runde fertig werden)
        if (!isCloseSnapshot(snap)) continue;
        pend.delete(mid);
        seenRef.current.add(mid); // gemeldet → nur einmal
        const machine = mach.get(String(m.machine_id ?? ""));
        const item = closeMatchFeedItem({
          matchId: mid,
          machine: machine?.name ? String(machine.name) : null,
          machineIcon: String((machine as { icon_emoji?: string | null } | undefined)?.icon_emoji ?? "").trim() || null,
          nameOf: (id) => player.get(id) ?? "?",
          snap,
        });
        if (item) ready.push(item);
      }
      for (const id of Array.from(pend.keys())) if (!live.has(id)) pend.delete(id);
      if (ready.length && onFeedRef.current) onFeedRef.current(ready);
    };
    check();
    const t = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(t);
  }, [code]);

  return null;
}
