// 🏆 Arcade-Rangliste + 🏛️ Hall of Fame (nur Modi mit Rangliste: Easy … Insane, Klassik-Rush, Monster-Rush).
// GET /api/arcade/leaderboard
//  -> { ok: true, modes: [{ mode, rows: [{ profileId, playerName, wins, stagesTotal, livesLeft, livesStart, status, at, runs }],
//                          hallOfFame: [{ profileId, playerName, at }] }] }
// Rangliste: bester Lauf je Spieler – mehr Stufen (Anteil) zuerst, dann mehr übrige Leben, dann früher.
// Hall of Fame: wer den Modus geschafft hat, in der Reihenfolge des ERSTEN Schaffens.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { loadArcadeRuns } from "@/lib/arcadeServer";
import { ARCADE_MODES, compareArcadeRuns, type ArcadeRun } from "@/lib/arcade";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const { runs, error } = await loadArcadeRuns(supabaseAdmin());
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
    const modes = ARCADE_MODES.filter((m) => m.ranked).map((m) => {
      const mine = runs.filter((r) => r.mode === m.mode);
      const bestBy = new Map<string, ArcadeRun & { runs: number }>();
      for (const r of mine) {
        const cur = bestBy.get(r.profileId);
        const n = (cur?.runs ?? 0) + 1;
        if (!cur || compareArcadeRuns(r, cur) < 0) bestBy.set(r.profileId, { ...r, runs: n });
        else bestBy.set(r.profileId, { ...cur, runs: n });
      }
      const rows = Array.from(bestBy.values())
        .sort(compareArcadeRuns)
        .map((r) => ({
          profileId: r.profileId,
          playerName: r.playerName,
          wins: r.wins,
          stagesTotal: r.stagesTotal,
          livesLeft: r.livesLeft,
          livesStart: r.livesStart,
          status: r.status,
          at: r.at,
          runs: r.runs,
          code: r.code,
        }));
      const firstClear = new Map<string, ArcadeRun>();
      for (const r of mine.filter((x) => x.status === "cleared").sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")))) {
        if (!firstClear.has(r.profileId)) firstClear.set(r.profileId, r);
      }
      const hallOfFame = Array.from(firstClear.values()).map((r) => ({ profileId: r.profileId, playerName: r.playerName, at: r.at, stagesTotal: r.stagesTotal }));
      return { mode: m.mode, rows, hallOfFame };
    });
    return NextResponse.json({ ok: true, modes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("arcade/leaderboard crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
