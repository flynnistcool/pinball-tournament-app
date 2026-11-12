import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
// Lange ID-Listen in Paketen + seitenweise laden (sonst "fetch failed" / 1000-Zeilen-Limit)
import { fetchAllIn } from "@/lib/supabaseChunks";
import { machineKey } from "@/lib/machineStats";

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
  const { data: tRows, error: tErr } = await fetchAllIn<any>(tournamentIds as string[], (chunk) =>
    sb
      .from("tournaments")
      // locations(name) setzt voraus, dass tournaments.location_id -> locations.id als FK existiert
      .select("id, name, created_at, location_id, locations(name)")
      .in("id", chunk)
      .order("id")
  );

  if (tErr) return noStoreJson({ error: tErr.message }, { status: 500 });

  const tournamentInfoById = new Map<string, any>();
  for (const t of tRows ?? []) tournamentInfoById.set(t.id, t);

  // 3) Für "Turnier-Highscores": alle rounds+matches dieser Turniere holen
  const { data: rounds, error: rErr } = await fetchAllIn<any>(tournamentIds as string[], (chunk) =>
    sb.from("rounds").select("id, tournament_id").in("tournament_id", chunk).order("id")
  );

  if (rErr) return noStoreJson({ error: rErr.message }, { status: 500 });

  const roundIds = (rounds ?? []).map((r: any) => r.id);
  const tournamentIdByRoundId = new Map<string, string>();
  for (const r of rounds ?? []) tournamentIdByRoundId.set(r.id, r.tournament_id);

  if (!roundIds.length) {
    return noStoreJson({ ok: true, machineBests: [], tournaments: [] });
  }

  const { data: matches, error: mErr } = await fetchAllIn<any>(roundIds, (chunk) =>
    sb.from("matches").select("id, round_id, machine_id").in("round_id", chunk).order("id")
  );

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
  const { data: mpRows, error: mpErr } = await fetchAllIn<any>(matchIds, (chunk) =>
    sb
      .from("match_players")
      .select("match_id, player_id, score")
      .in("match_id", chunk)
      .not("score", "is", null)
      .order("match_id")
      .order("player_id")
  );

  if (mpErr) return noStoreJson({ error: mpErr.message }, { status: 500 });

  const uniquePlayerIds = Array.from(new Set((mpRows ?? []).map((x: any) => x.player_id))) as string[];
  const { data: allPlayers, error: apErr } = await fetchAllIn<any>(uniquePlayerIds, (chunk) =>
    sb.from("players").select("id, profile_id, name").in("id", chunk).order("id")
  );

  if (apErr) return noStoreJson({ error: apErr.message }, { status: 500 });

  const profileIdByPlayerId = new Map<string, string>();
  for (const p of allPlayers ?? []) {
    if (p.profile_id) profileIdByPlayerId.set(p.id, p.profile_id);
  }

  // Maschinen-Namen
  const uniqueMachineIds = Array.from(
    new Set((matches ?? []).map((m: any) => m.machine_id).filter(Boolean))
  ) as string[];
  const machineNameById = new Map<string, string>();
  const machineEmojiById = new Map<string, string | null>();
  if (uniqueMachineIds.length) {
    const { data: macRows, error: macErr } = await fetchAllIn<any>(uniqueMachineIds, (chunk) =>
      sb.from("machines").select("id, name, icon_emoji").in("id", chunk).order("id")
    );

    if (macErr) return noStoreJson({ error: macErr.message }, { status: 500 });

    for (const mac of macRows ?? []) {
      machineNameById.set(mac.id, mac.name ?? "Unbekannt");
      machineEmojiById.set(mac.id, (mac.icon_emoji ?? null) as string | null);
    }
  }

  // ---------
  // A) Linke Tabelle: bester Score dieses Profils je (Location + Flipper)
  // "global" bedeutet hier: global innerhalb dieser Location.
  //
  // ⚠️ Flipper werden pro Turnier neu angelegt (eigene ID je Turnier) und sind nur über den
  //    NAMEN mit dem Location-Flipper verbunden. Deshalb Schlüssel = Flipper-Name + Location
  //    (Groß/Klein + Leerzeichen egal) – sonst erscheint z. B. "Jaws" einmal pro Turnier.
  // ---------
  const keyOf = (machineName: string | null | undefined, locationId: string | null) =>
    `${machineKey(machineName)}__${locationId ?? "null"}`;

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

    const score = Number(mp.score);
    if (!Number.isFinite(score)) continue;

    const key = keyOf(machineNameById.get(machineId), locationId);
    const cur = bestScoreByMachineLocForProfile.get(key);
    if (cur == null || score > cur) {
      bestScoreByMachineLocForProfile.set(key, score);
      // Anzeige (Name/Icon) vom Flipper, auf dem der Bestscore erzielt wurde
      machineLocInfo.set(key, { machineId, locationId, locationName });
    } else if (!machineLocInfo.has(key)) {
      machineLocInfo.set(key, { machineId, locationId, locationName });
    }
  }

  const keysForLeft = Array.from(bestScoreByMachineLocForProfile.keys());
  if (!keysForLeft.length) {
    return noStoreJson({ ok: true, machineBests: [], tournaments: [] });
  }

  // ---------
  // B) Badge "Highscore #1" / "Rang #n": Vergleich mit ALLEN Spielern auf diesem Flipper
  //    in ALLEN Turnieren derselben Location (gleicher Flipper-Name).
  // ---------
  const locIds = Array.from(
    new Set(keysForLeft.map((k) => machineLocInfo.get(k)?.locationId).filter(Boolean))
  ) as string[];
  const needNoLocation = keysForLeft.some((k) => !machineLocInfo.get(k)?.locationId);
  const wantedKeys = new Set(keysForLeft);

  // Turniere dieser Locations (+ ggf. Turniere ohne Location)
  const { data: locTournaments, error: ltErr } = await fetchAllIn<any>(locIds, (chunk) =>
    sb.from("tournaments").select("id, location_id").in("location_id", chunk).order("id")
  );
  if (ltErr) return noStoreJson({ error: ltErr.message }, { status: 500 });
  const allTournamentRows: any[] = [...(locTournaments ?? [])];
  if (needNoLocation) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("tournaments")
        .select("id, location_id")
        .is("location_id", null)
        .order("id")
        .range(from, from + 999);
      if (error) return noStoreJson({ error: error.message }, { status: 500 });
      allTournamentRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  const locByTournament = new Map<string, string | null>();
  for (const t of allTournamentRows) locByTournament.set(t.id, (t.location_id ?? null) as string | null);

  // Flipper dieser Turniere – nur die mit passendem Namen
  const { data: locMachines, error: lmErr } = await fetchAllIn<any>(Array.from(locByTournament.keys()), (chunk) =>
    sb.from("machines").select("id, name, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (lmErr) return noStoreJson({ error: lmErr.message }, { status: 500 });
  const keyByMachineId = new Map<string, string>();
  for (const m of locMachines ?? []) {
    const key = keyOf(m.name, locByTournament.get(m.tournament_id) ?? null);
    if (wantedKeys.has(key)) keyByMachineId.set(m.id, key);
  }

  const { data: allMatchesForMachines, error: amErr } = await fetchAllIn<any>(
    Array.from(keyByMachineId.keys()),
    (chunk) => sb.from("matches").select("id, machine_id").in("machine_id", chunk).order("id")
  );
  if (amErr) return noStoreJson({ error: amErr.message }, { status: 500 });

  const machineLocKeyByMatchIdAll = new Map<string, string>();
  for (const m of allMatchesForMachines ?? []) {
    const key = keyByMachineId.get(m.machine_id);
    if (key) machineLocKeyByMatchIdAll.set(m.id, key);
  }

  const { data: mpAll, error: mpAllErr } = await fetchAllIn<any>(
    Array.from(machineLocKeyByMatchIdAll.keys()),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, score")
        .in("match_id", chunk)
        .not("score", "is", null)
        .order("match_id")
        .order("player_id")
  );
  if (mpAllErr) return noStoreJson({ error: mpAllErr.message }, { status: 500 });

  const uniquePlayerIdsAll = Array.from(new Set((mpAll ?? []).map((x: any) => x.player_id))) as string[];
  const { data: playersAll, error: paErr } = await fetchAllIn<any>(uniquePlayerIdsAll, (chunk) =>
    sb.from("players").select("id, profile_id").in("id", chunk).order("id")
  );
  if (paErr) return noStoreJson({ error: paErr.message }, { status: 500 });

  const profileByPlayerAll = new Map<string, string>();
  for (const p of playersAll ?? []) {
    if (p.profile_id) profileByPlayerAll.set(p.id, p.profile_id);
  }

  type GlobalBest = { score: number; winners: Set<string> }; // winners = profile_id
  const globalBestByMachineLoc = new Map<string, GlobalBest>();
  // Für Platzierung (Rank) pro (Location + Flipper): best score je profile_id
  const bestScoreByMachineLocByProfile = new Map<string, Map<string, number>>();

  for (const mp of mpAll ?? []) {
    const key = machineLocKeyByMatchIdAll.get(mp.match_id);
    if (!key) continue;

    const pid = profileByPlayerAll.get(mp.player_id);
    if (!pid) continue;

    const score = Number(mp.score);
    if (!Number.isFinite(score)) continue;

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

      // Platzierung (Dense Rank) innerhalb der Location für diesen Flipper
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
