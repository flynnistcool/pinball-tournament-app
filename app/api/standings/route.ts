import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb.from("tournaments").select("id").eq("code", code).single();
  if (!t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // compute points: for each match, 4 players => 1st=4,2nd=2,3rd=1,4th=0 (simple default)
  // For 2 players, 1st=2,2nd=0
  const { data: players } = await sb.from("players").select("id, name, active").eq("tournament_id", t.id).order("created_at");
  const { data: rows } = await sb
    .from("match_players")
    .select("player_id, position, matches!inner(round_id, rounds!inner(tournament_id))")
    .eq("matches.rounds.tournament_id", t.id);

  const points: Record<string, number> = {};
  for (const p of (players ?? []) as any[]) points[p.id] = 0;

  for (const r of (rows ?? []) as any[]) {
    const pos = r.position as number | null;
    if (!pos) continue;
    // naive mapping for 4-player: 1->4,2->2,3->1,4->0
    const map4 = { 1: 4, 2: 2, 3: 1, 4: 0 } as any;
    points[r.player_id] += map4[pos] ?? 0;
  }

  const out = (players ?? []).map((p: any) => ({ id: p.id, name: p.name, active: p.active, points: points[p.id] ?? 0 }))
    .sort((a:any,b:any) => b.points - a.points || a.name.localeCompare(b.name));

  return NextResponse.json({ standings: out });
}
