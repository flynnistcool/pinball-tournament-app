import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const {
    id,
    rating,
    provisionalMatches,
    resetMatchesPlayed,
    color,
    icon,
    isBot,
    excludeFromStats,
  }: {
    id?: string;
    rating?: number;
    provisionalMatches?: number;
    resetMatchesPlayed?: boolean;
    color?: string | null;
    icon?: string | null;
    isBot?: boolean;
    excludeFromStats?: boolean;
  } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Profil-ID fehlt" },
      { status: 400 }
    );
  }

  // 🛡️ Elo-Felder sind optional: nur was mitgeschickt wird, wird geändert
  // (Farbe/Icon/Name speichern darf nie einen alten Elo-Wert zurückschreiben).
  const hasRating = rating !== undefined && rating !== null;
  const hasProvisional = provisionalMatches !== undefined && provisionalMatches !== null;

  // Rating normalisieren
  const ratingNum = Number(rating);
  const newRating =
    Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : 1500;

  // Provisional normalisieren (0–50)
  const provisionalNum = Number(provisionalMatches);
  const newProvisional =
    Number.isFinite(provisionalNum) && provisionalNum >= 0
      ? Math.min(50, Math.max(0, provisionalNum))
      : 10;

  // Farbe & Icon normalisieren
  const colorStr =
    typeof color === "string" && color.trim().length > 0
      ? color.trim()
      : null;

  const iconStr =
    typeof icon === "string" && icon.trim().length > 0
      ? icon.trim()
      : null;

  const sb = supabaseAdmin();

  // 🛡️ Elo ändern ist gesperrt, solange der Spieler in einem laufenden Turnier ist
  // (das Turnier rechnet seine Elo laufend neu und würde die Änderung überschreiben bzw. durcheinanderbringen).
  if (hasRating || hasProvisional || resetMatchesPlayed) {
    const running = await runningTournamentsOf(sb, id);
    if (running.error) {
      return NextResponse.json({ ok: false, error: running.error }, { status: 500 });
    }
    if (running.names.length) {
      const list = running.names.map((n) => `„${n}“`).join(", ");
      return NextResponse.json(
        {
          ok: false,
          error:
            `Elo kann gerade nicht geändert werden – der Spieler ist im laufenden Turnier ${list}. ` +
            `Bitte erst das Turnier beenden. (Farbe, Icon usw. lassen sich ohne Elo-Änderung speichern.)`,
        },
        { status: 409 }
      );
    }
  }

  const update: any = {
    color: colorStr,
    icon: iconStr,
  };
  if (hasRating) update.rating = newRating;
  if (hasProvisional) update.provisional_matches = newProvisional;

  // 🤖 KI-Bot-Schalter nur ändern, wenn er mitgeschickt wird (alte Aufrufer bleiben unverändert)
  if (typeof isBot === "boolean") {
    update.is_bot = isBot;
    update.bot_kind = isBot ? "fixed" : null;
  }

  // 🚫 Platzhalter-Schalter nur ändern, wenn mitgeschickt
  if (typeof excludeFromStats === "boolean") {
    update.exclude_from_stats = excludeFromStats;
  }

  if (resetMatchesPlayed) {
    update.matches_played = 0;
  }

  const { data, error } = await sb
    .from("profiles")
    .update(update)
    .eq("id", id)
    .select(
      "id, name, avatar_url, rating, matches_played, provisional_matches, color, icon, is_bot, bot_kind, exclude_from_stats"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data });
}

/** Namen der nicht beendeten Turniere, in denen dieses Profil mitspielt */
async function runningTournamentsOf(
  sb: ReturnType<typeof supabaseAdmin>,
  profileId: string
): Promise<{ names: string[]; error?: string }> {
  const { data: pl, error: pErr } = await sb.from("players").select("tournament_id").eq("profile_id", profileId);
  if (pErr) return { names: [], error: pErr.message };
  const ids = Array.from(new Set((pl ?? []).map((p: any) => p.tournament_id).filter(Boolean)));
  if (!ids.length) return { names: [] };
  const { data: ts, error: tErr } = await sb.from("tournaments").select("id, name, code, status").in("id", ids);
  if (tErr) return { names: [], error: tErr.message };
  return {
    names: (ts ?? [])
      .filter((t: any) => String(t.status ?? "") !== "finished")
      .map((t: any) => String(t.name || t.code || "?")),
  };
}
