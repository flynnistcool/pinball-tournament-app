// 👥 Benutzerverwaltung (nur Server): wer ist gerade angemeldet? + Profil-Verknüpfung setzen.
// Die Admin-Prüfung selbst macht middleware.ts (Schreibzugriffe nur mit echt geprüftem Admin-Login).

import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

/** ID des angemeldeten Logins (echt beim Server geprüft) – null = keiner */
export async function currentAuthUserId(): Promise<string | null> {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data, error } = await supabaseAuth.auth.getUser();
    return error ? null : data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Login ↔ Spielerprofil verknüpfen (profileId null = Verknüpfung lösen). Ein Login hat höchstens ein Profil. */
export async function setProfileLink(sb: Sb, authUserId: string, profileId: string | null): Promise<string | null> {
  const { error: delErr } = await sb.from("profile_links").delete().eq("auth_user_id", authUserId);
  if (delErr) return `Verknüpfung lösen fehlgeschlagen: ${delErr.message}`;
  if (!profileId) return null;
  const { error: insErr } = await sb.from("profile_links").insert({ auth_user_id: authUserId, profile_id: profileId });
  if (insErr) return `Verknüpfung speichern fehlgeschlagen: ${insErr.message}`;
  return null;
}

export function cleanEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function validRole(v: unknown): "admin" | "viewer" | null {
  return v === "admin" || v === "viewer" ? v : null;
}
