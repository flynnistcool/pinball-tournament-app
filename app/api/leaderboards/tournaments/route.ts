// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Typ für die Zeilen aus tournament_results
type TournamentResultRow = {
  tournament_id: string;
  player_id: string;
  player_name: string | null;
  final_rank: number | null;
  super_final_rank: number | null;
  avg_position: number | null;        // wird für Turnier-Ø nicht mehr benutzt
  tournament_points: number | null;   // 👈 aus der DB nehmen wir diesen Wert
  tournaments?: {
    id: string;
    code: string | null;
    category: string | null;
    name: string | null;
    status: string | null;
    created_at: string | null;
  };
};

export async function GET(req: Request) {
  const sb = supabaseAdmin();

  // 🔍 Query-Parameter auslesen
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const category = (searchParams.get("category") || "").trim();
  const search = (searchParams.get("search") || "").trim();
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const topRaw = (searchParams.get("top") || "").trim();
  const topN = topRaw ? Math.max(0, parseInt(topRaw, 10) || 0) : 0;

  // 1) Alle gespeicherten Turnier-Endergebnisse holen
  //    Nur für Turniere, die es noch gibt (inner join auf tournaments)
  let query = sb
    .from("tournament_results")
    .select(
      `
      tournament_id,
      player_id,
      player_name,
      final_rank,
      super_final_rank,
      avg_position,
      tournament_points,
      tournaments!inner(
        id,
        code,
        category,
        name,
        status,
        created_at
      )
    `
    );

  // ✅ nur beendete Turniere berücksichtigen (stale/deleted vermeiden)
  query = query.eq("tournaments.status", "finished");

  // 🔽 Filter auf Turnier-Tabelle anwenden
  if (category) {
    query = query.ilike("tournaments.category", `%${category}%`);
  }

  if (search) {
    query = query.ilike("tournaments.name", `%${search}%`);
  }

  if (from) {
    query = query.gte("tournaments.created_at", `${from}T00:00:00`);
  }

  if (to) {
    query = query.lte("tournaments.created_at", `${to}T23:59:59`);
  }

  const { data: results, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!results || results.length === 0) {
    return NextResponse.json(
      { rows: [] },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }

  const rows = results as TournamentResultRow[];

  // 2) dazu passende Spieler + Profile holen (für Name/Avatar/Icon)
  const playerIds = Array.from(new Set(rows.map((r) => r.player_id).filter(Boolean)));

  let players: any[] = [];
  if (playerIds.length > 0) {
    const { data, error: pErr } = await sb
      .from("players")
      .select("id, profile_id")
      .in("id", playerIds);

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    players = data ?? [];
  }

  const profileIds = Array.from(
    new Set(players.map((p) => p.profile_id).filter((id: string | null) => !!id))
  );

  let profiles: any[] = [];
  if (profileIds.length > 0) {
    const { data, error: profErr } = await sb
      .from("profiles")
      .select("id, name, avatar_url, color, icon")
      .in("id", profileIds);

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
    profiles = data ?? [];
  }

  const playersById: Record<string, any> = {};
  for (const p of players) playersById[p.id] = p;

  const profilesById: Record<string, any> = {};
  for (const p of profiles) profilesById[p.id] = p;

  // Aggregat-Typ für die Turnier-Statistik
  type AggRow = {
    profileId: string | null;
    name: string;
    avatar_url: string | null;
    color: string | null;
    icon: string | null;
    tournamentsPlayed: number;
    firstPlaces: number;
    secondPlaces: number;
    thirdPlaces: number;
    superFinalWins: number;
    sumFinalRank: number; // Summe der final_rank-Werte (für Ø-Platz)
    points: number;       // Summe der tournament_points aus der DB
  };

  const aggByKey: Record<string, AggRow> = {};

  // --- Top-N Auswahl (optional) ---
  // Wenn topN > 0: pro Spieler nur die Top-N Turniere (nach tournament_points) zählen.
  // Zusätzlich bauen wir eine Auswahl-Liste für die UI (Transparenz).
  type TopSelection = {
    profileId: string | null;
    name: string;
    avatar_url: string | null;
    color: string | null;
    icon: string | null;
    totalInFilter: number;
    selected: Array<{
      tournament_id: string;
      tournament_code: string | null;
      tournament_name: string | null;
      tournament_category: string | null;
      created_at: string | null;
      final_rank: number | null;
      tournament_points: number;
    }>;
  };

  let selection: TopSelection[] = [];

  // Welche Zeilen werden wirklich aggregiert?
  let rowsForAgg: TournamentResultRow[] = rows;

  if (topN > 0) {
    // 1) Key je Spieler (profileId oder name:...)
    const grouped: Record<string, TournamentResultRow[]> = {};

    for (const r of rows) {
      const player = playersById[r.player_id];
      const profileId: string | null = player?.profile_id ?? null;
      const key = profileId ?? `name:${r.player_name ?? ""}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    // 2) pro Spieler sortieren und Top-N nehmen
    const picked: TournamentResultRow[] = [];
    const selectionOut: TopSelection[] = [];

    for (const [key, list] of Object.entries(grouped)) {
      const anyRow = list[0];
      const player = playersById[anyRow.player_id];
      const profileId: string | null = player?.profile_id ?? null;
      const profile = profileId ? profilesById[profileId] : null;

      const sorted = [...list].sort((a, b) => {
        const ap = a.tournament_points ?? 0;
        const bp = b.tournament_points ?? 0;
        if (bp !== ap) return bp - ap;
        const ad = a.tournaments?.created_at ? Date.parse(a.tournaments.created_at) : 0;
        const bd = b.tournaments?.created_at ? Date.parse(b.tournaments.created_at) : 0;
        return bd - ad;
      });

      const top = sorted.slice(0, topN);
      picked.push(...top);

      selectionOut.push({
        profileId,
        name: profile?.name ?? anyRow.player_name ?? "Unbekannt",
        avatar_url: profile?.avatar_url ?? null,
        color: profile?.color ?? null,
        icon: profile?.icon ?? null,
        totalInFilter: list.length,
        selected: top.map((r) => ({
          tournament_id: r.tournament_id,
          tournament_code: r.tournaments?.code ?? null,
          tournament_name: r.tournaments?.name ?? null,
          tournament_category: r.tournaments?.category ?? null,
          created_at: r.tournaments?.created_at ?? null,
          final_rank: r.final_rank ?? null,
          tournament_points: r.tournament_points ?? 0,
        })),
      });
    }

    rowsForAgg = picked;
    selection = selectionOut.sort((a, b) => a.name.localeCompare(b.name));
  }

  // 3) Aggregation pro Spieler
  for (const r of rowsForAgg) {
    const player = playersById[r.player_id];
    const profileId: string | null = player?.profile_id ?? null;
    const profile = profileId ? profilesById[profileId] : null;

    const key = profileId ?? `name:${r.player_name ?? ""}`;

    if (!aggByKey[key]) {
      aggByKey[key] = {
        profileId,
        name: profile?.name ?? r.player_name ?? "Unbekannt",
        avatar_url: profile?.avatar_url ?? null,
        color: profile?.color ?? null,
        icon: profile?.icon ?? null,
        tournamentsPlayed: 0,
        firstPlaces: 0,
        secondPlaces: 0,
        thirdPlaces: 0,
        superFinalWins: 0,
        sumFinalRank: 0,
        points: 0,
      };
    }

    const acc = aggByKey[key];

    acc.tournamentsPlayed += 1;

    if (r.final_rank === 1) acc.firstPlaces += 1;
    else if (r.final_rank === 2) acc.secondPlaces += 1;
    else if (r.final_rank === 3) acc.thirdPlaces += 1;

    if (r.super_final_rank === 1) acc.superFinalWins += 1;

    if (typeof r.final_rank === "number") acc.sumFinalRank += r.final_rank;

    acc.points += (r.tournament_points ?? 0);
  }

  // 4) Output
  const out = Object.values(aggByKey)
    .map((acc) => {
      const avgPosition =
        acc.tournamentsPlayed > 0 ? acc.sumFinalRank / acc.tournamentsPlayed : null;

      const tournamentWinrate =
        acc.tournamentsPlayed > 0 ? (acc.firstPlaces / acc.tournamentsPlayed) * 100 : 0;

      return {
        profileId: acc.profileId,
        name: acc.name,
        avatar_url: acc.avatar_url,
        color: acc.color,
        icon: acc.icon,
        tournamentsPlayed: acc.tournamentsPlayed,
        firstPlaces: acc.firstPlaces,
        secondPlaces: acc.secondPlaces,
        thirdPlaces: acc.thirdPlaces,
        superFinalWins: acc.superFinalWins,
        avgPosition,
        tournamentWinrate,
        tournamentPoints: acc.points,
      };
    })
    .sort((a, b) => {
      return (
        (b.tournamentPoints ?? 0) - (a.tournamentPoints ?? 0) ||
        b.firstPlaces - a.firstPlaces ||
        b.secondPlaces - a.secondPlaces ||
        b.thirdPlaces - a.thirdPlaces ||
        b.tournamentsPlayed - a.tournamentsPlayed ||
        a.name.localeCompare(b.name)
      );
    });

  return NextResponse.json(
    { rows: out, selection },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
