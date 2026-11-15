// 🤖 Bot-Statistik eines Profils.
// GET /api/players/bot-stats?profileId=...
// - Mensch: Bilanz gegen jeden KI-Bot           -> mode "bots"
// - Bot:    Bilanz gegen jeden menschlichen Gegner -> mode "humans"
// -> { ok: true, mode, rows: [{ profileId, name, icon, color, elo, isBot, matches, wins, losses, draws, winrate }], total }
// Gezählt werden Matches, in denen beide einen Platz haben (weiter vorne = Sieg aus Sicht des Profils).
// Platzhalter-/Testprofile zählen nicht als Gegner.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Agg = { matches: number; wins: number; losses: number; draws: number };
type MpRow = { match_id: string; player_id: string; position: number | null };

const pct = (a: Agg) => (a.matches ? Math.round((a.wins / a.matches) * 1000) / 10 : null);

export async function GET(req: Request) {
  try {
    const profileId = String(new URL(req.url).searchParams.get("profileId") ?? "").trim();
    if (!profileId) return NextResponse.json({ ok: false, error: "profileId fehlt" }, { status: 400 });
    const sb = supabaseAdmin();

    const { data: self, error: sErr } = await sb.from("profiles").select("id, is_bot").eq("id", profileId).maybeSingle();
    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
    const mode: "bots" | "humans" = self?.is_bot ? "humans" : "bots";
    const empty = { ok: true, mode, rows: [], total: { matches: 0, wins: 0, losses: 0, draws: 0, winrate: null } };

    // eigene Spieler-Einträge + eigene Plätze je Match
    const { data: myPlayers, error: mpErr } = await sb.from("players").select("id").eq("profile_id", profileId);
    if (mpErr) return NextResponse.json({ ok: false, error: mpErr.message }, { status: 500 });
    const myPlayerIds = (myPlayers ?? []).map((p: any) => String(p.id));
    if (!myPlayerIds.length) return NextResponse.json(empty);

    const mine = await fetchAllIn<MpRow>(myPlayerIds, (chunk) =>
      sb.from("match_players").select("match_id, player_id, position").in("player_id", chunk).order("match_id").order("player_id")
    );
    if (mine.error) return NextResponse.json({ ok: false, error: mine.error.message }, { status: 500 });
    const myPosByMatch = new Map(mine.data.map((r) => [String(r.match_id), r.position]));
    if (!myPosByMatch.size) return NextResponse.json(empty);

    // alle Mitspieler in diesen Matches
    const all = await fetchAllIn<MpRow>(Array.from(myPosByMatch.keys()), (chunk) =>
      sb.from("match_players").select("match_id, player_id, position").in("match_id", chunk).order("match_id").order("player_id")
    );
    if (all.error) return NextResponse.json({ ok: false, error: all.error.message }, { status: 500 });
    const mySet = new Set(myPlayerIds);
    const others = all.data.filter((r) => !mySet.has(String(r.player_id)));

    const pl = await fetchAllIn<{ id: string; profile_id: string | null }>(
      Array.from(new Set(others.map((r) => String(r.player_id)))),
      (chunk) => sb.from("players").select("id, profile_id").in("id", chunk).order("id")
    );
    if (pl.error) return NextResponse.json({ ok: false, error: pl.error.message }, { status: 500 });
    const profileOfPlayer = new Map(pl.data.map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));

    const prof = await fetchAllIn<{
      id: string;
      name: string | null;
      icon: string | null;
      color: string | null;
      rating: number | null;
      is_bot: boolean | null;
      exclude_from_stats: boolean | null;
    }>(
      Array.from(new Set(Array.from(profileOfPlayer.values()).filter(Boolean) as string[])),
      (chunk) =>
        sb.from("profiles").select("id, name, icon, color, rating, is_bot, exclude_from_stats").in("id", chunk).order("id")
    );
    if (prof.error) return NextResponse.json({ ok: false, error: prof.error.message }, { status: 500 });
    const profById = new Map(prof.data.map((p) => [String(p.id), p]));

    const agg = new Map<string, Agg>();
    for (const r of others) {
      const opp = profileOfPlayer.get(String(r.player_id));
      const op = opp ? profById.get(opp) : undefined;
      if (!op || op.exclude_from_stats) continue;
      // Mensch → nur Bots als Gegner; Bot → nur Menschen als Gegner
      if (mode === "bots" ? !op.is_bot : op.is_bot) continue;
      const me = myPosByMatch.get(String(r.match_id));
      if (typeof me !== "number" || typeof r.position !== "number") continue;
      const a = agg.get(String(op.id)) ?? { matches: 0, wins: 0, losses: 0, draws: 0 };
      a.matches++;
      if (me < r.position) a.wins++;
      else if (me > r.position) a.losses++;
      else a.draws++;
      agg.set(String(op.id), a);
    }

    const rows = Array.from(agg.entries())
      .map(([id, a]) => {
        const p = profById.get(id)!;
        return {
          profileId: id,
          name: String(p.name ?? "?"),
          icon: p.icon ?? null,
          color: p.color ?? null,
          elo: p.rating != null ? Number(p.rating) : null,
          isBot: p.is_bot === true,
          ...a,
          winrate: pct(a),
        };
      })
      .sort((x, y) =>
        mode === "bots" ? (x.elo ?? 0) - (y.elo ?? 0) : y.matches - x.matches || x.name.localeCompare(y.name)
      );
    const total = rows.reduce(
      (t: Agg, r) => ({ matches: t.matches + r.matches, wins: t.wins + r.wins, losses: t.losses + r.losses, draws: t.draws + r.draws }),
      { matches: 0, wins: 0, losses: 0, draws: 0 }
    );
    return NextResponse.json({ ok: true, mode, rows, total: { ...total, winrate: pct(total) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("players/bot-stats crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
