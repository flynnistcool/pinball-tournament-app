export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearCategory = url.searchParams.get("category");
  // Backwards compatible: league years
  const res = await fetch(new URL(`/api/season/years?category=${encodeURIComponent(yearCategory ?? "league")}`, url.origin), { cache: "no-store" });
  const j = await res.json().catch(()=>({}));
  return new Response(JSON.stringify(j), { status: res.status, headers: { "Content-Type": "application/json" } });
}
