// 🔐 Rollen der Logins (Supabase Auth) – an EINER Stelle.
//
// Die Rolle steht NUR in app_metadata.role ("admin" | "viewer"). app_metadata kann ausschließlich
// der Server / die Datenbank setzen. user_metadata dagegen darf jeder Benutzer selbst ändern
// (supabase.auth.updateUser) – deshalb wird es für Rechte NIE verwendet.

export type AppRole = "admin" | "viewer";

type UserLike = { app_metadata?: Record<string, unknown> | null } | null | undefined;

export function roleOfUser(user: UserLike): AppRole {
  return user?.app_metadata?.role === "admin" ? "admin" : "viewer";
}

export function isAdminUser(user: UserLike): boolean {
  return roleOfUser(user) === "admin";
}

/**
 * Schnittstellen, die Zuschauer (eingeloggt, aber kein Admin) aufrufen dürfen.
 * Grundsatz: Lesen ja, Ändern nein.
 * - alle GET-Anfragen (außer ADMIN_ONLY_GET)
 * - diese POST-Anfragen, die nur LESEN (Statistiken laden per POST)
 */
export const VIEWER_POST_READS: readonly string[] = [
  "/api/admin/verify",
  "/api/finals/state",
  "/api/players/elo-history",
  "/api/players/head-to-head",
  "/api/players/machine-stats",
  "/api/players/stats",
  "/api/players/success-tables",
  "/api/rounds/current",
  "/api/standings",
  "/api/stats",
  "/api/tournaments/highscores",
  "/api/tournaments/load",
  "/api/winrates/machine-location",
];

/** GET-Schnittstellen, die trotzdem nur Admins sehen dürfen */
export const ADMIN_ONLY_GET: readonly string[] = [
  "/api/players/links", // persönliche QR-Links → damit kann man Ergebnisse eintragen
];

/** Darf ein Zuschauer diese API-Anfrage stellen? (Admins dürfen immer) */
export function viewerMayCall(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  const p = pathname.replace(/\/+$/, "");
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return !ADMIN_ONLY_GET.includes(p);
  if (m === "POST") return VIEWER_POST_READS.includes(p);
  return false;
}
