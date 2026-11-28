// 📅 Tages-Challenge: Tages-Ranglisten der letzten 14 Tage (je Tag + Location – dort hatten alle dieselben Gegner/Flipper).
// GET /api/arcade/daily
//  -> { ok: true, today, days: [{ day, locationId, locationName, rows: [{ playerName, wins, stagesTotal, status, livesLeft, margin, at }] }] }
// Reihenfolge: weiter gekommen zuerst, dann deutlicher gewonnen (Summe "mein Score ÷ Bot-Score"), dann früher.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { loadArcadeRuns } from "@/lib/arcadeServer";
import { berlinDay, compareDailyRuns, type ArcadeRun } from "@/lib/arcade";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { runs, error } = await loadArcadeRuns(sb, { mode: "daily" });
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
    const today = berlinDay(new Date());
    const since = berlinDay(new Date(Date.now() - 14 * 86400_000));
    const groups = new Map<string, ArcadeRun[]>();
    for (const r of runs) {
      if (!r.day || r.day < since) continue;
      const k = `${r.day}|${r.locationId ?? ""}`;
      const list = groups.get(k) ?? [];
      list.push(r);
      groups.set(k, list);
    }
    const locIds = Array.from(new Set(runs.map((r) => r.locationId).filter(Boolean) as string[]));
    const { data: locs } = locIds.length ? await sb.from("locations").select("id, name").in("id", locIds) : { data: [] };
    const locName = new Map(((locs ?? []) as { id: string; name: string | null }[]).map((l) => [String(l.id), String(l.name ?? "")]));
    const days = Array.from(groups.entries())
      .map(([k, list]) => {
        const [day, locationId] = k.split("|");
        return {
          day,
          locationId,
          locationName: locName.get(locationId) ?? "",
          rows: [...list].sort(compareDailyRuns).map((r) => ({
            playerName: r.playerName,
            wins: r.wins,
            stagesTotal: r.stagesTotal,
            status: r.status,
            livesLeft: r.livesLeft,
            margin: r.margin ?? 0,
            at: r.at,
          })),
        };
      })
      .sort((a, b) => b.day.localeCompare(a.day) || a.locationName.localeCompare(b.locationName));
    return NextResponse.json({ ok: true, today, days }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("arcade/daily crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
