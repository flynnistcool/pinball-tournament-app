// 🔐 "Eigenes Profil"-Rechte (nur Server): Admin darf alles; ein Zuschauer-Login darf bestimmte Dinge
// NUR für das Spielerprofil, mit dem er verknüpft ist (Tabelle profile_links).
// Die Middleware lässt diese Routen für Zuschauer durch (lib/authRoles.ts → OWNER_ROUTES);
// die Route selbst MUSS dann checkOwnerOrAdmin aufrufen.

import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { isAdminUser } from "@/lib/authRoles";
import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export type OwnerCheck = { ok: true; isAdmin: boolean; userId: string } | { ok: false; status: number; error: string };

/** Angemeldeter Login (echt beim Server geprüft) + verknüpftes Profil */
export async function currentLogin(sb: Sb): Promise<{ userId: string; isAdmin: boolean; profileId: string | null } | null> {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data, error } = await supabaseAuth.auth.getUser();
    if (error || !data.user) return null;
    const { data: link } = await sb
      .from("profile_links")
      .select("profile_id")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    return {
      userId: data.user.id,
      isAdmin: isAdminUser(data.user),
      profileId: (link as { profile_id?: string } | null)?.profile_id ? String((link as { profile_id: string }).profile_id) : null,
    };
  } catch {
    return null;
  }
}

/** Darf der angemeldete Login dieses Profil ändern? (Admin immer, sonst nur das eigene verknüpfte Profil) */
export async function checkOwnerOrAdmin(sb: Sb, profileId: string | null | undefined): Promise<OwnerCheck> {
  const me = await currentLogin(sb);
  if (!me) return { ok: false, status: 401, error: "Bitte anmelden" };
  if (me.isAdmin) return { ok: true, isAdmin: true, userId: me.userId };
  if (profileId && me.profileId && String(profileId) === me.profileId) {
    return { ok: true, isAdmin: false, userId: me.userId };
  }
  return { ok: false, status: 403, error: "🔒 Nur für Admins oder das eigene Profil" };
}

/** Profil zu einem Single-Play-Lauf */
export async function profileOfRun(sb: Sb, runId: string): Promise<string | null> {
  const { data } = await sb.from("single_play_runs").select("profile_id").eq("id", runId).maybeSingle();
  return (data as { profile_id?: string } | null)?.profile_id ? String((data as { profile_id: string }).profile_id) : null;
}
