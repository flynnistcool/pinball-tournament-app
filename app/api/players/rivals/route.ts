// ⚔️ Erzfeind & Lieblingsgegner eines Profils (nur lesen).
// GET ?profileId=… → { ok, minDuels, minStreak, frequent[], even[], nemesis[], favorite[], streak[], qualified, profiles }
// Rechnung: lib/rivals.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn, fetchAllRows } from "@/lib/supabaseChunks";
import { loadStatsExclusions } from "@/lib/statsExclusions";
import { computeRivalStats, duelLog, pickRivals, RIVAL_MIN_DUELS, RIVAL_MIN_STREAK, type RivalRow } from "@/lib/rivals";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

type MpRow = {
  match_id: string;
  player_id: string;
  position: number | null;
  team: unknown;
  players: { profile_id: string | null } | null;
  matches: { created_at: string | null; machines: { name: string | null } | null; rounds: { number: number | null; format: string | null; tournament_id: string | null; tournaments: { format: string | null; name: string | null; created_at: string | null } | null } | null } | null;
};

export async function GET(req: Request) {
  const profileId = (new URL(req.url).searchParams.get("profileId") ?? "").trim();
  if (!profileId) return fail("profileId fehlt", 400);

  const sb = supabaseAdmin();

  // 1) Turnier-Teilnahmen dieses Profils
  const { data: myPlayers, error: pErr } = await fetchAllRows<{ id: string }>(() =>
    sb.from("players").select("id").eq("profile_id", profileId).order("id")
  );
  if (pErr) return fail(`Spieler laden fehlgeschlagen: ${pErr.message}`, 500);
  const myPlayerIds = myPlayers.map((p) => String(p.id));
  const empty = { ok: true, minDuels: RIVAL_MIN_DUELS, minStreak: RIVAL_MIN_STREAK, frequent: [], even: [], nemesis: [], favorite: [], streak: [], qualified: 0, profiles: {} };
  if (!myPlayerIds.length) return NextResponse.json(empty, { headers: NO_STORE });

  // 2) eigene Matches (nur mit Platz)
  const { data: myMps, error: mErr } = await fetchAllIn<{ match_id: string }>(myPlayerIds, (chunk) =>
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
  if (!matchIds.length) return NextResponse.json(empty, { headers: NO_STORE });

  // 3) alle Teilnehmer dieser Matches (+ Profil + Format der Runde)
  const { data: allMps, error: aErr } = await fetchAllIn<MpRow>(matchIds, (chunk) =>
    sb
      .from("match_players")
      .select("match_id, player_id, position, team, players!inner(profile_id), matches!inner(created_at, machines(name), rounds!inner(number, format, tournament_id, tournaments!inner(format, name, created_at)))")
      .in("match_id", chunk)
      .order("match_id")
      .order("player_id") as any
  );
  if (aErr) return fail(`Gegner laden fehlgeschlagen: ${aErr.message}`, 500);

  const rows: RivalRow[] = allMps.map((r) => ({
    match_id: String(r.match_id),
    profile_id: r.players?.profile_id ? String(r.players.profile_id) : null,
    position: typeof r.position === "number" ? r.position : null,
    team: r.team,
    format: r.matches?.rounds?.format || r.matches?.rounds?.tournaments?.format || null, // ältere Runden: Turnierformat
    at: r.matches?.created_at ?? null,
    tournamentId: r.matches?.rounds?.tournament_id ?? null,
  }));

  // 🔍 ?vs=<profileId>: Duell-Protokoll gegen diesen Gegner (zum Nachprüfen)
  const vs = (new URL(req.url).searchParams.get("vs") ?? "").trim();
  if (vs) {
    const info = new Map<string, { tournament: string; tournamentAt: string | null; machine: string | null; round: number | null }>();
    for (const r of allMps) {
      const rd = r.matches?.rounds;
      info.set(String(r.match_id), {
        tournament: String(rd?.tournaments?.name ?? "?"),
        tournamentAt: rd?.tournaments?.created_at ?? null,
        machine: r.matches?.machines?.name ?? null,
        round: rd?.number ?? null,
      });
    }
    const log = duelLog(profileId, vs, rows).map((e) => ({ ...e, ...info.get(e.matchId) }));
    return NextResponse.json({ ok: true, log }, { headers: NO_STORE });
  }

  // 4) rechnen (Bots + Platzhalter zählen nicht)
  const ex = await loadStatsExclusions(sb);
  const result = pickRivals(computeRivalStats(profileId, rows, ex.excludedProfileIds));

  // 5) Namen/Farben der genannten Gegner
  const ids = Array.from(
    new Set([...result.frequent, ...result.even, ...result.nemesis, ...result.favorite, ...result.streak].map((s) => s.profileId))
  );
  const profiles: Record<string, { name: string; icon: string | null; color: string | null }> = {};
  if (ids.length) {
    const { data: profs, error: prErr } = await sb.from("profiles").select("id, name, icon, color").in("id", ids);
    if (prErr) return fail(`Profile laden fehlgeschlagen: ${prErr.message}`, 500);
    for (const p of profs ?? []) {
      profiles[String(p.id)] = { name: String(p.name ?? "?"), icon: (p.icon ?? "").trim() || null, color: p.color ?? null };
    }
  }

  return NextResponse.json({ ok: true, minDuels: RIVAL_MIN_DUELS, minStreak: RIVAL_MIN_STREAK, ...result, profiles }, { headers: NO_STORE });
}
