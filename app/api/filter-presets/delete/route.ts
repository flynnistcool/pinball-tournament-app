// @ts-nocheck
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAdminFromUser(user: any): boolean {
  if (!user) return false;
  const meta = {
    ...(user.app_metadata || {}),
    ...(user.user_metadata || {}),
  };
  return meta.role === "admin";
}

export async function POST(req: Request) {
  try {
    // 🔐 Admin-Check
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: userData } = await supabaseAuth.auth.getUser();

    if (!isAdminFromUser(userData?.user)) {
      return NextResponse.json(
        { error: "Forbidden (admin only)" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const presetId = body?.presetId;

    if (!presetId) {
      return NextResponse.json(
        { error: "presetId fehlt" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sb = supabaseAdmin();

    const { error } = await sb
      .from("filter_presets")
      .delete()
      .eq("id", presetId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
