import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
type StartOrderMode = "random" | "standings_asc" | "last_round_asc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayerRow = {
  id: string;
  name: string;
  active: boolean;
  profile_id?: string | null;
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// DYP helpers (2vs2)
function teamKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function matchupKey(teamA: string, teamB: string) {
  return teamA < teamB ? `${teamA}||${teamB}` : `${teamB}||${teamA}`;
}

function buildDypCountsFromHistory(
  mpByMatch: Record<string, { player_id: string; team?: number | null }[]>
) {
  const partnerCounts = new Map<string, number>();
  const matchupCounts = new Map<string, number>();

  for (const mps of Object.values(mpByMatch)) {
    const t1 = (mps ?? [])
      .filter((x) => x.team === 1)
      .map((x) => x.player_id)
      .filter(Boolean);
    const t2 = (mps ?? [])
      .filter((x) => x.team === 2)
      .map((x) => x.player_id)
      .filter(Boolean);

    if (t1.length === 2) {
      const k = pairKey(t1[0], t1[1]);
      partnerCounts.set(k, (partnerCounts.get(k) ?? 0) + 1);
    }
    if (t2.length === 2) {
      const k = pairKey(t2[0], t2[1]);
      partnerCounts.set(k, (partnerCounts.get(k) ?? 0) + 1);
    }

    if (t1.length === 2 && t2.length === 2) {
      const k1 = teamKey(t1[0], t1[1]);
      const k2 = teamKey(t2[0], t2[1]);
      const mk = matchupKey(k1, k2);
      matchupCounts.set(mk, (matchupCounts.get(mk) ?? 0) + 1);
    }
  }

  return { partnerCounts, matchupCounts };
}

function bestMatchingForIds(
  ids: string[],
  weight: (a: string, b: string) => number
): { pairs: [string, string][]; cost: number } {
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

    const candidates = rest
      .map((b) => ({ b, w: weight(a, b) }))
      .sort((x, y) => (x.w !== y.w ? x.w - y.w : Math.random() < 0.5 ? -1 : 1));

    for (const c of candidates) {
      const b = c.b;
      const w = c.w;
      const nextRemaining = rest.filter((x) => x !== b);
      pairs.push([a, b]);
      rec(nextRemaining, pairs, cost + w);
      pairs.pop();
      if (best && best.cost === 0) return;
    }
  }

  rec(idsArr.sort(() => (Math.random() < 0.5 ? -1 : 1)), [], 0);
  return best ?? { pairs: [], cost: Number.POSITIVE_INFINITY };
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

// Wie oft hat ein Spieler in der Vergangenheit "ausgesetzt" (Bye)?
// Wir leiten das aus bestehenden Runden ab:
// - pro Round zählen wir nur dann einen Bye, wenn GENAU 1 aktiver Spieler in dieser Runde in keinem Match war.
//   (bei 5 Spielern in 1vs1: 2 Matches -> 4 Spieler spielen -> 1 Bye)
function buildByeCountsFromHistory(opts: {
  rounds: { id: string }[];
  matches: { id: string; round_id: string }[];
  matchPlayers: { match_id: string; player_id: string }[];
  activePlayerIds: string[];
}): Map<string, number> {
  const byeCounts = new Map<string, number>();
  for (const pid of opts.activePlayerIds) byeCounts.set(pid, 0);

  const matchIdToRoundId = new Map<string, string>();
  for (const m of opts.matches ?? []) {
    if (m?.id && m?.round_id) matchIdToRoundId.set(m.id, m.round_id);
  }

  const playedByRound = new Map<string, Set<string>>();
  for (const r of opts.rounds ?? []) {
    playedByRound.set(r.id, new Set());
  }

  for (const mp of opts.matchPlayers ?? []) {
    const rid = matchIdToRoundId.get(mp.match_id);
    if (!rid) continue;
    if (!playedByRound.has(rid)) playedByRound.set(rid, new Set());
    playedByRound.get(rid)!.add(mp.player_id);
  }

  const activeSet = new Set(opts.activePlayerIds);
  for (const [rid, played] of playedByRound.entries()) {
    // nur Spieler berücksichtigen, die aktuell aktiv sind (minimiert Nebenwirkungen bei später aktiv/inaktiv)
    const missing: string[] = [];
    for (const pid of activeSet) {
      if (!played.has(pid)) missing.push(pid);
    }
    if (missing.length === 1) {
      const pid = missing[0];
      byeCounts.set(pid, (byeCounts.get(pid) ?? 0) + 1);
    }
  }

  return byeCounts;
}

