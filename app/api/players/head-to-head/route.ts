// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";


export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store" },
  });
}

function emptyPayload(profileAId: string | null, profileBId: string | null) {
  return {
    ok: true,
    profileAId,
    profileBId,
    matches: {
      oneVsOne: { count: 0, aWins: 0, bWins: 0, draws: 0 },
      // togetherAny: alle Matches, in denen beide vorkommen (auch mit anderen)
      togetherAny: { count: 0, aBeatsB: 0, bBeatsA: 0, draws: 0, aFirsts: 0, bFirsts: 0 },
    },
    tournaments: {
      // oneVsOneOnly: Turniere, in denen NUR diese zwei Profile teilgenommen haben
      oneVsOneOnly: { count: 0, aWins: 0, bWins: 0, draws: 0, aFirsts: 0, bFirsts: 0 },
      // togetherAny: Turniere, in denen beide teilgenommen haben (auch wenn weitere Spieler dabei waren)
      togetherAny: { count: 0, aWins: 0, bWins: 0, draws: 0, aFirsts: 0, bFirsts: 0 },
    },
    _aliases: {
      matches: { together: "matches.togetherAny" },
      tournaments: {
        oneVsOne: "tournaments.oneVsOneOnly",
        together: "tournaments.togetherAny",
      },
    },
  };
}

function cmp(a: number | null, b: number | null) {
  if (a == null || b == null) return 0;
  if (a < b) return -1; // A besser (kleinere Position/Rank)
  if (b < a) return 1;  // B besser
  return 0;
}

