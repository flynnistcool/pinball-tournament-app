// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { matchPoints, superFinalTpBonus } from "@/lib/points";

type MPRow = {
  player_id: string;
  position: number | null;
  matches: {
    id: string;
    machine_id: string | null;
    round_id: string;
    rounds: { tournament_id: string; number: number; format: string };
  };
};

// Punkte-Logik zentral in lib/points.ts (Rotation 5+ Spieler: N, N-2, N-3, ...)
function pointsFor(position: number, nPlayers: number, format?: string | null) {
  return matchPoints(position, nPlayers, format);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code)
    return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb
    .from("tournaments")
    .select("id, format, match_size")
    .eq("code", code)
    .single();
  if (!t)
    return NextResponse.json(
      { error: "Turnier nicht gefunden" },
      { status: 404 }
    );

const [
  { data: players },
  { data: profiles },
  { data: machines },
  { data: mpsRaw },
  { data: ratingRows },
  { data: trRows }, // ✅ NEU: tournament_results rows
  { data: rounds }, // ✅ NEU: rounds für Progress-Bars
] = await Promise.all([
      sb
        .from("players")
        .select("id, name, profile_id")
        .eq("tournament_id", t.id),
      // ⬇️ HIER: color & icon mitladen
      sb
        .from("profiles")
        .select(
          "id, avatar_url, rating, matches_played, provisional_matches, color, icon"
        ),
      sb
        .from("machines")
        .select("id, name")
        .eq("tournament_id", t.id),
      sb
        .from("match_players")
        .select(
          "player_id, position, matches!inner(id, machine_id, round_id, rounds!inner(tournament_id, number, format))"
        )
        .eq("matches.rounds.tournament_id", t.id),
        // ⭐ NEU: Start-Elo vor diesem Turnier
        sb
          .from("tournament_ratings")
          .select("profile_id, rating_before")
          .eq("tournament_id", t.id),
        // ✅ NEU: Turnierpunkte pro Spieler aus tournament_results
        sb.from("tournament_results")
          .select("player_id, tournament_points, super_final_rank")
          .eq("tournament_id", t.id),
sb
  .from("rounds")
  .select("id, number, status, format, elo_enabled")
  .eq("tournament_id", t.id),
    ]);


  const tournamentPointsByPlayer: Record<string, number> = {};
  const superFinalTpBonusByPlayer: Record<string, number> = {}; // Anteil Superfinale (für "6 TP + 2 🔥")
  for (const row of (trRows ?? []) as any[]) {
    const pid = row.player_id as string | undefined;
    if (!pid) continue;
    tournamentPointsByPlayer[pid] = Number(row.tournament_points ?? 0);
    superFinalTpBonusByPlayer[pid] = superFinalTpBonus(row.super_final_rank ?? null);
  }

  // ⬇️ Avatare + Farben + Icons aus den Profilen holen
  const avatar: Record<string, string | null> = {};
  const profileColor: Record<string, string | null> = {};
  const profileIcon: Record<string, string | null> = {};
  const profileRating: Record<string, number | null> = {};

  for (const p of (profiles ?? []) as any[]) {
    avatar[p.id] = p.avatar_url ?? null;
    profileColor[p.id] = (p as any).color ?? null;
    profileIcon[p.id] = (p as any).icon ?? null;
    profileRating[p.id] =
    typeof (p as any).rating === "number" ? (p as any).rating : null;
  }

  // ⭐ NEU: Start-Elo vor dem Turnier aus tournament_ratings
  const startRatingByProfile: Record<string, number | null> = {};
  for (const row of (ratingRows ?? []) as any[]) {
    const pid = row.profile_id as string | undefined;
    if (!pid) continue;
    if (typeof row.rating_before === "number") {
      startRatingByProfile[pid] = row.rating_before;
    }
  }

  const machineName: Record<string, string> = {};
  for (const m of (machines ?? []) as any[]) machineName[m.id] = m.name;

  const mps = (mpsRaw ?? []) as any as MPRow[];

  // Precompute match size (players per match)
  const matchToPlayers: Record<string, string[]> = {};
  for (const row of mps) {
    const mid = row.matches.id;
    matchToPlayers[mid] = matchToPlayers[mid] || [];
    matchToPlayers[mid].push(row.player_id);
  }

  // Stats accumulators
  const played: Record<string, number> = {};
  const wins: Record<string, number> = {};
  const podiums: Record<string, number> = {};
  const posSum: Record<string, number> = {};
  const posCount: Record<string, number> = {};
  const pointsSum: Record<string, number> = {};
  const roundPoints: Record<string, Record<number, number>> = {}; // player -> roundNo -> points
  const machinePlays: Record<string, Record<string, number>> = {}; // player -> machine -> count
  const machinePoints: Record<string, Record<string, number>> = {}; // player -> machine -> pointsSum

  for (const row of mps) {
    const pid = row.player_id;
    const pos = row.position;
    const mid = row.matches.machine_id;
    const matchId = row.matches.id;
    const nPlayers = matchToPlayers[matchId]?.length ?? 0;

    if (pos == null) continue; // only count finished entries
    played[pid] = (played[pid] ?? 0) + 1;
    posSum[pid] = (posSum[pid] ?? 0) + pos;
    posCount[pid] = (posCount[pid] ?? 0) + 1;
    if (pos === 1) wins[pid] = (wins[pid] ?? 0) + 1;
    if (pos <= 3) podiums[pid] = (podiums[pid] ?? 0) + 1;

    const pts = pointsFor(pos, nPlayers, row.matches?.rounds?.format);
    pointsSum[pid] = (pointsSum[pid] ?? 0) + pts;

    

    const rno = row.matches.rounds.number;
    roundPoints[pid] = roundPoints[pid] || {};
    roundPoints[pid][rno] = (roundPoints[pid][rno] ?? 0) + pts;

    if (mid) {
      machinePlays[pid] = machinePlays[pid] || {};
      machinePoints[pid] = machinePoints[pid] || {};
      machinePlays[pid][mid] = (machinePlays[pid][mid] ?? 0) + 1;
      machinePoints[pid][mid] = (machinePoints[pid][mid] ?? 0) + pts;
    }
  }

