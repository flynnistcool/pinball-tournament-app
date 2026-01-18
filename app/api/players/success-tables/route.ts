import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: ResponseInit) {
  return new NextResponse(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      ...(init?.headers ?? {}),
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const profileId = String(body.profileId ?? "").trim();
  if (!profileId) return noStoreJson({ error: "profileId fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  // 1) Alle player-IDs, die zu diesem Profil gehören (über alle Turniere)
  const { data: playerRows, error: pErr } = await sb
    .from("players")
    .select("id, tournament_id, profile_id")
    .eq("profile_id", profileId);

  if (pErr) return noStoreJson({ error: pErr.message }, { status: 500 });

  const playerIds = (playerRows ?? []).map((p: any) => p.id);
  const tournamentIds = Array.from(new Set((playerRows ?? []).map((p: any) => p.tournament_id).filter(Boolean)));

  if (!playerIds.length) {
    return noStoreJson({ ok: true, machineBests: [], tournaments: [] });
  }

  // 2) Turniere laden (Name/Datum + Location für linke Tabelle "global" pro (Location+Maschine))
  const { data: tRows, error: tErr } = await sb
    .from("tournaments")
    // locations(name) setzt voraus, dass tournaments.location_id -> locations.id als FK existiert
    .select("id, name, created_at, location_id, locations(name)")
    .in("id", tournamentIds.length ? tournamentIds : ["__none__"]);

  if (tErr) return noStoreJson({ error: tErr.message }, { status: 500 });

  const tournamentInfoById = new Map<string, any>();
  for (const t of tRows ?? []) tournamentInfoById.set(t.id, t);

  // 3) Für "Turnier-Highscores": alle rounds+matches dieser Turniere holen
  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id, tournament_id")
    .in("tournament_id", tournamentIds.length ? tournamentIds : ["__none__"]);

  if (rErr) return noStoreJson({ error: rErr.message }, { status: 500 });

  const roundIds = (rounds ?? []).map((r: any) => r.id);
  const tournamentIdByRoundId = new Map<string, string>();
  for (const r of rounds ?? []) tournamentIdByRoundId.set(r.id, r.tournament_id);

  if (!roundIds.length) {
    return noStoreJson({ ok: true, machineBests: [], tournaments: [] });
  }

  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select("id, round_id, machine_id")
    .in("round_id", roundIds);

  if (mErr) return noStoreJson({ error: mErr.message }, { status: 500 });

  const matchIds = (matches ?? []).map((m: any) => m.id);
  if (!matchIds.length) {
    return noStoreJson({ ok: true, machineBests: [], tournaments: [] });
  }

  const machineIdByMatchId = new Map<string, string>();
  const tournamentIdByMatchId = new Map<string, string>();
  for (const m of matches ?? []) {
    if (m.machine_id) machineIdByMatchId.set(m.id, m.machine_id);
    const tid = tournamentIdByRoundId.get(m.round_id);
    if (tid) tournamentIdByMatchId.set(m.id, tid);
  }

  // 4) match_players für diese Matches (für Turnier-Highscores)
  const { data: mpRows, error: mpErr } = await sb
    .from("match_players")
    .select("match_id, player_id, score")
    .in("match_id", matchIds)
    .not("score", "is", null);

  if (mpErr) return noStoreJson({ error: mpErr.message }, { status: 500 });

  const uniquePlayerIds = Array.from(new Set((mpRows ?? []).map((x: any) => x.player_id)));
  const { data: allPlayers, error: apErr } = await sb
    .from("players")
    .select("id, profile_id, name")
    .in("id", uniquePlayerIds.length ? uniquePlayerIds : ["__none__"]);

  if (apErr) return noStoreJson({ error: apErr.message }, { status: 500 });

  const profileIdByPlayerId = new Map<string, string>();
  for (const p of allPlayers ?? []) {
    if (p.profile_id) profileIdByPlayerId.set(p.id, p.profile_id);
  }

  // Maschinen-Namen
  const uniqueMachineIds = Array.from(new Set((matches ?? []).map((m: any) => m.machine_id).filter(Boolean)));
  const machineNameById = new Map<string, string>();
  const machineEmojiById = new Map<string, string | null>();
  if (uniqueMachineIds.length) {
    const { data: macRows, error: macErr } = await sb
      .from("machines")
      .select("id, name, icon_emoji")
      .in("id", uniqueMachineIds);

    if (macErr) return noStoreJson({ error: macErr.message }, { status: 500 });

    for (const mac of macRows ?? []) {
      machineNameById.set(mac.id, mac.name ?? "Unbekannt");
      machineEmojiById.set(mac.id, (mac.icon_emoji ?? null) as string | null);
    }
  }

  // ---------
  // A) Linke Tabelle: bester Score dieses Profils je (Location + Maschine)
  // "global" bedeutet hier: global innerhalb dieser Location.
  // ---------
  const bestScoreByMachineLocForProfile = new Map<string, number>();
  const machineLocInfo = new Map<
    string,
    { machineId: string; locationId: string | null; locationName: string | null }
  >();

  for (const mp of mpRows ?? []) {
    const pid = profileIdByPlayerId.get(mp.player_id);
    if (pid !== profileId) continue;

    const machineId = machineIdByMatchId.get(mp.match_id);
    if (!machineId) continue;

    const tid = tournamentIdByMatchId.get(mp.match_id) ?? null;
    const tInfo = tid ? tournamentInfoById.get(tid) : null;
    const locationId = (tInfo?.location_id ?? null) as string | null;
    const locationName = (tInfo?.locations?.name ?? null) as string | null;

    const key = `${machineId}__${locationId ?? "null"}`;
    machineLocInfo.set(key, { machineId, locationId, locationName });

    const score = Number(mp.score);
    if (!Number.isFinite(score)) continue;

    const cur = bestScoreByMachineLocForProfile.get(key);
    if (cur == null || score > cur) bestScoreByMachineLocForProfile.set(key, score);
  }

  const keysForLeft = Array.from(bestScoreByMachineLocForProfile.keys());
  if (!keysForLeft.length) {
    return noStoreJson({ ok: true, machineBests: [], tournaments: [] });
  }

  const machineIdsForLeft = Array.from(
    new Set(keysForLeft.map((k) => k.split("__")[0]).filter(Boolean))
  );

  // ---------
  // B) Badge "Highscore": global beste Score pro (Location + Maschine)
  // Dafür holen wir ALLE Matches dieser Maschinen (inkl. round->tournament->location) + match_players scores
  // ---------
  const { data: allMatchesForMachines, error: amErr } = await sb
    .from("matches")
    .select("id, machine_id, round_id")
    .in("machine_id", machineIdsForLeft);

  if (amErr) return noStoreJson({ error: amErr.message }, { status: 500 });

  const allMatchIdsForMachines = (allMatchesForMachines ?? []).map((m: any) => m.id);

  const { data: mpAll, error: mpAllErr } = await sb
    .from("match_players")
    .select("match_id, player_id, score")
    .in("match_id", allMatchIdsForMachines.length ? allMatchIdsForMachines : ["__none__"])
    .not("score", "is", null);

  if (mpAllErr) return noStoreJson({ error: mpAllErr.message }, { status: 500 });

  const uniquePlayerIdsAll = Array.from(new Set((mpAll ?? []).map((x: any) => x.player_id)));
  const { data: playersAll, error: paErr } = await sb
    .from("players")
    .select("id, profile_id")
    .in("id", uniquePlayerIdsAll.length ? uniquePlayerIdsAll : ["__none__"]);

  if (paErr) return noStoreJson({ error: paErr.message }, { status: 500 });

  const profileByPlayerAll = new Map<string, string>();
  for (const p of playersAll ?? []) {
    if (p.profile_id) profileByPlayerAll.set(p.id, p.profile_id);
  }

  // Für die globalen Highscores brauchen wir die Location pro Match.
  // Dazu: round_id -> tournament_id -> location_id/name.
  const allRoundIds = Array.from(
    new Set((allMatchesForMachines ?? []).map((m: any) => m.round_id).filter(Boolean))
  );

  const { data: allRounds, error: arErr } = await sb
    .from("rounds")
    .select("id, tournament_id")
    .in("id", allRoundIds.length ? allRoundIds : ["__none__"]);

  if (arErr) return noStoreJson({ error: arErr.message }, { status: 500 });

  const tournamentIdByRoundAll = new Map<string, string>();
  for (const r of allRounds ?? []) {
    if (r.id && r.tournament_id) tournamentIdByRoundAll.set(r.id, r.tournament_id);
  }

  const allTournamentIds = Array.from(new Set((allRounds ?? []).map((r: any) => r.tournament_id).filter(Boolean)));

  const { data: allTournaments, error: atErr } = await sb
    .from("tournaments")
    .select("id, location_id, locations(name)")
    .in("id", allTournamentIds.length ? allTournamentIds : ["__none__"]);

  if (atErr) return noStoreJson({ error: atErr.message }, { status: 500 });

  const tournamentInfoAllById = new Map<string, any>();
  for (const t of allTournaments ?? []) tournamentInfoAllById.set(t.id, t);

  const machineLocKeyByMatchIdAll = new Map<string, string>();
  for (const m of allMatchesForMachines ?? []) {
    const mid = (m as any).machine_id as string | null;
    if (!mid) continue;

    const rid = (m as any).round_id as string | null;
    const tid = rid ? tournamentIdByRoundAll.get(rid) : null;
    const tInfo = tid ? tournamentInfoAllById.get(tid) : null;
    const locId = (tInfo?.location_id ?? null) as string | null;

    const key = `${mid}__${locId ?? "null"}`;
    machineLocKeyByMatchIdAll.set((m as any).id, key);
  }

  type GlobalBest = { score: number; winners: Set<string> }; // winners = profile_id
  const globalBestByMachineLoc = new Map<string, GlobalBest>();

  // 🆕 Für Platzierung (Rank) pro (Location + Maschine): best score je profile_id
  // key = "<machineId>__<locationId|null>" -> (profileId -> bestScore)
  const bestScoreByMachineLocByProfile = new Map<string, Map<string, number>>();

  for (const mp of mpAll ?? []) {
    const key = machineLocKeyByMatchIdAll.get(mp.match_id);
    if (!key) continue;

    const pid = profileByPlayerAll.get(mp.player_id);
    if (!pid) continue;

    const score = Number(mp.score);
    if (!Number.isFinite(score)) continue;

    // best score je profile für diese (Location+Maschine)
    let byProfile = bestScoreByMachineLocByProfile.get(key);
    if (!byProfile) {
      byProfile = new Map<string, number>();
      bestScoreByMachineLocByProfile.set(key, byProfile);
    }
    const curBest = byProfile.get(pid);
    if (curBest == null || score > curBest) byProfile.set(pid, score);

    const cur = globalBestByMachineLoc.get(key);
    if (!cur) {
      globalBestByMachineLoc.set(key, { score, winners: new Set([pid]) });
      continue;
    }
    if (score > cur.score) {
      cur.score = score;
      cur.winners = new Set([pid]);
    } else if (score === cur.score) {
      cur.winners.add(pid);
    }
  }

  const machineBests = keysForLeft
    .map((key) => {
      const info = machineLocInfo.get(key);
      if (!info) return null;

      const bestScore = bestScoreByMachineLocForProfile.get(key) ?? 0;
      const global = globalBestByMachineLoc.get(key);

      // 🆕 Platzierung (Rank) global innerhalb der Location für diese Maschine
      // Dense Rank: 1 + Anzahl *verschiedener* Scores, die größer sind als bestScore.
      let globalRank: number | null = null;
      const byProfile = bestScoreByMachineLocByProfile.get(key);
      if (byProfile && Number.isFinite(bestScore)) {
        const uniqueScoresDesc = Array.from(new Set(Array.from(byProfile.values())))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => b - a);
        const idx = uniqueScoresDesc.findIndex((s) => s === bestScore);
        globalRank = idx >= 0 ? idx + 1 : null;
      }

      const isGlobalHighscore =
        !!global &&
        global.score === bestScore &&
        global.winners.has(profileId);

      return {
        machineId: info.machineId,
        machineName: machineNameById.get(info.machineId) ?? "Unbekannt",
        machineIconEmoji: machineEmojiById.get(info.machineId) ?? null,
        locationId: info.locationId,
        locationName: info.locationName,
        bestScore,
        isGlobalHighscore,
        globalRank,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.bestScore - a.bestScore);

  // ---------
  // C) Rechte Tabelle: pro Turnier wie viele Maschinen-Highscores (Platz 1 Score) dieser Spieler hatte
  // ---------
  // Wir berechnen pro Turnier die besten Scores je Maschine (ties zählen)
  type Best = { score: number; winners: Set<string> };
  const bestByTournamentMachine = new Map<string, Map<string, Best>>(); // tid -> (machineId -> best)

  for (const mp of mpRows ?? []) {
    const tid = tournamentIdByMatchId.get(mp.match_id);
    if (!tid) continue;

    const machineId = machineIdByMatchId.get(mp.match_id);
    if (!machineId) continue;

    const pid = profileIdByPlayerId.get(mp.player_id);
    if (!pid) continue;

    const score = Number(mp.score);
    if (!Number.isFinite(score)) continue;

    let byMachine = bestByTournamentMachine.get(tid);
    if (!byMachine) {
      byMachine = new Map();
      bestByTournamentMachine.set(tid, byMachine);
    }

    const cur = byMachine.get(machineId);
    if (!cur) {
      byMachine.set(machineId, { score, winners: new Set([pid]) });
      continue;
    }

    if (score > cur.score) {
      cur.score = score;
      cur.winners = new Set([pid]);
    } else if (score === cur.score) {
      cur.winners.add(pid);
    }
  }

  const tournaments = tournamentIds
    .map((tid) => {
      const t = tournamentInfoById.get(tid);
      const byMachine = bestByTournamentMachine.get(tid);

      let count = 0;
      if (byMachine) {
        for (const [, best] of byMachine.entries()) {
          if (best.winners.has(profileId)) count += 1;
        }
      }

      return {
        tournamentId: tid,
        tournamentName: String(t?.name ?? "Turnier"),
        created_at: (t?.created_at ?? null) as string | null,
        machineHighscores: count,
      };
    })
    // nur Turniere anzeigen, wo es überhaupt Daten gibt (optional)
    .filter((t) => t.tournamentName)
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });

  return noStoreJson({ ok: true, machineBests, tournaments });
}
