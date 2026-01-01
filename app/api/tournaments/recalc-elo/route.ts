import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type EloState = {
  rating: number;
  matches_played: number;
  provisional_matches: number;
};

function expectedScore(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function getK(state: EloState): number {
  // einfache Heuristik – kannst du später anpassen
  if (state.provisional_matches > 0) return 32;
  if (state.matches_played < 30) return 24;
  return 16;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // 1) Turnier laden
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, code")
    .eq("code", code)
    .single();

  if (tErr || !t) {
    return NextResponse.json(
      { error: "Turnier nicht gefunden" },
      { status: 404 }
    );
  }

  // 2) Startwerte aus tournament_ratings laden
  const { data: trRows, error: trErr } = await sb
    .from("tournament_ratings")
    .select(
      "profile_id, rating_before, provisional_before, matches_before"
    )
    .eq("tournament_id", t.id);

  if (trErr) {
    return NextResponse.json(
      { error: trErr.message ?? "Fehler beim Laden der Startwerte" },
      { status: 500 }
    );
  }

  if (!trRows || trRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "Keine Elo-Startwerte gefunden (tournament_ratings ist leer für dieses Turnier)",
      },
      { status: 400 }
    );
  }

  // Arbeitszustand pro Profil
  const stateByProfile = new Map<string, EloState>();
  for (const row of trRows) {
    stateByProfile.set(row.profile_id, {
      rating: Number(row.rating_before),
      matches_played: Number(row.matches_before),
      provisional_matches: Number(row.provisional_before),
    });
  }

  // 3) Runden laden, die Elo beeinflussen sollen
  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id, number")
    .eq("tournament_id", t.id)
    .eq("elo_enabled", true)
    .eq("status", "finished")
    .order("number", { ascending: true });

  if (rErr) {
    return NextResponse.json(
      { error: rErr.message ?? "Fehler beim Laden der Runden" },
      { status: 500 }
    );
  }

  const roundIds = (rounds ?? []).map((r: any) => r.id);

  // Wenn keine fertigen Elo-Runden: auf Startwerte zurücksetzen und fertig
  if (!roundIds.length) {
    for (const row of trRows) {
      await sb
        .from("profiles")
        .update({
          rating: row.rating_before,
          matches_played: row.matches_before,
          provisional_matches: row.provisional_before,
        })
        .eq("id", row.profile_id);
    }

    return NextResponse.json({
      ok: true,
      message:
        "Keine fertigen Elo-Runden – Profile wurden auf Startwerte zurückgesetzt.",
    });
  }

  // 4) Matches & Match-Players der Runden laden
  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select("id, round_id")
    .in("round_id", roundIds);

  if (mErr) {
    return NextResponse.json(
      { error: mErr.message ?? "Fehler beim Laden der Matches" },
      { status: 500 }
    );
  }

  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: mpRows, error: mpErr } = await sb
    .from("match_players")
    .select("match_id, player_id, position")
    .in("match_id", matchIds);

  if (mpErr) {
    return NextResponse.json(
      { error: mpErr.message ?? "Fehler beim Laden der Match-Spieler" },
      { status: 500 }
    );
  }

  // Spieler -> Profil
  const uniquePlayerIds = Array.from(
    new Set((mpRows ?? []).map((mp: any) => mp.player_id))
  );

  const { data: playerRows, error: pErr } = await sb
    .from("players")
    .select("id, profile_id")
    .in("id", uniquePlayerIds);

  if (pErr) {
    return NextResponse.json(
      { error: pErr.message ?? "Fehler beim Laden der Spieler" },
      { status: 500 }
    );
  }

  const profileIdByPlayerId = new Map<string, string>();
  for (const p of playerRows ?? []) {
    if (p.profile_id) {
      profileIdByPlayerId.set(p.id, p.profile_id);
    }
  }

  // Match -> Teilnehmer (mit Profil + Position)
  type MPItem = {
    profile_id: string;
    position: number | null;
  };

  const mpByMatch = new Map<string, MPItem[]>();
  for (const row of mpRows ?? []) {
    const profId = profileIdByPlayerId.get(row.player_id);
    if (!profId) continue;

    const list = mpByMatch.get(row.match_id) ?? [];
    list.push({
      profile_id: profId,
      position: row.position,
    });
    mpByMatch.set(row.match_id, list);
  }

  // Hilfsfunktion: Elo-Update für ein Match
  function applyMatchElo(mpList: MPItem[]) {
    // nur Spieler mit gesetzter Position berücksichtigen
    const players = mpList.filter((p) => p.position != null);
    if (players.length < 2) return;

    // jeder gegen jeden
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const A = players[i];
        const B = players[j];

        const sA =
          A.position! < B.position!
            ? 1
            : A.position! > B.position!
            ? 0
            : 0.5;
        const sB = 1 - sA;

        const sAState = stateByProfile.get(A.profile_id);
        const sBState = stateByProfile.get(B.profile_id);
        if (!sAState || !sBState) continue;

        const kA = getK(sAState);
        const kB = getK(sBState);

        const eA = expectedScore(sAState.rating, sBState.rating);
        const eB = expectedScore(sBState.rating, sAState.rating);

        sAState.rating = sAState.rating + kA * (sA - eA);
        sBState.rating = sBState.rating + kB * (sB - eB);
      }
    }

    // Matches/Provisional count (1 Match pro Spieler)
    for (const p of players) {
      const st = stateByProfile.get(p.profile_id);
      if (!st) continue;
      st.matches_played += 1;
      if (st.provisional_matches > 0) {
        st.provisional_matches -= 1;
      }
    }
  }

  // 5) Elo in Rundenreihenfolge simulieren
  const matchesByRound = new Map<string, string[]>();
  for (const m of matches ?? []) {
    const arr = matchesByRound.get(m.round_id) ?? [];
    arr.push(m.id);
    matchesByRound.set(m.round_id, arr);
  }

  for (const r of rounds ?? []) {
    const mids = matchesByRound.get(r.id) ?? [];
    for (const mid of mids) {
      const mpl = mpByMatch.get(mid) ?? [];
      applyMatchElo(mpl);
    }
  }

  // 6) Profile aktualisieren
  for (const [profileId, st] of stateByProfile.entries()) {
    await sb
      .from("profiles")
      .update({
        rating: st.rating,
        matches_played: st.matches_played,
        provisional_matches: st.provisional_matches,
      })
      .eq("id", profileId);
  }

  return NextResponse.json({
    ok: true,
    message: "Elo für dieses Turnier wurde neu berechnet.",
  });
}
