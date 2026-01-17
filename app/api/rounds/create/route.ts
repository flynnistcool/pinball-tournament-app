import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
type StartOrderMode = "random" | "standings_asc" | "last_round_asc";

type PlayerRow = {
  id: string;
  name: string;
  active: boolean;
  profile_id?: string | null;
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function groupRepeatCost(group: PlayerRow[], pairCounts: Map<string, number>) {
  let cost = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      cost += pairCounts.get(pairKey(group[i].id, group[j].id)) ?? 0;
    }
  }
  return cost;
}

function buildPairCountsFromHistory(mpByMatch: Record<string, { player_id: string }[]>) {
  const pairCounts = new Map<string, number>();
  for (const mps of Object.values(mpByMatch)) {
    const ids = (mps ?? []).map((x) => x.player_id).filter(Boolean);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i], ids[j]);
        pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
      }
    }
  }
  return pairCounts;
}

function makeMatchplayGroupsAvoidingRepeats(
  players: PlayerRow[],
  groupSize: 2 | 3 | 4,
  pairCounts: Map<string, number>
): { groups: PlayerRow[][]; lone?: PlayerRow } {
  const ps = players.slice();

  // --- 1vs1 (groupSize=2): exakte Suche nach der besten Paarung (minimale Wiederholungen) ---
  if (groupSize === 2) {
    const byId = new Map(ps.map((p) => [p.id, p] as const));
    const idsAll = ps.map((p) => p.id);

    function bestMatchingForIds(ids: string[]): { pairs: [string, string][]; cost: number } {
      let best: { pairs: [string, string][]; cost: number } | null = null;

      const idsSet = new Set(ids);
      const idsArr = Array.from(idsSet);

      function rec(remaining: string[], pairs: [string, string][], cost: number) {
        if (best && cost > best.cost) return;
        if (remaining.length < 2) {
          if (!best || cost < best.cost || (cost === best.cost && Math.random() < 0.5)) {
            best = { pairs: pairs.slice(), cost };
          }
          return;
        }

        const a = remaining[0];
        const rest = remaining.slice(1);

        // Kandidaten nach "wie oft schon gegeneinander" sortieren (aufsteigend), bei Gleichstand zufällig.
        const candidates = rest
          .map((b) => ({ b, w: pairCounts.get(pairKey(a, b)) ?? 0 }))
          .sort((x, y) => (x.w !== y.w ? x.w - y.w : Math.random() < 0.5 ? -1 : 1));

        for (const c of candidates) {
          const b = c.b;
          const w = c.w;
          const nextRemaining = rest.filter((x) => x !== b);
          pairs.push([a, b]);
          rec(nextRemaining, pairs, cost + w);
          pairs.pop();
          // Wenn wir schon die perfekte Lösung gefunden haben: früh raus.
          if (best && best.cost === 0) return;
        }
      }

      rec(idsArr.sort(() => (Math.random() < 0.5 ? -1 : 1)), [], 0);
      return best ?? { pairs: [], cost: Number.POSITIVE_INFINITY };
    }

    // Bei ungerader Spielerzahl: probiere jede Bye-Option und nimm die beste.
    let bestOverall: {
      pairs: [string, string][];
      cost: number;
      lone?: string;
    } | null = null;

    const candidatesForBye = idsAll.length % 2 === 1 ? idsAll : [null];

    for (const byeId of candidatesForBye as any[]) {
      const ids = byeId ? idsAll.filter((x) => x !== byeId) : idsAll.slice();
      const res = bestMatchingForIds(ids);
      const totalCost = res.cost;
      if (
        !bestOverall ||
        totalCost < bestOverall.cost ||
        (totalCost === bestOverall.cost && Math.random() < 0.5)
      ) {
        bestOverall = { pairs: res.pairs, cost: totalCost, lone: byeId ?? undefined };
      }
      if (bestOverall && bestOverall.cost === 0 && (idsAll.length % 2 === 0 || byeId)) {
        // Für den Bye-Fall gibt es nicht zwingend "0" als bestes. Trotzdem reicht hier ein sehr früher Abbruch.
        break;
      }
    }

    const groups: PlayerRow[][] = (bestOverall?.pairs ?? []).map(([a, b]) => [byId.get(a)!, byId.get(b)!]);
    const lone = bestOverall?.lone ? byId.get(bestOverall.lone) : undefined;
    return { groups, lone };
  }

  // --- 3/4er Matchplay: viele Zufallsversuche und den besten nehmen (minimale Wiederholungen) ---
  const maxAttempts = 400;
  let bestGroups: PlayerRow[][] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  let bestLone: PlayerRow | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(ps);
    const groups: PlayerRow[][] = [];
    const pool = shuffled.slice();
    while (pool.length >= groupSize) groups.push(pool.splice(0, groupSize));

    let lone: PlayerRow | undefined;
    if (pool.length >= 2) {
      groups.push(pool.splice(0));
    } else if (pool.length === 1) {
      lone = pool[0];
    }

    const cost = groups.reduce((sum, g) => sum + groupRepeatCost(g, pairCounts), 0);
    if (cost < bestCost || (cost === bestCost && Math.random() < 0.5)) {
      bestCost = cost;
      bestGroups = groups;
      bestLone = lone;
      if (bestCost === 0) break;
    }
  }

  return { groups: bestGroups, lone: bestLone };
}

