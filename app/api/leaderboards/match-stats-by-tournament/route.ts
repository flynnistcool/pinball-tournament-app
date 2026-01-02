// app/api/leaderboards/match-stats-by-tournament/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // ggf. Pfad bei dir leicht anders

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RowOut = {
  tournamentId: string;
  tournamentName: string;
  code: string;
  matches: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  fourthPlaces: number;
  avgPosition: number | null;
  winrate: number; // 0–100
};

export async function POST(req: Request) {
  const supabase = await createClient();

  const body = await req.json().catch(() => ({}));
  const profileId = body?.profileId as string | undefined;

  if (!profileId) {
    return new NextResponse(
      JSON.stringify({ error: "profileId fehlt" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // 1) gültige Turniere (nicht gelöscht)
  const tRes = await supabase
    .from("tournaments")
    .select("id, name, code, deleted")
    .eq("deleted", false);

  if (tRes.error) {
    return new NextResponse(
      JSON.stringify({ error: tRes.error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const tournaments = (tRes.data ?? []) as any[];
  const tournamentsById: Record<string, any> = {};
  const validTournamentIds = new Set<string>();

  for (const t of tournaments) {
    tournamentsById[t.id] = t;
    validTournamentIds.add(t.id);
  }

  // 2) alle player_ids holen, die zu diesem Profil gehören
  const pRes = await supabase
    .from("players")
    .select("id, profile_id")
    .eq("profile_id", profileId);

  if (pRes.error) {
    return new NextResponse(
      JSON.stringify({ error: pRes.error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const playerIds = (pRes.data ?? []).map((p: any) => p.id).filter(Boolean);

  if (playerIds.length === 0) {
    return new NextResponse(
      JSON.stringify({ rows: [] }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // 3) Match-Ergebnisse für diese PlayerIds laden (inkl. Tournament über round->tournament_id)
  //    (Hier ggf. Felder an dein Schema anpassen, aber du hast das im globalen Endpoint ja schon drin.)
  const rRes = await supabase
    .from("match_results")
    .select(
      `
      player_id,
      position,
      matches:match_id (
        id,
        rounds:round_id (
          id,
          tournament_id
        )
      )
    `
    )
    .in("player_id", playerIds);

  if (rRes.error) {
    return new NextResponse(
      JSON.stringify({ error: rRes.error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const rows = (rRes.data ?? []) as any[];

  // 4) Aggregation pro Turnier
  type Acc = {
    matches: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    sumPos: number;
  };

  const byTournament: Record<string, Acc> = {};

  for (const r of rows) {
    const match = r.matches;
    const round = match?.rounds;
    if (!match || !round) continue;

    const tournamentId = round.tournament_id;
    if (!tournamentId || !validTournamentIds.has(tournamentId)) continue;

    const pos = typeof r.position === "number" ? r.position : null;
    if (pos == null) continue;

    if (!byTournament[tournamentId]) {
      byTournament[tournamentId] = {
        matches: 0,
        p1: 0,
        p2: 0,
        p3: 0,
        p4: 0,
        sumPos: 0,
      };
    }

    const acc = byTournament[tournamentId];
    acc.matches += 1;
    acc.sumPos += pos;

    if (pos === 1) acc.p1 += 1;
    else if (pos === 2) acc.p2 += 1;
    else if (pos === 3) acc.p3 += 1;
    else if (pos === 4) acc.p4 += 1;
  }

  const out: RowOut[] = Object.entries(byTournament)
    .map(([tournamentId, acc]) => {
      const t = tournamentsById[tournamentId];
      const avgPosition = acc.matches > 0 ? acc.sumPos / acc.matches : null;
      const winrate = acc.matches > 0 ? (acc.p1 / acc.matches) * 100 : 0;

      return {
        tournamentId,
        tournamentName: t?.name ?? "(ohne Name)",
        code: t?.code ?? "",
        matches: acc.matches,
        firstPlaces: acc.p1,
        secondPlaces: acc.p2,
        thirdPlaces: acc.p3,
        fourthPlaces: acc.p4,
        avgPosition,
        winrate,
      };
    })
    // Sort: viele Matches, dann Name
    .sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches;
      return a.tournamentName.localeCompare(b.tournamentName);
    });

  return new NextResponse(JSON.stringify({ rows: out }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
