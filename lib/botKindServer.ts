// 👻/⚡/🥊 Bot-Art eines Profils prüfen (nur Server): 'fixed' (feste Elo), 'ghost' (spielt wie ein Spieler),
// 'form' (folgt der aktuellen Form eines Spielers), 'rival' (Rivalen-Bot, wächst mit seinem Spieler).
// Ghost/Form/Rivale brauchen einen echten Spieler (kein Bot).
// Liefert die Profil-Felder zum Speichern – bei Ghost/Form inkl. Elo des Spielers (Siegchance/Favorit);
// beim Rivalen die Startstärke (= Elo des Spielers beim Anlegen bzw. beim Wechsel des Spielers).

import type { supabaseAdmin } from "@/lib/supabaseServer";

type Sb = ReturnType<typeof supabaseAdmin>;

export type BotKind = "fixed" | "ghost" | "form" | "rival" | "gambler" | "pro" | "champion" | "specialist" | "character";

export function normalizeBotKind(v: unknown): BotKind {
  return ["ghost", "form", "rival", "gambler", "pro", "champion", "specialist", "character"].includes(String(v)) ? (v as BotKind) : "fixed";
}

export async function botKindFields(
  sb: Sb,
  selfId: string | null,
  botKindRaw: unknown,
  ownerRaw: unknown
): Promise<{ fields: Record<string, unknown>; error: string | null }> {
  const kind = normalizeBotKind(botKindRaw);
  // feste Elo (auch 🔴 Gambler / 🟣 Pro – nur andere Streuung): kein Spieler nötig
  if (["fixed", "gambler", "pro", "champion", "specialist", "character"].includes(kind)) {
    return { fields: { bot_kind: kind, bot_owner_profile_id: null }, error: null };
  }
  const ownerId = typeof ownerRaw === "string" ? ownerRaw.trim() : "";
  if (!ownerId) return { fields: {}, error: "Bitte den Spieler wählen, dem der Bot folgt." };
  if (selfId && ownerId === selfId) return { fields: {}, error: "Ein Bot kann nicht sich selbst folgen." };
  const { data: op, error } = await sb.from("profiles").select("id, rating, is_bot").eq("id", ownerId).maybeSingle();
  if (error) return { fields: {}, error: error.message };
  if (!op) return { fields: {}, error: "Spieler nicht gefunden." };
  if ((op as { is_bot?: boolean | null }).is_bot) return { fields: {}, error: "Ein Bot kann keinem anderen Bot folgen." };
  const r = (op as { rating?: number | null }).rating;
  const ownerElo = typeof r === "number" && Number.isFinite(r) ? r : null;
  const fields: Record<string, unknown> = { bot_kind: kind, bot_owner_profile_id: ownerId };

  if (kind === "rival") {
    // 🥊 Startstärke nur beim ersten Mal (oder neuer Spieler) setzen – sonst bleibt der Rivale, wie er ist
    if (selfId) {
      const { data: me } = await sb
        .from("profiles")
        .select("bot_kind, bot_owner_profile_id, bot_strength")
        .eq("id", selfId)
        .maybeSingle();
      const m = me as { bot_kind?: string | null; bot_owner_profile_id?: string | null; bot_strength?: number | null } | null;
      if (m?.bot_kind === "rival" && String(m.bot_owner_profile_id ?? "") === ownerId && m.bot_strength != null) {
        return { fields, error: null };
      }
    }
    const start = ownerElo ?? 1500;
    fields.bot_strength = start;
    fields.rating = start;
    return { fields, error: null };
  }

  // 👻/⚡ Elo des Bots = Elo seines Spielers (wird beim Würfeln erneut angeglichen)
  if (ownerElo != null) fields.rating = ownerElo;
  return { fields, error: null };
}
