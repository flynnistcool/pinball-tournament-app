export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const mode = String(url.searchParams.get("mode") ?? "match");
  const best = String(url.searchParams.get("best") ?? "8");
  const participation = String(url.searchParams.get("participation") ?? "0");

  const apiUrl = new URL(`/api/league/standings?year=${encodeURIComponent(String(year))}&mode=${encodeURIComponent(mode)}&best=${encodeURIComponent(best)}&participation=${encodeURIComponent(participation)}`, url.origin);
  const res = await fetch(apiUrl, { cache: "no-store" });
  if (!res.ok) return new Response("Fehler", { status: 500 });
  const j = await res.json();

  const esc = (s: string) => `"${String(s).replaceAll('"','""')}"`;
  const lines = ["rank,name,points,counted_tournaments,dropped_tournaments,total_tournaments,matches,wins,winrate_percent"];
  for (const r of (j.standings ?? [])) {
    lines.push([r.rank, esc(r.name), r.points, r.countedTournaments, r.droppedTournaments, r.tournamentsPlayed, r.matches, r.wins, String(r.winrate).replace(".", ",")].join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="league_${year}.csv"`
    }
  });
}
