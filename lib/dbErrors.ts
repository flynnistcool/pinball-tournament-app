// 🧯 Supabase-Fehler sauber unterscheiden:
// - "keine Zeile gefunden" (PostgREST-Code PGRST116 bei .single()) → echtes "nicht gefunden" (404)
// - alles andere (Verbindung, Zeitüberschreitung, Spalte fehlt …) → echter Datenbank-Fehler (500)
//   mit dem echten Grund, statt ihn als "nicht gefunden" zu verschleiern.

type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

export function isNoRowsError(err: DbErrorLike): boolean {
  return !!err && err.code === "PGRST116";
}

/** Echter DB-Fehler (nicht "keine Zeile")? → lesbarer Text, sonst null. Loggt den Fehler mit Kontext. */
export function realDbError(err: DbErrorLike, context: string): string | null {
  if (!err || isNoRowsError(err)) return null;
  const msg = String(err.message ?? err.code ?? "unbekannter Fehler");
  console.error(`[DB] ${context}:`, err);
  return `Datenbank-Fehler (${context}): ${msg}`;
}
