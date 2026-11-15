// 👥 Benutzer (Logins) verwalten – NUR Admin (middleware.ts: GET steht in ADMIN_ONLY_GET, POST ist Schreibzugriff).
// GET  → { ok, users: [{ id, email, role (admin|viewer|pending), createdAt, lastSignInAt, profileId, profileName, isSelf, displayName, signupNote }] }
// POST { email, password, role, profileId? } → neuen Login anlegen (sofort aktiv, ohne Bestätigungs-Mail)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { roleOfUser } from "@/lib/authRoles";
import { cleanEmail, currentAuthUserId, setProfileLink, validRole } from "@/lib/usersAdminServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return fail(`Benutzer laden fehlgeschlagen: ${error.message}`, 500);
  const users = data?.users ?? [];

  const { data: links, error: lErr } = await sb.from("profile_links").select("auth_user_id, profile_id");
  if (lErr) return fail(`Verknüpfungen laden fehlgeschlagen: ${lErr.message}`, 500);
  const profileByUser = new Map((links ?? []).map((l: any) => [String(l.auth_user_id), String(l.profile_id)]));

  const profileIds = Array.from(new Set(Array.from(profileByUser.values())));
  const { data: profs } = profileIds.length
    ? await sb.from("profiles").select("id, name").in("id", profileIds)
    : { data: [] as any[] };
  const nameById = new Map((profs ?? []).map((p: any) => [String(p.id), String(p.name ?? "?")]));

  const selfId = await currentAuthUserId();

  return NextResponse.json(
    {
      ok: true,
      users: users
        .map((u) => {
          const pid = profileByUser.get(u.id) ?? null;
          return {
            id: u.id,
            email: u.email ?? "",
            role: roleOfUser(u),
            createdAt: u.created_at ?? null,
            lastSignInAt: u.last_sign_in_at ?? null,
            profileId: pid,
            profileName: pid ? nameById.get(pid) ?? "(gelöschtes Profil)" : null,
            isSelf: !!selfId && selfId === u.id,
            // bei Selbst-Registrierung angegeben (nur Anzeige – NIE für Rechte nutzen)
            displayName: String(u.user_metadata?.display_name ?? "").trim() || null,
            signupNote: String(u.user_metadata?.signup_note ?? "").trim() || null,
          };
        })
        .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "admin" ? -1 : 1)),
    },
    { headers: NO_STORE }
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body?.email);
  const password = String(body?.password ?? "");
  const role = validRole(body?.role) ?? "viewer";
  const profileId = body?.profileId ? String(body.profileId) : null;

  if (!email || !email.includes("@")) return fail("Bitte eine gültige E-Mail eingeben", 400);
  if (password.length < 8) return fail("Das Passwort braucht mindestens 8 Zeichen", 400);

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // sofort aktiv – keine Bestätigungs-Mail nötig
    app_metadata: { role }, // 🔐 Rolle nur im geschützten Feld
  });
  if (error || !data?.user) return fail(`Login anlegen fehlgeschlagen: ${error?.message ?? "unbekannt"}`, 400);

  if (profileId) {
    const linkErr = await setProfileLink(sb, data.user.id, profileId);
    if (linkErr) return fail(`Login angelegt, aber ${linkErr}`, 500);
  }
  return NextResponse.json({ ok: true, id: data.user.id }, { headers: NO_STORE });
}
