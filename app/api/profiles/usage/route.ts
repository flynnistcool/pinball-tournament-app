// Wie oft wurde ein Profil schon benutzt? (für die Warnung vor dem Löschen)
// GET /api/profiles/usage?id=...  -> { ok: true, tournaments, matches }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const id = String(new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: players, error } = await sb.from("players").select("id, tournament_id").eq("profile_id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const playerIds = (players ?? []).map((p: { id: string }) => String(p.id));
  const tournaments = new Set((players ?? []).map((p: { tournament_id: string }) => String(p.tournament_id))).size;

  let matches = 0;
  if (playerIds.length) {
    const mp = await fetchAllIn<{ match_id: string }>(playerIds, (chunk) =>
      sb.from("match_players").select("match_id, player_id").in("player_id", chunk).order("match_id").order("player_id")
    );
    if (!mp.error) matches = mp.data.length;
  }

  return NextResponse.json({ ok: true, tournaments, matches }, { headers: { "Cache-Control": "no-store" } });
}
