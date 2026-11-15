import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { loadStatsExclusions } from "@/lib/statsExclusions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("tournaments")
      .select("id, code, name, created_at, category, format, match_size, location_id, status, extraball")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("tournaments/list supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tournaments = data ?? [];

    // 👥 Spielerzahl je Turnier (für die Archiv-Tabelle). Fehler hier sind nicht schlimm:
    // dann fehlt nur die Zahl (player_count = null), die Liste kommt trotzdem.
    // Aufgeteilt in Spieler / 🚫 Platzhalter / 🤖 Bots (player_count bleibt die Gesamtzahl)
    const counts = new Map<string, number>();
    const split = new Map<string, { humans: number; placeholders: number; bots: number }>();
    let countsOk = false;
    try {
      const ids = tournaments.map((t: any) => String(t.id));
      const pRes = await fetchAllIn<{ id: string; tournament_id: string; profile_id: string | null }>(ids, (chunk) =>
        sb.from("players").select("id, tournament_id, profile_id").in("tournament_id", chunk).order("id")
      );
      if (pRes.error) {
        console.error("tournaments/list player count error:", pRes.error);
      } else {
        const ex = await loadStatsExclusions(sb);
        for (const p of pRes.data) {
          const k = String(p.tournament_id);
          counts.set(k, (counts.get(k) ?? 0) + 1);
          const c = split.get(k) ?? { humans: 0, placeholders: 0, bots: 0 };
          const prof = p.profile_id ? String(p.profile_id) : "";
          if (prof && ex.botProfileIds.has(prof)) c.bots++;
          else if (prof && ex.placeholderProfileIds.has(prof)) c.placeholders++;
          else c.humans++;
          split.set(k, c);
        }
        countsOk = true;
      }
    } catch (e) {
      console.error("tournaments/list player count crash:", e);
    }

    // ⚠️ beendete Turniere OHNE gespeicherte Auswertung (tournament_results) erkennen
    const withResults = new Set<string>();
    let resultsOk = false;
    try {
      const finishedIds = tournaments.filter((t: any) => t.status === "finished").map((t: any) => String(t.id));
      const rRes = await fetchAllIn<{ tournament_id: string; player_id: string }>(finishedIds, (chunk) =>
        sb.from("tournament_results").select("tournament_id, player_id").in("tournament_id", chunk).order("tournament_id").order("player_id")
      );
      if (!rRes.error) {
        for (const r of rRes.data) withResults.add(String(r.tournament_id));
        resultsOk = true;
      }
    } catch (e) {
      console.error("tournaments/list results check crash:", e);
    }

    return NextResponse.json({
      tournaments: tournaments.map((t: any) => ({
        ...t,
        player_count: countsOk ? counts.get(String(t.id)) ?? 0 : null,
        human_count: countsOk ? split.get(String(t.id))?.humans ?? 0 : null,
        placeholder_count: countsOk ? split.get(String(t.id))?.placeholders ?? 0 : null,
        bot_count: countsOk ? split.get(String(t.id))?.bots ?? 0 : null,
        missing_results: resultsOk && t.status === "finished" && (counts.get(String(t.id)) ?? 0) > 0 && !withResults.has(String(t.id)),
      })),
    });
  } catch (e: any) {
    console.error("tournaments/list crash:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
