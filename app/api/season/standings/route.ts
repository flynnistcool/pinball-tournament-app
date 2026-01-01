import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

function matchPointsFor(position: number, nPlayers: number) {
  // Linear: 1st gets N, 2nd N-1, ... last gets 1
  if (!nPlayers || nPlayers <= 1) return 0;
  if (!position || position < 1) return 0;
  return Math.max(1, nPlayers - position + 1);
}

function placementFixed(rank: number) {
  if (rank === 1) return 20;
  if (rank === 2) return 17;
  if (rank === 3) return 15;
  if (rank === 4) return 13;
  if (rank === 5) return 11;
  if (rank === 6) return 9;
  if (rank === 7) return 7;
  if (rank === 8) return 5;
  return 3;
}

function placementLinear(rank: number, n: number) {
  return Math.max(1, n - rank + 1);
}

function avg(arr: number[]) { return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0; }

function computeTieGroups(sorted: any[]) {
  const groups: { keys: string[]; startRank: number; endRank: number }[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = i;
    const base = sorted[i];
    i++;
    while (i < sorted.length && sorted[i].points === base.points && sorted[i].wins === base.wins) i++;
    const end = i - 1;
    groups.push({ keys: sorted.slice(start, i).map(p => p.key), startRank: start + 1, endRank: end + 1 });
  }
  return groups;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const category = String(url.searchParams.get("category") ?? "league").toLowerCase(); // league|normal|fun
  const mode = String(url.searchParams.get("mode") ?? "match").toLowerCase(); // match | placement_fixed | placement_linear
  const bestN = Math.max(1, Math.min(50, Number(url.searchParams.get("best") ?? 8)));
  const participation = Math.max(0, Math.min(50, Number(url.searchParams.get("participation") ?? 0)));

  if (!Number.isFinite(year)) return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: ts, error: tErr } = await sb
    .from("tournaments")
    .select("id, name, code")
    .eq("category", category)
    .eq("season_year", year);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  const tids = (ts ?? []).map((t: any) => t.id);
  if (!tids.length) return NextResponse.json({ year, category, standings: [], tournaments: [], config: { mode, bestN, participation } });

  const { data: mps, error } = await sb
    .from("match_players")
    .select("player_id, position, matches!inner(id), players!inner(profile_id, name, tournament_id)")
    .in("players.tournament_id", tids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const matchToCount: Record<string, number> = {};
  for (const row of (mps ?? []) as any[]) {
    const mid = row.matches.id as string;
    matchToCount[mid] = (matchToCount[mid] ?? 0) + 1;
  }

  type PerT = Record<string, { name: string; points: number; matches: number; wins: number }>;
  const perTournament: Record<string, PerT> = {};

  for (const row of (mps ?? []) as any[]) {
    if (row.position == null) continue;

    const profileId = row.players?.profile_id as string | null;
    const pname = row.players?.name as string;
    const key = profileId ?? `name:${pname}`;
    const tId = row.players?.tournament_id as string;
    const nPlayers = matchToCount[row.matches.id] ?? 0;

    perTournament[tId] = perTournament[tId] || {};
    const obj = perTournament[tId][key] ?? { name: pname, points: 0, matches: 0, wins: 0 };
    obj.matches += 1;
    if (row.position === 1) obj.wins += 1;
    obj.points += matchPointsFor(row.position, nPlayers);
    perTournament[tId][key] = obj;
  }

  type TRes = { tournamentId: string; tournamentName: string; raw: number; counted: number; rank: number };
  type Agg = { key: string; name: string; total: number; matches: number; wins: number; tournamentsPlayed: number; winrate: number; results: TRes[] };

  const agg: Record<string, Agg> = {};
  const tName: Record<string, string> = Object.fromEntries((ts ?? []).map((t: any) => [t.id, t.name]));

  for (const tId of tids) {
    const entries = perTournament[tId] || {};
    const players = Object.entries(entries).map(([key, v]) => ({ key, ...(v as any) }));
    if (!players.length) continue;

    players.sort((a: any, b: any) => (b.points - a.points) || (b.wins - a.wins) || a.name.localeCompare(b.name));

    const groups = computeTieGroups(players);
    const n = players.length;

    const rankToFixed: Record<number, number> = {};
    const rankToLinear: Record<number, number> = {};
    for (let r = 1; r <= n; r++) { rankToFixed[r] = placementFixed(r); rankToLinear[r] = placementLinear(r, n); }

    const pointsForKey: Record<string, { rank: number; pts: number }> = {};
    for (const g of groups) {
      const ranks = [];
      for (let rr = g.startRank; rr <= g.endRank; rr++) ranks.push(rr);
      const fixedAvg = avg(ranks.map(rr => rankToFixed[rr]));
      const linearAvg = avg(ranks.map(rr => rankToLinear[rr]));
      for (const k of g.keys) {
        pointsForKey[k] = {
          rank: g.startRank,
          pts: mode === "placement_fixed" ? fixedAvg : mode === "placement_linear" ? linearAvg : 0,
        };
      }
    }

    for (const p of players) {
      let tournamentPoints = 0;
      if (mode === "match") tournamentPoints = p.points;
      else tournamentPoints = pointsForKey[p.key]?.pts ?? 0;

      tournamentPoints += participation;

      const a = agg[p.key] ?? { key: p.key, name: p.name, total: 0, matches: 0, wins: 0, tournamentsPlayed: 0, winrate: 0, results: [] };
      a.matches += p.matches;
      a.wins += p.wins;
      a.tournamentsPlayed += 1;
      a.results.push({ tournamentId: tId, tournamentName: tName[tId] ?? tId, raw: Math.round(tournamentPoints*100)/100, counted: Math.round(tournamentPoints*100)/100, rank: pointsForKey[p.key]?.rank ?? 0 });
      agg[p.key] = a;
    }
  }

  for (const a of Object.values(agg)) {
    const sorted = a.results.slice().sort((x, y) => y.raw - x.raw);
    const kept = new Set(sorted.slice(0, bestN).map(r => r.tournamentId));
    a.total = 0;
    for (const r of a.results) {
      if (kept.has(r.tournamentId)) { r.counted = r.raw; a.total += r.counted; }
      else { r.counted = 0; }
    }
    a.winrate = a.matches ? Math.round((a.wins / a.matches) * 1000) / 10 : 0;
    a.results.sort((x, y) => x.tournamentName.localeCompare(y.tournamentName));
  }

  const standings = Object.values(agg)
    .sort((a: any, b: any) => (b.total - a.total) || (b.wins - a.wins) || a.name.localeCompare(b.name))
    .map((a: any, idx: number) => ({
      rank: idx + 1,
      key: a.key,
      name: a.name,
      points: Math.round(a.total*100)/100,
      tournamentsPlayed: a.tournamentsPlayed,
      countedTournaments: Math.min(a.tournamentsPlayed, bestN),
      droppedTournaments: Math.max(0, a.tournamentsPlayed - bestN),
      matches: a.matches,
      wins: a.wins,
      winrate: a.winrate,
      results: a.results,
    }));

  return NextResponse.json({ year, category, standings, tournaments: ts ?? [], config: { mode, bestN, participation } });
}
