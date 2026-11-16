// 📋 Rückblick nach einer Runde (Matchplay & Co.) bzw. einem Durchgang (Round the Pinball) – reine Logik.
// Genutzt von den Einblendungen "Runde abgeschlossen" / "Durchgang geschafft" und dem Live-Ticker.

import { liveLeaderboard, type MmData } from "@/lib/myMatch";
import { rotationWaveMap } from "@/lib/rotationTurn";

export type RoundSummary = {
  /** Rundensieger (Platz 1 je Match) bzw. bei Round the Pinball: wer im Durchgang an seinem Flipper vorn liegt */
  winners: { name: string; machine: string }[];
  /** höchster Score der Runde / des Durchgangs */
  top: { name: string; machine: string; score: number } | null;
  /** Tabellenführer danach */
  leader: { name: string; points: number } | null;
  /** größter Aufsteiger in der Tabelle (nur wenn jemand nach vorn gerückt ist) */
  climber: { name: string; place: number } | null;
};

type AnyData = MmData;

const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function names(data: AnyData) {
  const player = new Map(data.players.map((p) => [String(p.id), String(p.name ?? "?")]));
  const machine = new Map((data.machines ?? []).map((m) => [String(m.id), String(m.name ?? "?")]));
  const matchMachine = new Map(data.matches.map((m) => [String(m.id), machine.get(String(m.machine_id ?? "")) ?? "?"]));
  return { player, matchMachine };
}

/** Tabellenführer + größter Aufsteiger: Tabelle mit und ohne die betrachteten Einträge vergleichen */
function leaderAndClimber(after: AnyData, before: AnyData): Pick<RoundSummary, "leader" | "climber"> {
  const a = liveLeaderboard(after).rows;
  const b = liveLeaderboard(before).rows;
  const leader = a[0] ? { name: a[0].name, points: a[0].total } : null;
  const placeBefore = new Map(b.map((r) => [r.id, r.place]));
  let climber: RoundSummary["climber"] = null;
  let bestGain = 0;
  for (const r of a) {
    const gain = (placeBefore.get(r.id) ?? r.place) - r.place;
    if (gain > bestGain) {
      bestGain = gain;
      climber = { name: r.name, place: r.place };
    }
  }
  return { leader, climber };
}

/** Matchplay & Co.: Rückblick einer fertigen Runde */
export function roundSummary(data: AnyData, roundId: string): RoundSummary {
  const { player, matchMachine } = names(data);
  const matchIds = new Set(data.matches.filter((m) => String(m.round_id) === String(roundId)).map((m) => String(m.id)));
  const mps = data.match_players.filter((mp) => matchIds.has(String(mp.match_id)));

  const winners = mps
    .filter((mp) => Number(mp.position) === 1)
    .map((mp) => ({ name: player.get(String(mp.player_id)) ?? "?", machine: matchMachine.get(String(mp.match_id)) ?? "?" }));

  let top: RoundSummary["top"] = null;
  for (const mp of mps) {
    const s = num(mp.score);
    if (s != null && (!top || s > top.score)) {
      top = { name: player.get(String(mp.player_id)) ?? "?", machine: matchMachine.get(String(mp.match_id)) ?? "?", score: s };
    }
  }

  const before: AnyData = {
    ...data,
    matches: data.matches.filter((m) => !matchIds.has(String(m.id))),
    match_players: data.match_players.filter((mp) => !matchIds.has(String(mp.match_id))),
  };
  return { winners, top, ...leaderAndClimber(data, before) };
}

/** Round the Pinball: Rückblick eines Durchgangs (1-basiert) */
export function rotationWaveSummary(data: AnyData, wave: number): RoundSummary {
  const { player, matchMachine } = names(data);
  const matchIds = data.matches.map((m) => String(m.id));
  const waveOf = rotationWaveMap(matchIds, data.match_players as any);
  const inWave = data.match_players.filter(
    (mp) => waveOf.get(String(mp.match_id) + "|" + String(mp.player_id)) === wave && num(mp.score) != null
  );

  // Wer liegt mit seinem Score aus diesem Durchgang an seinem Flipper vorn?
  const byMatch = new Map<string, number[]>();
  for (const mp of data.match_players) {
    const s = num(mp.score);
    if (s == null) continue;
    const list = byMatch.get(String(mp.match_id)) ?? [];
    list.push(s);
    byMatch.set(String(mp.match_id), list);
  }
  const winners = inWave
    .filter((mp) => Math.max(...(byMatch.get(String(mp.match_id)) ?? [0])) === num(mp.score))
    .map((mp) => ({ name: player.get(String(mp.player_id)) ?? "?", machine: matchMachine.get(String(mp.match_id)) ?? "?" }));

  let top: RoundSummary["top"] = null;
  for (const mp of inWave) {
    const s = num(mp.score)!;
    if (!top || s > top.score) top = { name: player.get(String(mp.player_id)) ?? "?", machine: matchMachine.get(String(mp.match_id)) ?? "?", score: s };
  }

  // "vorher" = ohne die Scores dieses Durchgangs
  const waveKeys = new Set(inWave.map((mp) => String(mp.match_id) + "|" + String(mp.player_id)));
  const before: AnyData = {
    ...data,
    match_players: data.match_players.map((mp) =>
      waveKeys.has(String(mp.match_id) + "|" + String(mp.player_id)) ? { ...mp, score: null, position: null } : mp
    ),
  };
  return { winners, top, ...leaderAndClimber(data, before) };
}

/** kurze Textfassung (Ticker) */
export function summaryText(s: RoundSummary, rotation = false): string {
  const parts: string[] = [];
  if (s.winners.length) {
    parts.push(
      (rotation ? "Vorn an ihrem Flipper: " : "Rundensieger: ") +
        s.winners
          .slice(0, 6)
          .map((w) => `${w.name} (${w.machine})`)
          .join(", ")
    );
  }
  if (s.top) parts.push(`Höchster Score: ${s.top.name} an ${s.top.machine} – ${s.top.score.toLocaleString("de-DE")}`);
  if (s.leader && s.climber && s.climber.name === s.leader.name) {
    parts.push(`${s.leader.name} übernimmt die Führung (${s.leader.points} Pkt.)`);
  } else {
    if (s.leader) parts.push(`Führend: ${s.leader.name} (${s.leader.points} Pkt.)`);
    if (s.climber) parts.push(`${s.climber.name} rückt auf Platz ${s.climber.place} vor`);
  }
  return parts.join(" · ");
}
