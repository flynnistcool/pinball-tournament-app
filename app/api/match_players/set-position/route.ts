import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // akzeptiere snake_case UND camelCase
  const code = String(body.code ?? "").trim().toUpperCase();

  const matchId = String(body.match_id ?? body.matchId ?? "").trim();
  const playerId = String(body.player_id ?? body.playerId ?? "").trim();

  const positionRaw = body.position;
  const position =
    positionRaw === null || positionRaw === "" || typeof positionRaw === "undefined"
      ? null
      : Number(positionRaw);

  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "match_id fehlt" }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: "player_id fehlt" }, { status: 400 });

  if (position !== null && (!Number.isFinite(position) || position < 1 || position > 8)) {
    return NextResponse.json({ error: "Ungültige Position" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Turnier anhand Code holen
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, format")
    .eq("code", code)
    .single();

  if (tErr || !t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // Match muss zu diesem Turnier gehören (via rounds)
  const { data: m, error: mErr } = await sb
    .from("matches")
    .select("id, round_id, rounds!inner(tournament_id, number, status, format)")
    .eq("id", matchId)
    .eq("rounds.tournament_id", t.id)
    .single();

  if (mErr || !m) {
    return NextResponse.json({ error: "Match nicht gefunden (oder gehört nicht zum Turnier)" }, { status: 404 });
  }

  // Update match_players
  const { data: updated, error: uErr } = await sb
    .from("match_players")
    .update({ position })
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .select("match_id, player_id, position")
    .single();

  if (uErr) return NextResponse.json({ error: uErr.message ?? "Update fehlgeschlagen" }, { status: 500 });


  // ------------------------------------------------------------
  // Elimination-Schutz:
  // - Runde N darf nur schließen, wenn Runde N-1 bereits finished ist
  // - Und nur wenn die Runde voll besetzt ist (expected player count)
  // ------------------------------------------------------------
  const tournamentFormat = String((t as any)?.format ?? "").toLowerCase();
  const roundNumber = Number((m as any)?.rounds?.number ?? 0) || 0;
  const roundFormat = String((m as any)?.rounds?.format ?? "").toLowerCase();
  const isElimination = tournamentFormat === "elimination" || roundFormat === "elimination";
  const isRotation = tournamentFormat === "rotation" || roundFormat === "rotation";

  // Gate 1: vorherige Runde muss finished sein (außer Runde 1)
  // ❗ GILT NICHT FÜR ELIMINATION UND NICHT FÜR ROTATION
  if (!isElimination && !isRotation && roundNumber > 1) {
    const { data: prevRound } = await sb
      .from("rounds")
      .select("status")
      .eq("tournament_id", t.id)
      .eq("number", roundNumber - 1)
      .maybeSingle();

    if (!prevRound || prevRound.status !== "finished") {
      // Position ist gespeichert, aber wir schließen hier nichts automatisch.
      return NextResponse.json({ ok: true, row: updated, gated: "prev_round_not_finished" });
    }
  }

  

  // Nach jeder Positions-Änderung:
  // - Match automatisch fertigstellen, sobald in DIESEM Match alle Positionen gesetzt sind.
  // - Runde automatisch fertigstellen:
  //   * Standard: wenn alle Matches der Runde finished sind.
  //   * Elimination: wenn (a) erwartete Spieleranzahl für die Runde erreicht ist (über ALLE Matches der Runde)
  //                  UND (b) für alle Spieler der Runde Positionen gesetzt sind.

  // 1) Match-Status (nur dieses Match)
  const { data: mp, error: mpErr } = await sb
    .from("match_players")
    .select("position, player_id")
    .eq("match_id", matchId);

  if (mpErr) {
    return NextResponse.json({ error: mpErr.message ?? "match_players load failed" }, { status: 500 });
  }

  const matchAllSet = (mp ?? []).length > 0 && (mp ?? []).every((r: any) => r.position != null);

  await sb
    .from("matches")
    .update({ status: matchAllSet ? "finished" : "open" })
    .eq("id", matchId);

  // 2) Runde-Status
  if (m.round_id) {
    let roundFinished = false;

    if (!isElimination) {
      const { data: roundMatches } = await sb
        .from("matches")
        .select("status")
        .eq("round_id", m.round_id);

      roundFinished = (roundMatches ?? []).length > 0 && (roundMatches ?? []).every((rm: any) => rm.status === "finished");
    } else {
      // Elimination: expectedThisRound bezieht sich auf die GESAMTE Runde (über alle Matches),
      // nicht auf ein einzelnes Match.
      const { data: roundsAll } = await sb
        .from("rounds")
        .select("id, number, format")
        .eq("tournament_id", t.id)
        .order("number", { ascending: true });

      const roundsArr = (roundsAll ?? []) as any[];

      const elimStart =
        roundsArr.find((r) => String(r.format ?? "").toLowerCase() === "elimination") ??
        roundsArr[0];

      if (elimStart?.id) {
        const elimStartRoundNumber = Number((elimStart as any).number ?? 1) || 1;
        const elimIndex = Math.max(1, roundNumber - elimStartRoundNumber + 1);

        const { data: startMatches } = await sb
          .from("matches")
          .select("id")
          .eq("round_id", (elimStart as any).id);

        const startMatchIds = (startMatches ?? []).map((x: any) => x.id);

        if (startMatchIds.length > 0) {
          const { data: startMps } = await sb
            .from("match_players")
            .select("player_id")
            .in("match_id", startMatchIds);

          const startTotal = new Set((startMps ?? []).map((x: any) => String(x.player_id))).size;
          const expectedThisRound = Math.max(2, startTotal - (elimIndex - 1));

          // Alle Matches dieser Runde + alle match_players dieser Runde laden
          const { data: roundMatchRows } = await sb
            .from("matches")
            .select("id, status")
            .eq("round_id", m.round_id);

          const roundMatchIds = (roundMatchRows ?? []).map((x: any) => x.id);

          if (roundMatchIds.length > 0) {
            const { data: roundMps } = await sb
              .from("match_players")
              .select("player_id, position")
              .in("match_id", roundMatchIds);

            const roundPlayerCount = new Set((roundMps ?? []).map((x: any) => String(x.player_id))).size;
            const roundAllPositionsSet =
              (roundMps ?? []).length > 0 && (roundMps ?? []).every((r: any) => r.position != null);

            const roundIsFull = roundPlayerCount === expectedThisRound;

            // Optional extra-safety: alle Matches müssen finished sein
            const allMatchesFinished =
              (roundMatchRows ?? []).length > 0 && (roundMatchRows ?? []).every((rm: any) => rm.status === "finished");

            roundFinished = roundIsFull && roundAllPositionsSet && allMatchesFinished;
          }
        }
      }
    }

    await sb
      .from("rounds")
      .update({ status: roundFinished ? "finished" : "open" })
      .eq("id", m.round_id);
  }


  return NextResponse.json({ ok: true, row: updated });
}
