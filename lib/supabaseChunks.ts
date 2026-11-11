// Hilfsfunktion für Supabase-Abfragen mit langen ID-Listen (.in("spalte", ids)).
//
// Problem 1: Supabase packt alle IDs in die URL der Anfrage. Bei hunderten/tausenden
//            IDs wird die URL zu lang -> "TypeError: fetch failed".
// Problem 2: Supabase liefert pro Abfrage höchstens 1000 Zeilen (Rest wird still abgeschnitten).
//
// Lösung: IDs in Pakete aufteilen (CHUNK_SIZE) und pro Paket seitenweise (PAGE_SIZE) laden.
//
// Verwendung:
//   const { data, error } = await fetchAllIn<Row>(ids, (chunk) =>
//     sb.from("match_players").select("match_id, player_id, score")
//       .in("match_id", chunk)
//       .order("match_id").order("player_id")   // stabile Reihenfolge für die Seiten
//   );

const CHUNK_SIZE = 100; // IDs pro Anfrage (UUIDs ~37 Zeichen -> ~4 KB URL)
const PAGE_SIZE = 1000; // Supabase-Standardlimit pro Antwort

type RangeableQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>;
};

export async function fetchAllIn<T>(
  ids: readonly string[],
  build: (chunk: string[]) => RangeableQuery<T>,
  chunkSize: number = CHUNK_SIZE
): Promise<{ data: T[]; error: { message: string } | null }> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out: T[] = [];

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await build(chunk).range(from, from + PAGE_SIZE - 1);
      if (error) return { data: out, error: { message: String(error.message ?? error) } };
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }

  return { data: out, error: null };
}
