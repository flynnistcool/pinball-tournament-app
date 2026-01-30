import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// ✅ nicht cachen
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? body.profileId ?? "").trim();
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });

  const infoRaw = body.info;
  const infoStr = typeof infoRaw === "string" ? infoRaw : String(infoRaw ?? "");
  const info = infoStr.trimEnd(); // führende Spaces absichtlich nicht anfassen
  const value = info.length ? info : null;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("profiles")
    .update({ info: value })
    .eq("id", id)
    .select("id, info")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, profile: data },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
