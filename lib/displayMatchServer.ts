// 📟 Server: Daten fürs Flipper-Display bei Matchplay / Swiss / Round Robin.
// Lädt Runden, Matches, Scores und Spieler des Turniers und baut daraus (lib/flipperDisplay.ts matchDisplay):
// Match dieses Flippers in der aktuellen Runde (wer spielt, pers. Bestwert, Sieger), Turnier-Highscore am
// Flipper, "Runde fertig" + Tabelle. Persönliche Bestwerte der Location: lib/feedContextServer (5 Min. Cache).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { loadMachineRecords } from "@/lib/feedContextServer";
import { machineKey } from "@/lib/machineStats";
import { personalKey } from "@/lib/recordWatch";
import { displayText, tournamentRanking, type DisplayMatch, type DisplayRecord, type RankingEntry } from "@/lib/flipperDisplay";

type T = { id: string; location_id: string | null; format: string | null };

export type MatchDisplayData = {
  hasRounds: boolean;
  roundNo: number;
  match: DisplayMatch | null;
  roundDone: boolean;
  standings: RankingEntry[];
  tournamentBest: DisplayRecord | null;
};

const PERSONAL_TTL_MS = 5 * 60_000;
const personalCache = new Map<string, { at: number; personal: Record<string, number> }>();

async function personalRecords(sb: SupabaseClient, t: T): Promise<Record<string, number>> {
  const hit = personalCache.get(t.id);
  if (hit && Date.now() - hit.at < PERSONAL_TTL_MS) return hit.personal;
  const r = await loadMachineRecords(sb, t);
  const personal = r.personal ?? {};
  personalCache.set(t.id, { at: Date.now(), personal });
  return personal;
}

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function loadMatchDisplay(sb: SupabaseClient, t: T, mine: Set<string>, flipperName: string): Promise<MatchDisplayData> {
  const key = machineKey(flipperName);
  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id, number, format, status")
    .eq("tournament_id", t.id);
  if (rErr) throw new Error(`Runden laden fehlgeschlagen: ${rErr.message}`);
  const rs = (rounds ?? []) as { id: string; number: number | null; format: string | null; status: string | null }[];
  const empty: MatchDisplayData = { hasRounds: false, roundNo: 0, match: null, roundDone: false, standings: [], tournamentBest: null };
  if (!rs.length) return empty;

  const roundNo = Math.max(...rs.map((r) => Number(r.number ?? 0)));
  const current = rs.filter((r) => Number(r.number ?? 0) === roundNo).map((r) => String(r.id));

  const mRes = await fetchAllIn<{ id: string; round_id: string; machine_id: string | null }>(
    rs.map((r) => String(r.id)),
    (chunk) => sb.from("matches").select("id, round_id, machine_id").in("round_id", chunk).order("id")
  );
  if (mRes.error) throw new Error(`Matches laden fehlgeschlagen: ${mRes.error.message}`);
  const mpRes = await fetchAllIn<{
    match_id: string;
    player_id: string;
    score: number | string | null;
    position: number | null;
    start_position: number | null;
  }>(
    mRes.data.map((m) => String(m.id)),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, score, position, start_position")
        .in("match_id", chunk)
        .order("match_id")
        .order("player_id")
  );
  if (mpRes.error) throw new Error(`Scores laden fehlgeschlagen: ${mpRes.error.message}`);
  const { data: players, error: pErr } = await sb.from("players").select("id, name, profile_id").eq("tournament_id", t.id);
  if (pErr) throw new Error(`Spieler laden fehlgeschlagen: ${pErr.message}`);
  const ps = (players ?? []) as { id: string; name: string | null; profile_id: string | null }[];
  const nameOf = new Map(ps.map((p) => [String(p.id), displayText(p.name) || "?"]));
  const profileOf = new Map(ps.map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));

  const byMatch = new Map<string, typeof mpRes.data>();
  for (const mp of mpRes.data) {
    const list = byMatch.get(String(mp.match_id)) ?? [];
    list.push(mp);
    byMatch.set(String(mp.match_id), list);
  }
  const isFinished = (mid: string) => {
    const list = byMatch.get(mid) ?? [];
    return list.length > 0 && list.every((x) => x.position != null);
  };

  // 🏆 bester Score an diesem Flipper im Turnier (alle Runden)
  const myAll = mRes.data.filter((m) => m.machine_id && mine.has(String(m.machine_id))).map((m) => String(m.id));
  let tournamentBest: DisplayRecord | null = null;
  for (const mid of myAll) {
    for (const mp of byMatch.get(mid) ?? []) {
      const s = toScore(mp.score);
      if (s != null && (!tournamentBest || s > tournamentBest.score)) {
        tournamentBest = { score: s, holder: nameOf.get(String(mp.player_id)) ?? null };
      }
    }
  }

  // 🎯 Match dieses Flippers in der aktuellen Runde
  const curMatches = mRes.data.filter((m) => current.includes(String(m.round_id)));
  const mine0 = curMatches.find((m) => m.machine_id && mine.has(String(m.machine_id)));
  let match: DisplayMatch | null = null;
  if (mine0) {
    const mid = String(mine0.id);
    const list = (byMatch.get(mid) ?? [])
      .slice()
      .sort((a, b) => Number(a.start_position ?? 9999) - Number(b.start_position ?? 9999));
    const finished = isFinished(mid);
    const activeMp = finished ? null : list.find((x) => toScore(x.score) == null && x.position == null) ?? null;
    const winners = list.filter((x) => x.position === 1);
    let activeBest: number | null = null;
    if (activeMp) {
      const prof = profileOf.get(String(activeMp.player_id));
      if (prof && t.location_id) {
        const personal = await personalRecords(sb, t).catch(() => ({} as Record<string, number>));
        const pb = personal[personalKey(prof, key)];
        if (pb != null && Number.isFinite(Number(pb))) activeBest = Number(pb);
      }
      // dazu: eigene Scores an diesem Flipper in diesem Turnier
      for (const m2 of myAll) {
        for (const mp of byMatch.get(m2) ?? []) {
          if (String(mp.player_id) !== String(activeMp.player_id)) continue;
          const s = toScore(mp.score);
          if (s != null && (activeBest == null || s > activeBest)) activeBest = s;
        }
      }
    }
    match = {
      matchId: mid,
      round: roundNo,
      players: list.map((x) => nameOf.get(String(x.player_id)) ?? "?"),
      active: activeMp ? nameOf.get(String(activeMp.player_id)) ?? "?" : null,
      activeBest,
      finished,
      winner: winners.length
        ? {
            name: winners.map((x) => nameOf.get(String(x.player_id)) ?? "?").join(" & "),
            score: winners.length === 1 ? toScore(winners[0].score) : null,
          }
        : null,
    };
  }

  // ✅ aktuelle Runde komplett fertig → Tabelle (Punkte wie TV/Statistik)
  const roundDone = curMatches.length > 0 && curMatches.every((m) => isFinished(String(m.id)));
  const standings = roundDone
    ? tournamentRanking(
        ps,
        rs.map((r) => ({ id: String(r.id), format: r.format })),
        mRes.data,
        mpRes.data.map((x) => ({ match_id: x.match_id, player_id: x.player_id, position: x.position }))
      )
    : [];

  return { hasRounds: true, roundNo, match, roundDone, standings, tournamentBest };
}

