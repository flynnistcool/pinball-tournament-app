import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { isAdminUser, isOwnerRoute, isPendingUser, viewerMayCall } from "@/lib/authRoles";

// 🔐 Türsteher der App
// - Öffentlich (ohne Login): Startseite, /login, /public, /p, /s (TV + Handy-Eingabe per QR), /api/public/*, /api/health, /api/ocr
// - Alles andere braucht einen Login. Lesen: schnelle Cookie-Prüfung; Ändern: ECHTE Prüfung beim Server (getUser).
// - Rollen (lib/authRoles.ts, nur aus app_metadata):
//     Admin    → darf alles
//     Zuschauer → darf alle Seiten sehen und Daten LESEN, aber nichts ändern (API-Schreibzugriffe → 403)
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

  // Login + Registrierung sind immer erlaubt
  if (pathname === "/login" || pathname === "/register") return NextResponse.next();

  // ✅ Public pages/APIs erlauben
  // Wichtig: "/" als Prefix ist special — sonst matched es alles.
  if (
    pathname === "/" ||
    PUBLIC_PREFIXES.filter((p) => p !== "/").some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  // 🔒 Alles andere: Login nötig
  //    Seiten + LESEN: schnelle Prüfung (Session-Cookie, keine Anfrage an Supabase) – die Admin-Seite
  //    lädt ständig nach; eine Server-Prüfung pro Aufruf führt zu "Request rate limit reached".
  //    ÄNDERN (und Admin-only-Daten): ECHTE Prüfung beim Supabase-Server (getUser) + Admin-Rolle.
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const isApi = pathname.startsWith("/api/");
  const needsAdmin = isApi && !viewerMayCall(req.method, pathname);

  // 1) Session (erneuert abgelaufene Anmeldungen automatisch und schreibt die neuen Cookies)
  const { data: sess } = await supabase.auth.getSession();
  let user: { app_metadata?: Record<string, unknown> | null } | null = sess.session?.user ?? null;

  // 2) Ändern / Admin-Daten: zusätzlich ECHT beim Supabase-Server prüfen
  if (user && needsAdmin) {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const status = Number((error as { status?: number }).status ?? 0);
      if (status === 401 || status === 403) {
        user = null; // Anmeldung ungültig → wie nicht angemeldet
      } else {
        // Supabase gerade nicht erreichbar / Limit erreicht → ehrlich melden, nicht "Bitte anmelden"
        return NextResponse.json(
          { ok: false, error: `Anmeldung konnte gerade nicht geprüft werden – bitte kurz warten und erneut versuchen (${error.message})` },
          { status: 503 }
        );
      }
    } else {
      user = data.user;
    }
  }

  if (!user) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "Bitte anmelden" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ⏳ Selbst registriert, noch nicht freigeschaltet: nur die Warte-Seite
  if (isPendingUser(user)) {
    if (pathname === "/wartet") return res;
    if (isApi) {
      return NextResponse.json({ ok: false, error: "⏳ Dein Konto wartet auf Freischaltung durch den Admin" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/wartet";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Freigeschaltete brauchen die Warte-Seite nicht mehr
  if (pathname === "/wartet") {
    const url = req.nextUrl.clone();
    url.pathname = "/t";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 🔒 Zuschauer: nur lesen (Ändern nur mit echt geprüftem Admin-Login).
  //    Ausnahme: "Eigenes Profil"-Routen – die prüfen selbst, ob das Profil zum Login gehört.
  if (needsAdmin && !isAdminUser(user) && !isOwnerRoute(pathname)) {
    return NextResponse.json({ ok: false, error: "🔒 Nur für Admins" }, { status: 403 });
  }

  return res;
}

// ✅ Matcher: schließt Next interne Assets + Manifest + Icons + Sounds sauber aus
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icon-192.png|icon-512.png|sounds).*)",
  ],
};
