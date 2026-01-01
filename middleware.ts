import { NextResponse, NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

// Variante A ("ich bin immer Admin"):
// - /t ist Admin-only und erfordert einen Supabase-Login.
// - Öffentliche Ansicht läuft über /s und /api/public/*.
// - Sonstige /api/* Endpoints sind Admin-only.
const PUBLIC_PREFIXES = [
  "/", // root
  "/public",
  "/p",
  "/s",
  "/_next",
  "/favicon.ico",
  "/api/public",
  "/api/health",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow public pages/APIs
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname === "/login") return NextResponse.next();

  // Admin pages: require session
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

export const config = {
  matcher: ["/((?!.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)"],
};