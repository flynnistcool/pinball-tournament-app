import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Helper: Supabase embedded relations kommen manchmal als Objekt oder Array.
// Wir nehmen immer "das erste Objekt" (oder null).
function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET() {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("match_players")
    .select(`
      score,
      player:players (
        id,
        name
      ),
      match:matches!inner (
        id,
        machine:machines!inner (
          id,
          name,
          icon_emoji
        ),
        round:rounds!inner (
          tournament:tournaments!inner (
            id,
            name,
            location_id,
            status,
            created_at
          )
        )
      )
    `)
    .not("score", "is", null);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Fehler beim Laden der Highscores" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rows = (data ?? []) as any[];

  // Locations sammeln (robust, weil match/round/tournament evtl. Arrays sind)
  const locationIds = Array.from(
    new Set(
      rows
        .map((r) => {
          const match = first(r.match);
          const round = first(match?.round);
          const tournament = first(round?.tournament);
          return tournament?.location_id ?? null;
        })
        .filter(Boolean)
    )
  );

  const locationMap = new Map<string, string>();
  if (locationIds.length > 0) {
    const { data: locations } = await sb
      .from("locations")
      .select("id, name")
      .in("id", locationIds);

    (locations ?? []).forEach((l: any) => {
      locationMap.set(l.id, l.name);
    });
  }

  // Gruppieren: Location + Maschine
  const machinesMap = new Map<
    string,
    {
      key: string;
      name: string;
      icon: string | null;
      location: string;
      top: Array<{
        score: number;
        player: string;
        tournament: string;
        tournamentCreatedAt: string | null;
      }>;
    }
  >();

  for (const r of rows) {
    const match = first(r.match);
    const machine = first(match?.machine);
    const round = first(match?.round);
    const tournament = first(round?.tournament);
    const player = first(r.player);

    if (!machine || !tournament) continue;

    // deleted Turniere ignorieren
    if (tournament.status === "deleted") continue;

    // score normalisieren
    const scoreNum = Number(r.score);
    if (!Number.isFinite(scoreNum)) continue;

    const locationName =
      tournament.location_id
        ? locationMap.get(tournament.location_id) ?? "Unbekannte Location"
        : "Unbekannte Location";

    // key nach location + machine (maschinen-id ist stabiler als name)
    const machineName = (machine.name ?? "Unbekannte Maschine").trim();
    const key = `${tournament.location_id ?? "none"}::${machineName.toLowerCase()}`;

    if (!machinesMap.has(key)) {
      machinesMap.set(key, {
        key,
        name: machineName,
        icon: machine.icon_emoji ?? null,
        location: locationName,
        top: [],
      });
    }

    machinesMap.get(key)!.top.push({
      score: scoreNum,
      player: player?.name ?? "Unbekannt",
      tournament: tournament.name ?? "Unbekanntes Turnier",
      tournamentCreatedAt: tournament.created_at ?? null,
    });
  }

  // Pro Maschine: Top 3
  const machines = Array.from(machinesMap.values()).map((m) => {
    m.top.sort((a, b) => b.score - a.score);
    m.top = m.top.slice(0, 3);
    return m;
  });

  // Sortierung: Location, dann Name
  machines.sort(
    (a, b) =>
      (a.location ?? "").localeCompare(b.location ?? "") ||
      (a.name ?? "").localeCompare(b.name ?? "")
  );

  return NextResponse.json(
    { machines },
    { headers: { "Cache-Control": "no-store" } }
  );
}
