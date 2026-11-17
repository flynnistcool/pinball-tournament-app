// 🏅 Auszeichnungen eines Profils (nur lesen) – aus den beendeten Turnieren berechnet, keine eigene Tabelle.
// GET ?profileId=… → { ok, flawless: [{ tournamentId, name, at, format, wins, matches, mode }] }
// Rechnung: lib/flawless.ts (dieselbe wie bei der Live-Einblendung "Flawless Victory")

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn, fetchAllRows } from "@/lib/supabaseChunks";
import { flawlessMode, flawlessWinners, runCount } from "@/lib/flawless";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

export type FlawlessAward = {
  tournamentId: string;
  name: string;
  at: string | null;
  format: string;
  /** Siege gegen Gegner (Round the Pinball: Flipper) */
  wins: number;
  matches: number;
  mode: "wins" | "leads";
};

/** 🔍 ?all=1 → alle Flawless Victories aller Spieler (zum Nachprüfen der alten Turniere) */
async function allFlawless() {
  const sb = supabaseAdmin();
  const { data: tours, error: tErr } = await fetchAllRows<{
    id: string;
    name: string | null;
    created_at: string | null;
    format: string | null;
    status: string | null;
  }>(() => sb.from("tournaments").select("id, name, created_at, format, status").eq("status", "finished").order("id"));
  if (tErr) return fail(`Turniere laden fehlgeschlagen: ${tErr.message}`, 500);
  const done = tours.filter((t) => flawlessMode(t.format) !== "none");
  if (!done.length) return NextResponse.json({ ok: true, checked: 0, found: [] }, { headers: NO_STORE });
  const tIdList = done.map((t) => String(t.id));

  const { data: rounds, error: rErr } = await fetchAllIn<{ id: string; tournament_id: string }>(tIdList, (chunk) =>
    sb.from("rounds").select("id, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (rErr) return fail(`Runden laden fehlgeschlagen: ${rErr.message}`, 500);
  const tourOfRound = new Map(rounds.map((r) => [String(r.id), String(r.tournament_id)]));
  const { data: matches, error: mErr } = await fetchAllIn<{ id: string; round_id: string }>(
    rounds.map((r) => String(r.id)),
    (chunk) => sb.from("matches").select("id, round_id").in("round_id", chunk).order("id")
  );
  if (mErr) return fail(`Matches laden fehlgeschlagen: ${mErr.message}`, 500);
  const { data: mps, error: mpErr } = await fetchAllIn<{
    match_id: string;
    player_id: string;
    position: number | null;
    score: number | string | null;
  }>(
    matches.map((m) => String(m.id)),
    (chunk) =>
      sb.from("match_players").select("match_id, player_id, position, score").in("match_id", chunk).order("match_id").order("player_id")
  );
  if (mpErr) return fail(`Ergebnisse laden fehlgeschlagen: ${mpErr.message}`, 500);
  const { data: players, error: plErr } = await fetchAllIn<{ id: string; name: string | null }>(tIdList, (chunk) =>
    sb.from("players").select("id, name").in("tournament_id", chunk).order("id")
  );
  if (plErr) return fail(`Spieler laden fehlgeschlagen: ${plErr.message}`, 500);
  const nameOf = new Map(players.map((p) => [String(p.id), String(p.name ?? "?")]));

  const matchesByTour = new Map<string, { id: string }[]>();
  for (const m of matches) {
    const tid = tourOfRound.get(String(m.round_id)) ?? "";
    matchesByTour.set(tid, [...(matchesByTour.get(tid) ?? []), m]);
  }
  const mpsByMatch = new Map<string, typeof mps>();
  for (const mp of mps) mpsByMatch.set(String(mp.match_id), [...(mpsByMatch.get(String(mp.match_id)) ?? []), mp]);

  const found: { tournament: string; at: string | null; format: string; player: string; wins: number; matches: number }[] = [];
  for (const t of done) {
    const mode = flawlessMode(t.format);
    const tMatches = matchesByTour.get(String(t.id)) ?? [];
    const tMps = tMatches.flatMap((m) => mpsByMatch.get(String(m.id)) ?? []);
    for (const w of flawlessWinners({ matches: tMatches, match_players: tMps }, mode)) {
      found.push({
        tournament: String(t.name ?? "Turnier"),
        at: t.created_at,
        format: String(t.format ?? ""),
        player: nameOf.get(w.playerId) ?? "?",
        wins: runCount(w.run, mode),
        matches: w.run.played,
      });
    }
  }
  found.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return NextResponse.json({ ok: true, checked: done.length, found }, { headers: NO_STORE });
}

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("all") === "1") return allFlawless();
  const profileId = (new URL(req.url).searchParams.get("profileId") ?? "").trim();
  if (!profileId) return fail("profileId fehlt", 400);
  const sb = supabaseAdmin();

  // 1) Turnier-Teilnahmen dieses Profils
  const { data: myPlayers, error: pErr } = await fetchAllRows<{ id: string; tournament_id: string | null }>(() =>
    sb.from("players").select("id, tournament_id").eq("profile_id", profileId).order("id")
  );
  if (pErr) return fail(`Spieler laden fehlgeschlagen: ${pErr.message}`, 500);
  const myPlayerIds = new Set(myPlayers.map((p) => String(p.id)));
  const tIds = Array.from(new Set(myPlayers.map((p) => String(p.tournament_id ?? "")).filter(Boolean)));
  if (!tIds.length) return NextResponse.json({ ok: true, flawless: [] }, { headers: NO_STORE });

  // 2) nur beendete Turniere (Elimination zählt nicht)
  const { data: tours, error: tErr } = await fetchAllIn<{
    id: string;
    name: string | null;
    created_at: string | null;
    format: string | null;
    status: string | null;
  }>(tIds, (chunk) => sb.from("tournaments").select("id, name, created_at, format, status").in("id", chunk).order("id"));
  if (tErr) return fail(`Turniere laden fehlgeschlagen: ${tErr.message}`, 500);
  const done = tours.filter((t) => t.status === "finished" && flawlessMode(t.format) !== "none");
  if (!done.length) return NextResponse.json({ ok: true, flawless: [] }, { headers: NO_STORE });

  // 3) Runden → Matches → Teilnehmer dieser Turniere
  const { data: rounds, error: rErr } = await fetchAllIn<{ id: string; tournament_id: string }>(
    done.map((t) => String(t.id)),
    (chunk) => sb.from("rounds").select("id, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (rErr) return fail(`Runden laden fehlgeschlagen: ${rErr.message}`, 500);
  const tourOfRound = new Map(rounds.map((r) => [String(r.id), String(r.tournament_id)]));

  const { data: matches, error: mErr } = await fetchAllIn<{ id: string; round_id: string }>(
    rounds.map((r) => String(r.id)),
    (chunk) => sb.from("matches").select("id, round_id").in("round_id", chunk).order("id")
  );
  if (mErr) return fail(`Matches laden fehlgeschlagen: ${mErr.message}`, 500);
  const tourOfMatch = new Map(matches.map((m) => [String(m.id), tourOfRound.get(String(m.round_id)) ?? ""]));

  const { data: mps, error: mpErr } = await fetchAllIn<{
    match_id: string;
    player_id: string;
    position: number | null;
    score: number | string | null;
  }>(
    matches.map((m) => String(m.id)),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, position, score")
        .in("match_id", chunk)
        .order("match_id")
        .order("player_id")
  );
  if (mpErr) return fail(`Ergebnisse laden fehlgeschlagen: ${mpErr.message}`, 500);

  // 4) je Turnier: hat dieses Profil alles gewonnen?
  const flawless: FlawlessAward[] = [];
  for (const t of done) {
    const tid = String(t.id);
    const mode = flawlessMode(t.format);
    if (mode === "none") continue;
    const tMatches = matches.filter((m) => tourOfMatch.get(String(m.id)) === tid);
    const ids = new Set(tMatches.map((m) => String(m.id)));
    const tMps = mps.filter((mp) => ids.has(String(mp.match_id)));
    const winner = flawlessWinners({ matches: tMatches, match_players: tMps }, mode).find((w) =>
      myPlayerIds.has(w.playerId)
    );
    if (!winner) continue;
    flawless.push({
      tournamentId: tid,
      name: String(t.name ?? "Turnier"),
      at: t.created_at,
      format: String(t.format ?? ""),
      wins: runCount(winner.run, mode),
      matches: winner.run.played,
      mode,
    });
  }
  flawless.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));

  return NextResponse.json({ ok: true, flawless }, { headers: NO_STORE });
}
