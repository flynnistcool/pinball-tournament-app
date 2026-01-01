// @ts-nocheck           // ⬅️ diese Zeile NEU

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type MPRow = {
  player_id: string;
  position: number | null;
  matches: {
    id: string;
    machine_id: string | null;
    round_id: string;
    rounds: {
      tournament_id: string;
      number: number | null;
    } | null;
  } | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const sb = supabaseAdmin();

  // 1) Alle Match-Player mit Position = 1 (Sieger) laden,
  //    inkl. Match + Round (für Turnier & Runden-Nr.)
  const { data: mps, error } = await sb
    .from("match_players")
    .select(
      "player_id, position, matches!inner(id, machine_id, round_id, rounds!inner(tournament_id, number))"
    )
    .eq("position", 1); // nur Sieger

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!mps || mps.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  const rows = mps as MPRow[];

  // 2) IDs sammeln für Spieler, Maschinen, Turniere
  const playerIds = new Set<string>();
  const machineIds = new Set<string>();
  const tournamentIds = new Set<string>();

  for (const r of rows) {
    if (!r.matches || !r.matches.rounds) continue;

    playerIds.add(r.player_id);
    if (r.matches.machine_id) {
      machineIds.add(r.matches.machine_id);
    }
    tournamentIds.add(r.matches.rounds.tournament_id);
  }

  // 3) Stammdaten nachladen
  // Spieler
  let players: { id: string; name: string }[] = [];
  if (playerIds.size > 0) {
    const { data, error: pErr } = await sb
      .from("players")
      .select("id, name")
      .in("id", Array.from(playerIds));

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    players = data ?? [];
  }

  // Maschinen
  let machines: { id: string; name: string }[] = [];
  if (machineIds.size > 0) {
    const { data, error: mErr } = await sb
      .from("machines")
      .select("id, name")
      .in("id", Array.from(machineIds));

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }
    machines = data ?? [];
  }

  // Turniere (MIT Datum + Kategorie)
  let tournaments: {
    id: string;
    name: string;
    code: string;
    created_at: string;
    category: string | null;
  }[] = [];
  if (tournamentIds.size > 0) {
    const { data, error: tErr } = await sb
      .from("tournaments")
      .select("id, name, code, created_at, category")
      .in("id", Array.from(tournamentIds));

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 500 });
    }
    tournaments = (data ?? []) as any;
  }

  // 4) Maps bauen
  const playersById: Record<string, { id: string; name: string }> = {};
  for (const p of players) playersById[p.id] = p;

  const machinesById: Record<string, { id: string; name: string }> = {};
  for (const m of machines) machinesById[m.id] = m;

  const tournamentsById: Record<
    string,
    { id: string; name: string; code: string; created_at: string; category: string | null }
  > = {};
  for (const t of tournaments) tournamentsById[t.id] = t;

  // 5) Ausgabe-Zeilen bauen
  type MatchRow = {
    id: string;
    playedAt: string | null;
    tournamentId: string | null;
    tournamentName: string;
    tournamentCode: string;
    tournamentCategory: string | null;
    roundNumber: number | null;
    machineName: string | null;
    winnerName: string;
  };

  const out: MatchRow[] = [];

  for (const r of rows) {
    if (!r.matches || !r.matches.rounds) continue;

    const match = r.matches;
    const round = r.matches.rounds;
    const tournament = tournamentsById[round.tournament_id];
    const player = playersById[r.player_id];
    const machine =
      match.machine_id != null ? machinesById[match.machine_id] : null;

    out.push({
      id: match.id,
      // 🔹 Datum aus dem Turnier (alle Matches eines Turniers haben dasselbe Datum)
      playedAt: tournament?.created_at ?? null,
      tournamentId: tournament?.id ?? null,
      tournamentName: tournament?.name ?? "Unbekanntes Turnier",
      tournamentCode: tournament?.code ?? "",
      tournamentCategory: tournament?.category ?? null,
      roundNumber: round.number ?? null,
      machineName: machine?.name ?? null,
      winnerName: player?.name ?? "Unbekannter Spieler",
    });
  }

  // 6) Sortierung: nach Datum (neueste oben), dann Turniername, dann Runde
  out.sort((a, b) => {
    const da = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const db = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    if (db !== da) return db - da;
    return (
      a.tournamentName.localeCompare(b.tournamentName) ||
      (a.roundNumber ?? 0) - (b.roundNumber ?? 0)
    );
  });

  // 7) explizit no-store Header
  return new NextResponse(JSON.stringify({ rows: out }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
