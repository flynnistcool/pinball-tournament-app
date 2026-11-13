// Öffentliche Daten für die Spieler-Sammelkarten am Infobildschirm (/s/<code>/tv).
// GET /api/public/player-cards?code=ABC123
// Liefert je Turnierspieler: Avatar/Icon/Farbe, Elo (+ Rang im Turnier), Turniere/Siege,
// Matches/Siegquote (über ALLE Turniere), Lieblingsflipper, beste Flipper und Bestscore
// (nur an der Location des Turniers; ohne Location über alle Turniere).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { buildPlayerCards, type CardInput, type CardProfile } from "@/lib/playerCards";

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

    const { data: t, error: tErr } = await sb
      .from("tournaments")
      .select("id, location_id")
      .eq("code", code)
      .maybeSingle();
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);

    const { data: tPlayers, error: pErr } = await sb
      .from("players")
      .select("id, name, profile_id")
      .eq("tournament_id", t.id)
      .order("created_at");
    if (pErr) return fail(`Spieler laden fehlgeschlagen: ${pErr.message}`, 500);
    const tournamentPlayers = (tPlayers ?? []) as CardInput["tournamentPlayers"];

    const profileIds = Array.from(
      new Set(tournamentPlayers.map((p) => p.profile_id).filter((x): x is string => !!x).map(String))
    );

    let profiles: CardProfile[] = [];
    let allPlayers: CardInput["allPlayers"] = [];
    let matchPlayers: CardInput["matchPlayers"] = [];
    let matches: CardInput["matches"] = [];
    let machines: CardInput["machines"] = [];
    let results: CardInput["results"] = [];
    let locationTournamentIds: string[] | null = null;

    // aktive Flipper dieses Turniers (nur diese erscheinen bei Lieblings-/Bester Flipper und Bestscore)
    const { data: curMachines, error: cmErr } = await sb
      .from("machines")
      .select("name, active")
      .eq("tournament_id", t.id);
    if (cmErr) return fail(`Flipper laden fehlgeschlagen: ${cmErr.message}`, 500);
    const activeMachineNames = (curMachines ?? [])
      .filter((m: { active: boolean | null }) => m.active !== false)
      .map((m: { name: string | null }) => String(m.name ?? "").trim())
      .filter(Boolean);

    if (profileIds.length) {
      const prRes = await fetchAllIn<CardProfile>(profileIds, (chunk) =>
        sb.from("profiles").select("id, name, avatar_url, icon, color, rating").in("id", chunk).order("id")
      );
      if (prRes.error) return fail(`Profile laden fehlgeschlagen: ${prRes.error.message}`, 500);
      profiles = prRes.data;

      const apRes = await fetchAllIn<CardInput["allPlayers"][number]>(profileIds, (chunk) =>
        sb.from("players").select("id, profile_id, tournament_id").in("profile_id", chunk).order("id")
      );
      if (apRes.error) return fail(`Spielerverlauf laden fehlgeschlagen: ${apRes.error.message}`, 500);
      allPlayers = apRes.data;
      const allPlayerIds = allPlayers.map((p) => String(p.id));

      // Turniere an derselben Location (für Lieblings-/Bester Flipper und Bestscore)
      if (t.location_id) {
        const tIds = Array.from(new Set(allPlayers.map((p) => String(p.tournament_id))));
        const tlRes = await fetchAllIn<{ id: string; location_id: string | null }>(tIds, (chunk) =>
          sb.from("tournaments").select("id, location_id").in("id", chunk).order("id")
        );
        if (tlRes.error) return fail(`Turniere laden fehlgeschlagen: ${tlRes.error.message}`, 500);
        locationTournamentIds = tlRes.data
          .filter((x) => String(x.location_id ?? "") === String(t.location_id))
          .map((x) => String(x.id));
      }

      const [mpRes, resRes] = await Promise.all([
        fetchAllIn<CardInput["matchPlayers"][number]>(allPlayerIds, (chunk) =>
          sb
            .from("match_players")
            .select("match_id, player_id, position, score")
            .in("player_id", chunk)
            .order("match_id")
            .order("player_id")
        ),
        fetchAllIn<CardInput["results"][number]>(allPlayerIds, (chunk) =>
          sb
            .from("tournament_results")
            .select("tournament_id, player_id, final_rank, super_final_rank")
            .in("player_id", chunk)
            .order("tournament_id")
            .order("player_id")
        ),
      ]);
      if (mpRes.error) return fail(`Matches laden fehlgeschlagen: ${mpRes.error.message}`, 500);
      matchPlayers = mpRes.data;
      // Ergebnisse sind nur für Turniersiege nötig – fehlen sie, zählen wir 0 statt abzubrechen
      if (resRes.error) console.error("player-cards results error:", resRes.error);
      else results = resRes.data;

      const matchIds = Array.from(new Set(matchPlayers.map((m) => String(m.match_id))));
      const mRes = await fetchAllIn<CardInput["matches"][number]>(matchIds, (chunk) =>
        sb.from("matches").select("id, machine_id").in("id", chunk).order("id")
      );
      if (mRes.error) return fail(`Matches laden fehlgeschlagen: ${mRes.error.message}`, 500);
      matches = mRes.data;

      const machineIds = Array.from(
        new Set(matches.map((m) => m.machine_id).filter((x): x is string => !!x).map(String))
      );
      const maRes = await fetchAllIn<CardInput["machines"][number]>(machineIds, (chunk) =>
        sb.from("machines").select("id, name, icon_emoji").in("id", chunk).order("id")
      );
      if (maRes.error) return fail(`Flipper laden fehlgeschlagen: ${maRes.error.message}`, 500);
      machines = maRes.data;
    }

    const cards = buildPlayerCards({
      tournamentPlayers,
      profiles,
      allPlayers,
      matchPlayers,
      matches,
      machines,
      results,
      locationTournamentIds,
      activeMachineNames,
    });
    return NextResponse.json({ ok: true, cards });
  } catch (e: unknown) {
    console.error("player-cards crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
