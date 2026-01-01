import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return new Response("Code fehlt", { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb.from("tournaments").select("id").eq("code", code).single();
  if (!t) return new Response("Turnier nicht gefunden", { status: 404 });

  const { data: players } = await sb.from("players").select("id, name").eq("tournament_id", t.id);
  const { data: mps } = await sb
    .from("match_players")
    .select("player_id, position, matches!inner(id, rounds!inner(tournament_id))")
    .eq("matches.rounds.tournament_id", t.id);

  // simple points mapping (assumes 4-player schema in MVP)
  const points: Record<string, number> = {};
  for (const p of (players ?? []) as any[]) points[p.id] = 0;
  const map4: any = { 1: 4, 2: 2, 3: 1, 4: 0 };
  for (const row of (mps ?? []) as any[]) {
    if (!row.position) continue;
    points[row.player_id] += map4[row.position] ?? 0;
  }

  const rows = (players ?? []).map((p:any)=>({ name:p.name, points: points[p.id] ?? 0 }))
    .sort((a:any,b:any)=>b.points-a.points || a.name.localeCompare(b.name));

  const esc = (s: string) => `"${String(s).replaceAll('"','""')}"`;
  const lines = ["rank,name,points"];
  rows.forEach((r:any, idx:number)=> lines.push([idx+1, esc(r.name), r.points].join(",")));

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="standings_${code}.csv"`
    }
  });
}
