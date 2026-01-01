import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const profileId = String(url.searchParams.get("profileId") ?? "").trim();
  if (!profileId) return NextResponse.json({ error: "profileId fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: prof, error: pErr } = await sb.from("profiles").select("id, name, avatar_url, rating, matches_played, provisional_matches, created_at").eq("id", profileId).single();
  if (pErr || !prof) return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });

  const { data: rows, error } = await sb
    .from("match_players")
    .select("position, matches!inner(id, machine_id, rounds!inner(tournament_id)), players!inner(profile_id)")
    .eq("players.profile_id", profileId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Need machine names
  const machineIds = Array.from(new Set((rows ?? []).map((r:any)=>r.matches?.machine_id).filter(Boolean)));
  let machineName: Record<string,string> = {};
  if (machineIds.length) {
    const { data: ms } = await sb.from("machines").select("id, name").in("id", machineIds);
    machineName = Object.fromEntries((ms ?? []).map((m:any)=>[m.id, m.name]));
  }

  const tournaments = new Set<string>();
  let matches = 0, wins = 0, posSum = 0, posCount = 0;

  const perMachine: Record<string, { plays: number; wins: number; posSum: number; posCount: number }> = {};

  for (const r of (rows ?? []) as any[]) {
    const pos = r.position as number | null;
    if (!pos) continue;
    matches += 1;
    if (pos === 1) wins += 1;
    posSum += pos; posCount += 1;

    const tid = r.matches?.rounds?.tournament_id;
    if (tid) tournaments.add(tid);

    const mid = r.matches?.machine_id as string | null;
    if (mid) {
      perMachine[mid] = perMachine[mid] || { plays: 0, wins: 0, posSum: 0, posCount: 0 };
      perMachine[mid].plays += 1;
      if (pos === 1) perMachine[mid].wins += 1;
      perMachine[mid].posSum += pos;
      perMachine[mid].posCount += 1;
    }
  }

  const machineStats = Object.entries(perMachine).map(([mid, v]) => ({
    machineId: mid,
    machine: machineName[mid] ?? mid,
    plays: v.plays,
    wins: v.wins,
    winrate: v.plays ? Math.round((v.wins / v.plays) * 1000) / 10 : 0,
    avgPos: v.posCount ? Math.round((v.posSum / v.posCount) * 100) / 100 : null,
  }))
  .sort((a:any,b:any)=> (b.plays-a.plays) || (b.winrate-a.winrate) || a.machine.localeCompare(b.machine))
  .slice(0, 20);

  return NextResponse.json({
    profile: prof,
    stats: {
      tournamentsPlayed: tournaments.size,
      matches,
      wins,
      winrate: matches ? Math.round((wins/matches)*1000)/10 : 0,
      avgPos: posCount ? Math.round((posSum/posCount)*100)/100 : null,
    },
    machineStats,
  });
}
