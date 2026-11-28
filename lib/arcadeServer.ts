// 🕹️ Arcade-Modus – Server: die nötigen Bots sicherstellen (vorhandene nehmen, fehlende einmal anlegen),
// Läufe auswerten (Freischalten, Rangliste, Hall of Fame, Profil) und Gegner für Monster-Rush/Spiegel/Zufall.
// - Klassische Bots (Robo-Rookie …): vorhandenes Bot-Profil mit genau diesem Namen; sonst angelegt.
// - Alle anderen: über profiles.arcade_key (z. B. "pro:1600"); fehlt er → anlegen (is_bot, bot_kind, Elo).

import type { supabaseAdmin } from "@/lib/supabaseServer";
import { arcadeDuelWon, arcadeState, type ArcadeDuel, type ArcadeRun, type ArcadeStageSpec } from "@/lib/arcade";
import { fetchAllIn } from "@/lib/supabaseChunks";

type Sb = ReturnType<typeof supabaseAdmin>;

export async function ensureArcadeBots(
  sb: Sb,
  specs: readonly ArcadeStageSpec[]
): Promise<{ ids: Record<string, string>; error: string | null }> {
  const ids: Record<string, string> = {};

  const { data: bots, error } = await sb.from("profiles").select("id, name, arcade_key").eq("is_bot", true);
  if (error) return { ids, error: `Bots laden fehlgeschlagen (supabase_arcade.sql ausgeführt?): ${error.message}` };
  const list = (bots ?? []) as { id: string; name: string | null; arcade_key: string | null }[];

  for (const s of specs) {
    if (ids[s.key]) continue;
    const byKey = list.find((b) => b.arcade_key === s.key);
    const byName = s.classic
      ? list.find((b) => String(b.name ?? "").trim().toLowerCase() === s.name.trim().toLowerCase())
      : undefined;
    const hit = byName ?? byKey;
    if (hit) {
      ids[s.key] = String(hit.id);
      continue;
    }
    const { data: created, error: cErr } = await sb
      .from("profiles")
      .insert({
        name: s.name,
        rating: s.elo,
        provisional_matches: 0,
        matches_played: 0,
        is_bot: true,
        bot_kind: s.kind,
        arcade_key: s.key,
      })
      .select("id")
      .single();
    if (cErr || !created) {
      return {
        ids,
        error: `Bot „${s.name}“ konnte nicht angelegt werden (supabase_arcade.sql und supabase_bot_kinds_character.sql ausgeführt?): ${cErr?.message ?? "?"}`,
      };
    }
    ids[s.key] = String((created as { id: string }).id);
    list.push({ id: ids[s.key], name: s.name, arcade_key: s.key });
  }
  return { ids, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏆 Läufe auswerten (Freischalten, Rangliste, Hall of Fame, Profil)

/** alle Arcade-Läufe (optional nur eines Spielers) mit ihrem Stand */
export async function loadArcadeRuns(sb: Sb, opts: { profileId?: string | null } = {}): Promise<{ runs: ArcadeRun[]; error: string | null }> {
  let q = sb
    .from("tournaments")
    .select("id, code, status, format, created_at, arcade_mode, arcade_lives, arcade_stages, arcade_profile_id")
    .not("arcade_mode", "is", null);
  if (opts.profileId) q = q.eq("arcade_profile_id", opts.profileId);
  const { data: ts, error } = await q;
  if (error) return { runs: [], error: `Arcade-Läufe laden fehlgeschlagen (supabase_arcade.sql ausgeführt?): ${error.message}` };
  const tours = (ts ?? []) as {
    id: string;
    code: string;
    status: string | null;
    format: string | null;
    created_at: string | null;
    arcade_mode: string;
    arcade_lives: number | null;
    arcade_stages: string[] | null;
    arcade_profile_id: string | null;
  }[];
  if (!tours.length) return { runs: [], error: null };
  const tIds = tours.map((t) => String(t.id));

  const pl = await fetchAllIn<{ id: string; name: string | null; profile_id: string | null; tournament_id: string }>(tIds, (chunk) =>
    sb.from("players").select("id, name, profile_id, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (pl.error) return { runs: [], error: pl.error.message };
  const rd = await fetchAllIn<{ id: string; number: number | null; tournament_id: string }>(tIds, (chunk) =>
    sb.from("rounds").select("id, number, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (rd.error) return { runs: [], error: rd.error.message };
  const ma = await fetchAllIn<{ id: string; round_id: string }>(
    rd.data.map((r) => String(r.id)),
    (chunk) => sb.from("matches").select("id, round_id").in("round_id", chunk).order("id")
  );
  if (ma.error) return { runs: [], error: ma.error.message };
  const mp = await fetchAllIn<{ match_id: string; player_id: string; position: number | null; score: number | string | null }>(
    ma.data.map((m) => String(m.id)),
    (chunk) => sb.from("match_players").select("match_id, player_id, position, score").in("match_id", chunk).order("match_id").order("player_id")
  );
  if (mp.error) return { runs: [], error: mp.error.message };

  const roundById = new Map(rd.data.map((r) => [String(r.id), r]));
  const mpsByMatch = new Map<string, typeof mp.data>();
  for (const r of mp.data) {
    const list = mpsByMatch.get(String(r.match_id)) ?? [];
    list.push(r);
    mpsByMatch.set(String(r.match_id), list);
  }
  const matchesByT = new Map<string, { id: string; round: number }[]>();
  for (const m of ma.data) {
    const r = roundById.get(String(m.round_id));
    if (!r) continue;
    const list = matchesByT.get(String(r.tournament_id)) ?? [];
    list.push({ id: String(m.id), round: Number(r.number ?? 0) });
    matchesByT.set(String(r.tournament_id), list);
  }

  const runs: ArcadeRun[] = [];
  for (const t of tours) {
    const stages = Array.isArray(t.arcade_stages) ? t.arcade_stages : [];
    if (!stages.length || !t.arcade_profile_id) continue;
    const me = pl.data.find((p) => String(p.tournament_id) === String(t.id) && String(p.profile_id) === String(t.arcade_profile_id));
    if (!me) continue;
    const duels: ArcadeDuel[] = (matchesByT.get(String(t.id)) ?? []).map((m) => {
      const rows = mpsByMatch.get(m.id) ?? [];
      const mine = rows.find((x) => String(x.player_id) === String(me.id));
      const bot = rows.find((x) => String(x.player_id) !== String(me.id));
      const v = (x?: { position: number | null; score: number | string | null }) => ({
        position: x?.position ?? null,
        score: x?.score != null && x.score !== "" ? Number(x.score) : null,
      });
      return { roundNumber: m.round, won: mine && bot ? arcadeDuelWon(v(mine), v(bot)) : null };
    });
    const st = arcadeState(stages.length, Number(t.arcade_lives ?? 1), duels);
    runs.push({
      tournamentId: String(t.id),
      code: String(t.code),
      profileId: String(t.arcade_profile_id),
      playerName: String(me.name ?? "?"),
      mode: String(t.arcade_mode),
      stagesTotal: stages.length,
      wins: st.wins,
      livesStart: st.livesStart,
      livesLeft: st.livesLeft,
      status: st.status,
      finished: t.status === "finished",
      at: t.created_at ?? null,
      format: t.format ?? null,
    });
  }
  return { runs, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// ☠️/🪞/🎲 Gegner für Modi, die erst beim Start zusammengestellt werden

type BotRow = {
  id: string;
  name: string | null;
  rating: number | null;
  bot_kind: string | null;
  arcade_key: string | null;
  bot_owner_profile_id: string | null;
};
const FIXED_KINDS = new Set(["fixed", "gambler", "pro", "specialist", "character"]);

export async function buildDynamicStages(sb: Sb, mode: string, profileId: string): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await sb
    .from("profiles")
    .select("id, name, rating, bot_kind, arcade_key, bot_owner_profile_id")
    .eq("is_bot", true);
  if (error) return { ids: [], error: error.message };
  const bots = (data ?? []) as BotRow[];

  if (mode === "monster_rush") {
    // alle SELBST angelegten Bots mit fester Elo (ohne 🕹️ Arcade-Bots), der Stärke nach – 👑 Champion + 🤖 Terminator ans Ende
    const own = bots
      .filter((b) => !b.arcade_key && FIXED_KINDS.has(String(b.bot_kind ?? "fixed")))
      .filter((b) => String(b.name ?? "").trim().toLowerCase() !== "terminator")
      .sort((a, b) => Number(a.rating ?? 0) - Number(b.rating ?? 0));
    const ends = await ensureArcadeBots(sb, [
      { key: "champion", name: "Der Champion", kind: "champion", elo: 2400 },
      { key: "classic:terminator", name: "Terminator", kind: "fixed", elo: 2500, classic: true },
    ]);
    if (ends.error) return { ids: [], error: ends.error };
    const ids = [...own.map((b) => String(b.id)), ends.ids["champion"], ends.ids["classic:terminator"]];
    if (ids.length < 3) return { ids: [], error: "Für den Monster-Rush braucht es eigene Bots mit fester Elo." };
    return { ids, error: null };
  }

  if (mode === "random") {
    const pool = bots.filter(
      (b) => FIXED_KINDS.has(String(b.bot_kind ?? "fixed")) && Number(b.rating ?? 0) >= 1300 && Number(b.rating ?? 0) <= 2100
    );
    if (pool.length < 5) return { ids: [], error: "Zu wenige Bots zwischen 1300 und 2100 Elo für den Zufall-Modus." };
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    return { ids: picked.sort((a, b) => Number(a.rating ?? 0) - Number(b.rating ?? 0)).map((b) => String(b.id)), error: null };
  }

  if (mode === "mirror") {
    // 🪞 Spiegel: ⚡ deine Form → 👻 du selbst → 🥊 dein Rivale → 👻 Ghost des Besten (höchste Elo, ohne dich)
    const { data: me } = await sb.from("profiles").select("id, name, rating").eq("id", profileId).maybeSingle();
    if (!me) return { ids: [], error: "Spieler nicht gefunden" };
    const { data: humans } = await sb
      .from("profiles")
      .select("id, name, rating, exclude_from_stats")
      .eq("is_bot", false)
      .order("rating", { ascending: false })
      .limit(20);
    const best = ((humans ?? []) as { id: string; name: string | null; rating: number | null; exclude_from_stats?: boolean | null }[]).find(
      (h) => String(h.id) !== String(profileId) && !h.exclude_from_stats
    );
    if (!best) return { ids: [], error: "Kein anderer Spieler für den Ghost des Besten gefunden." };
    const myName = String((me as { name?: string }).name ?? "?");
    const myElo = Number((me as { rating?: number }).rating ?? 1500);
    const need = async (key: string, name: string, kind: string, ownerId: string, elo: number, extra: Record<string, unknown> = {}) => {
      const hit = bots.find((b) => b.arcade_key === key);
      if (hit) return { id: String(hit.id), error: null as string | null };
      const { data: c, error: e } = await sb
        .from("profiles")
        .insert({
          name,
          rating: elo,
          provisional_matches: 0,
          matches_played: 0,
          is_bot: true,
          bot_kind: kind,
          bot_owner_profile_id: ownerId,
          arcade_key: key,
          ...extra,
        })
        .select("id")
        .single();
      return { id: c ? String((c as { id: string }).id) : "", error: e ? e.message : null };
    };
    const form = await need(`mirror:form:${profileId}`, `Form von ${myName}`, "form", profileId, myElo);
    const ghost = await need(`mirror:ghost:${profileId}`, `Geist von ${myName}`, "ghost", profileId, myElo);
    // Rivale: vorhandenen Rivalen des Spielers nehmen, sonst einen anlegen
    const existingRival = bots.find((b) => b.bot_kind === "rival" && String(b.bot_owner_profile_id) === String(profileId));
    const rival = existingRival
      ? { id: String(existingRival.id), error: null as string | null }
      : await need(`mirror:rival:${profileId}`, `Rivale von ${myName}`, "rival", profileId, myElo, { bot_strength: myElo });
    const bestGhost = await need(`mirror:ghost:${best.id}`, `Geist von ${best.name ?? "?"}`, "ghost", String(best.id), Number(best.rating ?? 1500));
    const err = form.error || ghost.error || rival.error || bestGhost.error;
    if (err) return { ids: [], error: `Spiegel-Bots anlegen fehlgeschlagen: ${err}` };
    return { ids: [form.id, ghost.id, rival.id, bestGhost.id], error: null };
  }

  return { ids: [], error: "Unbekannter Modus" };
}
