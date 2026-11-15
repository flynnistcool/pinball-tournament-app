// 🤖 KI-Bot würfelt seinen Score für ein Match (Round the Pinball).
// POST { code, matchId, playerId }
//  -> { ok: true, score, calc }   (calc = Rechenzettel, wird an match_players.bot_calc gespeichert)
//  -> { ok: false, error, calc? }
// Der Score selbst wird danach von der Oberfläche ganz normal über /api/match_players/set-score
// gespeichert (gleicher Weg wie eine Eingabe von Hand → Plätze, Rekorde usw. wie gewohnt).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { botsAllowedInFormat, effectiveExtraball, scoreLevel } from "@/lib/botRules";
import { computeBotScore } from "@/lib/botScore";
import { loadBotSamples } from "@/lib/botData";
import { loadBotSettings } from "@/lib/botSettingsServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Formate, in denen ein Bot seinen Score würfeln kann (Platz ergibt sich dann aus den Scores) */
const BOT_PLAY_FORMATS = new Set(["rotation", "matchplay", "swiss", "round_robin"]);

function fail(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    const matchId = String(body?.matchId ?? body?.match_id ?? "").trim();
    const playerId = String(body?.playerId ?? body?.player_id ?? "").trim();
    if (!code || !matchId || !playerId) return fail("Code, matchId oder playerId fehlt", 400);

    const sb = supabaseAdmin();

    const { data: t, error: tErr } = await sb
      .from("tournaments")
      .select("id, format, extraball, location_id, status, locations(name)")
      .eq("code", code)
      .maybeSingle();
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);
    const format = String((t as any).format ?? "").toLowerCase();
    if (!botsAllowedInFormat(format) || !BOT_PLAY_FORMATS.has(format)) {
      return fail("🤖 Bots können in diesem Format nicht spielen", 400);
    }
    if (!(t as any).location_id) {
      return fail("Das Turnier hat keine Location – der Bot braucht die Scores dieser Location.", 400);
    }

    const { data: player, error: pErr } = await sb
      .from("players")
      .select("id, name, profile_id")
      .eq("id", playerId)
      .eq("tournament_id", (t as any).id)
      .maybeSingle();
    if (pErr) return fail(`Spieler laden fehlgeschlagen: ${pErr.message}`, 500);
    if (!player?.profile_id) return fail("Spieler nicht gefunden", 404);

    const { data: prof, error: prErr } = await sb
      .from("profiles")
      .select("id, name, rating, is_bot")
      .eq("id", player.profile_id)
      .maybeSingle();
    if (prErr) return fail(`Profil laden fehlgeschlagen: ${prErr.message}`, 500);
    if (!prof?.is_bot) return fail("Dieser Spieler ist kein KI-Bot", 400);
    const botElo = Number(prof.rating ?? 1500);

    const { data: match, error: mErr } = await sb
      .from("matches")
      .select("id, machine_id, rounds!inner(tournament_id)")
      .eq("id", matchId)
      .eq("rounds.tournament_id", (t as any).id)
      .maybeSingle();
    if (mErr) return fail(`Match laden fehlgeschlagen: ${mErr.message}`, 500);
    if (!match) return fail("Match nicht gefunden (oder gehört nicht zum Turnier)", 404);

    const { data: mpRow, error: mpErr } = await sb
      .from("match_players")
      .select("score")
      .eq("match_id", matchId)
      .eq("player_id", playerId)
      .maybeSingle();
    if (mpErr) return fail(`Match-Spieler laden fehlgeschlagen: ${mpErr.message}`, 500);
    if (!mpRow) return fail("Der Bot spielt in diesem Match nicht mit", 400);
    if (mpRow.score != null) return fail("Der Bot hat hier schon einen Score", 400);

    let machineName = "";
    if ((match as any).machine_id) {
      const { data: mach } = await sb.from("machines").select("name").eq("id", (match as any).machine_id).maybeSingle();
      machineName = String(mach?.name ?? "");
    }
    if (!machineName.trim()) return fail("Diesem Match ist kein Flipper zugeordnet", 400);

    const { samples, error: dErr } = await loadBotSamples(sb, {
      locationId: String((t as any).location_id),
      machineName,
      excludeTournamentId: String((t as any).id),
    });
    if (dErr) return fail(dErr, 500);

    const extraball = effectiveExtraball(format, (t as any).extraball);
    const { settings } = await loadBotSettings(sb); // ⚙️ Stellschrauben aus dem Bot-Labor
    const calc = computeBotScore({
      botName: String(prof.name ?? player.name ?? "Bot"),
      botElo,
      machine: machineName.trim(),
      location: ((t as any).locations?.name as string | undefined) ?? null,
      format,
      extraball,
      level: scoreLevel(format, extraball) ?? "normal",
      levelOf: scoreLevel,
      samples,
      settings,
    });

    if (!calc.ok || calc.score == null) {
      return fail(calc.error ?? "Bot-Score konnte nicht berechnet werden", 422, { calc });
    }

    // 🧾 Rechenzettel speichern (Score speichert danach die Oberfläche über set-score)
    const { error: uErr } = await sb
      .from("match_players")
      .update({ bot_calc: calc })
      .eq("match_id", matchId)
      .eq("player_id", playerId);
    if (uErr) return fail(`Rechenzettel speichern fehlgeschlagen: ${uErr.message}`, 500);

    return NextResponse.json({ ok: true, score: calc.score, calc }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("bots/roll crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
