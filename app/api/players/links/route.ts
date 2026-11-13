// 📱 QR-Links aller Spieler eines Turniers (nur Admin – liegt NICHT unter /api/public).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { makePlayerToken } from "@/lib/playerLink";

export const dynamic = "force-dynamic";
// Datenbank-Antworten NIE zwischenspeichern (sonst liefert Next.js alte Stände aus)
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!t) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404 });

  const { data: players, error: pErr } = await sb.from("players").select("id").eq("tournament_id", t.id);
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

  try {
    const links: Record<string, string> = {};
    for (const p of players ?? []) links[String(p.id)] = makePlayerToken(String(p.id));
    return NextResponse.json({ ok: true, links });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
