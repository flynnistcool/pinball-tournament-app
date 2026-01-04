// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  position: number | null;
  matches: {
    id: string;
    machine_id: string | null;
    machines: {
      id: string;
      name: string;
    } | null;
    rounds: {
      tournament_id: string | null;
      tournaments: {
        location_id: string | null;
        locations: {
          name: string;
        } | null;
      } | null;
    } | null;
  } | null;
  players: {
    profile_id: string;
  } | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const profileId = body?.profileId as string | undefined;

    if (!profileId) {
      return new NextResponse(JSON.stringify({ error: "profileId fehlt" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    const sb = supabaseAdmin();

    /**
     * WICHTIG:
     * - wir zählen NUR über match_players (eine Zeile = ein gespieltes Match)
     * - joinen uns die Maschinen + Location nur dazu
     * - dadurch kann die Summe über alle Maschinen niemals > Matches sein
     */
    const { data, error } = await sb
      .from("match_players")
      .select(
        `
        position,
        matches!inner(
          id,
          machine_id,
          machines(
            id,
            name
          ),
          rounds!inner(
            tournament_id,
            tournaments(
              location_id,
              locations(
                name
              )
            )
          )
        ),
        players!inner(
          profile_id
        )
      `
      )
      .eq("players.profile_id", profileId);

    if (error) {
      console.error("machine-stats query error:", error);
      return new NextResponse(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    const rows = (data ?? []) as Row[];


// Aggregation pro (locationName + machineName)
const map: Record<
  string,
  {
    locationName: string | null;
    machineName: string | null;
    matchesPlayed: number;
    wins: number;
    posSum: number;
    posCount: number;
  }
> = {};

for (const r of rows) {
  const match = r.matches;
  const machineName = match?.machines?.name ?? null;

  // Location (wenn vorhanden)
  const locationName =
    match?.rounds?.tournaments?.locations?.name ??
    match?.rounds?.tournaments?.locations?.name ??
    null;

  // Wenn keine Maschinenbezeichnung vorhanden ist, skip
  if (!machineName) continue;

  // Key: Location + MachineName (damit gleiche Namen zusammengefasst werden)
  const key = `${locationName ?? "Unbekannt"}__${machineName}`;

  if (!map[key]) {
    map[key] = {
      locationName: locationName ?? null,
      machineName,
      matchesPlayed: 0,
      wins: 0,
      posSum: 0,
      posCount: 0,
    };
  }

  map[key].matchesPlayed += 1;

  const pos = typeof r.position === "number" ? r.position : null;
  if (pos != null) {
    map[key].posSum += pos;
    map[key].posCount += 1;
    if (pos === 1) map[key].wins += 1;
  }
}

const machines = Object.values(map)
  .map((x) => ({
    locationId: null,
    locationName: x.locationName,
    machineId: null,
    machineName: x.machineName,
    matchesPlayed: x.matchesPlayed,
    wins: x.wins,
    // ✅ UI erwartet 0–1
    winRate: x.matchesPlayed > 0 ? x.wins / x.matchesPlayed : null,
    avgPosition: x.posCount > 0 ? x.posSum / x.posCount : null,
  }))
  .sort((a, b) => (b.matchesPlayed ?? 0) - (a.matchesPlayed ?? 0));


    return new NextResponse(JSON.stringify({ machines }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("machine-stats crash:", e);
    return new NextResponse(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
}
