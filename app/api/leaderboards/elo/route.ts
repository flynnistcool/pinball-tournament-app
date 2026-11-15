// app/api/leaderboards/elo/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { isExcludedProfile, loadStatsExclusions } from "@/lib/statsExclusions";
import { fetchAllIn, fetchAllRows } from "@/lib/supabaseChunks";

// Sorgt dafür, dass Next diese Route nicht statisch cached
export const dynamic = "force-dynamic";
export const revalidate = 0;

type EloLeaderboardEntry = {
  profileId: string;
  name: string;
  avatar_url?: string | null;
  color?: string | null;
  icon?: string | null;
  rating: number;
  matchesPlayed: number;
  tournamentsPlayed: number;
  trendLastN?: number | null;
};

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    // 1) Profile mit Elo-Rating laden
    const {
      data: profiles,
      error: profilesError,
    } = await supabase
      .from("profiles")
      .select("id, name, avatar_url, color, icon, rating")
      .not("rating", "is", null)
      .order("rating", { ascending: false });

    if (profilesError) {
      console.error("profilesError", profilesError);
      return NextResponse.json(
        { error: "Konnte Profile nicht laden." },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json(
        { rows: [] },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    // 2) Players laden (für Turnier- & Match-Zuordnung)
    const {
      data: players,
      error: playersError,
    } = await fetchAllRows<{ id: string; profile_id: string | null; tournament_id: string | null }>(() =>
      supabase.from("players").select("id, profile_id, tournament_id").order("id")
    ); // >1000 Zeilen: seitenweise

    if (playersError) {
      console.error("playersError", playersError);
      return NextResponse.json(
        { error: "Konnte Players nicht laden." },
        { status: 500 }
      );
    }

    // Mapping player_id -> profile_id
    const playerToProfile = new Map<string, string>();
    // Für Turnierzählung: profile_id -> Set<tournament_id>
    const tournamentsByProfile = new Map<string, Set<string>>();

    for (const p of players ?? []) {
      if (!p.profile_id) continue;
      playerToProfile.set(p.id, p.profile_id);

      if (p.tournament_id) {
        let set = tournamentsByProfile.get(p.profile_id);
        if (!set) {
          set = new Set<string>();
          tournamentsByProfile.set(p.profile_id, set);
        }
        set.add(p.tournament_id);
      }
    }

    // 3) Match-Players laden (für Matches pro Profil)
    const {
      data: matchPlayers,
      error: mpError,
    } = await fetchAllRows<{ match_id: string; player_id: string }>(() =>
      supabase.from("match_players").select("match_id, player_id").order("match_id").order("player_id")
    ); // >1000 Zeilen: seitenweise

    if (mpError) {
      console.error("matchPlayersError", mpError);
      return NextResponse.json(
        { error: "Konnte Match-Players nicht laden." },
        { status: 500 }
      );
    }

    // profile_id -> Set<match_id>
    const matchesByProfile = new Map<string, Set<string>>();

    for (const mp of matchPlayers ?? []) {
      const profileId = playerToProfile.get(mp.player_id);
      if (!profileId || !mp.match_id) continue;

      let set = matchesByProfile.get(profileId);
      if (!set) {
        set = new Set<string>();
        matchesByProfile.set(profileId, set);
      }
      set.add(mp.match_id);
    }


        // 3b) Start-Elo pro Profil über tournament_ratings bestimmen
    const profileIds = (profiles ?? []).map((p: any) => p.id as string);

    const { data: ratingRows, error: ratingErr } = await fetchAllIn<{
      profile_id: string;
      rating_before: number | null;
      created_at: string;
    }>(profileIds, (chunk) =>
      supabase
        .from("tournament_ratings")
        .select("profile_id, rating_before, created_at")
        .in("profile_id", chunk)
        .order("created_at", { ascending: false })
        .order("profile_id")
        .order("tournament_id")
    ); // >1000 Zeilen: seitenweise, je Profil bleibt die Reihenfolge (neueste zuerst)

    if (ratingErr) {
      console.error(
        "tournament_ratings error in elo leaderboard",
        ratingErr
      );
      return NextResponse.json(
        { error: "Konnte Elo-Verläufe nicht laden." },
        { status: 500 }
      );
    }

// profile_id -> Rating vor dem LETZTEN Turnier
const startRatingByProfile = new Map<string, number | null>();

for (const r of ratingRows ?? []) {
  const pid = r.profile_id as string | undefined;
  if (!pid) continue;

  // rows sind nach created_at DESC sortiert → erster Eintrag je Profil ist das letzte Turnier
  if (!startRatingByProfile.has(pid)) {
    const before =
      typeof (r as any).rating_before === "number"
        ? (r as any).rating_before
        : null;
    startRatingByProfile.set(pid, before);
  }
}



    // 🛡️ Statistik-Schutz: Bots und Platzhalter nicht in der Elo-Rangliste
    const ex = await loadStatsExclusions(supabase);

    // 4) Alles zusammenbauen
    const rows: EloLeaderboardEntry[] = profiles.filter((p: any) => !isExcludedProfile(ex, p.id)).map((p: any) => {
      const profileId = p.id as string;
      const rating = typeof p.rating === "number" ? p.rating : 0;

      const matchesSet = matchesByProfile.get(profileId);
      const tournamentsSet = tournamentsByProfile.get(profileId);

      const startRating = startRatingByProfile.get(profileId) ?? null;
      const trendLastN =
        typeof startRating === "number" ? rating - startRating : null;

      return {
        profileId,
        name: p.name ?? "Unbekannt",
        avatar_url: p.avatar_url ?? null,
        color: p.color ?? null,
        icon: p.icon ?? null,
        rating,
        matchesPlayed: matchesSet ? matchesSet.size : 0,
        tournamentsPlayed: tournamentsSet ? tournamentsSet.size : 0,
        trendLastN,
      };
    });


    // Nach Rating sortieren (falls sich etwas geändert hat)
    rows.sort((a, b) => b.rating - a.rating);

    const limited = rows.slice(0, 200);

    return NextResponse.json(
      { rows: limited },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e) {
    console.error("elo leaderboard error", e);
    return NextResponse.json(
      { error: "Unbekannter Fehler beim Laden des Elo-Leaderboards." },
      { status: 500 }
    );
  }
}
