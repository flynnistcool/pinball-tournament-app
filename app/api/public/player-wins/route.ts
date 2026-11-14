// Bisherige Matchsiege der Spieler eines Turniers (für die Matchsieg-Meilensteine).
// GET /api/public/player-wins?code=ABC123
// wins[profileId] = Anzahl Matches mit Platz 1 in ALLEN ANDEREN Turnieren (alle Formate).
// Die Siege im laufenden Turnier zählt die Seite selbst live dazu.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { isExcludedProfile, loadHumanMatchContext, loadStatsExclusions } from "@/lib/statsExclusions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  try {
    const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
    if (!code) return fail("Code fehlt", 400);
    const sb = supabaseAdmin();

    const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);

    const { data: cur, error: cErr } = await sb.from("players").select("profile_id").eq("tournament_id", t.id);
    if (cErr) return fail(`Spieler laden fehlgeschlagen: ${cErr.message}`, 500);
    const profileIds = Array.from(
      new Set((cur ?? []).map((p: { profile_id: string | null }) => p.profile_id).filter(Boolean).map(String))
    );
    if (!profileIds.length) return NextResponse.json({ ok: true, wins: {} });

    // alle Spieler-Einträge dieser Profile in anderen Turnieren
    const apRes = await fetchAllIn<{ id: string; profile_id: string; tournament_id: string }>(profileIds, (chunk) =>
      sb.from("players").select("id, profile_id, tournament_id").in("profile_id", chunk).order("id")
    );
    if (apRes.error) return fail(`Spielerverlauf laden fehlgeschlagen: ${apRes.error.message}`, 500);
    const others = apRes.data.filter((p) => String(p.tournament_id) !== String(t.id));
    const profileByPlayer = new Map(others.map((p) => [String(p.id), String(p.profile_id)]));

    // alle gewerteten Matches laden (nicht nur Siege): in Matches mit 🤖 Bots zählt der Platz nur unter Menschen
    const wRes = await fetchAllIn<{ match_id: string; player_id: string; position: number | null }>(
      others.map((p) => String(p.id)),
      (chunk) =>
        sb
          .from("match_players")
          .select("match_id, player_id, position")
          .in("player_id", chunk)
          .not("position", "is", null)
          .order("match_id")
          .order("player_id")
    );
    if (wRes.error) return fail(`Siege laden fehlgeschlagen: ${wRes.error.message}`, 500);

    const ex = await loadStatsExclusions(sb);
    const hc = await loadHumanMatchContext(sb, ex, Array.from(new Set(wRes.data.map((r) => String(r.match_id)))));

    const wins: Record<string, number> = {};
    for (const pid of profileIds) wins[pid] = 0;
    for (const w of wRes.data) {
      const pid = profileByPlayer.get(String(w.player_id));
      if (!pid) continue;
      if (hc.position(String(w.match_id), String(w.player_id), w.position) === 1) wins[pid] = (wins[pid] ?? 0) + 1;
    }
    // 🤖/🚫 Bots + Platzhalter: keine Matchsieg-Meilensteine
    const excluded = profileIds.filter((id) => isExcludedProfile(ex, id));
    return NextResponse.json({ ok: true, wins, excluded });
  } catch (e: unknown) {
    console.error("player-wins crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
