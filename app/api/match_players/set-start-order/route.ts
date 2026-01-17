import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const matchId = String(body.matchId ?? "").trim();
  const orderedPlayerIds = Array.isArray(body.orderedPlayerIds)
    ? body.orderedPlayerIds.map((x: any) => String(x).trim()).filter(Boolean)
    : [];

  if (!matchId || orderedPlayerIds.length < 2) {
    return NextResponse.json(
      { error: "matchId oder orderedPlayerIds fehlt" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const sb = supabaseAdmin();

  // check: Ergebnisse schon gesetzt?
  const { data: rows, error: rowsErr } = await sb
    .from("match_players")
    .select("player_id, position, score")
    .eq("match_id", matchId);

  if (rowsErr) {
    return NextResponse.json(
      { error: rowsErr.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const hasResults = (rows ?? []).some(
    (r: any) => r.position != null || r.score != null
  );
  if (hasResults) {
    return NextResponse.json(
      { error: "Ergebnisse sind gesetzt – Reihenfolge ist gesperrt." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // validate: genau dieselben Spieler, keine Duplikate
  const existing = (rows ?? []).map((r: any) => String(r.player_id));
  const allowed = new Set(existing);

  const filtered = orderedPlayerIds.filter((id: string) => allowed.has(id));
  const unique = new Set(filtered);

  if (filtered.length !== existing.length || unique.size !== existing.length) {
    return NextResponse.json(
      { error: "orderedPlayerIds passt nicht zu den Match-Spielern" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // write start_position 1..N
  for (let i = 0; i < filtered.length; i++) {
    const pid = filtered[i];
    const { error } = await sb
      .from("match_players")
      .update({ start_position: i + 1 })
      .eq("match_id", matchId)
      .eq("player_id", pid);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}

