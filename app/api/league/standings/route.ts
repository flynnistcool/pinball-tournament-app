export async function GET(req: Request) {
  const url = new URL(req.url);
  // Backwards compatible: league standings
  const year = url.searchParams.get("year") ?? "";
  const mode = url.searchParams.get("mode") ?? "";
  const best = url.searchParams.get("best") ?? "";
  const participation = url.searchParams.get("participation") ?? "";
  const target = new URL(`/api/season/standings?category=league&year=${encodeURIComponent(year)}&mode=${encodeURIComponent(mode)}&best=${encodeURIComponent(best)}&participation=${encodeURIComponent(participation)}`, url.origin);
  const res = await fetch(target, { cache: "no-store" });
  const j = await res.json().catch(()=>({}));
  return new Response(JSON.stringify(j), { status: res.status, headers: { "Content-Type": "application/json" } });
}
