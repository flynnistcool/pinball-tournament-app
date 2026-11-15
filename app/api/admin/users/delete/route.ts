// 👥 Login löschen – NUR Admin (Schreibzugriff, middleware.ts prüft echt).
// POST { id } → Login + Profil-Verknüpfung weg; das Spielerprofil selbst bleibt erhalten.
// Schutz: Man kann sich nicht selbst löschen.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { currentAuthUserId } from "@/lib/usersAdminServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return fail("id fehlt", 400);
  if ((await currentAuthUserId()) === id) return fail("Du kannst dich nicht selbst löschen", 400);

  const sb = supabaseAdmin();
  const { error: lErr } = await sb.from("profile_links").delete().eq("auth_user_id", id);
  if (lErr) return fail(`Verknüpfung lösen fehlgeschlagen: ${lErr.message}`, 500);

  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) return fail(`Löschen fehlgeschlagen: ${error.message}`, 500);

  return NextResponse.json({ ok: true });
}
