// 🔐 Rollen der Logins (Supabase Auth) – an EINER Stelle.
//
// Die Rolle steht NUR in app_metadata.role ("admin" | "viewer" | "pending"). app_metadata kann ausschließlich
// der Server / die Datenbank setzen. user_metadata dagegen darf jeder Benutzer selbst ändern
// (supabase.auth.updateUser) – deshalb wird es für Rechte NIE verwendet.

/** pending = selbst registriert, wartet auf Freischaltung durch den Admin (darf noch nichts sehen) */
export type AppRole = "admin" | "viewer" | "pending";

type UserLike = { app_metadata?: Record<string, unknown> | null } | null | undefined;

export function roleOfUser(user: UserLike): AppRole {
  const r = user?.app_metadata?.role;
  return r === "admin" ? "admin" : r === "pending" ? "pending" : "viewer";
}

export function isPendingUser(user: UserLike): boolean {
  return roleOfUser(user) === "pending";
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
  "/api/admin/users", // 👥 Liste aller Logins (E-Mails, Rollen)
];

/**
 * Routen, die Zuschauer für ihr EIGENES verknüpftes Profil nutzen dürfen.
 * Die Middleware lässt sie (mit echt geprüftem Login) durch – die Route prüft dann selbst
 * mit lib/ownerAuth.ts → checkOwnerOrAdmin, ob das Profil wirklich zum Login gehört.
 */
export const OWNER_ROUTES: readonly string[] = [
  "/api/single-play/run/start",
  "/api/single-play/ball/upsert",
  "/api/single-play/run/finish",
  "/api/single-play/run/delete",
  "/api/single-play/run/delete-archive",
  "/api/profiles/setInfo",
  "/api/profiles/set-style",
  "/api/avatars/upload",
];

export function isOwnerRoute(pathname: string): boolean {
  return OWNER_ROUTES.includes(pathname.replace(/\/+$/, ""));
}

/** Darf ein Zuschauer diese API-Anfrage stellen? (Admins dürfen immer) */
export function viewerMayCall(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  const p = pathname.replace(/\/+$/, "");
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return !ADMIN_ONLY_GET.includes(p);
  if (m === "POST") return VIEWER_POST_READS.includes(p);
  return false;
}
