// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { isExcludedProfile, loadHumanMatchContext, loadStatsExclusions } from "@/lib/statsExclusions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  position: number | null;
  matches: {
    id: string;
    created_at?: string | null;
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
        match_id,
        player_id,
        position,
        matches!inner(
          id,
          created_at,
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

    // 🛡️ Statistik-Schutz: Siege/Plätze nur gegen Menschen; Matches nur gegen Bots zählen nicht
    // (Bot-/Platzhalter-Profil selbst: unverändert)
    const ex = await loadStatsExclusions(sb);
    const selfExcluded = isExcludedProfile(ex, profileId);
    const hc = await loadHumanMatchContext(
      sb,
      ex,
      selfExcluded ? [] : Array.from(new Set(((data ?? []) as any[]).map((r) => String(r.match_id))))
    );
    const rows = (((data ?? []) as any[])
      .map((r) => {
        if (selfExcluded) return r;
        const pos = hc.position(String(r.match_id), String(r.player_id), r.position);
        if (r.position != null && pos == null) return null; // nur gegen Bots gespielt
        return { ...r, position: pos };
      })
      .filter(Boolean)) as Row[];


    // Aggregation pro (LocationNameNormalized + MachineNameNormalized)
    // Warum so?
    // - Vor der Sparkline hattest du "Maschine + Location" praktisch über die NAMEN aggregiert.
    // - In deiner DB können (oder konnten) mehrere location_id die gleiche location.name haben.
    //   Wenn wir über location_id gruppieren, sieht man dann "doppelte" Einträge.
    // - Darum: wir machen es wie vorher – aber robust (trim + whitespace + lowercase).
    const norm = (s: any) => String(s ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

    const map: Record<
      string,
      {
        locationId: string | null;
        locationName: string | null;
        machineId: string | null;
        machineName: string;
        matchesPlayed: number;
        wins: number;
        posSum: number;
        posCount: number;
        // Sparkline: cumulative Winrate (0–1) pro Match in Zeit-Reihenfolge
        timeline: { t: number; win: number }[];
      }
    > = {};

    for (const r of rows) {
      const match = r.matches;
      const machineNameRaw = match?.machines?.name ?? "";
      const machineName = String(machineNameRaw ?? "").trim();
      if (!machineName) continue;

      const locationId = match?.rounds?.tournaments?.location_id ?? null;
      const locationNameRaw = match?.rounds?.tournaments?.locations?.name ?? "Unbekannt";
      const locationName = String(locationNameRaw ?? "").trim() || "Unbekannt";

      const key = `${norm(locationName)}__${norm(machineName)}`;

      if (!map[key]) {
        map[key] = {
          locationId,
          locationName,
          // machineId ist hier NICHT die Gruppierung (kann wechseln). Wir geben den zuletzt gesehenen mit.
          machineId: match?.machines?.id ?? match?.machine_id ?? null,
          machineName,
          matchesPlayed: 0,
          wins: 0,
          posSum: 0,
          posCount: 0,
          timeline: [],
        };
      } else {
        // falls wir später einen besseren Namen/LocationName sehen
        if (!map[key].locationName && locationName) map[key].locationName = locationName;
        // keep a representative machineId
        if (!map[key].machineId && (match?.machines?.id || match?.machine_id)) {
          map[key].machineId = match?.machines?.id ?? match?.machine_id ?? null;
        }
      }

      const pos = typeof r.position === "number" ? r.position : null;
      // nur gewertete Matches (Platz vergeben) zählen – offene Matches sind weder Sieg noch Niederlage
      if (pos != null) map[key].matchesPlayed += 1;
      if (pos != null) {
        map[key].posSum += pos;
        map[key].posCount += 1;
        if (pos === 1) map[key].wins += 1;
      }

      // Sparkline-Punkt: pro gespieltem Match (wenn position vorhanden)
      if (pos != null) {
        const t = match?.created_at ? new Date(match.created_at as any).getTime() : 0;
        map[key].timeline.push({ t, win: pos === 1 ? 1 : 0 });
      }
    }

    const machines = Object.values(map)
      .map((x) => {
        // timeline sortieren
        const tl = (x.timeline ?? []).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
        let w = 0;
        let n = 0;
        const winRateSeries: number[] = [];
        for (const p of tl) {
          n += 1;
          w += p.win ? 1 : 0;
          winRateSeries.push(n > 0 ? w / n : 0);
        }
        // auf max 30 Punkte begrenzen (UI)
        const series = winRateSeries.length > 30 ? winRateSeries.slice(-30) : winRateSeries;

        return {
          locationId: x.locationId,
          locationName: x.locationName,
          machineId: x.machineId,
          machineName: x.machineName,
          matchesPlayed: x.matchesPlayed,
          wins: x.wins,
          // ✅ UI erwartet 0–1
          winRate: x.matchesPlayed > 0 ? x.wins / x.matchesPlayed : null,
          avgPosition: x.posCount > 0 ? x.posSum / x.posCount : null,
          // 🆕 Sparkline
          winRateSeries: series,
        };
      })
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
