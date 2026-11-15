// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { isExcludedProfile, loadHumanMatchContext, loadStatsExclusions } from "@/lib/statsExclusions";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { loadTournamentPlayerCounts } from "@/lib/tournamentCounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

type OutRow = {
  tournamentId: string;
  tournamentName: string;
  tournamentCode: string | null;
  tournamentCategory: string | null;
  tournamentCreatedAt: string | null;
  /** Turnierformat (matchplay, rotation, …) */
  tournamentFormat: string | null;
  /** Teilnehmer im Turnier: Spieler / Platzhalter / Bots */
  humansCount: number;
  placeholdersCount: number;
  botsCount: number;
  matches: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  fourthPlaces: number;
  avgPosition: number | null;
  winrate: number; // in %
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get("profileId");

    if (!profileId) {
      return jsonNoStore({ error: "profileId fehlt" }, 400);
    }

    const supabase = supabaseAdmin();

    // 1) alle player-ids dieses profileId finden
    const playersRes = await supabase
      .from("players")
      .select("id")
      .eq("profile_id", profileId);

    if (playersRes.error) {
      return jsonNoStore({ error: playersRes.error.message }, 500);
    }

    const playerIds = (playersRes.data ?? []).map((p) => p.id);
    if (playerIds.length === 0) {
      return jsonNoStore({ rows: [] });
    }

    // 2) match_players für diese playerIds holen (nur Matches mit gesetzter Position)
    //    (in Paketen – bei vielen Matches wird die Anfrage sonst zu lang: "fetch failed")
    const mpRes = await fetchAllIn<any>(playerIds.map(String), (chunk) =>
      supabase
        .from("match_players")
        .select("match_id, player_id, position")
        .in("player_id", chunk)
        .not("position", "is", null)
        .order("match_id")
        .order("player_id")
    );

    if (mpRes.error) {
      return jsonNoStore({ error: mpRes.error.message }, 500);
    }

    // 🛡️ Statistik-Schutz: Plätze nur unter Menschen; Matches nur gegen Bots zählen nicht
    // (Bot-/Platzhalter-Profil selbst: unverändert)
    const exBt = await loadStatsExclusions(supabase);
    const selfExcludedBt = isExcludedProfile(exBt, profileId);
    const hcBt = await loadHumanMatchContext(
      supabase,
      exBt,
      selfExcludedBt ? [] : Array.from(new Set((mpRes.data ?? []).map((x: any) => String(x.match_id))))
    );
    const mps = (mpRes.data ?? [])
      .map((x: any) =>
        selfExcludedBt ? x : { ...x, position: hcBt.position(String(x.match_id), String(x.player_id), x.position) }
      )
      .filter((x: any) => x.position != null);
    if (mps.length === 0) {
      return jsonNoStore({ rows: [] });
    }

    const matchIds = Array.from(new Set(mps.map((x) => x.match_id)));

    // 3) matches -> rounds
    const matchesRes = await fetchAllIn<any>(matchIds.map(String), (chunk) =>
      supabase.from("matches").select("id, round_id").in("id", chunk).order("id")
    );

    if (matchesRes.error) {
      return jsonNoStore({ error: matchesRes.error.message }, 500);
    }

    const matches = matchesRes.data ?? [];
    const roundIds = Array.from(
      new Set(matches.map((m) => m.round_id).filter(Boolean))
    );

    if (roundIds.length === 0) {
      return jsonNoStore({ rows: [] });
    }

    // 4) rounds -> tournaments
    const roundsRes = await fetchAllIn<any>(roundIds.map(String), (chunk) =>
      supabase.from("rounds").select("id, tournament_id").in("id", chunk).order("id")
    );

    if (roundsRes.error) {
      return jsonNoStore({ error: roundsRes.error.message }, 500);
    }

    const rounds = roundsRes.data ?? [];
    const tournamentIds = Array.from(
      new Set(rounds.map((r) => r.tournament_id).filter(Boolean))
    );

    if (tournamentIds.length === 0) {
      return jsonNoStore({ rows: [] });
    }

    // 5) tournaments laden – nur finished
    const tRes = await fetchAllIn<any>(tournamentIds.map(String), (chunk) =>
      supabase
        .from("tournaments")
        .select("id, name, code, status, category, created_at, format")
        .in("id", chunk)
        .eq("status", "finished")
        .order("id")
    );

    if (tRes.error) {
      return jsonNoStore({ error: tRes.error.message }, 500);
    }

    const tournaments = tRes.data ?? [];

    const tMap = new Map<
      string,
      {
        name: string;
        code: string | null;
        category: string | null;
        created_at: string | null;
        format: string | null;
      }
    >();

    for (const t of tournaments) {
      tMap.set(t.id, {
        name: t.name,
        code: t.code ?? null,
        category: (t as any).category ?? null,
        created_at: (t as any).created_at ?? null,
        format: (t as any).format ?? null,
      });
    }

    // Teilnehmer je Turnier: Spieler / Platzhalter / Bots
    const countsByT = await loadTournamentPlayerCounts(supabase, Array.from(tMap.keys()), exBt);

    // helper: roundId -> tournamentId
    const roundToTournament = new Map<string, string>();
    for (const r of rounds) {
      if (r.id && r.tournament_id) roundToTournament.set(r.id, r.tournament_id);
    }

    // helper: matchId -> tournamentId
    const matchToTournament = new Map<string, string>();
    for (const m of matches) {
      const tid = m.round_id ? roundToTournament.get(m.round_id) : undefined;
      if (m.id && tid) matchToTournament.set(m.id, tid);
    }

    // 6) aggregieren pro Tournament
    const agg = new Map<string, OutRow & { sumPos: number }>();

    for (const mp of mps) {
      const pos = mp.position as number | null;
      if (!pos) continue;

      const tid = matchToTournament.get(mp.match_id);
      if (!tid) continue;

      const tInfo = tMap.get(tid);
      if (!tInfo) continue;

      if (!agg.has(tid)) {
        agg.set(tid, {
          tournamentId: tid,
          tournamentName: tInfo.name,
          tournamentCode: tInfo.code,
          tournamentCategory: tInfo.category,
          tournamentCreatedAt: tInfo.created_at,
          tournamentFormat: tInfo.format,
          humansCount: countsByT.get(tid)?.humans ?? 0,
          placeholdersCount: countsByT.get(tid)?.placeholders ?? 0,
          botsCount: countsByT.get(tid)?.bots ?? 0,
          matches: 0,
          firstPlaces: 0,
          secondPlaces: 0,
          thirdPlaces: 0,
          fourthPlaces: 0,
          avgPosition: null,
          winrate: 0,
          sumPos: 0,
        });
      }

      const a = agg.get(tid)!;
      a.matches += 1;
      a.sumPos += pos;

      if (pos === 1) a.firstPlaces += 1;
      else if (pos === 2) a.secondPlaces += 1;
      else if (pos === 3) a.thirdPlaces += 1;
      else if (pos === 4) a.fourthPlaces += 1;
    }

    const out: OutRow[] = Array.from(agg.values()).map((a) => {
      const avg = a.matches > 0 ? a.sumPos / a.matches : null;
      const winrate = a.matches > 0 ? (a.firstPlaces / a.matches) * 100 : 0;

      return {
        tournamentId: a.tournamentId,
        tournamentName: a.tournamentName,
        tournamentCode: a.tournamentCode,
        tournamentCategory: a.tournamentCategory ?? null,
        tournamentCreatedAt: a.tournamentCreatedAt ?? null,
        tournamentFormat: a.tournamentFormat ?? null,
        humansCount: a.humansCount ?? 0,
        placeholdersCount: a.placeholdersCount ?? 0,
        botsCount: a.botsCount ?? 0,
        matches: a.matches,
        firstPlaces: a.firstPlaces,
        secondPlaces: a.secondPlaces,
        thirdPlaces: a.thirdPlaces,
        fourthPlaces: a.fourthPlaces,
        avgPosition: avg,
        winrate,
      };
    });

    // ✅ Sortierung: neuestes Turnier zuerst
    out.sort((a, b) => {
      const ta = a.tournamentCreatedAt ? new Date(a.tournamentCreatedAt).getTime() : 0;
      const tb = b.tournamentCreatedAt ? new Date(b.tournamentCreatedAt).getTime() : 0;

      if (tb !== ta) return tb - ta;                // Datum DESC (neu → alt)
      if (b.matches !== a.matches) return b.matches - a.matches; // optional: bei gleichem Datum
      return a.tournamentName.localeCompare(b.tournamentName);  // optional: als letzte Tie-Breaker
    });

    return jsonNoStore({ rows: out });
  } catch (e: any) {
    return jsonNoStore({ error: e?.message ?? "Unbekannter Fehler" }, 500);
  }
}
