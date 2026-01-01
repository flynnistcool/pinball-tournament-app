import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Multiplayer Elo via pairwise comparisons
function expected(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const matchId = String(body.matchId ?? "").trim();
  const positions = body.positions as Record<string, number>; // {playerId: position}
  if (!matchId || !positions) return NextResponse.json({ error: "Fehlende Daten" }, { status: 400 });

  const sb = supabaseAdmin();

  // Avoid double-submit
  const { data: matchRow } = await sb.from("matches").select("id, status, round_id, rounds!inner(tournament_id)").eq("id", matchId).single();
  if (!matchRow) return NextResponse.json({ error: "Match nicht gefunden" }, { status: 404 });
  if (matchRow.status === "finished") return NextResponse.json({ ok: true, note: "already finished" });

  // Update each player's position
  for (const [playerId, position] of Object.entries(positions)) {
    if (!Number.isInteger(position) || position < 1 || position > 4) continue;
    const { error } = await sb.from("match_players").update({ position }).eq("match_id", matchId).eq("player_id", playerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mark match finished
  const { error: mErr } = await sb.from("matches").update({ status: "finished" }).eq("id", matchId);

  // Runde automatisch abschließen, wenn alle Matches finished sind
  const { data: roundMatches } = await sb
    .from("matches")
    .select("status")
    .eq("round_id", matchRow.round_id);

  const roundFinished = roundMatches?.every((x) => x.status === "finished") ?? false;

  await sb
    .from("rounds")
    .update({ status: roundFinished ? "finished" : "open" })
    .eq("id", matchRow.round_id);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  // --- Elo update (profiles only, ignore players without profile_id) ---
  // Get tournament category to ignore fun tournaments
  const { data: tRow } = await sb
  .from("rounds")
  .select("tournaments!inner(category)")
  .eq(
    "tournament_id",
    (matchRow as any).rounds?.[0]?.tournament_id
  )
  .single();

  const category = (tRow as any)?.tournaments?.category ?? "normal";
  if (category !== "fun") {
    const { data: mps, error: mpErr } = await sb
      .from("match_players")
      .select("position, players!inner(profile_id)")
      .eq("match_id", matchId);

    if (!mpErr && mps?.length) {
      const ids = (mps as any[]).map(r => r.players?.profile_id).filter(Boolean);
      if (ids.length >= 2) {
        const { data: profs } = await sb.from("profiles").select("id, rating, provisional_matches, matches_played").in("id", ids);

        const ratingById: Record<string, number> = {};
        const metaById: Record<string, { provisional_matches: number; matches_played: number }> = {};
        for (const p of (profs ?? []) as any[]) {
          ratingById[p.id] = Number(p.rating ?? 1500);
          metaById[p.id] = { provisional_matches: Number(p.provisional_matches ?? 10), matches_played: Number(p.matches_played ?? 0) };
        }
        const kFor = (id: string) => {
          const m = metaById[id];
          if (!m) return 24;
          const remaining = Math.max(0, m.provisional_matches - m.matches_played);
          return remaining > 0 ? 48 : 24;
        };

        const players = (mps as any[])
          .map(r => ({ id: r.players.profile_id as string, pos: Number(r.position) }))
          .filter(x => Number.isFinite(x.pos) && x.pos >= 1);

        // Pairwise score: better position wins; tie => 0.5        // K-Factor: 48 for provisional players (first N matches), then 24
const delta: Record<string, number> = Object.fromEntries(players.map(p => [p.id, 0]));

        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            const A = players[i], B = players[j];
            const ra = ratingById[A.id] ?? 1500;
            const rb = ratingById[B.id] ?? 1500;
            const ea = expected(ra, rb);
            const eb = expected(rb, ra);

            let sa = 0.5, sbScore = 0.5;
            if (A.pos < B.pos) { sa = 1; sbScore = 0; }
            else if (A.pos > B.pos) { sa = 0; sbScore = 1; }

            delta[A.id] += kFor(A.id) * (sa - ea);
            delta[B.id] += kFor(B.id) * (sbScore - eb);
          }
        }

        for (const pid of Object.keys(delta)) {
          const newRating = Math.round(((ratingById[pid] ?? 1500) + delta[pid]) * 10) / 10;
          await sb.from("profiles").update({ rating: newRating }).eq("id", pid);
          // Count this match towards provisional progression
          const cur = metaById[pid]?.matches_played ?? 0;
          metaById[pid] = { ...(metaById[pid] ?? { provisional_matches: 10, matches_played: 0 }), matches_played: cur + 1 };
          await sb.from("profiles").update({ matches_played: cur + 1 }).eq("id", pid);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
