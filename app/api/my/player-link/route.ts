// 📱 "Meine Eingabe": persönlicher Handy-Link des angemeldeten Logins für ein Turnier – ohne QR-Code.
// GET /api/my/player-link?code=ABC123 -> { ok: true, token, playerId } | { ok: true, token: null } (nicht dabei)
// Nur für das EIGENE verknüpfte Profil (profile_links); Admins bekommen hier ebenfalls nur ihr eigenes.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { currentLogin } from "@/lib/ownerAuth";
import { makePlayerToken } from "@/lib/playerLink";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  const me = await currentLogin(sb);
  if (!me) return NextResponse.json({ ok: false, error: "Bitte anmelden" }, { status: 401 });
  if (!me.profileId) return NextResponse.json({ ok: true, token: null, reason: "kein Profil verknüpft" }, { headers: NO_STORE });

  const { data: t } = await sb.from("tournaments").select("id, status").eq("code", code).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404 });

  const { data: p } = await sb
    .from("players")
    .select("id")
    .eq("tournament_id", (t as { id: string }).id)
    .eq("profile_id", me.profileId)
    .maybeSingle();
  if (!p) return NextResponse.json({ ok: true, token: null, reason: "nicht in diesem Turnier" }, { headers: NO_STORE });

  try {
    const playerId = String((p as { id: string }).id);
    return NextResponse.json({ ok: true, token: makePlayerToken(playerId), playerId }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
