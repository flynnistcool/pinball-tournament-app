import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  }

  // Rating / Provisional wie bisher
  const startRatingRaw = body.startRating ?? body.rating ?? null;
  const provisionalRaw =
    body.provisionalMatches ?? body.provisional_matches ?? 10;

  const rating =
    startRatingRaw != null && Number.isFinite(Number(startRatingRaw))
      ? Math.max(800, Math.min(3000, Number(startRatingRaw)))
      : 1500;

  const provisional_matches = Math.max(
    0,
    Math.min(50, Number(provisionalRaw) || 0)
  );

  // 🆕 Farbe & Icon optional aus dem Body holen
  const colorRaw = body.color ?? null;
  const iconRaw = body.icon ?? null;

  const color =
    typeof colorRaw === "string" && colorRaw.trim().length > 0
      ? colorRaw.trim()
      : null;

  const icon =
    typeof iconRaw === "string" && iconRaw.trim().length > 0
      ? iconRaw.trim()
      : null;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .insert({
      name,
      rating,
      provisional_matches,
      matches_played: 0,
      color, // 🆕
      icon,  // 🆕
    })
    .select(
      "id, name, avatar_url, rating, matches_played, provisional_matches, color, icon, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
