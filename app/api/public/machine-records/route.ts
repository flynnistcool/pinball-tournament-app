// Bisherige Flipper-Rekorde für den Highscore-Jubel am Infobildschirm (/s/<code>/tv).
// GET /api/public/machine-records?code=ABC123
// Rekorde = bester Score je Flipper-NAME an der Location des Turniers, aus allen anderen
// BEENDETEN Turnieren dort (ohne Timeplay/DYP), dazu der Highscore der letzten 30 Tage
// und persönliche Bestwerte der Turnierspieler.
// enabled=false, wenn das Turnier keine Location hat oder selbst Timeplay/DYP ist.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { buildPriorRecords } from "@/lib/recordWatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Timeplay (auf Zeit) und DYP (nur Platzierungen, teils Kicker/Arcade) zählen nicht
const NOT_COUNTED_FORMATS = new Set(["timeplay", "dyp", "dyp_round_robin"]);
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  try {
    const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
    if (!code) return fail("Code fehlt", 400);
    const sb = supabaseAdmin();

    const { data: t, error: tErr } = await sb
      .from("tournaments")
      .select("id, location_id, format")
      .eq("code", code)
      .maybeSingle();
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);

    const empty = { ok: true, enabled: false, records: {}, monthly: {}, personal: {} };
    if (!t.location_id || NOT_COUNTED_FORMATS.has(String(t.format ?? ""))) return NextResponse.json(empty);

    // Profile der aktuellen Spieler (für persönliche Bestwerte)
    const { data: curPlayers, error: cpErr } = await sb
      .from("players")
      .select("profile_id")
      .eq("tournament_id", t.id);
    if (cpErr) return fail(`Spieler laden fehlgeschlagen: ${cpErr.message}`, 500);
    const personalFor = Array.from(
      new Set((curPlayers ?? []).map((p: { profile_id: string | null }) => p.profile_id).filter(Boolean).map(String))
    );

    const { data: others, error: oErr } = await sb
      .from("tournaments")
      .select("id, format, created_at")
      .eq("location_id", t.location_id)
      .eq("status", "finished")
      .neq("id", t.id);
    if (oErr) return fail(`Turniere laden fehlgeschlagen: ${oErr.message}`, 500);
    const counted = (others ?? []).filter(
      (o: { format: string | null }) => !NOT_COUNTED_FORMATS.has(String(o.format ?? ""))
    ) as { id: string; created_at: string | null }[];
    const tIds = counted.map((o) => String(o.id));
    const since = Date.now() - MONTH_MS;
    const recentTournamentIds = counted
      .filter((o) => o.created_at && new Date(o.created_at).getTime() >= since)
      .map((o) => String(o.id));
    if (!tIds.length) return NextResponse.json({ ...empty, enabled: true });

    const maRes = await fetchAllIn<{ id: string; name: string | null; tournament_id: string | null }>(tIds, (chunk) =>
      sb.from("machines").select("id, name, tournament_id").in("tournament_id", chunk).order("id")
    );
    if (maRes.error) return fail(`Flipper laden fehlgeschlagen: ${maRes.error.message}`, 500);

    const mRes = await fetchAllIn<{ id: string; machine_id: string | null }>(
      maRes.data.map((m) => String(m.id)),
      (chunk) => sb.from("matches").select("id, machine_id").in("machine_id", chunk).order("id")
    );
    if (mRes.error) return fail(`Matches laden fehlgeschlagen: ${mRes.error.message}`, 500);

    const mpRes = await fetchAllIn<{ match_id: string; player_id: string; score: number | string | null }>(
      mRes.data.map((m) => String(m.id)),
      (chunk) =>
        sb
          .from("match_players")
          .select("match_id, player_id, score")
          .in("match_id", chunk)
          .not("score", "is", null)
          .order("match_id")
          .order("player_id")
    );
    if (mpRes.error) return fail(`Scores laden fehlgeschlagen: ${mpRes.error.message}`, 500);

    const pRes = await fetchAllIn<{ id: string; name: string | null; profile_id: string | null }>(
      Array.from(new Set(mpRes.data.map((m) => String(m.player_id)))),
      (chunk) => sb.from("players").select("id, name, profile_id").in("id", chunk).order("id")
    );
    if (pRes.error) return fail(`Spieler laden fehlgeschlagen: ${pRes.error.message}`, 500);

    const prior = buildPriorRecords({
      machines: maRes.data,
      matches: mRes.data,
      matchPlayers: mpRes.data,
      players: pRes.data,
      personalFor,
      recentTournamentIds,
    });
    return NextResponse.json({ ok: true, enabled: true, ...prior });
  } catch (e: unknown) {
    console.error("machine-records crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
