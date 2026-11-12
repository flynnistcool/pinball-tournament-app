// Bisherige Matchsiege der Spieler eines Turniers (für die Matchsieg-Meilensteine).
// GET /api/public/player-wins?code=ABC123
// wins[profileId] = Anzahl Matches mit Platz 1 in ALLEN ANDEREN Turnieren (alle Formate).
// Die Siege im laufenden Turnier zählt die Seite selbst live dazu.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";

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

    const wRes = await fetchAllIn<{ match_id: string; player_id: string }>(
      others.map((p) => String(p.id)),
      (chunk) =>
        sb
          .from("match_players")
          .select("match_id, player_id")
          .in("player_id", chunk)
          .eq("position", 1)
          .order("match_id")
          .order("player_id")
    );
    if (wRes.error) return fail(`Siege laden fehlgeschlagen: ${wRes.error.message}`, 500);

    const wins: Record<string, number> = {};
    for (const pid of profileIds) wins[pid] = 0;
    for (const w of wRes.data) {
      const pid = profileByPlayer.get(String(w.player_id));
      if (pid) wins[pid] = (wins[pid] ?? 0) + 1;
    }
    return NextResponse.json({ ok: true, wins });
  } catch (e: unknown) {
    console.error("player-wins crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