function makeMatchplayGroupsAvoidingRepeats(
  players: PlayerRow[],
  groupSize: 2 | 3 | 4,
  pairCounts: Map<string, number>,
  byeCounts?: Map<string, number>
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

    // Bye-Fairness: wenn möglich nicht denselben Spieler mehrfach aussetzen lassen.
    // Wir berücksichtigen das als Zusatzkosten (starker Malus pro bisherigem Bye).
    const byePenaltyWeight = 1000;

    for (const byeId of candidatesForBye as any[]) {
      const ids = byeId ? idsAll.filter((x) => x !== byeId) : idsAll.slice();
      const res = bestMatchingForIds(ids);
      const byePenalty = byeId ? (byeCounts?.get(String(byeId)) ?? 0) * byePenaltyWeight : 0;
      const totalCost = res.cost + byePenalty;
      if (
        !bestOverall ||
        totalCost < bestOverall.cost ||
        (totalCost === bestOverall.cost && Math.random() < 0.5)
      ) {
        bestOverall = { pairs: res.pairs, cost: totalCost, lone: byeId ?? undefined };
      }

      // Kein Early-Break hier: bei ungerader Spielerzahl müssen wir ALLE Bye-Kandidaten prüfen,
      // sonst kann derselbe Spieler immer wieder "gewinnen" (stabile Reihenfolge / Zufall) und mehrfach aussetzen.
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

  // ✅✅✅ NEU: optionales Format-Override (nur wenn du es mitsendest)
  // unterstützt body.format oder body.forceFormat
  const requestedFormatRaw = String(body.format ?? body.forceFormat ?? "").trim();
  const requestedFormat:
    | "matchplay"
    | "swiss"
    | "round_robin"
    | "dyp_round_robin"
    | "elimination"
    | "rotation"
    | null =
    requestedFormatRaw === "matchplay" ||
    requestedFormatRaw === "swiss" ||
    requestedFormatRaw === "round_robin" ||
    requestedFormatRaw === "dyp_round_robin" ||
    requestedFormatRaw === "elimination" ||
    requestedFormatRaw === "rotation"
      ? (requestedFormatRaw as any)
      : null;

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

  const tournamentFormat: "matchplay" | "swiss" | "round_robin" | "dyp_round_robin" | "elimination" | "rotation" =
    t.format === "swiss" ||
    t.format === "round_robin" ||
    t.format === "dyp_round_robin" ||
    t.format === "elimination" ||
    t.format === "rotation"
      ? (t.format as any)
      : "matchplay";

  // ✅✅✅ NEU: effective format (Override > DB)
  const format: "matchplay" | "swiss" | "round_robin" | "dyp_round_robin" | "elimination" | "rotation" =
    requestedFormat ?? tournamentFormat;

const groupSizeAny =
  format === "dyp_round_robin"
    ? 4
    : format === "rotation"
    ? Math.max(2, Number(t.match_size ?? 4)) // rotation: beliebig
    : Math.min(4, Math.max(2, Number(t.match_size ?? 4))); // andere: 2..4

const groupSizeFixed = (Math.min(4, Math.max(2, Number(t.match_size ?? 4))) as 2 | 3 | 4);

const groupSize = format === "rotation" ? groupSizeAny : groupSizeFixed;

  // Spieler + Maschinen holen (mit profile_id!)
  const [{ data: playersRaw }, { data: machinesRaw }] = await Promise.all([
    sb
      .from("players")
      .select("id, name, active, profile_id, eliminated_round")
      .eq("tournament_id", t.id)
      .order("created_at"),
    sb
      .from("machines")
      .select("id, name, active")
      .eq("tournament_id", t.id)
      .order("created_at"),
  ]);

  // ✅ Elimination: ausgeschiedene Spieler bleiben sichtbar (Option A),
  // aber werden für neue Matches nicht mehr verwendet.
  const players = (playersRaw ?? []).filter((p: any) => {
    if (!p?.active) return false;
    if (format === "elimination") return p.eliminated_round == null;
    return true;
  });
  const machines = (machinesRaw ?? []).filter((m: any) => m.active);

  if (!players.length) {
    return NextResponse.json(
      { error: "Keine aktiven Spieler im Turnier" },
      { status: 400 }
    );
  }

  if (format === "elimination" && players.length < 2) {
    return NextResponse.json(
      { error: "Elimination benötigt mindestens 2 nicht ausgeschiedene Spieler" },
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
        .select("match_id, player_id, position, team")
        .in("match_id", matchIds)
    : { data: [] as any[] };

  // ================================
  // ROTATION
  // - erstellt ALLE Runden auf einmal: 1 Runde pro aktiver Maschine
  // - jede Runde enthält GENAU 1 Match
  // - in jedem Match spielen ALLE aktiven Spieler (n = 2..4 in dieser App)
  // ================================
  if (format === "rotation") {
    const warnings: string[] = [];

    if ((rounds ?? []).length > 0) {
      return NextResponse.json(
        {
          error:
            "Rotation erstellt alle Maschinen-Runden in einem Rutsch. In diesem Turnier existieren bereits Runden – bitte ein neues Rotation-Turnier anlegen.",
        },
        { status: 400 }
      );
    }



    // Standings-basierte Startreihenfolgen passen bei Rotation nicht sauber (weil wir 0 History haben).
    // Wir degradieren deshalb auf random.
    const startOrderModeRaw2 = String(startOrderMode ?? "random");
    const effectiveStartOrderMode: StartOrderMode =
      startOrderModeRaw2 === "standings_asc" || startOrderModeRaw2 === "last_round_asc"
        ? "random"
        : "random";
    if (startOrderModeRaw2 !== "random") {
      warnings.push(
        "Rotation: Startreihenfolge wird aktuell immer zufällig gesetzt (Timer/Rotation-Modus)."
      );
    }



    // Rotation-Regel (wie von dir beschrieben):
    // Es werden genau so viele Runden erzeugt wie es SPIELER gibt.
    // Die Maschinen werden dabei zufällig aus dem Pool aktiver Maschinen gezogen,
    // aber ohne Wiederholung (jede Runde hat einen anderen Flipper).
    const playerCount = (players as any[]).length;
    const allMachines = (machines as any[]) ?? [];
    const useMachineCount = Math.min(playerCount, allMachines.length);
    const machinesForRotation = shuffle(allMachines).slice(0, useMachineCount);

    if (allMachines.length > useMachineCount) {
      warnings.push(
        `Rotation: Es sind ${allMachines.length} Maschinen aktiv, aber es werden nur ${useMachineCount} genutzt (= Spieleranzahl).`
      );
    }
    if (allMachines.length < playerCount) {
      warnings.push(
        `Rotation: Es sind nur ${allMachines.length} Maschinen aktiv – es werden daher nur ${useMachineCount} Runden erzeugt.`
      );
    }
    // 1) Runden anlegen (1 pro Maschine)
    const roundsToInsert = (machinesForRotation ?? []).map((m: any, i: number) => ({
      tournament_id: t.id,
      format: "rotation",
      number: nextRoundNumber + i,
      status: "open",
      elo_enabled: useElo,
    }));

    const { data: newRounds, error: roundsErr } = await sb
      .from("rounds")
      .insert(roundsToInsert)
      .select("id, number");

    if (roundsErr || !newRounds?.length) {
      return NextResponse.json(
        { error: roundsErr?.message ?? "Rotation-Runden konnten nicht erstellt werden" },
        { status: 500 }
      );
    }

    // 2) tournament_ratings sicherstellen (wie im Standard-Flow)
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

    const allProfileIds = Array.from(
      new Set(
        (players as any[])
          .map((p: any) => p.profile_id)
          .filter(Boolean)
          .map(String)
      )
    );

    const missingProfileIds = allProfileIds.filter(
      (pid) => !existingTrProfiles.has(pid)
    );

    // ✅ WICHTIG: tournament_ratings braucht die Startwerte (rating_before / provisional_before / matches_before),
    // sonst bricht /api/tournaments/recalc-elo später mit 400 ab.
    if (missingProfileIds.length) {
      const { data: profs, error: profErr } = await sb
        .from("profiles")
        .select("id, rating, provisional_matches, matches_played")
        .in("id", missingProfileIds);

      if (profErr) {
        return NextResponse.json(
          { error: profErr.message ?? "Fehler beim Laden der Profile für Elo-Startwerte" },
          { status: 500 }
        );
      }

      if (!profs || profs.length === 0) {
        return NextResponse.json(
          {
            error:
              "Keine Profile gefunden, um Elo-Startwerte anzulegen (profiles-Abfrage leer).",
          },
          { status: 500 }
        );
      }

      const rows = profs.map((p: any) => ({
        tournament_id: t.id,
        profile_id: p.id,
        rating_before: p.rating,
        provisional_before: p.provisional_matches,
        matches_before: p.matches_played,
      }));

      const { error: trInsErr } = await sb.from("tournament_ratings").insert(rows);

      if (trInsErr) {
        return NextResponse.json(
          { error: trInsErr.message ?? "Elo-Startwerte konnten nicht gespeichert werden" },
          { status: 500 }
        );
      }

      for (const p of profs) {
        existingTrProfiles.add(p.id);
      }
    }

    // 3) pro Runde genau 1 Match erstellen und ALLE Spieler als match_players eintragen
    // Wichtig:
    // - Maschinen: zufällig, aber ohne Wiederholung (siehe machinesForRotation)
    // - Spieler-Reihenfolge: einmalig pro Runde (zyklische Verschiebung)
    //   Bei 3 Spielern entstehen z.B. genau die 3 möglichen Startreihenfolgen.

    const baseOrder = shuffle((players as any[]).slice());

    for (let i = 0; i < (machinesForRotation ?? []).length; i++) {
      const machine = (machinesForRotation as any[])[i];
      const round = (newRounds as any[])[i];
      if (!machine?.id || !round?.id) continue;

      const { data: match, error: matchErr } = await sb
        .from("matches")
        .insert({
          round_id: round.id,
          machine_id: machine.id,
          status: "open",
          game_number: 1,
        })
        .select("id")
        .single();

      if (matchErr || !match?.id) {
        warnings.push(
          `Rotation: Match konnte nicht erstellt werden (${machine?.name ?? "Maschine"}).`
        );
        continue;
      }

      // Einmalige Startreihenfolge pro Runde:
      // wir nehmen eine Basisreihenfolge (random) und verschieben sie pro Runde um i.
      // => jede Runde hat eine andere, aber deterministisch eindeutige Reihenfolge.
      const shift = i % baseOrder.length;
      const playersInThisMatch = baseOrder.slice(shift).concat(baseOrder.slice(0, shift));

      const mpsToInsert = playersInThisMatch.map((p: any, idx: number) => ({
        match_id: match.id,
        player_id: p.id,
        position: null,
        start_position: idx + 1,
        team: null,
      }));

      await sb.from("match_players").insert(mpsToInsert);
    }

    return new NextResponse(
      JSON.stringify({
        created_rounds: newRounds,
        warnings,
        effective_format: format,
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

  // Standings berechnen (wie Leaderboard)
  const mpByMatch: Record<
    string,
    { player_id: string; position: number | null; team?: number | null }[]
  > = {};
  for (const mp of matchPlayers ?? []) {
    mpByMatch[mp.match_id] = mpByMatch[mp.match_id] || [];
    mpByMatch[mp.match_id].push({
      player_id: mp.player_id,
      position: mp.position,
      team: (mp as any).team ?? null,
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
        const only12 = mps.every(
          (x) => x.position == null || x.position === 1 || x.position === 2
        );
        if (only12) {
          pts = pos === 1 ? 3 : 0;
        } else {
          pts = pos === 1 ? 4 : pos === 2 ? 2 : pos === 3 ? 1 : 0;
        }
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

  const pairCounts = buildPairCountsFromHistory(mpByMatch);

  // Bye-Historie (nur relevant bei ungerader Spielerzahl / 1vs1 Matchplay)
  // Minimal-invasiv: wir nutzen diese Counts nur als Zusatzkosten bei der Bye-Auswahl,
  // damit nicht derselbe Spieler mehrfach in derselben "jeder-gegen-jeden"-Phase aussetzen muss.
  const byeCounts = buildByeCountsFromHistory({
    rounds: (rounds ?? []) as any[],
    matches: (matches ?? []) as any[],
    matchPlayers: (matchPlayers ?? []) as any[],
    activePlayerIds: (players as any[]).map((p) => p.id),
  });

  const warnings: string[] = [];

  // Gruppen bilden
  type PlannedGroup = {
    group: PlayerRow[];
    teamByPlayerId?: Record<string, 1 | 2>;
  };
  let plannedGroups: PlannedGroup[] = [];

  const byId = new Map((players as PlayerRow[]).map((p) => [p.id, p] as const));

  // ✅ Elimination: immer genau EIN Match pro Runde.
  // Gruppe = alle aktuell noch nicht ausgeschiedenen Spieler.
  // match_size wird hier bewusst ignoriert.
  if (format === "elimination") {
    plannedGroups = [{ group: players as PlayerRow[] }];
  } else if (format === "dyp_round_robin") {
    const idsAll = (players as PlayerRow[]).map((p) => p.id);

    let idsForPairing = idsAll.slice();
    if (idsAll.length % 2 === 1) {
      const scored = idsAll
        .map((id) => ({
          id,
          matches: standingByPlayerId.get(id)?.matches ?? 0,
          r: Math.random(),
        }))
        .sort((a, b) => (a.matches !== b.matches ? a.matches - b.matches : a.r - b.r));

      const byeId = scored[0]?.id;
      if (byeId) {
        idsForPairing = idsAll.filter((x) => x !== byeId);
        const byeName = byId.get(byeId)?.name ?? "?";
        warnings.push(`Ein Spieler ohne Match: ${byeName} (setzt diese Runde aus)`);
      }
    }

    const { partnerCounts, matchupCounts } = buildDypCountsFromHistory(mpByMatch);

    const teamPairs = bestMatchingForIds(idsForPairing, (a, b) => partnerCounts.get(pairKey(a, b)) ?? 0);
    const teams = teamPairs.pairs.map(([a, b]) => ({ id: teamKey(a, b), a, b }));

    const teamById = new Map(teams.map((t) => [t.id, t] as const));
    const matchPairs = bestMatchingForIds(
      teams.map((t) => t.id),
      (ta, tb) => matchupCounts.get(matchupKey(ta, tb)) ?? 0
    );

    plannedGroups = matchPairs.pairs
      .map(([ta, tb]) => {
        const A = teamById.get(ta);
        const B = teamById.get(tb);
        if (!A || !B) return null;

        const pA1 = byId.get(A.a);
        const pA2 = byId.get(A.b);
        const pB1 = byId.get(B.a);
        const pB2 = byId.get(B.b);
        if (!pA1 || !pA2 || !pB1 || !pB2) return null;

        const teamByPlayerId: Record<string, 1 | 2> = {
          [pA1.id]: 1,
          [pA2.id]: 1,
          [pB1.id]: 2,
          [pB2.id]: 2,
        };

        return { group: [pA1, pA2, pB1, pB2], teamByPlayerId } as PlannedGroup;
      })
      .filter(Boolean) as PlannedGroup[];
  } else {
    let groups: PlayerRow[][] = [];

    if (format === "swiss") {
      let orderedPlayersForGrouping: PlayerRow[] = [];
      if ((rounds ?? []).length === 0) {
        orderedPlayersForGrouping = shuffle(players as PlayerRow[]);
      } else {
        orderedPlayersForGrouping = (players as PlayerRow[])
          .slice()
          .sort((a, b) => {
            const sa = standingByPlayerId.get(a.id)?.points ?? 0;
            const sb = standingByPlayerId.get(b.id)?.points ?? 0;
            if (sa !== sb) return sb - sa; // höherer Score zuerst
            return Math.random() < 0.5 ? -1 : 1;
          });
      }

      // ✅ Swiss-Bye fair rotieren:
      // Ziel: Bevor jemand ein 2. Bye bekommt, sollen alle einmal dran gewesen sein.
      // Wir wählen daher aus den "unteren" Kandidaten den Spieler mit den wenigsten bisherigen Byes.
      // Bei Gleichstand: weniger Punkte bevorzugen (typisches Swiss), danach Zufall.
      const pool = orderedPlayersForGrouping.slice();

      const needsBye = groupSize > 0 && pool.length % groupSize === 1;
      if (needsBye) {
        // Kandidaten aus dem unteren Bereich (damit Top-Spieler nicht unnötig Byes bekommen)
        const takeN = Math.min(pool.length, Math.max(groupSize + 1, 6));
        const candidates = pool.slice(-takeN);

        candidates.sort((a, b) => {
          const ba = byeCounts?.get(a.id) ?? 0;
          const bb = byeCounts?.get(b.id) ?? 0;
          if (ba !== bb) return ba - bb; // weniger Byes zuerst (Rotation)
          const sa = standingByPlayerId.get(a.id)?.points ?? 0;
          const sb = standingByPlayerId.get(b.id)?.points ?? 0;
          if (sa !== sb) return sa - sb; // weniger Punkte zuerst
          return Math.random() < 0.5 ? -1 : 1;
        });

        const byePlayer = candidates[0];
        if (byePlayer?.id) {
          const idx = pool.findIndex((p) => p.id === byePlayer.id);
          if (idx >= 0) pool.splice(idx, 1);
          warnings.push(
            `Ein Spieler ohne Gruppe: ${byePlayer.name ?? "?"} (setzt diese Runde aus)`
          );
        }
      }

      while (pool.length >= groupSize) groups.push(pool.splice(0, groupSize));

      // Restgruppe (2..groupSize-1) darf noch ein Match bekommen
      if (pool.length >= 2) {
        groups.push(pool.splice(0));
      } else if (pool.length === 1) {
        // Sollte durch needsBye oben eigentlich nicht mehr passieren – aber als Fallback:
        const lone = pool[0];
        warnings.push(
          `Ein Spieler ohne Gruppe: ${lone.name ?? "?"} (setzt diese Runde aus)`
        );
      }
    } else if (format === "matchplay") {
      // Nur bei 1vs1 ist die Bye-Fairness relevant.
      const res = makeMatchplayGroupsAvoidingRepeats(
        players as PlayerRow[],
        groupSizeFixed,
        pairCounts,
        groupSizeFixed === 2 ? byeCounts : undefined
      );
      groups = res.groups;
      if (res.lone) warnings.push(`Ein Spieler ohne Gruppe: ${res.lone.name ?? "?"} (setzt diese Runde aus)`);
    } else {
      const pool = shuffle(players as PlayerRow[]).slice();
      while (pool.length >= groupSize) groups.push(pool.splice(0, groupSize));
      if (pool.length >= 2) groups.push(pool.splice(0));
      else if (pool.length === 1)
        warnings.push(`Ein Spieler ohne Gruppe: ${pool[0].name ?? "?"} (setzt diese Runde aus)`);
    }

    plannedGroups = groups.map((g) => ({ group: g }));
  }

  if (!plannedGroups.length) {
    return NextResponse.json(
      { error: "Keine Gruppen gefunden (zu wenige Spieler?)" },
      { status: 400 }
    );
  }

  const singleMatchThisRound = plannedGroups.length === 1;
  let effectiveStartOrderMode: StartOrderMode = startOrderMode;

  const lastRoundPosByPlayerId = new Map<string, number | null>();

  if (startOrderMode === "last_round_asc") {
    const lastRound = (rounds ?? []).reduce(
      (best: any | null, r: any) => (!best || (r.number ?? 0) > (best.number ?? 0) ? r : best),
      null
    );
    const lastRoundId = lastRound?.id as string | undefined;

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
      const lastMatchId = lastRoundMatchIds[0];
      for (const mp of matchPlayers ?? []) {
        if (mp.match_id !== lastMatchId) continue;
        lastRoundPosByPlayerId.set(mp.player_id, mp.position ?? null);
      }
    }
  }

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

  for (const planned of plannedGroups) {
    const group = planned.group;
    const teamByPlayerId = planned.teamByPlayerId;

    const playerIds = group.map((p: any) => p.id);
    const playerProfileIds = group
      .map((p: any) => p.profile_id)
      .filter(Boolean);

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

    for (const pid of playerIds) {
      if (!usedByPlayer[pid]) usedByPlayer[pid] = {};
      usedByPlayer[pid][machine.id] =
        (usedByPlayer[pid][machine.id] ?? 0) + 1;
    }

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

    let playersInThisMatch = group.slice();

    if (effectiveStartOrderMode === "standings_asc") {
      playersInThisMatch.sort((a: any, b: any) => {
        const sa = standingByPlayerId.get(a.id)?.points ?? 0;
        const sb = standingByPlayerId.get(b.id)?.points ?? 0;
        if (sa !== sb) return sa - sb;
        return String(b.name ?? "").localeCompare(String(a.name ?? ""));
      });
    } else if (effectiveStartOrderMode === "last_round_asc") {
      playersInThisMatch.sort((a: any, b: any) => {
        const pa = lastRoundPosByPlayerId.get(a.id) ?? null;
        const pb = lastRoundPosByPlayerId.get(b.id) ?? null;

        if (pa == null && pb == null) return a.name.localeCompare(b.name);
        if (pa == null) return 1;
        if (pb == null) return -1;

        if (pa !== pb) return pb - pa;
        return a.name.localeCompare(b.name);
      });
    } else {
      playersInThisMatch = shuffle(playersInThisMatch);
    }

    const isDypMatch = format === "dyp_round_robin" && group.length === 4;

    const effectiveTeamByPlayerId: Record<string, 1 | 2> | undefined = isDypMatch
      ? ((teamByPlayerId && Object.keys(teamByPlayerId).length > 0
          ? (teamByPlayerId as any)
          : ({
              [group[0]?.id]: 1,
              [group[1]?.id]: 1,
              [group[2]?.id]: 2,
              [group[3]?.id]: 2,
            } as any)) as any)
      : undefined;

    const mpsToInsert = playersInThisMatch.map((p: any, idx: number) => ({
      match_id: matchId,
      player_id: p.id,
      position: null,
      start_position: idx + 1,
      team: effectiveTeamByPlayerId ? (effectiveTeamByPlayerId[p.id] ?? null) : null,
    }));

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

  await sb
    .from("tournaments")
    .update({ current_round: nextRoundNumber })
    .eq("id", t.id);

  return new NextResponse(
    JSON.stringify({
      ok: true,
      warnings,
      round_number: nextRoundNumber,
      startOrderMode,
      effectiveStartOrderMode,
      // ✅✅✅ NEU: Debug, damit wir sofort sehen, ob DYP wirklich aktiv war
      tournament_format: tournamentFormat,
      requested_format: requestedFormat,
      effective_format: format,
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

