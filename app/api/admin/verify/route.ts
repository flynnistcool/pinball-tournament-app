import { NextResponse } from "next/server";
// Variante A: Admin-Zugriff wird über Supabase-Login + Middleware abgesichert.
// Dieser Endpoint bleibt als No-Op für alte Clients bestehen.

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: true });
}
