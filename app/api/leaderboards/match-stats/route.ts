import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Sorgt dafür, dass Next diese Route nicht statisch cached
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Rohdaten: ein Spieler in einem Match
type MPRow = {
  player_id: string;
  position: number | null;
  matches: {
    id: string;
    round_id: string;
    rounds: {
      tournament_id: string;
    } | null;
  } | null;
};

export async function GET() {
  const sb = supabaseAdmin();

  // 1) Alle Match-Player + Match + Round + Tournament laden
  const { data, error } = await sb
    .from("match_players")
    .select(
      `
      player_id,
      position,
      matches!inner (
        id,
        round_id,
        rounds!inner (
          id,
          tournament_id
        )
      )
    `
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as MPRow[];

  if (rows.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  // 2) Tournament-IDs einsammeln, um gelöschte Turniere rauszufiltern
  const tournamentIds = new Set<string>();
  for (const r of rows) {
    const tId = r.matches?.rounds?.tournament_id;
    if (tId) tournamentIds.add(tId);
  }

  let validTournamentIds = new Set<string>();
  if (tournamentIds.size > 0) {
    const { data: tournaments, error: tErr } = await sb
      .from("tournaments")
      .select("id")
      .in("id", Array.from(tournamentIds));

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 500 });
    }
    validTournamentIds = new Set((tournaments ?? []).map((t) => t.id));
  }

  // 3) Spieler-Basisdaten holen (Name + profile_id)
  const playerIds = Array.from(
    new Set(rows.map((r) => r.player_id).filter(Boolean))
  );

  const playersById: Record<
    string,
    { id: string; name: string; profile_id: string | null }
  > = {};

  if (playerIds.length > 0) {
    const { data: players, error: pErr } = await sb
      .from("players")
      .select("id, name, profile_id")
      .in("id", playerIds);

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    for (const p of players ?? []) {
      playersById[p.id] = {
        id: p.id,
        name: p.name,
        profile_id: p.profile_id ?? null,
      };
    }
  }

  // 4) Profile-Daten (Avatar, Farbe, Icon) holen
  const profileIds = Array.from(
    new Set(
      Object.values(playersById)
        .map((p) => p.profile_id)
        .filter((id): id is string => !!id)
    )
  );

  const profilesById: Record<
    string,
    { id: string; avatar_url: string | null; color: string | null; icon: string | null }
  > = {};

  if (profileIds.length > 0) {
    const { data: profiles, error: profErr } = await sb
      .from("profiles")
      .select("id, name, avatar_url, color, icon")
      .in("id", profileIds);

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    for (const pr of profiles ?? []) {
      profilesById[pr.id] = {
        id: pr.id,
        avatar_url: pr.avatar_url ?? null,
        color: pr.color ?? null,
        icon: pr.icon ?? null,
      };
    }
  }

  // 5) Stats pro Spieler aufbauen
// 5) Stats pro Profil (global) aufbauen
type Acc = {
  key: string;                // <-- neu
  profileId: string | null;
  name: string;
  matches: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  fourthPlaces: number;
  sumPosition: number;
};

const statsByKey: Record<string, Acc> = {};

for (const r of rows) {
  const match = r.matches;
  const round = match?.rounds;
  if (!match || !round) continue;

  const tId = round.tournament_id;
  if (!validTournamentIds.has(tId)) continue;

  const playerId = r.player_id;
  const pos = typeof r.position === "number" ? r.position : null;
  if (!playerId || pos == null) continue;

  const playerBase = playersById[playerId];
  const profileId = playerBase?.profile_id ?? null;

  // ✅ GLOBAL key: profileId wenn vorhanden, sonst playerId
  const key = profileId ?? `player:${playerId}`;

  // ✅ Name: wenn Profil vorhanden, nimm Profil-Name, sonst Player-Name
  const prof = profileId ? profilesById[profileId] : null;
  const name = (prof as any)?.name ?? playerBase?.name ?? "Unbekannter Spieler";

  if (!statsByKey[key]) {
    statsByKey[key] = {
      key,
      profileId,
      name,
      matches: 0,
      firstPlaces: 0,
      secondPlaces: 0,
      thirdPlaces: 0,
      fourthPlaces: 0,
      sumPosition: 0,
    };
  }

  const acc = statsByKey[key];
  acc.matches += 1;
  acc.sumPosition += pos;

  if (pos === 1) acc.firstPlaces += 1;
  else if (pos === 2) acc.secondPlaces += 1;
  else if (pos === 3) acc.thirdPlaces += 1;
  else if (pos === 4) acc.fourthPlaces += 1;
}


  // 6) In Output-Format umrechnen
  type MatchPlacementRow = {
    profileId: string | null;
    name: string;
    avatar_url: string | null;
    color: string | null;
    icon: string | null;
    matches: number;
    firstPlaces: number;
    secondPlaces: number;
    thirdPlaces: number;
    fourthPlaces: number;
    avgPosition: number | null;
    winrate: number; // in %
  };

const out: MatchPlacementRow[] = Object.values(statsByKey)
  .filter((s) => s.matches > 0)
  .map((s) => {
    const avgPosition = s.matches > 0 ? s.sumPosition / s.matches : null;
    const winrate = s.matches > 0 ? (s.firstPlaces / s.matches) * 100 : 0;

    const prof = s.profileId ? profilesById[s.profileId] : null;

    return {
      profileId: s.profileId,
      name: s.name,
      avatar_url: prof?.avatar_url ?? null,
      color: prof?.color ?? null,
      icon: prof?.icon ?? null,
      matches: s.matches,
      firstPlaces: s.firstPlaces,
      secondPlaces: s.secondPlaces,
      thirdPlaces: s.thirdPlaces,
      fourthPlaces: s.fourthPlaces,
      avgPosition,
      winrate,
    };
  });


  // 7) Sortierung: wie im Frontend: viele Matches, dann Name
  out.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.name.localeCompare(b.name);
  });

  return new NextResponse(JSON.stringify({ rows: out }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
