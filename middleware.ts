import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

// Variante A ("ich bin immer Admin"):
// - /t ist Admin-only und erfordert einen Supabase-Login.
// - Öffentliche Ansicht läuft über /s und /api/public/*.
// - Sonstige /api/* Endpoints sind Admin-only.
const PUBLIC_PREFIXES = [
  "/", // root (Achtung: macht ALLES public, weil jeder Pfad mit "/" beginnt!)
  "/public",
  "/p",
  "/s",
  "/api/public",
  "/api/health",
  "/api/ocr", // ✅ HINZUFÜGEN
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Diese Dateien/Ordner NIE durch Auth/Middleware schicken
  // (sonst 307 Redirect auf /login und PWA/iPad Vollbild klappt nicht)
  if (
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    pathname.startsWith("/sounds/") ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  // Login ist immer erlaubt
  if (pathname === "/login") return NextResponse.next();

  // ✅ Public pages/APIs erlauben
  // Wichtig: "/" als Prefix ist special — sonst matched es alles.
  if (
    pathname === "/" ||
    PUBLIC_PREFIXES.filter((p) => p !== "/").some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  // 🔒 Alles andere: Admin-only → Session nötig
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

// ✅ Matcher: schließt Next interne Assets + Manifest + Icons + Sounds sauber aus
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icon-192.png|icon-512.png|sounds).*)",
  ],
};
