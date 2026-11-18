// 🏦 Elo buchen (Server): ruft die Datenbank-Funktionen elo_book / elo_unbook auf (supabase_elo_parallel.sql).
// Rechnung siehe lib/eloLedger.ts – die Datenbank bucht in EINEM Schritt mit Sperre.
//
// Fehlt die Funktion noch (SQL nicht ausgeführt) → wie früher absolut schreiben (Rückfall),
// damit nichts kaputtgeht. Andere Fehler werden gemeldet (kein stilles absolutes Schreiben,
// das würde gleichzeitige Turniere wieder überschreiben).

import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export type EloEnd = { rating: number; matches: number; provisional: number };
export type BookStatus = "booked" | "legacy" | "unbooked" | "no_snapshot" | "fallback";

/** Fehlermeldung "Funktion gibt es nicht" (PostgREST PGRST202 bzw. Postgres 42883) */
function missingFunction(err: { code?: string; message?: string } | null | undefined, name: string): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  return new RegExp(`(could not find|does not exist).*${name}|${name}.*(could not find|does not exist)`, "i").test(err.message ?? "");
}

/** Ergebnis eines Turniers für einen Spieler buchen (Endstand aus dem Nachspielen vom Foto aus) */
export async function bookElo(sb: Sb, tournamentId: string, profileId: string, end: EloEnd): Promise<BookStatus> {
  const { data, error } = await sb.rpc("elo_book", {
    p_tournament_id: tournamentId,
    p_profile_id: profileId,
    p_rating_end: end.rating,
    p_matches_end: Math.round(end.matches),
    p_provisional_end: Math.round(end.provisional),
  });
  if (!error) return (String(data ?? "booked") as BookStatus) || "booked";
  if (!missingFunction(error, "elo_book")) throw new Error(`Elo buchen fehlgeschlagen: ${error.message}`);
  // Rückfall (SQL noch nicht ausgeführt): wie früher absolut
  const { error: uErr } = await sb
    .from("profiles")
    .update({ rating: end.rating, matches_played: end.matches, provisional_matches: end.provisional })
    .eq("id", profileId);
  if (uErr) throw new Error(`Elo speichern fehlgeschlagen: ${uErr.message}`);
  return "fallback";
}

/** Anteil eines (laufenden) Turniers zurückbuchen – z. B. beim Löschen */
export async function unbookElo(
  sb: Sb,
  tournamentId: string,
  profileId: string,
  snapshot: { rating_before: number; matches_before: number | null; provisional_before: number | null }
): Promise<BookStatus> {
  const { data, error } = await sb.rpc("elo_unbook", { p_tournament_id: tournamentId, p_profile_id: profileId });
  if (!error) return (String(data ?? "unbooked") as BookStatus) || "unbooked";
  if (!missingFunction(error, "elo_unbook")) throw new Error(`Elo zurückbuchen fehlgeschlagen: ${error.message}`);
  // Rückfall: wie früher aufs Foto zurück
  const { error: uErr } = await sb
    .from("profiles")
    .update({
      rating: snapshot.rating_before,
      matches_played: snapshot.matches_before,
      provisional_matches: snapshot.provisional_before,
    })
    .eq("id", profileId);
  if (uErr) throw new Error(`Elo zurücksetzen fehlgeschlagen: ${uErr.message}`);
  return "fallback";
}
