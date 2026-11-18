// 📰 Turnier-Shortnews – kleine Ergebnis-Meldungen für Live-Ticker + kleine Karten (TV / Admin). Reine Logik.
//
// - Matchplay & Co.: ein Match ist fertig (alle Plätze stehen) → "Jaws: test4 gewinnt" + Plätze (+ Scores)
// - Round the Pinball: ein Durchgang ist fertig → alle Scores des Durchgangs mit aktuellem Platz am Flipper
//
// Der Text (body) ist auf 240 Zeichen begrenzt (lib/feed.ts) – deshalb stecken die Zeilen zusätzlich
// strukturiert in data.lines; Ticker und Karte zeigen die Zeilen, der Text ist nur Rückfall.

import type { FeedItemInput } from "@/lib/feed";
import type { MmData } from "@/lib/myMatch";
import { rotationWaveMap } from "@/lib/rotationTurn";

export type ShortMatchLine = { pos: number; name: string; score: number | null };
export type ShortWaveLine = { name: string; machine: string; score: number; place: number; machineIcon?: string | null };

const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (n: number) => n.toLocaleString("de-DE");
const MEDAL = ["🥇", "🥈", "🥉"];
export const posLabel = (pos: number) => MEDAL[pos - 1] ?? `${pos}.`;

function names(data: MmData) {
  const player = new Map(data.players.map((p) => [String(p.id), String(p.name ?? "?")]));
  const machine = new Map((data.machines ?? []).map((m) => [String(m.id), String(m.name ?? "?")]));
  const matchMachine = new Map(data.matches.map((m) => [String(m.id), machine.get(String(m.machine_id ?? "")) ?? "?"]));
  const machIcon = new Map((data.machines ?? []).map((m) => [String(m.id), String(m.icon_emoji ?? "").trim() || null]));
  const matchMachineIcon = new Map(data.matches.map((m) => [String(m.id), machIcon.get(String(m.machine_id ?? "")) ?? null]));
  return { player, matchMachine, matchMachineIcon };
}

/** Matches, in denen alle Plätze feststehen – mit Prüfsumme (ändert sich bei Korrekturen) */
export function finishedMatchSigs(data: MmData): Map<string, string> {
  const by = new Map<string, { player_id: string; position: unknown; score: unknown }[]>();
  for (const mp of data.match_players) {
    const list = by.get(String(mp.match_id)) ?? [];
    list.push(mp as any);
    by.set(String(mp.match_id), list);
  }
  const out = new Map<string, string>();
  for (const [mid, list] of Array.from(by.entries())) {
    if (list.length < 2) continue;
    if (!list.every((mp) => Number(mp.position) > 0)) continue;
    out.set(
      mid,
      list
        .map((mp) => `${mp.player_id}:${mp.position}:${mp.score ?? ""}`)
        .sort()
        .join(",")
    );
  }
  return out;
}

/** 📰 Matchplay & Co.: Ergebnis eines fertigen Matches */
export function matchShortNews(data: MmData, matchId: string): FeedItemInput | null {
  const { player, matchMachine, matchMachineIcon } = names(data);
  const mps = data.match_players.filter((mp) => String(mp.match_id) === String(matchId));
  if (mps.length < 2 || !mps.every((mp) => Number(mp.position) > 0)) return null;
  const timeplay = String(data.tournament?.format ?? "") === "timeplay";
  const lines: ShortMatchLine[] = mps
    .map((mp) => ({
      pos: Number(mp.position),
      name: player.get(String(mp.player_id)) ?? "?",
      score: timeplay ? null : num(mp.score),
    }))
    .sort((a, b) => a.pos - b.pos || a.name.localeCompare(b.name));
  const winners = lines.filter((l) => l.pos === 1).map((l) => l.name);
  const machine = matchMachine.get(String(matchId)) ?? "?";
  const machineIcon = matchMachineIcon.get(String(matchId)) ?? null;
  const body = lines.map((l) => `${posLabel(l.pos)} ${l.name}${l.score != null ? ` ${fmt(l.score)}` : ""}`).join(" · ");
  return {
    key: `matchShort|${matchId}`,
    kind: "matchShort",
    icon: "🏁",
    title: `${machineIcon ? `${machineIcon} ` : ""}${machine}: ${winners.join(" & ")} ${winners.length > 1 ? "gewinnen" : "gewinnt"}`,
    body,
    players: mps.map((mp) => String(mp.player_id)),
    data: { machine, machineIcon, lines },
  };
}

/** 📰 Round the Pinball: alle Scores eines fertigen Durchgangs (1-basiert) mit aktuellem Platz am Flipper */
export function waveShortNews(data: MmData, wave: number, total: number): FeedItemInput | null {
  const { player, matchMachine, matchMachineIcon } = names(data);
  const waveOf = rotationWaveMap(
    data.matches.map((m) => String(m.id)),
    data.match_players as any
  );
  // alle Scores je Flipper (= Match) – für "aktuell Platz X"
  const scoresByMatch = new Map<string, number[]>();
  for (const mp of data.match_players) {
    const s = num(mp.score);
    if (s == null) continue;
    const list = scoresByMatch.get(String(mp.match_id)) ?? [];
    list.push(s);
    scoresByMatch.set(String(mp.match_id), list);
  }
  const lines: ShortWaveLine[] = [];
  for (const mp of data.match_players) {
    if (waveOf.get(String(mp.match_id) + "|" + String(mp.player_id)) !== wave) continue;
    const s = num(mp.score);
    if (s == null) continue;
    const all = scoresByMatch.get(String(mp.match_id)) ?? [];
    lines.push({
      name: player.get(String(mp.player_id)) ?? "?",
      machine: matchMachine.get(String(mp.match_id)) ?? "?",
      machineIcon: matchMachineIcon.get(String(mp.match_id)) ?? null,
      score: s,
      place: 1 + all.filter((x) => x > s).length,
    });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.machine.localeCompare(b.machine) || b.score - a.score);
  return {
    key: `waveShort|${wave}|${total}`,
    kind: "waveShort",
    icon: "🎱",
    title: `Durchgang ${wave} / ${total}: alle Scores`,
    body: lines.map((l) => `${l.name} – ${l.machine}: Platz ${l.place} mit ${fmt(l.score)}`).join(" · "),
    data: { lines },
  };
}

/** Zeilen aus data lesen (Ticker / Karte) */
export function shortLines(item: { kind: string; data?: Record<string, unknown> | null }) {
  const lines = Array.isArray(item.data?.lines) ? (item.data!.lines as unknown[]) : [];
  return lines as (ShortMatchLine | ShortWaveLine)[];
}

export { fmt as fmtScore };
