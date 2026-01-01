import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";


// Sorgt dafür, dass Next diese Route NICHT vor-rendered/cached
export const dynamic = "force-dynamic";
export const revalidate = 0;
// alternativ (oder zusätzlich): export const revalidate = 0;

export async function GET() {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("profiles")
    .select("id, name, rating, matches_played, provisional_matches, color, icon") // <– hier deine echten Spalten einsetzen
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { profiles: data ?? [] },
    {
      // Browser-Caching explizit ausschalten
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
