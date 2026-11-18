// ⚔️ Gegner-Duell-Hinweise für ein Turnier (öffentlich: TV + Handy + Admin).
// GET ?code=XXXX → { ok, insights: { "playerIdA|playerIdB": RivalryInsight }, pairs: { "…|…": PairState } }
// Rechnung: lib/rivals.ts (Duelle) + lib/rivalryInsights.ts (Hinweis je Paar).
// Teuer ist nur das Laden der Spielhistorie → Clients holen das nur EINMAL pro Runde,
// zusätzlich 60 s Zwischenspeicher hier (pro Server-Instanz).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn, fetchAllRows } from "@/lib/supabaseChunks";
import { loadStatsExclusions } from "@/lib/statsExclusions";
import { computeRivalStats, type RivalRow, type RivalStat } from "@/lib/rivals";
import { buildInsights, buildPairStates, type PairState, type RivalryInsight } from "@/lib/rivalryInsights";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; key: string; insights: Record<string, RivalryInsight>; pairs: Record<string, PairState> }>();

type MpRow = {
  match_id: string;
  position: number | null;
  team: unknown;
  players: { profile_id: string | null } | null;
  matches: {
    created_at: string | null;
    rounds: { format: string | null; tournament_id: string | null; tournaments: { format: string | null } | null } | null;
  } | null;
};

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return fail("code fehlt", 400);

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id, format").eq("code", code).maybeSingle();
  if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
  if (!t) return fail("Turnier nicht gefunden", 404);

  // DYP: Teams → keine Duell-Hinweise
  if (String(t.format ?? "") === "dyp_round_robin") return NextResponse.json({ ok: true, insights: {}, pairs: {} }, { headers: NO_STORE });

  // Spieler dieses Turniers (ohne 🤖 Bots – Testprofile bekommen Duell-Hinweise, zählen aber in keiner Statistik)
  const ex = await loadStatsExclusions(sb);
  const { data: tPlayers, error: pErr } = await sb.from("players").select("id, profile_id").eq("tournament_id", t.id);
  if (pErr) return fail(`Spieler laden fehlgeschlagen: ${pErr.message}`, 500);
  const players = (tPlayers ?? [])
    .filter((p) => p.profile_id && !ex.botProfileIds.has(String(p.profile_id)))
    .map((p) => ({ playerId: String(p.id), profileId: String(p.profile_id) }));
  if (players.length < 2) return NextResponse.json({ ok: true, insights: {}, pairs: {} }, { headers: NO_STORE });

  // Zwischenspeicher: gleiche Spieler + gleiche Zahl gewerteter Matches → gleiches Ergebnis
  const { count: placed } = await sb
    .from("match_players")
    .select("match_id, players!inner(tournament_id)", { count: "exact", head: true })
    .eq("players.tournament_id", t.id)
    .not("position", "is", null);
  const key = `${players.map((p) => p.playerId).sort().join(",")}#${placed ?? "?"}`;
  const hit = cache.get(code);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json({ ok: true, insights: hit.insights, pairs: hit.pairs, cached: true }, { headers: NO_STORE });
  }

  const profileIds = Array.from(new Set(players.map((p) => p.profileId)));

  // 1) alle Turnier-Teilnahmen dieser Profile (über alle Turniere)
  const { data: allPlayers, error: apErr } = await fetchAllIn<{ id: string }>(profileIds, (chunk) =>
    sb.from("players").select("id").in("profile_id", chunk).order("id")
  );
  if (apErr) return fail(`Spielhistorie laden fehlgeschlagen: ${apErr.message}`, 500);

  // 2) deren Matches mit Platz
  const { data: myMps, error: mErr } = await fetchAllIn<{ match_id: string }>(
    allPlayers.map((p) => String(p.id)),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id")
        .in("player_id", chunk)
        .not("position", "is", null)
        .order("match_id")
        .order("player_id")
  );
  if (mErr) return fail(`Matches laden fehlgeschlagen: ${mErr.message}`, 500);
  const matchIds = Array.from(new Set(myMps.map((r) => String(r.match_id))));

  // 3) alle Teilnehmer dieser Matches
  const { data: allMps, error: aErr } = await fetchAllIn<MpRow>(matchIds, (chunk) =>
    sb
      .from("match_players")
      .select(
        "match_id, position, team, players!inner(profile_id), matches!inner(created_at, rounds!inner(format, tournament_id, tournaments!inner(format)))"
      )
      .in("match_id", chunk)
      .order("match_id")
      .order("player_id") as any
  );
  if (aErr) return fail(`Duelle laden fehlgeschlagen: ${aErr.message}`, 500);

  const rows: RivalRow[] = allMps.map((r) => ({
    match_id: String(r.match_id),
    profile_id: r.players?.profile_id ? String(r.players.profile_id) : null,
    position: typeof r.position === "number" ? r.position : null,
    team: r.team,
    format: r.matches?.rounds?.format || r.matches?.rounds?.tournaments?.format || null,
    at: r.matches?.created_at ?? null,
    tournamentId: r.matches?.rounds?.tournament_id ?? null,
  }));

  const statsByProfile = new Map<string, RivalStat[]>();
  for (const prof of profileIds) statsByProfile.set(prof, computeRivalStats(prof, rows, ex.excludedProfileIds));

  const insights = buildInsights(players, statsByProfile);
  const pairs = buildPairStates(players, statsByProfile);
  cache.set(code, { at: Date.now(), key, insights, pairs });
  return NextResponse.json({ ok: true, insights, pairs }, { headers: NO_STORE });
}
