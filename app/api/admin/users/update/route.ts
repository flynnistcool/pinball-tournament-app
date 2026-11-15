// 👥 Login ändern – NUR Admin (Schreibzugriff, middleware.ts prüft echt).
// POST { id, role?, password?, profileId? (null = Verknüpfung lösen; weglassen = unverändert) }
// Schutz: Man kann sich selbst nicht die Admin-Rolle wegnehmen (sonst sperrt man sich aus).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { currentAuthUserId, setProfileLink, validRole } from "@/lib/usersAdminServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return fail("id fehlt", 400);

  const sb = supabaseAdmin();
  const { data: existing, error: getErr } = await sb.auth.admin.getUserById(id);
  if (getErr || !existing?.user) return fail("Login nicht gefunden", 404);

  const attrs: { app_metadata?: Record<string, unknown>; password?: string } = {};

  if (body?.role !== undefined) {
    const role = validRole(body.role);
    if (!role) return fail("Ungültige Rolle", 400);
    if (role !== "admin" && (await currentAuthUserId()) === id) {
      return fail("Du kannst dir selbst nicht die Admin-Rolle wegnehmen", 400);
    }
    attrs.app_metadata = { ...(existing.user.app_metadata ?? {}), role };
  }

  if (body?.password !== undefined) {
    const pw = String(body.password ?? "");
    if (pw.length < 8) return fail("Das Passwort braucht mindestens 8 Zeichen", 400);
    attrs.password = pw;
  }

  if (attrs.app_metadata || attrs.password) {
    const { error } = await sb.auth.admin.updateUserById(id, attrs);
    if (error) return fail(`Speichern fehlgeschlagen: ${error.message}`, 500);
  }

  if (body?.profileId !== undefined) {
    const linkErr = await setProfileLink(sb, id, body.profileId ? String(body.profileId) : null);
    if (linkErr) return fail(linkErr, 500);
  }

  return NextResponse.json({ ok: true });
}
