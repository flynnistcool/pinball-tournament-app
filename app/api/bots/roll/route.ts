// 🤖 KI-Bot würfelt seinen Score für ein Match (Round the Pinball).
// POST { code, matchId, playerId }
//  -> { ok: true, score, calc }   (calc = Rechenzettel, wird an match_players.bot_calc gespeichert)
//  -> { ok: false, error, calc? }
// Der Score selbst wird danach von der Oberfläche ganz normal über /api/match_players/set-score
// gespeichert (gleicher Weg wie eine Eingabe von Hand → Plätze, Rekorde usw. wie gewohnt).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { botsAllowedInFormat, effectiveExtraball, scoreLevel } from "@/lib/botRules";
import { computeBotScore, settingsForKind } from "@/lib/botScore";
import { loadBotSamples } from "@/lib/botData";
import { loadBotSettings } from "@/lib/botSettingsServer";
import { computeMirrorBotScore, type MirrorKind } from "@/lib/botMirror";
import { loadOwnerMachineScores } from "@/lib/botMirrorData";
import { rivalStrength } from "@/lib/botRival";
import { computeChampionScore } from "@/lib/botChampion";
import { characterMachines, isSpecialistFavorite, specialistFavorites } from "@/lib/botSpecialist";
import { loadRivalDuels } from "@/lib/botRivalData";

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
      .select("id, name, rating, is_bot, bot_kind, bot_owner_profile_id, bot_strength")
      .eq("id", player.profile_id)
      .maybeSingle();
    if (prErr) return fail(`Profil laden fehlgeschlagen: ${prErr.message}`, 500);
    if (!prof?.is_bot) return fail("Dieser Spieler ist kein KI-Bot", 400);
    let botElo = Number(prof.rating ?? 1500);

    // 👻 Ghost-Bot / ⚡ Form-Bot: folgt einem Spieler – dessen Name + aktuelle Elo
    const mirrorKind: MirrorKind | null =
      (prof as any).bot_kind === "ghost" || (prof as any).bot_kind === "form" ? ((prof as any).bot_kind as MirrorKind) : null;
    let owner: { id: string; name: string; elo: number | null } | null = null;
    if (mirrorKind) {
      const ownerId = (prof as any).bot_owner_profile_id ? String((prof as any).bot_owner_profile_id) : "";
      if (!ownerId) return fail("Diesem Bot ist kein Spieler zugeordnet (Spieler-Tab → Bot bearbeiten).", 400);
      const { data: op, error: opErr } = await sb.from("profiles").select("id, name, rating").eq("id", ownerId).maybeSingle();
      if (opErr) return fail(`Spieler des Bots laden fehlgeschlagen: ${opErr.message}`, 500);
      if (!op) return fail("Der Spieler, dem dieser Bot folgt, existiert nicht mehr.", 400);
      const ownerElo = op.rating != null && Number.isFinite(Number(op.rating)) ? Number(op.rating) : null;
      owner = { id: String(op.id), name: String(op.name ?? "?"), elo: ownerElo };
      if (ownerElo != null) {
        botElo = ownerElo;
        // Elo des Bots = Elo seines Spielers (für Siegchance/Favorit); Bots werden nie neu berechnet
        if (Number(prof.rating) !== ownerElo) await sb.from("profiles").update({ rating: ownerElo }).eq("id", prof.id);
      }
    }

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

    const extraball = effectiveExtraball(format, (t as any).extraball);
    const { settings } = await loadBotSettings(sb); // ⚙️ Stellschrauben aus dem Bot-Labor
    const botName = String(prof.name ?? player.name ?? "Bot");
    const locationName = ((t as any).locations?.name as string | undefined) ?? null;
    const level = scoreLevel(format, extraball) ?? "normal";

    let calc: ReturnType<typeof computeBotScore> | null = null;
    let mirrorFallback: NonNullable<ReturnType<typeof computeBotScore>["mirror"]> | null = null;
    if (mirrorKind && owner) {
      // 👻/⚡ aus den eigenen Scores des Spielers (auch von heute, ohne dieses Match)
      const own = await loadOwnerMachineScores(sb, {
        ownerProfileId: owner.id,
        locationId: String((t as any).location_id),
        machineName,
        currentTournamentId: String((t as any).id),
        excludeMatchId: matchId,
      });
      if (own.error) return fail(own.error, 500);
      const res = computeMirrorBotScore({
        kind: mirrorKind,
        botName,
        owner: { name: owner.name, elo: owner.elo },
        machine: machineName.trim(),
        location: locationName,
        format,
        extraball,
        level,
        levelOf: scoreLevel,
        samples: own.samples,
        settings,
      });
      if (res.ok) calc = res.calc;
      else mirrorFallback = res.info; // zu wenig eigene Scores → unten wie ein fester Bot mit seiner Elo
    }

    // 🥊 Rivalen-Bot: Stärke aus allen Duellen mit seinem Spieler (auch von heute) → damit würfeln
    let rivalInfo: NonNullable<ReturnType<typeof computeBotScore>["rival"]> | null = null;
    if (!calc && (prof as any).bot_kind === "rival") {
      const ownerId = (prof as any).bot_owner_profile_id ? String((prof as any).bot_owner_profile_id) : "";
      if (!ownerId) return fail("Diesem Rivalen-Bot ist kein Spieler zugeordnet (Spieler-Tab → Bot bearbeiten).", 400);
      const { data: op, error: opErr } = await sb.from("profiles").select("id, name, rating").eq("id", ownerId).maybeSingle();
      if (opErr) return fail(`Spieler des Rivalen laden fehlgeschlagen: ${opErr.message}`, 500);
      if (!op) return fail("Der Spieler dieses Rivalen existiert nicht mehr.", 400);
      const duels = await loadRivalDuels(sb, {
        ownerProfileId: ownerId,
        rivalProfileId: String(prof.id),
        currentTournamentId: String((t as any).id),
      });
      if (duels.error) return fail(duels.error, 500);
      const start = Number((prof as any).bot_strength ?? op.rating ?? prof.rating ?? 1500);
      const rs = rivalStrength(start, duels.duels, settings);
      botElo = rs.strength;
      rivalInfo = {
        owner: String(op.name ?? "?"),
        start: rs.start,
        strength: rs.strength,
        wins: rs.wins,
        losses: rs.losses,
        step: settings.rivalStep,
      };
      // aktuelle Stärke als Elo des Bots (Siegchance/Favorit/Abzeichen); Bots werden nie neu berechnet
      if (Number(prof.rating) !== rs.strength) await sb.from("profiles").update({ rating: rs.strength }).eq("id", prof.id);
    }

    if (!calc) {
      const { samples, error: dErr } = await loadBotSamples(sb, {
        locationId: String((t as any).location_id),
        machineName,
        excludeTournamentId: String((t as any).id),
      });
      if (dErr) return fail(dErr, 500);
      const kind = String((prof as any).bot_kind ?? "");
      // 🟠 Specialist: an seinen Lieblingsflippern (aus den aktiven Flippern des Turniers) mit Elo + Bonus
      let specialistInfo: NonNullable<ReturnType<typeof computeBotScore>["specialist"]> | null = null;
      if (kind === "specialist") {
        const { data: tm, error: tmErr } = await sb.from("machines").select("name, active").eq("tournament_id", (t as any).id);
        if (tmErr) return fail(`Flipper des Turniers laden fehlgeschlagen: ${tmErr.message}`, 500);
        const favorites = specialistFavorites(String(prof.id), String((t as any).id), tm ?? [], settings.specialistFavs);
        const isFavorite = isSpecialistFavorite(favorites, machineName);
        specialistInfo = { favorites, isFavorite, baseElo: Math.round(botElo), bonus: settings.specialistBonus };
        if (isFavorite) botElo += settings.specialistBonus;
      }
      // 🎭 Charakter: Lieblingsflipper (+Bonus) und Angstflipper (−Malus) im Turnier
      if (kind === "character") {
        const { data: tm, error: tmErr } = await sb.from("machines").select("name, active").eq("tournament_id", (t as any).id);
        if (tmErr) return fail(`Flipper des Turniers laden fehlgeschlagen: ${tmErr.message}`, 500);
        const cm = characterMachines(String(prof.id), String((t as any).id), tm ?? [], settings.characterFavs, settings.characterFlops);
        const isFavorite = isSpecialistFavorite(cm.favorites, machineName);
        const isFlop = !isFavorite && isSpecialistFavorite(cm.flops, machineName);
        specialistInfo = {
          favorites: cm.favorites,
          isFavorite,
          baseElo: Math.round(botElo),
          bonus: settings.characterBonus,
          character: true,
          flops: cm.flops,
          isFlop,
          malus: settings.characterMalus,
        };
        if (isFavorite) botElo += settings.characterBonus;
        if (isFlop) botElo = Math.max(100, botElo - settings.characterMalus);
      }
      // 👑 Champion: Spitzenfeld aller Scores (unabhängig von der Elo)
      calc = kind === "champion"
        ? computeChampionScore({
            botName,
            botElo,
            machine: machineName.trim(),
            location: locationName,
            format,
            extraball,
            level,
            levelOf: scoreLevel,
            samples,
            settings,
          })
        : computeBotScore({
        botName,
        botElo,
        machine: machineName.trim(),
        location: locationName,
        format,
        extraball,
        level,
        levelOf: scoreLevel,
        samples,
        settings: settingsForKind(settings, kind), // 🔴/🟣 eigene Streuung
      });
      if (kind === "gambler" || kind === "pro") calc.style = kind;
      if (specialistInfo) calc.specialist = specialistInfo;
      if (mirrorFallback) calc.mirror = mirrorFallback;
      if (rivalInfo) calc.rival = rivalInfo;
    }

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
