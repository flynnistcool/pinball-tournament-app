// Öffentlich (nur lesend) – für den Infobildschirm /s/CODE/tv.
//
// Liefert
//  - die Turnierserien-Tabelle = Turnierpunkte aller BEENDETEN Turniere derselben Kategorie
//    (exakt dieselbe Berechnung wie die Tabelle "🏆 Turnierpunkte (Kategorie)" unten im Turnier:
//     wir rufen dafür intern die bestehende Route /api/leaderboards/tournaments auf)
//  - die Turnierpunkte von HEUTE (dieses Turnier, aus tournament_results – erst nach "Turnier beenden")
//
// GET /api/public/series?code=ABC123
// -> { category, rows: [...], today: [{ playerId, profileId, tournamentPoints, finalRank }] }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { superFinalTpBonus } from "@/lib/points";
import { GET as leaderboardTournamentsGET } from "@/app/api/leaderboards/tournaments/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return noStoreJson({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, category")
    .eq("code", code)
    .maybeSingle();
  if (tErr) return noStoreJson({ error: tErr.message }, { status: 500 });
  if (!t) return noStoreJson({ error: "Turnier nicht gefunden" }, { status: 404 });

  const category = String(t.category ?? "").trim();

  // 1) Serien-Tabelle: gleiche Berechnung wie im Admin (interner Aufruf, kein HTTP)
  let rows: any[] = [];
  if (category) {
    const inner = new URL("/api/leaderboards/tournaments", url.origin);
    inner.searchParams.set("category", category);
    const res = await leaderboardTournamentsGET(new Request(inner.toString()));
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) return noStoreJson({ error: j?.error ?? "Serien-Tabelle fehlgeschlagen" }, { status: 500 });
    rows = (j?.rows ?? []).map((r: any) => ({
      profileId: r.profileId ?? null,
      name: r.name ?? "?",
      color: r.color ?? null,
      icon: r.icon ?? null,
      tournamentsPlayed: Number(r.tournamentsPlayed) || 0,
      firstPlaces: Number(r.firstPlaces) || 0,
      tournamentPoints: Number(r.tournamentPoints) || 0,
    }));
  }

  // 2) Turnierpunkte von heute (gibt es erst nach "Turnier beenden")
  const { data: tr, error: trErr } = await sb
    .from("tournament_results")
    .select("player_id, tournament_points, final_rank, super_final_rank")
    .eq("tournament_id", t.id);
  if (trErr) return noStoreJson({ error: trErr.message }, { status: 500 });

  const playerIds = (tr ?? []).map((r: any) => r.player_id).filter(Boolean);
  const profileByPlayer: Record<string, string | null> = {};
  if (playerIds.length) {
    const { data: ps } = await sb.from("players").select("id, profile_id").in("id", playerIds);
    for (const p of ps ?? []) profileByPlayer[p.id] = p.profile_id ?? null;
  }
  const today = (tr ?? []).map((r: any) => ({
    playerId: r.player_id,
    profileId: profileByPlayer[r.player_id] ?? null,
    tournamentPoints: Number(r.tournament_points) || 0,
    finalRank: r.final_rank ?? null,
    superFinalBonus: superFinalTpBonus(r.super_final_rank ?? null), // Anteil Superfinale an den TP
  }));

  return noStoreJson({ category, rows, today });
}
