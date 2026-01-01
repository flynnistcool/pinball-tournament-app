import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("tournaments")
      .select("id, code, name, created_at, category, match_size, location_id, status")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("tournaments/list supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tournaments: data ?? [] });
  } catch (e: any) {
    console.error("tournaments/list crash:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
