// 🕹️ Arcade-Fortschritt eines Spielers: geschaffte Modi (für 🔒 Freischalten) + bester Lauf je Modus (Profil).
// GET /api/arcade/progress?profileId=...
//  -> { ok: true, cleared: string[], best: { [mode]: { wins, stagesTotal, livesLeft, status, at } }, played: { [mode]: n }, clears: { [mode]: n } }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { loadArcadeRuns } from "@/lib/arcadeServer";
import { compareArcadeRuns } from "@/lib/arcade";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  try {
    const profileId = String(new URL(req.url).searchParams.get("profileId") ?? "").trim();
    if (!profileId) return NextResponse.json({ ok: false, error: "profileId fehlt" }, { status: 400 });
    const { runs, error } = await loadArcadeRuns(supabaseAdmin(), { profileId });
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
    const cleared = Array.from(new Set(runs.filter((r) => r.status === "cleared").map((r) => r.mode)));
    const bestRun = new Map<string, (typeof runs)[number]>();
    const played: Record<string, number> = {};
    const clears: Record<string, number> = {};
    for (const r of runs) {
      played[r.mode] = (played[r.mode] ?? 0) + 1;
      if (r.status === "cleared") clears[r.mode] = (clears[r.mode] ?? 0) + 1;
      const cur = bestRun.get(r.mode);
      if (!cur || compareArcadeRuns(r, cur) < 0) bestRun.set(r.mode, r);
    }
    const best = Object.fromEntries(
      Array.from(bestRun.entries()).map(([mode, r]) => [
        mode,
        { wins: r.wins, stagesTotal: r.stagesTotal, livesLeft: r.livesLeft, status: r.status, at: r.at },
      ])
    );
    return NextResponse.json({ ok: true, cleared, best, played, clears }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("arcade/progress crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