function bestMachine(pid: string) {
  const playsMap = machinePlays[pid] || {};
  const ptsMap = machinePoints[pid] || {};

  let best: { mid: string; total: number; plays: number } | null = null;

  for (const mid of Object.keys(playsMap)) {
    const total = ptsMap[mid] ?? 0;
    const count = playsMap[mid] ?? 0;
    const candidate = { mid, total, plays: count };

    if (!best || candidate.total > best.total) {
      best = candidate;
    }
  }

  if (!best) return null;

  const avg = best.total / Math.max(1, best.plays);

  return {
    machineId: best.mid,
    machine: machineName[best.mid] ?? best.mid,
    // 🔹 NEU: Gesamtpunkte, wie gewünscht
    totalPoints: best.total,
    // 🔹 damit dein UI nicht crasht:
    avgPoints: Math.round(avg * 100) / 100,
    plays: best.plays,
  };
}



  function favoriteMachine(pid: string) {
    const plays = machinePlays[pid] || {};
    let fav: { mid: string; plays: number } | null = null;
    for (const mid of Object.keys(plays)) {
      const item = { mid, plays: plays[mid] };
      if (!fav || item.plays > fav.plays) fav = item;
    }
    if (!fav) return null;
    return {
      machineId: fav.mid,
      machine: machineName[fav.mid] ?? fav.mid,
      plays: fav.plays,
    };
  }

  function history(pid: string) {
    const rp = roundPoints[pid] || {};
    const rounds = Object.keys(rp)
      .map((n) => Number(n))
      .sort((a, b) => a - b);
    return rounds.map((r) => ({ round: r, points: rp[r] }));
  }

const rows = (players ?? []).map((p: any) => {
  const m = played[p.id] ?? 0;
  const w = wins[p.id] ?? 0;
  const winrate = m > 0 ? Math.round((w / m) * 1000) / 10 : 0; // %
  const avgPos =
    (posCount[p.id] ?? 0) > 0
      ? Math.round((posSum[p.id] / posCount[p.id]) * 100) / 100
      : null;
  const podiumRate =
    m > 0 ? Math.round(((podiums[p.id] ?? 0) / m) * 1000) / 10 : 0;
  const hist = history(p.id);

  const profileId = p.profile_id as string | null;
  const eloEnd =
    profileId ? profileRating[profileId] ?? null : null;
  const eloStart =
    profileId ? startRatingByProfile[profileId] ?? null : null;
  const eloDelta =
    eloEnd != null && eloStart != null ? eloEnd - eloStart : null;

  return {
    id: p.id,
    name: p.name,
    avatarUrl: profileId ? avatar[profileId] ?? null : null,
    color: profileId ? profileColor[profileId] ?? null : null,
    icon: profileId ? profileIcon[profileId] ?? null : null,

    matches: m,
    wins: w,
    winrate,
    avgPos,
    points: pointsSum[p.id] ?? 0,
    // ✅ Turnierwertungspunkte (fix nach Turnierende)
    tournamentPoints: tournamentPointsByPlayer[p.id] ?? 0,
    superFinalTpBonus: superFinalTpBonusByPlayer[p.id] ?? 0,

    podiumRate,
    favoriteMachine: favoriteMachine(p.id),
    bestMachine: bestMachine(p.id),
    history: hist,

    // ⭐ NEU: Elo-Verlauf dieses Turniers
    eloStart,
    eloEnd,
    eloDelta,
  };
});


  // sort by points then wins
  rows.sort(
    (a: any, b: any) =>
      b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name)
  );

  return NextResponse.json({
    stats: rows,
    tournament: { id: t.id, format: (t as any).format ?? null, match_size: (t as any).match_size ?? null },
    playersCount: (players ?? []).length,
    rounds: (rounds ?? []),
  });
}
