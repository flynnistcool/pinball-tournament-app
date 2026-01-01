import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = String(url.searchParams.get("category") ?? "league").toLowerCase(); // league|normal|fun|all
  const sb = supabaseAdmin();

  let q = sb.from("tournaments").select("season_year, category").not("season_year", "is", null);
  if (category !== "all") q = q.eq("category", category);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const years = Array.from(new Set((data ?? []).map((r: any) => r.season_year).filter((y: any) => typeof y === "number")))
    .sort((a, b) => b - a);

  return NextResponse.json({ years });
}