function shuffle<T>(arr: T[]): T[] {
  return arr
    .slice()
    .map((v) => ({ v, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.v);
}

// Maschine für ein Match auswählen
function pickMachine(
  machines: any[],
  usedByPlayer: Record<string, Record<string, number>>,
  players: string[],
  usedInThisRound: Set<string>
) {
  const candidates = machines.filter((m: any) => m.active);
  if (!candidates.length) return null;

  const fresh = candidates.filter((m: any) => !usedInThisRound.has(m.id));
  const pool = fresh.length ? fresh : candidates;

  const scored = pool.map((m: any) => {
    let usedCount = 0;
    for (const pid of players) {
      usedCount += usedByPlayer[pid]?.[m.id] ?? 0;
    }
    return { m, usedCount };
  });

  scored.sort((a, b) => a.usedCount - b.usedCount);

  const min = scored[0].usedCount;
  const best = scored.filter((s) => s.usedCount === min);

  const chosen = best[Math.floor(Math.random() * best.length)];
  return chosen?.m ?? pool[Math.floor(Math.random() * pool.length)];
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  }

  const startOrderModeRaw = String(body.startOrderMode ?? "random").trim();
  const startOrderMode: StartOrderMode =
    startOrderModeRaw === "standings_asc"
      ? "standings_asc"
      : startOrderModeRaw === "last_round_asc"
      ? "last_round_asc"
      : "random";

  const useElo = Boolean(body.useElo);

  const sb = supabaseAdmin();

  // Turnier laden
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, format, match_size, status")
    .eq("code", code)
    .single();

  if (tErr || !t) {
    return NextResponse.json(
      { error: "Turnier nicht gefunden" },
      { status: 404 }
    );
  }

  if (t.status === "finished") {
    return NextResponse.json(
      { error: "Turnier ist beendet, keine neuen Runden möglich" },
      { status: 400 }
    );
  }

  const format: "matchplay" | "swiss" | "round_robin" =
    t.format === "swiss" || t.format === "round_robin" ? t.format : "matchplay";

  const groupSize = Math.min(
    4,
    Math.max(2, Number(t.match_size ?? 4))
  ) as 2 | 3 | 4;

  // Spieler + Maschinen holen (mit profile_id!)
  const [{ data: playersRaw }, { data: machinesRaw }] = await Promise.all([
    sb
      .from("players")
      .select("id, name, active, profile_id")
      .eq("tournament_id", t.id)
      .order("created_at"),
    sb
      .from("machines")
      .select("id, name, active")
      .eq("tournament_id", t.id)
      .order("created_at"),
  ]);

  const players = (playersRaw ?? []).filter((p: any) => p.active);
  const machines = (machinesRaw ?? []).filter((m: any) => m.active);

  if (!players.length) {
    return NextResponse.json(
      { error: "Keine aktiven Spieler im Turnier" },
      { status: 400 }
    );
  }

  if (!machines.length) {
    return NextResponse.json(
      { error: "Keine aktiven Maschinen im Turnier" },
      { status: 400 }
    );
  }

  // Bisherige Runden / Matches / Match-Players laden (für Swiss + Standings)
  const { data: rounds } = await sb
    .from("rounds")
    .select("id, number")
    .eq("tournament_id", t.id)
    .order("number", { ascending: true });

  const nextRoundNumber =
    (rounds ?? []).reduce(
      (max, r: any) => Math.max(max, r.number ?? 0),
      0
    ) + 1;

  const roundIds = (rounds ?? []).map((r: any) => r.id);

  const { data: matches } = roundIds.length
    ? await sb
        .from("matches")
        .select("id, round_id")
        .in("round_id", roundIds)
    : { data: [] as any[] };

  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: matchPlayers } = matchIds.length
    ? await sb
        .from("match_players")
        .select("match_id, player_id, position")
        .in("match_id", matchIds)
    : { data: [] as any[] };

  // Standings berechnen (wie Leaderboard)
  const mpByMatch: Record<
    string,
    { player_id: string; position: number | null }[]
  > = {};
  for (const mp of matchPlayers ?? []) {
    mpByMatch[mp.match_id] = mpByMatch[mp.match_id] || [];
    mpByMatch[mp.match_id].push({
      player_id: mp.player_id,
      position: mp.position,
    });
  }

  type Standing = { player_id: string; points: number; matches: number };

  const standingsMap = new Map<string, Standing>();

  function addPoints(playerId: string, pts: number) {
    const cur = standingsMap.get(playerId) ?? {
      player_id: playerId,
      points: 0,
      matches: 0,
    };
    cur.points += pts;
    cur.matches += 1;
    standingsMap.set(playerId, cur);
  }

  for (const [, mps] of Object.entries(mpByMatch)) {
    const size = mps.length;
    if (!size) continue;

    for (const mp of mps) {
      if (mp.position == null) continue;
      const pos = mp.position;

      let pts = 0;
      if (size === 2) {
        pts = pos === 1 ? 3 : 0;
      } else if (size === 3) {
        pts = pos === 1 ? 3 : pos === 2 ? 1 : 0;
      } else {
        pts = pos === 1 ? 4 : pos === 2 ? 2 : pos === 3 ? 1 : 0;
      }

      addPoints(mp.player_id, pts);
    }
  }

  const standings: Standing[] = players.map((p: any) => {
    const st = standingsMap.get(p.id);
    return st ?? { player_id: p.id, points: 0, matches: 0 };
  });

  const standingByPlayerId = new Map<string, Standing>();
  for (const st of standings) standingByPlayerId.set(st.player_id, st);

  // Wie oft haben Spieler schon gegeneinander (oder im selben Match) gespielt?
  // Für 1vs1 ist das exakt "A vs B". Für 3/4er Matchplay zählt es als "zusammen gespielt".
  const pairCounts = buildPairCountsFromHistory(mpByMatch);

  const warnings: string[] = [];

  // Gruppen bilden
  let groups: PlayerRow[][] = [];

  if (format === "swiss") {
    // Swiss: wie bisher nach Standings (und innerhalb gleicher Punkte random), dann in Gruppen schneiden.
    let orderedPlayersForGrouping: PlayerRow[] = [];
    if ((rounds ?? []).length === 0) {
      orderedPlayersForGrouping = shuffle(players as PlayerRow[]);
    } else {
      orderedPlayersForGrouping = (players as PlayerRow[]).slice().sort((a, b) => {
        const sa = standingByPlayerId.get(a.id)?.points ?? 0;
        const sb = standingByPlayerId.get(b.id)?.points ?? 0;
        if (sa !== sb) return sb - sa;
        return Math.random() < 0.5 ? -1 : 1;
      });
    }

    const pool = orderedPlayersForGrouping.slice();
    while (pool.length >= groupSize) groups.push(pool.splice(0, groupSize));

    if (pool.length >= 2) {
      groups.push(pool.splice(0));
    } else if (pool.length === 1) {
      const lone = pool[0];
      warnings.push(`Ein Spieler ohne Gruppe: ${lone.name ?? "?"} (setzt diese Runde aus)`);
    }
  } else if (format === "matchplay") {
    // Matchplay: zufällig, aber Wiederholungen so lange wie möglich vermeiden.
    const res = makeMatchplayGroupsAvoidingRepeats(players as PlayerRow[], groupSize, pairCounts);
    groups = res.groups;
    if (res.lone) warnings.push(`Ein Spieler ohne Gruppe: ${res.lone.name ?? "?"} (setzt diese Runde aus)`);
  } else {
    // Round Robin: aktuell wie vorher (random). Wenn du hier einen echten Round-Robin-Plan willst, sag Bescheid.
    const pool = shuffle(players as PlayerRow[]).slice();
    while (pool.length >= groupSize) groups.push(pool.splice(0, groupSize));
    if (pool.length >= 2) groups.push(pool.splice(0));
    else if (pool.length === 1) warnings.push(`Ein Spieler ohne Gruppe: ${pool[0].name ?? "?"} (setzt diese Runde aus)`);
  }

  if (!groups.length) {
    return NextResponse.json(
      { error: "Keine Gruppen gefunden (zu wenige Spieler?)" },
      { status: 400 }
    );
  }

  // --- Startreihenfolge "nach letzter Runde" ist nur sinnvoll, wenn
  // (a) diese Runde genau 1 Match erzeugt UND
  // (b) die letzte Runde ebenfalls genau 1 Match hatte.
  const singleMatchThisRound = groups.length === 1;
  let effectiveStartOrderMode: StartOrderMode = startOrderMode;

  // Map: player_id -> position in letzter Runde (1=best, höher=schlechter)
  const lastRoundPosByPlayerId = new Map<string, number | null>();

  if (startOrderMode === "last_round_asc") {
    // letzte Runde bestimmen
    const lastRound = (rounds ?? []).reduce(
      (best: any | null, r: any) => (!best || (r.number ?? 0) > (best.number ?? 0) ? r : best),
      null
    );
    const lastRoundId = lastRound?.id as string | undefined;

    // Wie viele Matches hatte die letzte Runde?
    const lastRoundMatchIds = lastRoundId
      ? (matches ?? []).filter((m: any) => m.round_id === lastRoundId).map((m: any) => m.id)
      : [];

    const singleMatchLastRound = lastRoundMatchIds.length === 1;

    if (!singleMatchThisRound || !singleMatchLastRound) {
      effectiveStartOrderMode = "random";
      warnings.push(
        "Start-Reihenfolge 'Schlechtester zuerst (nach letzter Runde)' ist nur möglich, wenn pro Runde genau ein Match existiert. Es wird zufällig sortiert."
      );
    } else {
      // Positionen aus der letzten Runde einsammeln
      const lastMatchId = lastRoundMatchIds[0];
      for (const mp of matchPlayers ?? []) {
        if (mp.match_id !== lastMatchId) continue;
        lastRoundPosByPlayerId.set(mp.player_id, mp.position ?? null);
      }
    }
  }

  // Maschinen-Historie pro Spieler laden
  const { data: hist } = await sb
    .from("match_players")
    .select("player_id, matches(machine_id)")
    .in(
      "player_id",
      players.map((p: any) => p.id)
    );

  const usedByPlayer: Record<string, Record<string, number>> = {};
  for (const p of players) {
    usedByPlayer[p.id] = {};
  }

  for (const row of (hist ?? []) as any[]) {
    const pid = row.player_id as string;
    const mid = row.matches?.machine_id as string | null;
    if (pid && mid && usedByPlayer[pid]) {
      usedByPlayer[pid][mid] = (usedByPlayer[pid][mid] ?? 0) + 1;
    }
  }

  const usedMachinesInRound = new Set<string>();

  // Neue Runde anlegen (mit elo_enabled)
  const { data: newRound, error: roundErr } = await sb
    .from("rounds")
    .insert({
      tournament_id: t.id,
      format,
      number: nextRoundNumber,
      status: "open",
      elo_enabled: useElo,
    })
    .select("id")
    .single();

  if (roundErr || !newRound) {
    return NextResponse.json(
      { error: roundErr?.message ?? "Runde konnte nicht erstellt werden" },
      { status: 500 }
    );
  }

  const roundId = newRound.id as string;

  // 🔎 Bereits existierende Startwerte für das Turnier laden
  const { data: trExisting, error: trErr } = await sb
    .from("tournament_ratings")
    .select("profile_id")
    .eq("tournament_id", t.id);

  if (trErr) {
    return NextResponse.json(
      { error: trErr.message ?? "Fehler beim Laden von tournament_ratings" },
      { status: 500 }
    );
  }

  const existingTrProfiles = new Set<string>(
    (trExisting ?? []).map((r: any) => r.profile_id)
  );

  // Für jede Gruppe: Match + Match-Players anlegen
  for (const group of groups) {
    const playerIds = group.map((p: any) => p.id);
    const playerProfileIds = group
      .map((p: any) => p.profile_id)
      .filter(Boolean);

    // Maschine wählen
    const machine = pickMachine(
      machines,
      usedByPlayer,
      playerIds,
      usedMachinesInRound
    );

    if (!machine) {
      warnings.push(
        "Match konnte nicht erstellt werden: keine geeignete Maschine gefunden"
      );
      continue;
    }

    usedMachinesInRound.add(machine.id);

    // Historie updaten für diese Runde
    for (const pid of playerIds) {
      if (!usedByPlayer[pid]) usedByPlayer[pid] = {};
      usedByPlayer[pid][machine.id] =
        (usedByPlayer[pid][machine.id] ?? 0) + 1;
    }

    // Match anlegen
    const { data: match, error: matchErr } = await sb
      .from("matches")
      .insert({
        round_id: roundId,
        machine_id: machine.id,
        status: "open",
        game_number: 1,
      })
      .select("id")
      .single();

    if (matchErr || !match) {
      warnings.push(
        `Match konnte nicht erstellt werden: ${
          matchErr?.message ?? "Unbekannter Fehler"
        }`
      );
      continue;
    }

    const matchId = match.id as string;

    // Startreihenfolge
    let playersInThisMatch = group.slice();

    if (effectiveStartOrderMode === "standings_asc") {
      playersInThisMatch.sort((a: any, b: any) => {
        const sa = standingByPlayerId.get(a.id)?.points ?? 0;
        const sb = standingByPlayerId.get(b.id)?.points ?? 0;
        if (sa !== sb) return sa - sb;
        return String(b.name ?? "").localeCompare(String(a.name ?? ""));
      });
    } else if (effectiveStartOrderMode === "last_round_asc") {
      // Nur sinnvoll bei genau 1 Match pro Runde (siehe Checks oben).
      playersInThisMatch.sort((a: any, b: any) => {
        const pa = lastRoundPosByPlayerId.get(a.id) ?? null;
        const pb = lastRoundPosByPlayerId.get(b.id) ?? null;

        // Spieler ohne Position (z.B. kein Ergebnis) ans Ende
        if (pa == null && pb == null) return a.name.localeCompare(b.name);
        if (pa == null) return 1;
        if (pb == null) return -1;

        // schlechter (höhere Zahl) zuerst
        if (pa !== pb) return pb - pa;
        return a.name.localeCompare(b.name);
      });
    } else {
      playersInThisMatch = shuffle(playersInThisMatch);
    }

    const mpsToInsert = playersInThisMatch.map((p: any, idx: number) => ({
      match_id: matchId,
      player_id: p.id,
      position: null,
      start_position: idx + 1,
    }));

    // ⭐ Startwerte nur für Profile eintragen, die noch keinen Eintrag haben
    const newProfileIds = playerProfileIds.filter(
      (pid: string) => !existingTrProfiles.has(pid)
    );

    if (newProfileIds.length) {
      const { data: profs, error: profErr } = await sb
        .from("profiles")
        .select("id, rating, provisional_matches, matches_played")
        .in("id", newProfileIds);

      if (!profErr && profs && profs.length) {
        const rows = profs.map((p: any) => ({
          tournament_id: t.id,
          profile_id: p.id,
          rating_before: p.rating,
          provisional_before: p.provisional_matches,
          matches_before: p.matches_played,
        }));

        await sb.from("tournament_ratings").insert(rows);

        for (const p of profs) {
          existingTrProfiles.add(p.id);
        }
      }
    }

    const { error: mpErr } = await sb
      .from("match_players")
      .insert(mpsToInsert);

    if (mpErr) {
      warnings.push(
        `Spieler im Match konnten nicht gespeichert werden: ${mpErr.message}`
      );
    }
  }

  // current_round aktualisieren
  await sb
    .from("tournaments")
    .update({ current_round: nextRoundNumber })
    .eq("id", t.id);

  return NextResponse.json({
    ok: true,
    warnings,
    round_number: nextRoundNumber,
    startOrderMode,
    effectiveStartOrderMode, // ✅ NEU (Debug)
  });
}