function numOrNull(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const profileAId: string | null =
    body?.profileAId ?? body?.profileA ?? body?.a ?? null;
  const profileBId: string | null =
    body?.profileBId ?? body?.profileB ?? body?.b ?? null;

  if (!profileAId || !profileBId || profileAId === profileBId) {
    return noStoreJson(
      {
        ok: false,
        error:
          "profileAId und profileBId müssen gesetzt sein (und verschieden).",
      },
      { status: 400 }
    );
  }

  const payload = emptyPayload(profileAId, profileBId);

  // ✅ Wichtig: Ein Profil hat pro Turnier eine players-Zeile.
  // match_players referenziert players.id (nicht profiles.id).
  const { data: pMap, error: pErr } = await sb
    .from("players")
    .select("id, profile_id, tournament_id")
    .in("profile_id", [profileAId, profileBId]);

  if (pErr) return noStoreJson({ ok: false, error: pErr.message }, { status: 500 });

  const aPlayerIds = (pMap ?? [])
    .filter((p) => String(p.profile_id) === String(profileAId))
    .map((p) => String(p.id));

  const bPlayerIds = (pMap ?? [])
    .filter((p) => String(p.profile_id) === String(profileBId))
    .map((p) => String(p.id));

  if (aPlayerIds.length === 0 || bPlayerIds.length === 0) {
    return noStoreJson(payload);
  }

  const unionIds = Array.from(new Set([...aPlayerIds, ...bPlayerIds]));

  // ---- Matches: Head-to-Head ----
  const { data: unionMp, error: mp0Err } = await sb
    .from("match_players")
    .select("match_id, player_id")
    .in("player_id", unionIds);

  if (mp0Err) {
    return noStoreJson({ ok: false, error: mp0Err.message }, { status: 500 });
  }

  const seen = new Map<string, { hasA: boolean; hasB: boolean }>();
  for (const r of unionMp ?? []) {
    const mid = String(r.match_id);
    const pid = r.player_id == null ? null : String(r.player_id);
    if (!mid || !pid) continue;

    if (!seen.has(mid)) seen.set(mid, { hasA: false, hasB: false });

    const entry = seen.get(mid)!;
    if (aPlayerIds.includes(pid)) entry.hasA = true;
    if (bPlayerIds.includes(pid)) entry.hasB = true;
  }

  const matchIdsBoth = Array.from(seen.entries())
    .filter(([_, v]) => v.hasA && v.hasB)
    .map(([mid]) => mid);

  if (matchIdsBoth.length === 0) {
    // Matches 0 => Turniere sind sehr wahrscheinlich auch 0, aber wir geben payload zurück.
    return noStoreJson(payload);
  }

  const { data: allMp, error: mpErr } = await sb
    .from("match_players")
    .select("match_id, player_id, position")
    .in("match_id", matchIdsBoth);

  if (mpErr) {
    return noStoreJson({ ok: false, error: mpErr.message }, { status: 500 });
  }

  const mpByMatch = new Map<string, any[]>();
  for (const r of allMp ?? []) {
    const mid = String(r.match_id);
    if (!mpByMatch.has(mid)) mpByMatch.set(mid, []);
    mpByMatch.get(mid)!.push(r);
  }

  for (const mid of matchIdsBoth) {
    const rowsRaw = mpByMatch.get(mid) ?? [];
    const rows = rowsRaw.filter((x) => x?.player_id != null);

    const nPlayers = rows.length;

    const rowA = rows.find((x) => aPlayerIds.includes(String(x.player_id))) ?? null;
    const rowB = rows.find((x) => bPlayerIds.includes(String(x.player_id))) ?? null;
    if (!rowA || !rowB) continue;

    const posA = numOrNull(rowA.position);
    const posB = numOrNull(rowB.position);

    payload.matches.togetherAny.count++;

    if (posA === 1) payload.matches.togetherAny.aFirsts++;
    if (posB === 1) payload.matches.togetherAny.bFirsts++;

    const r = cmp(posA, posB);
    if (r < 0) payload.matches.togetherAny.aBeatsB++;
    else if (r > 0) payload.matches.togetherAny.bBeatsA++;
    else payload.matches.togetherAny.draws++;

    if (nPlayers === 2) {
      payload.matches.oneVsOne.count++;
      if (r < 0) payload.matches.oneVsOne.aWins++;
      else if (r > 0) payload.matches.oneVsOne.bWins++;
      else payload.matches.oneVsOne.draws++;
    }
  }

  // ---- Turniere: Head-to-Head ----
  // Turniere über players.tournament_id bestimmen (robust).
  const aTournamentIds = new Set(
    (pMap ?? [])
      .filter((p) => String(p.profile_id) === String(profileAId))
      .map((p) => (p as any).tournament_id)
      .filter(Boolean)
      .map((t) => String(t))
  );
  const bTournamentIds = new Set(
    (pMap ?? [])
      .filter((p) => String(p.profile_id) === String(profileBId))
      .map((p) => (p as any).tournament_id)
      .filter(Boolean)
      .map((t) => String(t))
  );

  const tournamentIds = Array.from(aTournamentIds).filter((tid) => bTournamentIds.has(tid));
  if (tournamentIds.length === 0) return noStoreJson(payload);

  // ✅ In diesem Projekt werden Turniere HARD gelöscht (kein deleted-Flag).
  // Deshalb: nur Turniere, die es noch gibt, und sinnvollerweise nur status='finished'
  const { data: tMeta, error: tErr } = await sb
    .from("tournaments")
    .select("id, status")
    .in("id", tournamentIds);

  if (tErr) {
    return noStoreJson({ ok: false, error: tErr.message }, { status: 500 });
  }

  const allowedTids = (tMeta ?? [])
    .filter((t) => String((t as any).status ?? "") === "finished")
    .map((t) => String(t.id));

  if (allowedTids.length === 0) {
    // Es gibt gemeinsame Turniere, aber keine beendeten => tournament_results existiert nicht.
    return noStoreJson(payload);
  }

  // tournament_results nutzt player_id (= players.id) in diesem Repo (siehe tournaments/finish/route.ts)
  const { data: trByPlayer, error: trErr } = await sb
    .from("tournament_results")
    .select("tournament_id, player_id, final_rank")
    .in("tournament_id", allowedTids)
    .in("player_id", unionIds);

  if (trErr) {
    return noStoreJson({ ok: false, error: trErr.message }, { status: 500 });
  }

  const trRows = (trByPlayer ?? []) as any[];

  // Map: tournament_id -> rows
  const byTid = new Map<string, any[]>();
  for (const row of trRows) {
    const tid = String(row.tournament_id);
    if (!byTid.has(tid)) byTid.set(tid, []);
    byTid.get(tid)!.push(row);
  }

  // togetherAny (Turniere, in denen beide teilgenommen haben)
  for (const tid of allowedTids) {
    const rows = byTid.get(String(tid)) ?? [];

    const ra = rows.find((x) => x.player_id != null && aPlayerIds.includes(String(x.player_id))) ?? null;
    const rb = rows.find((x) => x.player_id != null && bPlayerIds.includes(String(x.player_id))) ?? null;
    if (!ra || !rb) continue;

    payload.tournaments.togetherAny.count++;

    const rankA = numOrNull(ra.final_rank);
    const rankB = numOrNull(rb.final_rank);

    if (rankA === 1) payload.tournaments.togetherAny.aFirsts++;
    if (rankB === 1) payload.tournaments.togetherAny.bFirsts++;

    const r = cmp(rankA, rankB);
    if (r < 0) payload.tournaments.togetherAny.aWins++;
    else if (r > 0) payload.tournaments.togetherAny.bWins++;
    else payload.tournaments.togetherAny.draws++;
  }

  // oneVsOneOnly (Turniere, in denen NUR A und B als Profile vorkommen)
  // -> Das ermitteln wir über players in diesem Turnier: wie viele unterschiedliche profile_id existieren?
  for (const tid of allowedTids) {
    const { data: ps, error: psErr } = await sb
      .from("players")
      .select("profile_id")
      .eq("tournament_id", tid);

    if (psErr || !ps?.length) continue;

    const profSet = new Set((ps ?? []).map((p) => String((p as any).profile_id)).filter(Boolean));
    const onlyTwo =
      profSet.size === 2 &&
      profSet.has(String(profileAId)) &&
      profSet.has(String(profileBId));

    if (!onlyTwo) continue;

    const rows = byTid.get(String(tid)) ?? [];
    const ra = rows.find((x) => x.player_id != null && aPlayerIds.includes(String(x.player_id))) ?? null;
    const rb = rows.find((x) => x.player_id != null && bPlayerIds.includes(String(x.player_id))) ?? null;
    if (!ra || !rb) continue;

    payload.tournaments.oneVsOneOnly.count++;

    const rankA = numOrNull(ra.final_rank);
    const rankB = numOrNull(rb.final_rank);

    if (rankA === 1) payload.tournaments.oneVsOneOnly.aFirsts++;
    if (rankB === 1) payload.tournaments.oneVsOneOnly.bFirsts++;

    const r = cmp(rankA, rankB);
    if (r < 0) payload.tournaments.oneVsOneOnly.aWins++;
    else if (r > 0) payload.tournaments.oneVsOneOnly.bWins++;
    else payload.tournaments.oneVsOneOnly.draws++;
  }

  return noStoreJson(payload);
}
