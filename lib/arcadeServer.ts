// 🕹️ Arcade-Modus – Server: die nötigen Bots sicherstellen (vorhandene nehmen, fehlende einmal anlegen).
// - Klassische Bots (Robo-Rookie …): vorhandenes Bot-Profil mit genau diesem Namen; sonst angelegt.
// - Alle anderen: über profiles.arcade_key (z. B. "pro:1600"); fehlt er → anlegen (is_bot, bot_kind, Elo).

import type { supabaseAdmin } from "@/lib/supabaseServer";
import type { ArcadeStageSpec } from "@/lib/arcade";

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
