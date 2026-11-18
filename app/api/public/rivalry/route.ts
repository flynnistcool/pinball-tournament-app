// ⚔️ Gegner-Duell-Hinweise für ein Turnier (öffentlich: TV + Handy + Admin).
// GET ?code=XXXX → { ok, insights: { "playerIdA|playerIdB": RivalryInsight }, pairs: { "…|…": PairState } }
// Rechnung: lib/rivals.ts (Duelle) + lib/rivalryInsights.ts (Hinweis je Paar).
// Teuer ist nur das Laden der Spielhistorie → Clients holen das nur EINMAL pro Runde,
// zusätzlich 60 s Zwischenspeicher hier (pro Server-Instanz).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn, fetchAllRows } from "@/lib/supabaseChunks";
import { loadStatsExclusions } from "@/lib/statsExclusions";
import { computeRivalStats, pairMachineStats, type PairMachineStat, type RivalRow, type RivalStat } from "@/lib/rivals";
import { machineKey } from "@/lib/machineStats";
import { buildInsights, buildPairStates, type PairState, type RivalryInsight } from "@/lib/rivalryInsights";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

const CACHE_MS = 60_000;
type PairMachine = Record<string, Record<string, PairMachineStat>>;
const cache = new Map<
  string,
  { at: number; key: string; insights: Record<string, RivalryInsight>; pairs: Record<string, PairState>; pairMachine: PairMachine }
>();

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
  const { data: t, error: tErr } = await sb.from("tournaments").select("id, format, location_id").eq("code", code).maybeSingle();
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
    return NextResponse.json(
      { ok: true, insights: hit.insights, pairs: hit.pairs, pairMachine: hit.pairMachine, cached: true },
      { headers: NO_STORE }
    );
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
  // ⚔️ Bilanz je Paar an jedem Flipper DIESER Location (Admin: aufgeklappter Spieler) – Fehler → leer
  const pairMachine = await loadPairMachine(sb, t.location_id ? String(t.location_id) : null, matchIds, rows, players, ex.excludedProfileIds).catch(
    () => ({} as PairMachine)
  );
  cache.set(code, { at: Date.now(), key, insights, pairs, pairMachine });
  return NextResponse.json({ ok: true, insights, pairs, pairMachine }, { headers: NO_STORE });
}

/** Flipper (Name) je Match – nur Matches an der Location des Turniers; dann Bilanz je Paar + Flipper */
async function loadPairMachine(
  sb: ReturnType<typeof supabaseAdmin>,
  locationId: string | null,
  matchIds: string[],
  rows: RivalRow[],
  players: { playerId: string; profileId: string }[],
  excluded: ReadonlySet<string>
): Promise<PairMachine> {
  if (!locationId || !matchIds.length) return {};
  const ma = await fetchAllIn<{ id: string; machine_id: string | null }>(matchIds, (chunk) =>
    sb.from("matches").select("id, machine_id").in("id", chunk).order("id")
  );
  if (ma.error) throw new Error(ma.error.message);
  const machineIds = Array.from(new Set(ma.data.map((m) => m.machine_id).filter(Boolean).map(String)));
  const mc = await fetchAllIn<{ id: string; name: string | null; tournament_id: string | null }>(machineIds, (chunk) =>
    sb.from("machines").select("id, name, tournament_id").in("id", chunk).order("id")
  );
  if (mc.error) throw new Error(mc.error.message);
  const tIds = Array.from(new Set(mc.data.map((m) => m.tournament_id).filter(Boolean).map(String)));
  const tl = await fetchAllIn<{ id: string; location_id: string | null }>(tIds, (chunk) =>
    sb.from("tournaments").select("id, location_id").in("id", chunk).order("id")
  );
  if (tl.error) throw new Error(tl.error.message);
  const here = new Set(tl.data.filter((x) => String(x.location_id ?? "") === locationId).map((x) => String(x.id)));
  const keyOfMachine = new Map(
    mc.data.filter((m) => m.tournament_id && here.has(String(m.tournament_id))).map((m) => [String(m.id), machineKey(m.name)])
  );
  const keyOfMatch = new Map(ma.data.map((m) => [String(m.id), m.machine_id ? keyOfMachine.get(String(m.machine_id)) ?? null : null]));
  return pairMachineStats(
    rows.map((r) => ({ ...r, machineKey: keyOfMatch.get(r.match_id) ?? null })),
    players,
    excluded
  );
}
