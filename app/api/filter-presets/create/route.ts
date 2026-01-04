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

function formatLabel(category: string, name: string, from: string, to: string) {
  const parts: string[] = [];
  if (category.trim()) parts.push(category.trim());
  if (name.trim()) parts.push(`„${name.trim()}“`);
  if (from || to) parts.push(`${from || "…"} → ${to || "…"}`);
  return parts.length ? parts.join(" · ") : "Alle Turniere";
}

export async function POST(req: Request) {
  try {
    // ✅ Admin-Check über Supabase Auth Session (so wie euer UI-Rollenmodell)
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();

    if (userErr || !userData?.user || !isAdminFromUser(userData.user)) {
      return NextResponse.json(
        { error: "Forbidden (admin only)" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await req.json().catch(() => ({}));

    const context = (body?.context as string) || "tournament_success";
    const category = (body?.category as string) || "";
    const name = (body?.name as string) || "";
    const date_from = (body?.date_from as string) || "";
    const date_to = (body?.date_to as string) || "";

    const label =
      (body?.label as string) ||
      formatLabel(category, name, date_from, date_to);

    const sb = supabaseAdmin();

    // Upsert verhindert Duplikate (Unique Index)
    const { data, error } = await sb
      .from("filter_presets")
      .upsert(
        [
          {
            context,
            label,
            category,
            name,
            date_from,
            date_to,
            pinned: false,
            sort_order: 0,
          },
        ],
        { onConflict: "context,category,name,date_from,date_to" }
      )
      .select("id, context, label, category, name, date_from, date_to, pinned, sort_order, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { preset: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
