import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Antwortzeilen aus der SQL-Funktion get_player_machine_stats
type RpcRow = {
  location_name: string | null;
  machine_name: string | null;
  matches_played: number;
  wins: number;
  win_rate: number | null;
  avg_position: number | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const profileId = body?.profileId as string | undefined;

    if (!profileId) {
      return new NextResponse(
        JSON.stringify({ error: "profileId fehlt" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const sb = supabaseAdmin();

    // 🔁 direkt die Funktion aufrufen, die in Supabase das gleiche Ergebnis liefert
    const { data, error } = await sb.rpc("get_player_machine_stats", {
      profile_id: profileId,
    });

    if (error) {
      console.error("machine-stats rpc error:", error);
      return new NextResponse(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const rows = (data ?? []) as RpcRow[];

    // In das Format mappen, das das Frontend erwartet
    const machines = rows.map((row) => ({
      locationId: null,
      locationName: row.location_name,
      machineId: null,
      machineName: row.machine_name,
      matchesPlayed: row.matches_played ?? 0,
      wins: row.wins ?? 0,
      winRate: row.win_rate,
      avgPosition: row.avg_position,
    }));

    // ⛔ WICHTIG – Antwort immer **no-store**, sonst Caching-Probleme!
    return new NextResponse(
      JSON.stringify({ machines }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );

  } catch (e: any) {
    console.error("machine-stats crash:", e);
    return new NextResponse(
      JSON.stringify({ error: String(e?.message ?? e) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
