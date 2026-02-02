import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function randPick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // akzeptiere snake_case UND camelCase
  const code = String(body.code ?? "").trim().toUpperCase();

  const matchId = String(body.match_id ?? body.matchId ?? "").trim();
  const playerId = String(body.player_id ?? body.playerId ?? "").trim();

  const scoreRaw = body.score;
  const score =
    scoreRaw === null || scoreRaw === "" || typeof scoreRaw === "undefined"
      ? null
      : Number(scoreRaw);

  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "match_id fehlt" }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: "player_id fehlt" }, { status: 400 });

  if (score !== null && (!Number.isFinite(score) || score < 0)) {
    return NextResponse.json({ error: "Ungültige Punkte" }, { status: 400 });
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
    .select("id, round_id, rounds!inner(tournament_id, id, number, format, elo_enabled)")
    .eq("id", matchId)
    .eq("rounds.tournament_id", t.id)
    .single();

    

  if (mErr || !m) {
    return NextResponse.json(
      { error: "Match nicht gefunden (oder gehört nicht zum Turnier)" },
      { status: 404 }
    );
  }

  const currentUseElo = Boolean((m as any)?.rounds?.elo_enabled);

  // Update match_players
  const { data: updated, error: uErr } = await sb
    .from("match_players")
    .update({ score, score_submitted: true })
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .select("match_id, player_id, score")
    .single();

  if (uErr)
    return NextResponse.json(
      { error: uErr.message ?? "Update fehlgeschlagen" },
      { status: 500 }
    );

  // ------------------------------------------------------------
  // ✅ Elimination: nach jedem Score kaskadieren
  // - Positions automatisch aus Scores setzen, sobald Match komplett ist
  // - Letzten der Runde als eliminated_round markieren
  // - nächste Runde(n) "provisional" anlegen und mit "safe" Spielern füllen
  // ------------------------------------------------------------
  const tournamentFormat = String((t as any)?.format ?? "").toLowerCase();
  const roundNumber = Number((m as any)?.rounds?.number ?? 0) || 0;
  const roundFormat = String((m as any)?.rounds?.format ?? "").toLowerCase();
  const isElimination = tournamentFormat === "elimination" || roundFormat === "elimination";
  let speakText: string | null = null;
  let speakPlayerId: string | null = null;

  let newlyAdvancedPlayerId: string | null = null;

  if (isElimination) {
    // Erwartete Spieleranzahl pro Runde im Elimination-Modus
    // Wichtig: eine Runde darf nur schließen, wenn alle erwarteten Spieler *im Match* vorhanden sind
    // UND alle davon ihren Score wirklich eingetragen haben (score_submitted=true).
    //
    // Wir leiten die Start-Spielerzahl robust aus Runde 1 (erste Elimination-Runde) ab,
    // damit "provisional" Runden (noch nicht voll) niemals fälschlich schließen.
    let startRoundNumber = 1;
    let startTotal = 0;

    // 0) Start-Elimination-Runde bestimmen (kann später als Turnier-Runde 1 sein)
    //    und daraus die Start-Spielerzahl ableiten (DISTINCT player_id über alle Matches dieser Runde).
    const { data: roundsAll } = await sb
      .from("rounds")
      .select("id, number, format")
      .eq("tournament_id", (t as any).id)
      .order("number", { ascending: true });

    const roundsArr = (roundsAll ?? []) as any[];

    const elimStart =
      roundsArr.find((r) => String(r.format ?? "").toLowerCase() === "elimination") ??
      roundsArr[0];

    if (elimStart?.id) {
      startRoundNumber = Number((elimStart as any).number ?? 1) || 1;

      const { data: startMatchIds } = await sb
        .from("matches")
        .select("id")
        .eq("round_id", (elimStart as any).id);

      const ids = (startMatchIds ?? []).map((x: any) => x.id);

      if (ids.length > 0) {
        const { data: startMps } = await sb
          .from("match_players")
          .select("player_id")
          .in("match_id", ids);

        startTotal = new Set((startMps ?? []).map((x: any) => String(x.player_id))).size;
      }
    }

    // Fallback: falls oben nichts liefert (z.B. sehr frühes Stadium)
    if (!startTotal || startTotal < 2) {
      const { count: totalPlayers, error: totalErr } = await sb
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", (t as any).id);

      if (!totalErr && typeof totalPlayers === "number") startTotal = totalPlayers;
      if (!startTotal || startTotal < 2) startTotal = 2;
      // wenn wir über players zählen, ist startRoundNumber typischerweise 1
      // (wenn Elimination erst später startet, wird es dennoch durch elimStart oben korrekt gesetzt)
    }

    // Erwartete Spieler dieser Runde / nächste Runde
    const expectedThisRound = Math.max(2, startTotal - (roundNumber - startRoundNumber));
    const expectedNextRound = Math.max(0, expectedThisRound - 1);
    const isFinalWin = expectedNextRound < 2;

    // 1) Alle Match-Players dieses Matches laden (Scores + ggf. Position)
    const { data: allMps, error: mpLoadErr } = await sb
      .from("match_players")
      .select("player_id, score, position, score_submitted")
      .eq("match_id", matchId);

    if (!mpLoadErr && allMps && allMps.length) {
      const mps = (allMps as any[]).map((x) => ({
        player_id: String(x.player_id),
        score: x.score == null ? null : Number(x.score),
        position: x.position == null ? null : Number(x.position),
        score_submitted: Boolean((x as any).score_submitted),
      }));

      const scored = mps.filter((x) => x.score_submitted && x.score != null && Number.isFinite(x.score));

      // 2) SAFE-Spieler (ohne Gleichstand):
      //    sobald es mindestens einen kleineren finalen Score gibt.
      let safePlayerIds: string[] = [];
      if (scored.length >= 2) {
        const minScore = Math.min(...scored.map((x) => x.score as number));
        safePlayerIds = scored
          .filter((x) => (x.score as number) > minScore)
          .map((x) => x.player_id);
      }

      // 🔊 Speak-Trigger: sobald nach >=2 Scores klar ist, dass dieser Spieler NICHT letzter ist
// (also "safe" / nächste Runde – wie ihr es im UI schon macht)
if (scored.length >= 2 && safePlayerIds.length > 0) {
  // Player-Name holen (für Speak)
  const { data: p } = await sb
    .from("players")
    .select("name")
    .eq("id", playerId)
    .eq("tournament_id", (t as any).id)
    .maybeSingle();

  const playerName = String((p as any)?.name ?? "").trim() || "Player";


  // ✅ Prüfen: ist der Spieler der ERSTE in der nächsten Runde?
let isFirstInNextRound = false;
let existingNextIds = new Set<string>();

try {
  const nextRoundNumber = roundNumber + 1;

  // nächste Runde finden
  const { data: nextR } = await sb
    .from("rounds")
    .select("id")
    .eq("tournament_id", (t as any).id)
    .eq("number", nextRoundNumber)
    .maybeSingle();

  if (nextR?.id) {
    // erstes Match der nächsten Runde finden (bei dir: genau 1 Match pro Runde)
    const { data: nextM } = await sb
      .from("matches")
      .select("id")
      .eq("round_id", (nextR as any).id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextM?.id) {
      // wer ist bereits in der nächsten Runde?
      const { data: nextMps } = await sb
        .from("match_players")
        .select("player_id")
        .eq("match_id", (nextM as any).id);

      const othersAlreadyThere =
        (nextMps ?? []).some((x: any) => String(x.player_id) !== String(playerId));

      // wenn NOCH NIEMAND (außer evtl. er selbst) drin ist => er ist "der erste"
      isFirstInNextRound = !othersAlreadyThere;
    } else {
      // noch kein Match in nächster Runde => er wäre der erste
      isFirstInNextRound = true;
    }
  } else {
    // nächste Runde existiert noch nicht => er wäre der erste
    isFirstInNextRound = true;
  }
} catch {
  // wenn DB-Check mal scheitert: lieber neutral bleiben
  isFirstInNextRound = false;
}


speakPlayerId = playerId;



// 🔹 Speech-Zielspieler auf den neu Weitergekommenen umlenken
let speechPlayerName = playerName; // default: der bisherige Name

if (newlyAdvancedPlayerId) {
  speakPlayerId = newlyAdvancedPlayerId;

  const { data: advP } = await sb
    .from("players")
    .select("name")
    .eq("id", newlyAdvancedPlayerId)
    .eq("tournament_id", (t as any).id)
    .maybeSingle();

  speechPlayerName = String((advP as any)?.name ?? speechPlayerName);
}



  if (isFinalWin) {
    // 🏆 Text C
    speakText = `Wow, what a performance! ${speechPlayerName}! You played brilliantly, your pinball skills are exceptional! Let yourself be celebrated! ${playerName}, you won the tournament!
`;

  } else {

    if (isFirstInNextRound) {
      // ✅ Text A: er ist der erste in der neuen Runde
      speakText =
        `Great play! ${speechPlayerName}. ` +
        `You're the firt player in the next round. ` +
        `Go to the next round's pinball machine and set your score.`;
    } else {
      // ✅ Text B: es ist schon jemand in der neuen Runde
      speakText =
        `Very well played! ${speechPlayerName}. ` +
        `You're in the next round. ` +
        `Try to beat the cutoff score on the next round's pinball machine to stay in the game.`;

    }
  }
}







      // 3) Runde komplett?
      const isComplete =
        mps.length === expectedThisRound &&
        mps.every((x) => x.score_submitted && x.score != null && Number.isFinite(x.score));

let loserId: string | null = null;


// 🔹 Spieler, die VOR diesem Score schon in der nächsten Runde sind
const nextRoundNumber = roundNumber + 1;

const { data: existingNextMatches } = await sb
  .from("matches")
  .select("id")
  .eq("tournament_id", (t as any).id)
  .eq("round_number", nextRoundNumber);

const nextMatchIds = (existingNextMatches ?? []).map((m) => m.id);

let alreadyNextRoundIds = new Set<string>();

if (nextMatchIds.length > 0) {
  const { data: nextMps } = await sb
    .from("match_players")
    .select("player_id")
    .in("match_id", nextMatchIds);

  for (const r of nextMps ?? []) {
    alreadyNextRoundIds.add(String(r.player_id));
  }
}




// 3a) Wenn komplett: Positionen final setzen (Elimination: nur 1/2)
if (isComplete) {
  // Letzter = niedrigster Score
  const minScore = Math.min(...mps.map((x) => x.score as number));
  const losers = mps.filter((x) => (x.score as number) === minScore);

  // Safety: falls Tie um den letzten Platz entsteht, NICHT automatisch setzen
  if (losers.length !== 1) {
    return NextResponse.json(
      { ok: false, error: "Cannot auto-assign elimination positions: tie for last place." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Jetzt ist es safe, loserId zu setzen
  loserId = losers[0].player_id;

  // 🔹 Wer kommt JETZT neu weiter?
  // Safe = alle Spieler, die NICHT letzter sind
  const safePlayers = mps.filter(
    (p) => String(p.player_id) !== String(loserId)
  );

  // Kandidaten = safe, aber vorher NICHT in der nächsten Runde
  const newlyAdvanced = safePlayers.filter(
    (p) => !alreadyNextRoundIds.has(String(p.player_id))
  );

  // Wenn genau einer neu weiter ist → den nehmen
  if (newlyAdvanced.length === 1) {
    newlyAdvancedPlayerId = String(newlyAdvanced[0].player_id);
  }

  // Falls mehrere neu weiter sind (z.B. 5 Spieler → mehrere safe werden)
  // → nimm den mit dem höchsten Score (deterministisch)
  if (!newlyAdvancedPlayerId && newlyAdvanced.length > 1) {
    newlyAdvanced.sort((a, b) => {
      const ds = Number(b.score) - Number(a.score);
      if (ds !== 0) return ds;
      return String(a.player_id).localeCompare(String(b.player_id));
    });
    newlyAdvancedPlayerId = String(newlyAdvanced[0].player_id);
  }

  // Wenn jemand neu weiter ist, merken wir uns, für wen später gesprochen werden soll.
  // (Der Text selbst kommt später aus deinem Text A/B/C Block.)
  if (isElimination && newlyAdvancedPlayerId) {
    speakPlayerId = newlyAdvancedPlayerId;
  }

  // Positionen: alle anderen = 1, loser = 2
  for (const p of mps) {
    const pos = p.player_id === loserId ? 2 : 1;
    await sb
      .from("match_players")
      .update({ position: pos })
      .eq("match_id", matchId)
      .eq("player_id", p.player_id);
  }

  // Match als complete markieren (best effort)
  await sb.from("matches").update({ status: "complete" }).eq("id", matchId);

  // Letzter ist raus für nächste Runde
  await sb
    .from("players")
    .update({ eliminated_round: roundNumber })
    .eq("id", loserId)
    .eq("tournament_id", (t as any).id);
}



      // 4) Nächste Runde vorbereiten (provisional)
      // Nur wenn nach dieser Runde noch >= 2 Spieler übrig sein können
      if (roundNumber >= 1 && expectedNextRound >= 2 && safePlayerIds.length >= 1) {
        const nextRoundNumber = roundNumber + 1;

        // Runde holen oder anlegen
        const { data: existingRound } = await sb
          .from("rounds")
          .select("id")
          .eq("tournament_id", (t as any).id)
          .eq("number", nextRoundNumber)
          .single();

        let nextRoundId = (existingRound as any)?.id as string | undefined;


        if (!nextRoundId) {
          const { data: createdRound, error: crErr } = await sb
            .from("rounds")
            .insert({
              tournament_id: (t as any).id,
              format: "elimination",
              number: nextRoundNumber,
              status: "open",
              elo_enabled: currentUseElo,
            })
            .select("id")
            .single();
          if (!crErr) nextRoundId = (createdRound as any)?.id;
        }

        if (nextRoundId) {
          // Match holen oder anlegen (genau 1 Match pro Runde)
          const { data: existingMatch } = await sb
            .from("matches")
            .select("id")
            .eq("round_id", nextRoundId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          let nextMatchId = (existingMatch as any)?.id as string | undefined;

          if (!nextMatchId) {
            // Maschine wählen: "am wenigsten genutzt" im Turnier (best effort)
            const { data: machinesRaw } = await sb
              .from("machines")
              .select("id, active")
              .eq("tournament_id", (t as any).id);
            const machines = (machinesRaw ?? []).filter((x: any) => x.active);

            let machineId: string | null = machines.length ? String(randPick(machines).id) : null;
            if (machines.length) {
              const { data: used } = await sb
                .from("matches")
                .select("machine_id")
                .in(
                  "round_id",
                  (await sb
                    .from("rounds")
                    .select("id")
                    .eq("tournament_id", (t as any).id)).data?.map((r: any) => r.id) ?? []
                );
              const counts = new Map<string, number>();
              for (const mm of used ?? []) {
                const mid = mm.machine_id;
                if (!mid) continue;
                counts.set(mid, (counts.get(mid) ?? 0) + 1);
              }
              let bestCount = Number.POSITIVE_INFINITY;
              let best: string[] = [];
              for (const mrow of machines) {
                const mid = String(mrow.id);
                const c = counts.get(mid) ?? 0;
                if (c < bestCount) {
                  bestCount = c;
                  best = [mid];
                } else if (c === bestCount) {
                  best.push(mid);
                }
              }
              machineId = best.length ? randPick(best) : machineId;
            }

            const { data: createdMatch, error: cmErr } = await sb
              .from("matches")
              .insert({
                round_id: nextRoundId,
                machine_id: machineId,
                status: "open",
                game_number: 1,
              })
              .select("id")
              .single();
            if (!cmErr) nextMatchId = (createdMatch as any)?.id;
          }

          if (nextMatchId) {
            // Bereits vorhandene Spieler in der nächsten Runde
            const { data: existingNextMps } = await sb
              .from("match_players")
              .select("player_id")
              .eq("match_id", nextMatchId);
            const existingSet = new Set((existingNextMps ?? []).map((x: any) => String(x.player_id)));

            // Wenn aktuelle Runde komplett ist, kennen wir alle Qualifier (alle außer Letzter)
            let want: string[] = safePlayerIds;
            if (isComplete) {
              const loserId = [...mps].sort((a, b) => (a.score as number) - (b.score as number))[0]?.player_id;
              want = mps
                .map((x) => x.player_id)
                .filter((id) => id && id !== loserId);
            }

            const toInsert = want
              .filter((pid) => !existingSet.has(pid))
              .map((pid) => ({
                match_id: nextMatchId,
                player_id: pid,
                position: null,
                start_position: null,
                team: null,
                score: null,
                score_submitted: false,
              }));

            if (toInsert.length) {
              await sb.from("match_players").insert(toInsert);
            }
          }
        }
      }
    }
  }

return new NextResponse(
  JSON.stringify({
    ok: true,
    row: updated,
    speak: speakText
      ? { kind: "elimination_next_round", playerId: speakPlayerId, text: speakText }
      : null,
  }),
  {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  }
);

}
