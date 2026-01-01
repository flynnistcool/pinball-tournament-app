import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb.from("tournaments").select("id, code, name").eq("code", code).single();
  if (!t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // 1) Prefer open
  let { data: round } = await sb
    .from("rounds")
    .select("id, format, number, status, created_at")
    .eq("tournament_id", t.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2) fallback: newest round
  if (!round) {
    const r2 = await sb
      .from("rounds")
      .select("id, format, number, status, created_at")
      .eq("tournament_id", t.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    round = r2.data ?? null;
  }

  if (!round) return NextResponse.json({ tournament: t, round: null, matches: [] });

  const { data: matches } = await sb
    .from("matches")
    .select("id, machine_id, status, created_at, game_number, match_players(player_id, position)")
    .eq("round_id", round.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ tournament: t, round, matches: matches ?? [] });
}