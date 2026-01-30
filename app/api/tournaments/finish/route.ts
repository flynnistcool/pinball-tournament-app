import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

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

function pointsFor(position: number, nPlayers: number) {
  if (nPlayers <= 1) return 0;
  if (nPlayers === 2) return position === 1 ? 2 : 0;
  if (nPlayers === 3) return position === 1 ? 3 : position === 2 ? 1 : 0;
  // default 4+
  return position === 1 ? 4 : position === 2 ? 2 : position === 3 ? 1 : 0;
}

// 👉 NEU: Turnierpunkte nach Final-Rang + Teilnehmerzahl
function tournamentPointsForRank(finalRank: number | null, nPlayers: number): number {
  if (!finalRank || finalRank <= 0 || nPlayers <= 0) return 0;

  // 1. Platz: N + 2
  if (finalRank === 1) return nPlayers + 2;

  // 2. Platz: N
  if (finalRank === 2) return nPlayers;

  // 3. Platz: N - 2, 4. Platz: N - 3, 5. Platz: N - 4, ...
  const base = nPlayers - (finalRank - 1);
  return Math.max(0, base);
}

// 👉 NEU: Bonus für Super-Final-Sieger
function superFinalBonusPoints(nFinalPlayers: number): number {
  if (nFinalPlayers <= 0) return 0;
  return 2;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  // 1) Turnier holen (inkl. Status)
  const { data: t, error: terr } = await sb
    .from("tournaments")
    .select("id, status")
    .eq("code", code)
    .single();

  if (terr || !t) {
    return NextResponse.json(
      { error: terr?.message ?? "Turnier nicht gefunden" },
      { status: 404 }
    );
  }

  // 2) Status auf "finished" setzen (auch wenn schon finished – damit wir
  //    die Auswertung trotzdem neu schreiben können)
  const { error: upErr } = await sb
    .from("tournaments")
    .update({ status: "finished" })
    .eq("id", t.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // 3) Spieler, Maschinen, Match-Players laden
  const [
    { data: players, error: playersErr },
    { data: machines },
    { data: mpsRaw },
  ] = await Promise.all([
    sb
      .from("players")
      .select("id, name, profile_id")
      .eq("tournament_id", t.id),
    sb.from("machines").select("id, name").eq("tournament_id", t.id),
    sb
      .from("match_players")
      .select(
        "player_id, position, matches!inner(id, machine_id, round_id, rounds!inner(tournament_id, number, format))"
      )
      .eq("matches.rounds.tournament_id", t.id),
  ]);

  if (playersErr) {
    return NextResponse.json(
      { error: playersErr.message },
      { status: 500 }
    );
  }

  const mps = (mpsRaw ?? []) as any as MPRow[];

  const machineName: Record<string, string> = {};
  for (const m of (machines ?? []) as any[]) machineName[m.id] = m.name;

  // Matchgröße vorberechnen: wie viele Spieler pro Match
  const matchToPlayers: Record<string, string[]> = {};
  for (const row of mps) {
    const mid = row.matches.id;
    matchToPlayers[mid] = matchToPlayers[mid] || [];
    matchToPlayers[mid].push(row.player_id);
  }

  // Accumulatoren für Turnier-Stats
  const played: Record<string, number> = {};
  const wins: Record<string, number> = {};
  const podiums: Record<string, number> = {};
  const posSum: Record<string, number> = {};
  const posCount: Record<string, number> = {};
  const pointsSum: Record<string, number> = {};
  const roundPoints: Record<string, Record<number, number>> = {};
  const machinePlays: Record<string, Record<string, number>> = {};
  const machinePoints: Record<string, Record<string, number>> = {};

  for (const row of mps) {
    const pid = row.player_id;
    const pos = row.position;
    const mid = row.matches.machine_id;
    const matchId = row.matches.id;
    const nPlayers = matchToPlayers[matchId]?.length ?? 0;

    if (pos == null) continue; // nur fertige Einträge zählen

    played[pid] = (played[pid] ?? 0) + 1;
    posSum[pid] = (posSum[pid] ?? 0) + pos;
    posCount[pid] = (posCount[pid] ?? 0) + 1;

    if (pos === 1) wins[pid] = (wins[pid] ?? 0) + 1;
    if (pos <= 3) podiums[pid] = (podiums[pid] ?? 0) + 1;

    const pts = pointsFor(pos, nPlayers);
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
      totalPoints: best.total,
      avgPoints: Math.round(avg * 100) / 100,
      plays: best.plays,
    };
  }

  // history() brauchen wir hier nicht für DB, aber evtl. später
  function history(pid: string) {
    const rp = roundPoints[pid] || {};
    const rounds = Object.keys(rp)
      .map((n) => Number(n))
      .sort((a, b) => a - b);
    return rounds.map((r) => ({ round: r, points: rp[r] }));
  }

  // 4) Super-Finale: fertiges Finale suchen und Ränge pro Spieler lesen
  const superFinalRankByPlayer: Record<string, number> = {};

  const { data: finales, error: finalesErr } = await sb
    .from("finales")
    .select("id, status")
    .eq("tournament_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!finalesErr && finales && finales.length > 0) {
    const final = finales[0];

    if (final.status === "finished") {
      // Ränge direkt aus final_players (ACHTUNG: final_id, nicht tournament_id!)
      const { data: finalPlayers, error: finalErr } = await sb
        .from("final_players")
        .select("player_id, rank")
        .eq("final_id", final.id);

      if (!finalErr && finalPlayers) {
        for (const fp of finalPlayers as any[]) {
          if (fp.rank != null) {
            superFinalRankByPlayer[fp.player_id] = fp.rank;
          }
        }
      }
    }
  }

  // 5) Zeilen für tournament_results vorbereiten
  const resultRows = (players ?? []).map((p: any) => {
    const m = played[p.id] ?? 0;
    const w = wins[p.id] ?? 0;

    const winrate = m > 0 ? Math.round((w / m) * 1000) / 10 : 0;
    const avgPos =
      (posCount[p.id] ?? 0) > 0
        ? Math.round((posSum[p.id] / posCount[p.id]) * 100) / 100
        : null;
    const podiumRate =
      m > 0 ? Math.round(((podiums[p.id] ?? 0) / m) * 1000) / 10 : 0;

    // history aktuell nicht in DB, nur berechnet:
    const _hist = history(p.id);

    return {
      tournament_id: t.id,
      player_id: p.id,
      player_name: p.name, // NOT NULL
      final_rank: 0, // setzen wir gleich
      points: pointsSum[p.id] ?? 0,
      wins: w,
      podiums: podiums[p.id] ?? 0,
      matches_played: m,
      winrate,
      avg_position: avgPos,
      podium_rate: podiumRate,
      favorite_machine: favoriteMachine(p.id),
      best_machine: bestMachine(p.id),
      super_final_rank: superFinalRankByPlayer[p.id] ?? null,
      tournament_points: 0, // 👉 NEU – wird gleich berechnet
    };
  });

  // Sortierung wie im Stats-API: nach Punkten, dann Wins, dann Name
  resultRows.sort(
    (a, b) =>
      (b.points ?? 0) - (a.points ?? 0) ||
      (b.wins ?? 0) - (a.wins ?? 0) ||
      String(a.player_name).localeCompare(String(b.player_name))
  );

  // 👉 Anzahl Spieler im Turnier (für Punkteformel)
  const nPlayersTournament = (players ?? []).length;

  // final_rank + tournament_points setzen (Competition Ranking + tie-aware Punkte)
// Regeln:
// - Gleichstand = gleiche `points` (keine Auflösung über wins/name)
// - final_rank folgt Competition Ranking: 1,1,1,4 ...
// - tournament_points: Durchschnitt der Punkte der belegten Plätze
{
  // 1) final_rank setzen (Competition Ranking, nur nach points)
  let lastPts: number | null = null;
  let lastRank = 0;

  for (let i = 0; i < resultRows.length; i++) {
    const r = resultRows[i];
    const pts = Number(r.points ?? 0);

    const rank = lastPts !== null && pts === lastPts ? lastRank : i + 1;
    r.final_rank = rank;

    lastPts = pts;
    lastRank = rank;
  }

  // 2) tournament_points setzen (tie-aware)
  const nFinalPlayers = Object.keys(superFinalRankByPlayer).length;
  const bonusForWinner = superFinalBonusPoints(nFinalPlayers);

  let i = 0;
  while (i < resultRows.length) {
    const start = i;
    const pts = Number(resultRows[i].points ?? 0);
    const rankStart = resultRows[i].final_rank || (i + 1);

    // Tie-Gruppe: gleiche points
    while (i < resultRows.length && Number(resultRows[i].points ?? 0) === pts) i++;
    const end = i; // exklusiv
    const groupSize = end - start;

    // belegte Plätze: rankStart .. rankStart + groupSize - 1
    const rankEnd = rankStart + groupSize - 1;

    let sum = 0;
    for (let place = rankStart; place <= rankEnd; place++) {
      sum += tournamentPointsForRank(place, nPlayersTournament);
    }
    const baseAvg = groupSize > 0 ? sum / groupSize : 0;

    for (let j = start; j < end; j++) {
      const r = resultRows[j];
      const sfRank = r.super_final_rank ?? null;
      const bonus = sfRank === 1 ? bonusForWinner : 0;
      r.tournament_points = baseAvg + bonus;
    }
  }
}


  // 6) In tournament_results speichern (Upsert nach tournament_id + player_id)
  if (resultRows.length > 0) {
    const { error: insErr } = await sb
      .from("tournament_results")
      .upsert(resultRows, {
        onConflict: "tournament_id,player_id",
      });

    if (insErr) {
      console.error("Speichern in tournament_results fehlgeschlagen:", insErr);
      return NextResponse.json(
        {
          ok: true,
          warning:
            "Turnier beendet, aber Speichern der Gesamtergebnisse ist fehlgeschlagen.",
        },
        { status: 200 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
