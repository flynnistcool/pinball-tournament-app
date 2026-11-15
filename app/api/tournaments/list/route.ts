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
    // 👥 Namen je Turnier (Archiv: "wer hat mitgespielt")
    const names = new Map<string, { id: string; name: string; kind: "human" | "placeholder" | "bot" }[]>();
    let countsOk = false;
    try {
      const ids = tournaments.map((t: any) => String(t.id));
      const pRes = await fetchAllIn<{ id: string; tournament_id: string; profile_id: string | null; name: string | null }>(ids, (chunk) =>
        sb.from("players").select("id, tournament_id, profile_id, name").in("tournament_id", chunk).order("id")
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
          const kind = prof && ex.botProfileIds.has(prof) ? "bot" : prof && ex.placeholderProfileIds.has(prof) ? "placeholder" : "human";
          if (kind === "bot") c.bots++;
          else if (kind === "placeholder") c.placeholders++;
          else c.humans++;
          split.set(k, c);
          const nl = names.get(k) ?? [];
          nl.push({ id: String(p.id), name: String(p.name ?? "?"), kind });
          names.set(k, nl);
        }
        countsOk = true;
      }
    } catch (e) {
      console.error("tournaments/list player count crash:", e);
    }

    // ⚠️ beendete Turniere OHNE gespeicherte Auswertung (tournament_results) erkennen
    const withResults = new Set<string>();
    const rankOf = new Map<string, number>(); // player_id → Endplatz
    let resultsOk = false;
    try {
      const finishedIds = tournaments.filter((t: any) => t.status === "finished").map((t: any) => String(t.id));
      const rRes = await fetchAllIn<{ tournament_id: string; player_id: string; final_rank: number | null }>(finishedIds, (chunk) =>
        sb
          .from("tournament_results")
          .select("tournament_id, player_id, final_rank")
          .in("tournament_id", chunk)
          .order("tournament_id")
          .order("player_id")
      );
      if (!rRes.error) {
        for (const r of rRes.data) {
          withResults.add(String(r.tournament_id));
          if (typeof r.final_rank === "number") rankOf.set(String(r.player_id), r.final_rank);
        }
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
        // 👥 Teilnehmer: beendet → nach Endplatz, sonst alphabetisch
        players: countsOk
          ? (names.get(String(t.id)) ?? [])
              .map((p) => ({ name: p.name, kind: p.kind, rank: rankOf.get(p.id) ?? null }))
              .sort(
                (a, b) =>
                  (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name, "de", { sensitivity: "base" })
              )
          : null,
      })),
    });
  } catch (e: any) {
    console.error("tournaments/list crash:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
