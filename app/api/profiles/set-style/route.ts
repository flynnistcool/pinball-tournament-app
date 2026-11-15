// 🎨 Aussehen eines Profils ändern (Farbe / Emoji) – Admin ODER der Login, der mit diesem Profil verknüpft ist.
// Ändert NUR color und icon (keine Elo, kein Bot-/Platzhalter-Haken).
// POST { id, color, icon } -> { ok: true, profile }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { checkOwnerOrAdmin } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id fehlt" }, { status: 400 });

  const color = typeof body?.color === "string" && body.color.trim() ? body.color.trim().slice(0, 200) : null;
  const icon = typeof body?.icon === "string" && body.icon.trim() ? body.icon.trim().slice(0, 16) : null;

  const sb = supabaseAdmin();
  const own = await checkOwnerOrAdmin(sb, id);
  if (!own.ok) return NextResponse.json({ ok: false, error: own.error }, { status: own.status });

  const { data, error } = await sb
    .from("profiles")
    .update({ color, icon })
    .eq("id", id)
    .select("id, color, icon")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Profil nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ok: true, profile: data });
}
