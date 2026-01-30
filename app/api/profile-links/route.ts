// @ts-nocheck
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Session-User holen
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();

    if (userErr || !userData?.user) {
      return NextResponse.json(
        { profile_id: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const authUserId = userData.user.id;

    // Mapping aus DB holen (Service Role, aber wir geben nur das eigene zurück)
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("profile_links")
      .select("profile_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message, profile_id: null },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { profile_id: data?.profile_id ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e), profile_id: null },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
