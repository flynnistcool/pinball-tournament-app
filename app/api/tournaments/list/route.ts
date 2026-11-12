import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("tournaments")
      .select("id, code, name, created_at, category, format, match_size, location_id, status")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("tournaments/list supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tournaments = data ?? [];

    // 👥 Spielerzahl je Turnier (für die Archiv-Tabelle). Fehler hier sind nicht schlimm:
    // dann fehlt nur die Zahl (player_count = null), die Liste kommt trotzdem.
    const counts = new Map<string, number>();
    let countsOk = false;
    try {
      const ids = tournaments.map((t: any) => String(t.id));
      const pRes = await fetchAllIn<{ id: string; tournament_id: string }>(ids, (chunk) =>
        sb.from("players").select("id, tournament_id").in("tournament_id", chunk).order("id")
      );
      if (pRes.error) {
        console.error("tournaments/list player count error:", pRes.error);
      } else {
        for (const p of pRes.data) {
          const k = String(p.tournament_id);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        countsOk = true;
      }
    } catch (e) {
      console.error("tournaments/list player count crash:", e);
    }

    return NextResponse.json({
      tournaments: tournaments.map((t: any) => ({
        ...t,
        player_count: countsOk ? counts.get(String(t.id)) ?? 0 : null,
      })),
    });
  } catch (e: any) {
    console.error("tournaments/list crash:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
