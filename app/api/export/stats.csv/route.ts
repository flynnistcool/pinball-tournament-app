import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return new Response("Code fehlt", { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb.from("tournaments").select("id").eq("code", code).single();
  if (!t) return new Response("Turnier nicht gefunden", { status: 404 });

  // reuse stats endpoint logic by calling internally would be overkill; compute minimal here:
  const { data: players } = await sb.from("players").select("id, name").eq("tournament_id", t.id);
  const { data: mps } = await sb
    .from("match_players")
    .select("player_id, position, matches!inner(id, rounds!inner(tournament_id))")
    .eq("matches.rounds.tournament_id", t.id);

  const played: Record<string, number> = {};
  const wins: Record<string, number> = {};
  for (const row of (mps ?? []) as any[]) {
    if (row.position == null) continue;
    played[row.player_id] = (played[row.player_id] ?? 0) + 1;
    if (row.position === 1) wins[row.player_id] = (wins[row.player_id] ?? 0) + 1;
  }

  const lines = ["name,matches,wins,winrate_percent"];
  for (const p of (players ?? []) as any[]) {
    const m = played[p.id] ?? 0;
    const w = wins[p.id] ?? 0;
    const wr = m ? (w/m*100) : 0;
    const esc = (s: string) => `"${String(s).replaceAll('"','""')}"`;
    lines.push([esc(p.name), m, w, wr.toFixed(1)].join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stats_${code}.csv"`
    }
  });
}
