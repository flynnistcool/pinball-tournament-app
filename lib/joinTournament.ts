// lib/joinTournament.ts
export type JoinTournamentResult =
  | { ok: true; code: string; tournament: any }
  | { ok: false; code: string; error: string };

export async function joinTournamentByCode(codeRaw: string): Promise<JoinTournamentResult> {
  const c = (codeRaw ?? "").trim().toUpperCase();
  if (!c) return { ok: false, code: c, error: "Kein Code angegeben" };

  const res = await fetch("/api/tournaments/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: c, _ts: Date.now() }), // cache-bust
    cache: "no-store",
  });

  const j = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { ok: false, code: c, error: j.error ?? "Fehler" };
  }

  // Side effects, die du sowieso brauchst:
  localStorage.setItem("pb_code", c);

  return { ok: true, code: c, tournament: j.tournament };
}
