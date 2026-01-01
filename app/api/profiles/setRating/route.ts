import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const {
    id,
    rating,
    provisionalMatches,
    resetMatchesPlayed,
    color,
    icon,
  }: {
    id?: string;
    rating?: number;
    provisionalMatches?: number;
    resetMatchesPlayed?: boolean;
    color?: string | null;
    icon?: string | null;
  } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Profil-ID fehlt" },
      { status: 400 }
    );
  }

  // Rating normalisieren
  const ratingNum = Number(rating);
  const newRating =
    Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : 1500;

  // Provisional normalisieren (0–50)
  const provisionalNum = Number(provisionalMatches);
  const newProvisional =
    Number.isFinite(provisionalNum) && provisionalNum >= 0
      ? Math.min(50, Math.max(0, provisionalNum))
      : 10;

  // Farbe & Icon normalisieren
  const colorStr =
    typeof color === "string" && color.trim().length > 0
      ? color.trim()
      : null;

  const iconStr =
    typeof icon === "string" && icon.trim().length > 0
      ? icon.trim()
      : null;

  const sb = supabaseAdmin();

  const update: any = {
    rating: newRating,
    provisional_matches: newProvisional,
    color: colorStr,
    icon: iconStr,
  };

  if (resetMatchesPlayed) {
    update.matches_played = 0;
  }

  const { data, error } = await sb
    .from("profiles")
    .update(update)
    .eq("id", id)
    .select(
      "id, name, avatar_url, rating, matches_played, provisional_matches, color, icon"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
