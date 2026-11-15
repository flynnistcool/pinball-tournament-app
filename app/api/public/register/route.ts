// 📝 Selbst-Registrierung (öffentlich) – OHNE Mailversand.
// Der Server legt den Login an (Supabase-Signups bleiben AUS). Neue Logins bekommen die Rolle
// "pending" (⏳ wartet auf Freischaltung) und sehen nichts, bis der Admin sie unter "👥 Benutzer" freischaltet.
// POST { email, password, name, note?, website? (Honeypot – muss leer sein) } -> { ok: true }
//
// Spam-Bremse: Honeypot-Feld + höchstens MAX_PENDING_PER_HOUR neue, wartende Logins pro Stunde
// und höchstens MAX_PENDING_TOTAL wartende Logins insgesamt.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { roleOfUser } from "@/lib/authRoles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_PENDING_PER_HOUR = 10;
const MAX_PENDING_TOTAL = 30;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // 🍯 Honeypot: echte Menschen füllen dieses unsichtbare Feld nicht aus
  if (String(body?.website ?? "").trim()) return NextResponse.json({ ok: true });

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const note = String(body?.note ?? "").trim().slice(0, 300);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Bitte eine gültige E-Mail eingeben", 400);
  if (password.length < 8) return fail("Das Passwort braucht mindestens 8 Zeichen", 400);
  if (!name) return fail("Bitte deinen Namen angeben", 400);

  const sb = supabaseAdmin();

  // Spam-Bremse
  const { data: list, error: lErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (lErr) return fail("Registrierung gerade nicht möglich – bitte später erneut versuchen", 503);
  const pending = (list?.users ?? []).filter((u) => roleOfUser(u) === "pending");
  const hourAgo = Date.now() - 60 * 60 * 1000;
  if (pending.length >= MAX_PENDING_TOTAL || pending.filter((u) => Date.parse(u.created_at) > hourAgo).length >= MAX_PENDING_PER_HOUR) {
    return fail("Gerade warten schon viele Anmeldungen auf Freischaltung – bitte später erneut versuchen", 429);
  }
  if ((list?.users ?? []).some((u) => (u.email ?? "").toLowerCase() === email)) {
    return fail("Diese E-Mail ist schon registriert – bitte anmelden", 409);
  }

  const { error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // keine Bestätigungs-Mail – stattdessen Freischaltung durch den Admin
    app_metadata: { role: "pending" },
    user_metadata: { display_name: name, signup_note: note || null },
  });
  if (error) return fail(`Registrierung fehlgeschlagen: ${error.message}`, 400);

  return NextResponse.json({ ok: true });
}