/**
 * Endplatzierung eines beendeten Turniers aus tournament_results (inkl. Superfinale):
 * Finalisten nach Superfinale-Platz vorne, danach alle anderen nach final_rank. null = keine Auswertung.
 */
export async function finalRankingFromResults(sb: SupabaseClient, tournamentId: string): Promise<RankingEntry[] | null> {
  const { data, error } = await sb
    .from("tournament_results")
    .select("player_id, points, final_rank, super_final_rank")
    .eq("tournament_id", tournamentId);
  if (error || !data || !data.length) return null;
  const { data: players } = await sb.from("players").select("id, name").eq("tournament_id", tournamentId);
  const nameOf = new Map(((players ?? []) as { id: string; name: string | null }[]).map((p) => [String(p.id), displayText(p.name) || "?"]));
  const rows = data as { player_id: string; points: number | null; final_rank: number | null; super_final_rank: number | null }[];
  const finalists = rows.filter((r) => r.super_final_rank != null).sort((a, b) => Number(a.super_final_rank) - Number(b.super_final_rank));
  const rest = rows
    .filter((r) => r.super_final_rank == null)
    .sort((a, b) => Number(a.final_rank ?? 9999) - Number(b.final_rank ?? 9999) || Number(b.points ?? 0) - Number(a.points ?? 0));
  const out: RankingEntry[] = finalists.map((r) => ({
    place: Number(r.super_final_rank),
    name: nameOf.get(String(r.player_id)) ?? "?",
    points: Number(r.points ?? 0),
  }));
  let place = out.length;
  rest.forEach((r, i) => {
    const prev = rest[i - 1];
    if (!prev || Number(prev.points ?? 0) !== Number(r.points ?? 0)) place = out.length + 1;
    out.push({ place, name: nameOf.get(String(r.player_id)) ?? "?", points: Number(r.points ?? 0) });
  });
  return out;
}
