// app/api/players/stats/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MPRow = {
  position: number | null;
  matches: {
    id: string;
    round_id: string | null;
    rounds: {
      tournament_id: string | null;
    } | null;
  } | null;
  players: {
    profile_id: string;
  } | null;
};

type FinalRow = {
  rank: number | null;
  final_id: string | null;
  players: {
    profile_id: string;
  } | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const profileId = body?.profileId as string | undefined;

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId fehlt" },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin();

    //
    // 1) MATCHES (wie gehabt)
    //
    const { data, error } = await sb
      .from("match_players")
      .select(
        `
        position,
        matches!inner(
          id,
          round_id,
          rounds!inner(tournament_id)
        ),
        players!inner(
          profile_id
        )
      `
      )
      .eq("players.profile_id", profileId);

    if (error) {
      console.error("players/stats supabase error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as MPRow[];

    const matchesPlayed = rows.length;

    const placements = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      other: 0,
    };

    let matchWins = 0;

    // nur für Match-Statistik (nicht mehr für Turnier-Wertung!)
    for (const row of rows) {
      const pos = typeof row.position === "number" ? row.position : null;

      if (pos != null) {
        if (pos >= 1 && pos <= 4) {
          placements[String(pos) as "1" | "2" | "3" | "4"]++;
        } else {
          placements.other++;
        }
        if (pos === 1) {
          matchWins++;
        }
      }
    }

    const matchLosses = matchesPlayed - matchWins;
    const matchWinRate =
      matchesPlayed > 0 ? matchWins / matchesPlayed : null;

    //
    // 2) TURNIER-STATISTIK basierend auf echtem Turnier-Standings
    //
    // Hole alle players-Zeilen für dieses Profil (in welchen Turnieren war er?)
    const { data: playerEntries, error: playerErr } = await sb
      .from("players")
      .select("id, tournament_id")
      .eq("profile_id", profileId);

    if (playerErr) {
      console.error("players/stats players supabase error:", playerErr);
    }

    // Map: tournament_id -> player_id (des Profils in diesem Turnier)
    const playerByTournament: Record<string, string> = {};
    for (const row of (playerEntries ?? []) as any[]) {
      const tid = row.tournament_id as string | null;
      const pid = row.id as string | null;
      if (!tid || !pid) continue;
      if (!playerByTournament[tid]) {
        playerByTournament[tid] = pid;
      }
    }

    const tournamentPlacements = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      other: 0,
    };

    let tournamentsPlayed = 0;
    let sumTournamentPlacement = 0;
    let tournamentsWithValidPlacement = 0;
    // ⚠️ kein eigener tournamentWins-Zähler mehr

    // Für jedes Turnier: wie in /api/standings/route.ts die Punkte berechnen
    for (const [tournamentId, playerId] of Object.entries(
      playerByTournament
    )) {
      // alle Spieler dieses Turniers
      const { data: playersInTournament, error: ptErr } = await sb
        .from("players")
        .select("id, name, active")
        .eq("tournament_id", tournamentId);

      if (ptErr) {
        console.error(
          "players/stats tournament players error:",
          tournamentId,
          ptErr
        );
        continue;
      }

      if (!playersInTournament || playersInTournament.length === 0) {
        continue;
      }

      // alle Match-Zeilen dieses Turniers
      const { data: matchRows, error: mpErr2 } = await sb
        .from("match_players")
        .select(
          "player_id, position, matches!inner(round_id, rounds!inner(tournament_id))"
        )
        .eq("matches.rounds.tournament_id", tournamentId);

      if (mpErr2) {
        console.error(
          "players/stats tournament match_players error:",
          tournamentId,
          mpErr2
        );
        continue;
      }

      const points: Record<string, number> = {};
      for (const p of playersInTournament as any[]) {
        points[p.id] = 0;
      }

      for (const r of (matchRows ?? []) as any[]) {
        const pos = r.position as number | null;
        if (!pos) continue;
        // gleiches Mapping wie im Standings-Endpoint
        const map4 = { 1: 4, 2: 2, 3: 1, 4: 0 } as any;
        points[r.player_id] = (points[r.player_id] ?? 0) + (map4[pos] ?? 0);
      }

      const standings = (playersInTournament ?? [])
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          active: p.active,
          points: points[p.id] ?? 0,
        }))
        .sort(
          (a: any, b: any) =>
            b.points - a.points || a.name.localeCompare(b.name)
        );

      const idx = standings.findIndex((s) => s.id === playerId);
      if (idx === -1) {
        continue;
      }

      const place = idx + 1; // 1-basiert

      tournamentsPlayed++;

      if (place >= 1 && place <= 4) {
        tournamentPlacements[
          String(place) as "1" | "2" | "3" | "4"
        ]++;
      } else {
        tournamentPlacements.other++;
      }

      sumTournamentPlacement += place;
      tournamentsWithValidPlacement++;
    }

    const tournamentAvgPlacement =
      tournamentsWithValidPlacement > 0
        ? sumTournamentPlacement / tournamentsWithValidPlacement
        : null;

    // ✅ Siege direkt aus den Platzierungen ableiten
    const tournamentWins = tournamentPlacements["1"];

    const tournamentWinRate =
      tournamentsPlayed > 0 ? tournamentWins / tournamentsPlayed : null;

    //
    // 3) SUPER-FINALE (final_players + players) – dein bestehender Block
    //
    const { data: finalsData, error: finalsError } = await sb
      .from("final_players")
      .select(
        `
        rank,
        final_id,
        players!inner(profile_id)
      `
      )
      .eq("players.profile_id", profileId);

    if (finalsError) {
      console.error("players/stats finals supabase error:", finalsError);
      // wir liefern dann einfach 0er-Stats
    }

    const finalRows = (finalsData ?? []) as FinalRow[];

    const finalsPlacements = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      other: 0,
    };

    let finalsSumPlacement = 0;
    let finalsWithValidPlacement = 0;
    const finalsIds = new Set<string>();

    for (const row of finalRows) {
      const pos = typeof row.rank === "number" ? row.rank : null;
      const fid = row.final_id ?? null;

      if (fid) {
        finalsIds.add(fid);
      }

      if (pos != null) {
        if (pos >= 1 && pos <= 4) {
          finalsPlacements[
            String(pos) as "1" | "2" | "3" | "4"
          ]++;
        } else {
          finalsPlacements.other++;
        }

        if (pos > 0) {
          finalsSumPlacement += pos;
          finalsWithValidPlacement++;
        }
      }
    }

    const finalsPlayed = finalsIds.size;

    const finalsAvgPlacement =
      finalsWithValidPlacement > 0
        ? finalsSumPlacement / finalsWithValidPlacement
        : null;

    // ✅ Siege im Super-Finale auch direkt aus den Platzierungen
    const finalsWins = finalsPlacements["1"];

    const finalsWinRate =
      finalsPlayed > 0 ? finalsWins / finalsPlayed : null;

    //
    // 4) Response
    //
    return NextResponse.json({
      // Matches
      matchesPlayed,
      matchWins,
      matchLosses,
      matchWinRate,
      placements,

      // Turniere
      tournamentsPlayed,
      tournamentPlacements,
      tournamentAvgPlacement,
      tournamentWinRate,

      // Super-Finale
      finalsPlayed,
      finalsPlacements,
      finalsAvgPlacement,
      finalsWinRate,
    });
  } catch (e: any) {
    console.error("players/stats crash:", e);
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
