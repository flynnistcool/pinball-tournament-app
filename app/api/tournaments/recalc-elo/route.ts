import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// ✅ no-store (verhindert Next/Vercel Caching)
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}

type EloState = {
  rating: number;
  matches_played: number;
  provisional_matches: number;
  shielded: boolean; // ✅ NEU: wurde in diesem Recalc mindestens einmal geschützt?
};

function expectedScore(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function getK(state: EloState): number {
  // einfache Heuristik – kannst du später anpassen
  // Elo anpasssen
  if (state.provisional_matches > 0) return 32;
  if (state.matches_played < 30) return 24;
  return 16;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) {
    return json({ error: "Code fehlt" }, 400);
  }

  const sb = supabaseAdmin();

  // 1) Turnier laden
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, code, format")
    .eq("code", code)
    .single();

  if (tErr || !t) return json({ error: "Turnier nicht gefunden" }, 404);

  const tournamentFormat = String((t as any)?.format ?? "").toLowerCase();

  // 2) Startwerte aus tournament_ratings laden
  const { data: trRows, error: trErr } = await sb
    .from("tournament_ratings")
    .select("profile_id, rating_before, provisional_before, matches_before")
    .eq("tournament_id", t.id);

  if (trErr) {
    return json({ error: trErr.message ?? "Fehler beim Laden der Startwerte" }, 500);
  }

  if (!trRows || trRows.length === 0) {
    return json(
      {
        error:
          "Keine Elo-Startwerte gefunden (tournament_ratings ist leer für dieses Turnier)",
      },
      400
    );
  }

  // Arbeitszustand pro Profil
  const stateByProfile = new Map<string, EloState>();
  for (const row of trRows) {
    stateByProfile.set(row.profile_id, {
      rating: Number(row.rating_before),
      matches_played: Number(row.matches_before),
      provisional_matches: Number(row.provisional_before),
      shielded: false, // ✅ NEU
    });
  }

  // 3) Runden laden, die Elo beeinflussen sollen
  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id, number, format")
    .eq("tournament_id", t.id)
    .eq("elo_enabled", true)
    .eq("status", "finished")
    .order("number", { ascending: true });

  if (rErr) {
    return json({ error: rErr.message ?? "Fehler beim Laden der Runden" }, 500);
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

    return json({
      ok: true,
      message:
        "Keine fertigen Elo-Runden – Profile wurden auf Startwerte zurückgesetzt.",
      shieldedByProfile: {}, // ✅ NEU
    });
  }

  // 4) Matches & Match-Players der Runden laden
  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select("id, round_id")
    .in("round_id", roundIds);

  if (mErr) {
    return json({ error: mErr.message ?? "Fehler beim Laden der Matches" }, 500);
  }

  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: mpRows, error: mpErr } = await sb
    .from("match_players")
    .select("match_id, player_id, position")
    .in("match_id", matchIds);

  if (mpErr) {
    return json({ error: mpErr.message ?? "Fehler beim Laden der Match-Spieler" }, 500);
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
    return json({ error: pErr.message ?? "Fehler beim Laden der Spieler" }, 500);
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
  function applyMatchElo(
    mpList: MPItem[],
    shieldedThisRound: Record<string, boolean>,
    formatLower: string
  ) {

console.log("[recalc-elo] applyMatchElo called", {
  formatLower,
  mpListLen: mpList.length,
});


    // nur Spieler mit gesetzter Position berücksichtigen
    const players = mpList.filter((p) => p.position != null);
    
    if (players.length < 2) return;

    // ✅ Elimination (dein Format): 1 letzter (2. Platz) verliert, alle anderen gewinnen (Group-vs-One)
    // - keine Winner-vs-Winner Duelle
    // - zero-sum pro Match: was der Loser verliert, bekommen die Winners zusammen
    if (formatLower === "elimination") {
      const maxPos = Math.max(...players.map((p) => Number(p.position)));
      const losers = players.filter((p) => Number(p.position) === maxPos);
      const winners = players.filter((p) => Number(p.position) !== maxPos);

      // wir erwarten GENAU 1 Loser
      if (losers.length === 1 && winners.length >= 1) {
        const L = losers[0];
        const LState = stateByProfile.get(L.profile_id);
        if (!LState) return;

        // ⚠️ WICHTIG: Für korrekte/faire Verteilung müssen ALLE Erwartungen
        // mit den Ratings "vor" diesem Match berechnet werden (sonst entstehen
        // komische Ergebnisse, weil der Loser-Rating schon angepasst wurde).
        const loserRatingBefore = LState.rating;
        const winnerRatingsBefore = new Map<string, number>();
        for (const w of winners) {
          const st = stateByProfile.get(w.profile_id);
          if (!st) return;
          winnerRatingsBefore.set(w.profile_id, st.rating);
        }

        // Erwartung des Losers gegen die Gruppe
        const eList = winners.map((w) =>
          expectedScore(loserRatingBefore, winnerRatingsBefore.get(w.profile_id)!)
        );

        const eL = eList.reduce((a, b) => a + b, 0) / winners.length;

        const kL = getK(LState);
        // In Elimination ist es in der Praxis am stabilsten, wenn wir hier KEINE
        // Provisional-Shield-Sonderfälle anwenden (sonst ist es nicht mehr zero-sum
        // und wirkt "komisch" bei 1 Loser + viele Sieger).
        const dL = kL * (0 - eL); // Score_L = 0
        const pot = -dL; // wird an Winners verteilt (>=0)

        // ✅ In diesem Elimination-Format sind alle Sieger gleichwertig (alle "Platz 1").
        // Deshalb verteilen wir den Pot bewusst GLEICHMÄSSIG auf alle Winners.
        // (Das verhindert "komische" unterschiedliche Gewinne, obwohl alle Sieger gleich sind.)
        const perWinner = pot / winners.length;

        // ✅ Jetzt erst die Rating-Änderungen gleichzeitig anwenden (keine Reihenfolge-Effekte)
        LState.rating = loserRatingBefore + dL;

        for (let idx = 0; idx < winners.length; idx++) {
          const w = winners[idx];
          const wState = stateByProfile.get(w.profile_id);
          if (!wState) continue;

          wState.rating = wState.rating + perWinner;
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

        return;
      }
      // falls kein eindeutiger Loser: fallback auf Standard
    }

    // Standard: jeder gegen jeden
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

        // 🛡️ Provisional-Schutz: gegen Provisional zählt das Duell nur 50 %
        const wA = sBState.provisional_matches > 0 ? 0.5 : 1.0;
        const wB = sAState.provisional_matches > 0 ? 0.5 : 1.0;

        if (wA < 1) {
          sAState.shielded = true;
          shieldedThisRound[A.profile_id] = true;
        }
        if (wB < 1) {
          sBState.shielded = true;
          shieldedThisRound[B.profile_id] = true;
        }

        sAState.rating = sAState.rating + wA * kA * (sA - eA);
        sBState.rating = sBState.rating + wB * kB * (sB - eB);
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

  let lastRoundShieldedByProfile: Record<string, boolean> = {};
for (const r of rounds ?? []) {
  const shieldedThisRound: Record<string, boolean> = {}; // ✅ reset pro Runde

  const roundFormatLower = String((r as any)?.format ?? tournamentFormat ?? "").toLowerCase();

  const mids = matchesByRound.get(r.id) ?? [];
  for (const mid of mids) {
    const mpl = mpByMatch.get(mid) ?? [];
    applyMatchElo(mpl, shieldedThisRound, roundFormatLower); // ✅ Map + Format übergeben
  }

  // ✅ merken: das ist immer die zuletzt verarbeitete (höchste) finished Runde
  lastRoundShieldedByProfile = shieldedThisRound;
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

  return json({
    ok: true,
    message: "Elo für dieses Turnier wurde neu berechnet.",
    shieldedByProfile: lastRoundShieldedByProfile, // ✅ nur letzte Runde
  });
}
