import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Wählt eine (möglichst faire) Maschine für eine Spielergruppe
function pickMachine(
  machines: any[],
  usedByPlayer: Record<string, Set<string>>,
  players: string[],
  usedInThisRound: Set<string>
) {
  const candidates = machines.filter((m: any) => m.active);

  if (!candidates.length) return null;

  // Bevorzugt Maschinen, die in dieser Runde noch nicht benutzt wurden
  const fresh = candidates.filter((m: any) => !usedInThisRound.has(m.id));
  const pool = fresh.length ? fresh : candidates;

  const scored = pool.map((m: any) => {
    let score = 0;

    // Penalty, wenn Spieler diese Maschine schon gespielt haben
    for (const pid of players) {
      if (usedByPlayer[pid]?.has(m.id)) score += 5;
    }

    // Penalty, wenn Maschine in dieser Runde schon genutzt wird
    if (usedInThisRound.has(m.id)) score += 2;

    return { machine: m, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.machine ?? pool[0] ?? null;
}

// Teilt Spieler in Gruppen der Zielgröße auf (2 / 3 / 4), keine 1er-Gruppen
function makeGroups(players: any[], targetSize: 2 | 3 | 4) {
  const ids = players.slice();
  const out: any[][] = [];

  while (ids.length > 0) {
    const remaining = ids.length;

    if (remaining <= targetSize) {
      out.push(ids.splice(0, remaining));
      break;
    }

    const after = remaining - targetSize;
    if (after === 1) {
      const take = (targetSize - 1) as 2 | 3;
      out.push(ids.splice(0, take));
    } else {
      out.push(ids.splice(0, targetSize));
    }
  }

  return out.filter((g) => g.length >= 2);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Turnier + Format + match_size laden
  const { data: t } = await sb
    .from("tournaments")
    .select("id, match_size, format")
    .eq("code", code)
    .single();

  if (!t) {
    return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });
  }

  // Turnier-Format übernehmen
  const format: "matchplay" | "round_robin" | "swiss" =
    t.format === "swiss" || t.format === "round_robin"
      ? (t.format as any)
      : "matchplay";

  // Best-of ist aktuell immer 1
  const bestOf = 1;

  const targetSize = (
    [2, 3, 4].includes(Number((t as any).match_size))
      ? Number((t as any).match_size)
      : 4
  ) as 2 | 3 | 4;

  // Spieler, Maschinen, letzte Runde
  const [{ data: players }, { data: machines }, { data: lastRound }] =
    await Promise.all([
      sb
        .from("players")
        .select("id, name, active")
        .eq("tournament_id", t.id)
        .eq("active", true)
        .order("created_at"),
      sb
        .from("machines")
        .select("id, name, active")
        .eq("tournament_id", t.id)
        .order("created_at"),
      sb
        .from("rounds")
        .select("id, format, number")
        .eq("tournament_id", t.id)
        .eq("format", format)
        .order("number", { ascending: false })
        .limit(1),
    ]);

  const activePlayers = players ?? [];
  if (activePlayers.length < 2) {
    return NextResponse.json(
      { error: "Zu wenige Spieler" },
      { status: 400 }
    );
  }

  const activeMachines = (machines ?? []).filter((m: any) => m.active);
  if (!activeMachines.length) {
    return NextResponse.json(
      { error: "Keine aktiven Maschinen" },
      { status: 400 }
    );
  }

  const nextNumber = ((lastRound ?? [])[0]?.number ?? 0) + 1;

  // Neue Runde anlegen
  const { data: round, error: rErr } = await sb
    .from("rounds")
    .insert({
      tournament_id: t.id,
      format,
      number: nextNumber,
      status: "open",
    })
    .select("id, format, number")
    .single();

  if (rErr || !round) {
    return NextResponse.json(
      { error: rErr?.message ?? "Runde konnte nicht erstellt werden" },
      { status: 500 }
    );
  }

  // Historie: welche Maschinen haben Spieler schon gespielt?
  const { data: hist } = await sb
    .from("match_players")
    .select("player_id, matches!inner(machine_id)")
    .in(
      "player_id",
      activePlayers.map((p: any) => p.id)
    );

  const usedByPlayer: Record<string, Set<string>> = {};
  for (const p of activePlayers) usedByPlayer[p.id] = new Set();
  for (const row of (hist ?? []) as any[]) {
    const mid = row.matches?.machine_id;
    if (mid) usedByPlayer[row.player_id]?.add(mid);
  }

  const warnings: string[] = [];

  // Spieler-Reihenfolge je nach Format
  let orderedPlayers = activePlayers.slice();

  if (format === "swiss") {
    try {
      // Einfache Swiss-Wertung: Punkte aus ALLEN bisherigen Matches dieses Turniers
      // (über alle Runden, da Spieler nur in diesem Turnier existieren)
      const { data: mpHist, error: swissErr } = await sb
        .from("match_players")
        .select("player_id, position, match_id")
        .in(
          "player_id",
          activePlayers.map((p: any) => p.id)
        );

      if (swissErr) {
        warnings.push(
          "Swiss-Sortierung: Fallback auf Zufall (Fehler beim Laden der Historie)"
        );
        orderedPlayers = activePlayers.slice().sort(() => Math.random() - 0.5);
      } else {
        const scores: Record<string, number> = {};
        for (const p of activePlayers) scores[p.id] = 0;

        for (const row of (mpHist ?? []) as any[]) {
          const pid = row.player_id;
          const pos = row.position;
          if (!pid || pos == null) continue;

          let pts = 0;
          if (pos === 1) pts = 3;
          else if (pos === 2) pts = 2;
          else if (pos === 3) pts = 1;
          else pts = 0;

          if (scores[pid] == null) scores[pid] = 0;
          scores[pid] += pts;
        }

        orderedPlayers = activePlayers.slice().sort((a: any, b: any) => {
          const sa = scores[a.id] ?? 0;
          const sb = scores[b.id] ?? 0;
          if (sb !== sa) return sb - sa;
          // stabiler Tie-Breaker
          const na = (a.name ?? "").toString();
          const nb = (b.name ?? "").toString();
          return na.localeCompare(nb);
        });
      }
    } catch {
      warnings.push(
        "Swiss-Sortierung: Fallback auf Zufall (unerwarteter Fehler)"
      );
      orderedPlayers = activePlayers.slice().sort(() => Math.random() - 0.5);
    }
  } else {
    // Matchplay / Round Robin: aktuell gleich – faire Zufallsreihenfolge
    orderedPlayers = activePlayers.slice().sort(() => Math.random() - 0.5);
  }

  const groups = makeGroups(orderedPlayers, targetSize);

  const createdMatchIds: string[] = [];
  const usedMachinesInRound = new Set<string>();

  for (const g of groups) {
    if (g.length < 2) continue;

    const playerIds = g.map((p: any) => p.id);

    for (let gameNo = 1; gameNo <= bestOf; gameNo++) {
      const m = pickMachine(
        activeMachines,
        usedByPlayer,
        playerIds,
        usedMachinesInRound
      );
      if (!m) {
        warnings.push("Keine passende Maschine gefunden");
        continue;
      }

      usedMachinesInRound.add(m.id);
      for (const pid of playerIds) usedByPlayer[pid].add(m.id);

      const { data: match, error: mErr } = await sb
        .from("matches")
        .insert({
          round_id: round.id,
          machine_id: m.id,
          status: "open",
          game_number: gameNo,
        })
        .select("id")
        .single();

      if (mErr || !match) {
        warnings.push(
          "Match konnte nicht erstellt werden: " +
            (mErr?.message ?? "unbekannter Fehler")
        );
        continue;
      }

      createdMatchIds.push(match.id);

      const rows = playerIds.map((pid) => ({
        match_id: match.id,
        player_id: pid,
        position: null as number | null,
        start_position: null as number | null,
      }));

      const { error: mpErr } = await sb.from("match_players").insert(rows);
      if (mpErr) {
        warnings.push(
          "match_players konnten nicht erstellt werden: " +
            (mpErr.message ?? "unbekannter Fehler")
        );
      }
    }
  }

  const groupsCount = groups.length;
  const activeMachineCount = activeMachines.length;

  if (groupsCount > activeMachineCount) {
    warnings.push(
      `Hinweis: ${groupsCount} Gruppen aber nur ${activeMachineCount} aktive Maschinen → Doppelbelegung in einer Runde ist dann unvermeidbar.`
    );
  }

  if (!createdMatchIds.length) {
    warnings.push("Keine Matches erstellt (evtl. zu wenige Spieler?)");
  }

  return NextResponse.json({
    round,
    createdMatchIds,
    warnings,
    bestOf,
    matchSize: targetSize,
  });
}
