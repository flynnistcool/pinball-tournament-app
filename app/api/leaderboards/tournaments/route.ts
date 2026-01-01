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
        category,
        name,
        created_at
      )
    `
    );

  // 🔽 Filter auf Turnier-Tabelle anwenden
  if (category) {
    query = query.ilike("tournaments.category", `%${category}%`);
    //query = query.eq("tournaments.category", category);
  }

  if (search) {
    // sucht im Turniernamen (case-insensitive)
    query = query.ilike("tournaments.name", `%${search}%`);
  }

  if (from) {
    // Von-Datum inkl. Tagesanfang
    query = query.gte("tournaments.created_at", `${from}T00:00:00`);
  }

  if (to) {
    // Bis-Datum inkl. Tagesende
    query = query.lte("tournaments.created_at", `${to}T23:59:59`);
  }

  const { data: results, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
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
  const playerIds = Array.from(
    new Set(rows.map((r) => r.player_id).filter(Boolean))
  );

  let players: any[] = [];
  if (playerIds.length > 0) {
    const { data, error: pErr } = await sb
      .from("players")
      .select("id, profile_id")
      .in("id", playerIds);

    if (pErr) {
      return NextResponse.json(
        { error: pErr.message },
        { status: 500 }
      );
    }
    players = data ?? [];
  }

  const profileIds = Array.from(
    new Set(
      players
        .map((p) => p.profile_id)
        .filter((id: string | null) => !!id)
    )
  );

  let profiles: any[] = [];
  if (profileIds.length > 0) {
    const { data, error: profErr } = await sb
      .from("profiles")
      .select("id, name, avatar_url, color, icon")
      .in("id", profileIds);

    if (profErr) {
      return NextResponse.json(
        { error: profErr.message },
        { status: 500 }
      );
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

  // 3) Aggregation pro Spieler (über alle Turniere)
  for (const r of rows) {
    const player = playersById[r.player_id];
    const profileId: string | null = player?.profile_id ?? null;
    const profile = profileId ? profilesById[profileId] : null;

    // Key: bevorzugt profileId, sonst „name:…“ (falls kein Profil)
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

    // Turnier-Platzierungen (auf Basis final_rank)
    if (r.final_rank === 1) acc.firstPlaces += 1;
    else if (r.final_rank === 2) acc.secondPlaces += 1;
    else if (r.final_rank === 3) acc.thirdPlaces += 1;

    // Super-Final-Sieg
    if (r.super_final_rank === 1) {
      acc.superFinalWins += 1;
    }

    // Ø-Platz über final_rank aufbauen
    if (typeof r.final_rank === "number") {
      acc.sumFinalRank += r.final_rank;
    }

    // 👉 fertige tournament_points aufsummieren
    const tp = r.tournament_points ?? 0;
    acc.points += tp;
  }

  // 4) Ausgabe-Zeilen bauen
  const out = Object.values(aggByKey)
    .map((acc) => {
      const avgPosition =
        acc.tournamentsPlayed > 0
          ? acc.sumFinalRank / acc.tournamentsPlayed
          : null;

      // Winrate auf Turnier-Basis (1. Plätze / Turniere)
      const tournamentWinrate =
        acc.tournamentsPlayed > 0
          ? (acc.firstPlaces / acc.tournamentsPlayed) * 100
          : 0;

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
        tournamentPoints: acc.points, // 👈 so heißt das Feld jetzt im Output
      };
    })
    .sort((a, b) => {
      // Sortierung: zuerst nach Turnierpunkten, dann 1./2./3. Plätze usw.
      return (
        (b.tournamentPoints ?? 0) - (a.tournamentPoints ?? 0) || // Punkte
        b.firstPlaces - a.firstPlaces ||
        b.secondPlaces - a.secondPlaces ||
        b.thirdPlaces - a.thirdPlaces ||
        b.tournamentsPlayed - a.tournamentsPlayed ||
        a.name.localeCompare(b.name)
      );
    });

  return NextResponse.json(
    { rows: out },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
