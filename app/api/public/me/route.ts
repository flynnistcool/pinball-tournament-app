// 📱 Handy-Seite: prüft den QR-Token und sagt, welcher Spieler das ist.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { readPlayerToken } from "@/lib/playerLink";

export const dynamic = "force-dynamic";
// Datenbank-Antworten NIE zwischenspeichern (sonst liefert Next.js alte Stände aus)
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  const playerId = readPlayerToken(url.searchParams.get("t"));
  if (!code) return NextResponse.json({ ok: false, error: "Code fehlt" }, { status: 400 });
  if (!playerId) return NextResponse.json({ ok: false, error: "Ungültiger QR-Code" }, { status: 403 });

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!t) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404 });

  const { data: p, error: pErr } = await sb
    .from("players")
    .select("id, name, profile_id")
    .eq("id", playerId)
    .eq("tournament_id", t.id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  if (!p) return NextResponse.json({ ok: false, error: "Spieler gehört nicht zu diesem Turnier" }, { status: 404 });

  return NextResponse.json({ ok: true, playerId: String(p.id), name: p.name ?? "?", profileId: p.profile_id ?? null });
}
