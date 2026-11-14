// 🛡️ Statistik-Schutz: Wer/was zählt NICHT für allgemeine Statistiken?
// - 🤖 KI-Bots (profiles.is_bot)
// - 🚫 Platzhalter-/Testprofile (profiles.exclude_from_stats)
// - 🚫 einzelne, als falsch markierte Scores (match_players.stats_ignored) – siehe isIgnoredScoreRow
// Im laufenden Turnier (Leaderboard, Match-Ansicht) sind Bots ganz normal sichtbar –
// diese Hilfen sind nur für Rekorde, Ranglisten, Spielerstatistiken usw. über Turniere hinweg.

import type { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";

type Sb = ReturnType<typeof supabaseAdmin>;

export type StatsExclusions = {
  /** Bots + Platzhalter zusammen */
  excludedProfileIds: Set<string>;
  botProfileIds: Set<string>;
  placeholderProfileIds: Set<string>;
};

export async function loadStatsExclusions(sb: Sb): Promise<StatsExclusions> {
  const out: StatsExclusions = {
    excludedProfileIds: new Set(),
    botProfileIds: new Set(),
    placeholderProfileIds: new Set(),
  };
  const res = await sb.from("profiles").select("id, is_bot, exclude_from_stats").or("is_bot.eq.true,exclude_from_stats.eq.true");
  let rows: any[] = [];
  if (res.error) {
    // Spalte exclude_from_stats evtl. noch nicht angelegt → nur Bots
    const r2 = await sb.from("profiles").select("id, is_bot").eq("is_bot", true);
    rows = r2.data ?? [];
  } else {
    rows = res.data ?? [];
  }
  for (const r of rows) {
    const id = String(r.id);
    if (r.is_bot) out.botProfileIds.add(id);
    if (r.exclude_from_stats) out.placeholderProfileIds.add(id);
    out.excludedProfileIds.add(id);
  }
  return out;
}

/** true = Profil zählt nicht für Statistiken (Bot oder Platzhalter) */
export function isExcludedProfile(ex: StatsExclusions, profileId: string | null | undefined): boolean {
  return !!profileId && ex.excludedProfileIds.has(String(profileId));
}

/** true = dieser einzelne Score ist als falsch markiert (match_players.stats_ignored) */
export function isIgnoredScoreRow(row: { stats_ignored?: boolean | null } | null | undefined): boolean {
  return row?.stats_ignored === true;
}

/**
 * Turnier-Endergebnisse (tournament_results) für Ranglisten der MENSCHEN aufbereiten:
 * - Bots und Platzhalter fliegen raus.
 * - Turniere mit Bots und höchstens 1 Menschen = "🤖 Training" → fliegen ganz raus.
 * - Turniere mit Bots und ≥ 2 Menschen: Platz (final_rank) nur unter Menschen neu zählen
 *   (Bots "wegdenken" – passend zu den Turnierpunkten aus /api/tournaments/finish).
 * WICHTIG: rows müssen alle Zeilen der betroffenen Turniere enthalten (nicht vorher nach Spieler filtern).
 */
export function humanTournamentResults<
  T extends { tournament_id: string; player_id: string; final_rank: number | null }
>(rows: readonly T[], ex: StatsExclusions, profileOfPlayer: (playerId: string) => string | null | undefined): T[] {
  const byT = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r.tournament_id);
    const list = byT.get(k);
    if (list) list.push(r);
    else byT.set(k, [r]);
  }
  const out: T[] = [];
  for (const list of Array.from(byT.values())) {
    const isBot = (r: T) => ex.botProfileIds.has(String(profileOfPlayer(String(r.player_id)) ?? ""));
    const humans = list.filter((r) => !isExcludedProfile(ex, profileOfPlayer(String(r.player_id))));
    if (!list.some(isBot)) {
      out.push(...humans);
      continue;
    }
    if (humans.length <= 1) continue; // 🤖 Training
    for (const r of humans) {
      const own = r.final_rank;
      if (typeof own !== "number") {
        out.push(r);
        continue;
      }
      const better = humans.filter((o) => typeof o.final_rank === "number" && (o.final_rank as number) < own).length;
      out.push({ ...r, final_rank: better + 1 });
    }
  }
  return out;
}

/**
 * Match-Zeilen (match_players) für Statistiken der MENSCHEN aufbereiten (Nutzer-Regel 2026-11-14):
 * - Scores der Menschen zählen immer (auch gegen Bots) – außer als falsch markierte (stats_ignored → score null).
 * - Bots und Platzhalter fliegen raus.
 * - Siege/Plätze nur gegen Menschen: in Matches mit Bots wird der Platz nur unter Menschen gezählt;
 *   ist nur 1 Mensch dabei, wird position = null (Match zählt nicht für Siege/Winrate, Score bleibt).
 * WICHTIG: rows müssen alle Teilnehmer der betroffenen Matches enthalten.
 */
export function humanMatchRows<
  T extends { match_id: string; player_id: string; position?: number | null; score?: unknown; stats_ignored?: boolean | null }
>(rows: readonly T[], ex: StatsExclusions, profileOfPlayer: (playerId: string) => string | null | undefined): T[] {
  const byM = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r.match_id);
    const list = byM.get(k);
    if (list) list.push(r);
    else byM.set(k, [r]);
  }
  const out: T[] = [];
  const clean = (r: T): T => (r.stats_ignored === true ? { ...r, score: null } : r);
  for (const list of Array.from(byM.values())) {
    const hasBot = list.some((r) => ex.botProfileIds.has(String(profileOfPlayer(String(r.player_id)) ?? "")));
    const humans = list.filter((r) => !isExcludedProfile(ex, profileOfPlayer(String(r.player_id))));
    if (!hasBot) {
      for (const r of humans) out.push(clean(r));
      continue;
    }
    if (humans.length <= 1) {
      for (const r of humans) out.push({ ...clean(r), position: null });
      continue;
    }
    for (const r of humans) {
      const own = r.position;
      if (typeof own !== "number") {
        out.push(clean(r));
        continue;
      }
      const better = humans.filter((o) => typeof o.position === "number" && (o.position as number) < own).length;
      out.push({ ...clean(r), position: better + 1 });
    }
  }
  return out;
}

export type HumanMatchContext = {
  /** Spieler-Zeile gehört zu einem Bot oder Platzhalter → für Statistiken weglassen */
  isExcludedPlayer: (playerId: string) => boolean;
  /** Platz für Statistiken: in Matches mit Bots nur unter Menschen (null = nur 1 Mensch → zählt nicht als Sieg/Niederlage) */
  position: (matchId: string, playerId: string, original: number | null | undefined) => number | null;
  /** Matches mit Bots: alle Menschen mit ihrem Platz unter Menschen (für Routen, die nur Sieger laden) */
  humanPositionsInBotMatches: Map<string, Map<string, number | null>>;
};

/**
 * Lädt alles, was Statistik-Routen brauchen, um Bots/Platzhalter herauszurechnen –
 * unabhängig davon, ob die Route selbst alle Teilnehmer eines Matches geladen hat.
 * Ohne Bots in der Datenbank ist das fast kostenlos (nur Platzhalter werden ausgefiltert).
 */
export async function loadHumanMatchContext(
  sb: Sb,
  ex: StatsExclusions,
  matchIds: readonly string[]
): Promise<HumanMatchContext> {
  const excludedPlayerIds = new Set<string>();
  const botPlayerIds = new Set<string>();
  const excludedProfiles = Array.from(ex.excludedProfileIds);
  if (excludedProfiles.length) {
    const pl = await fetchAllIn<{ id: string; profile_id: string | null }>(excludedProfiles, (chunk) =>
      sb.from("players").select("id, profile_id").in("profile_id", chunk).order("id")
    );
    for (const p of pl.data) {
      excludedPlayerIds.add(String(p.id));
      if (p.profile_id && ex.botProfileIds.has(String(p.profile_id))) botPlayerIds.add(String(p.id));
    }
  }

  const humanPositionsInBotMatches = new Map<string, Map<string, number | null>>();
  if (botPlayerIds.size && matchIds.length) {
    const wanted = new Set(matchIds.map(String));
    const botRows = await fetchAllIn<{ match_id: string }>(Array.from(botPlayerIds), (chunk) =>
      sb.from("match_players").select("match_id, player_id").in("player_id", chunk).order("match_id").order("player_id")
    );
    const botMatchIds = Array.from(new Set(botRows.data.map((r) => String(r.match_id)).filter((id) => wanted.has(id))));
    if (botMatchIds.length) {
      const all = await fetchAllIn<{ match_id: string; player_id: string; position: number | null }>(botMatchIds, (chunk) =>
        sb.from("match_players").select("match_id, player_id, position").in("match_id", chunk).order("match_id").order("player_id")
      );
      const byM = new Map<string, { player_id: string; position: number | null }[]>();
      for (const r of all.data) {
        if (excludedPlayerIds.has(String(r.player_id))) continue;
        const k = String(r.match_id);
        const list = byM.get(k);
        if (list) list.push(r);
        else byM.set(k, [r]);
      }
      for (const mId of botMatchIds) {
        const humans = byM.get(mId) ?? [];
        const m = new Map<string, number | null>();
        for (const h of humans) {
          if (humans.length <= 1 || typeof h.position !== "number") {
            m.set(String(h.player_id), humans.length <= 1 ? null : h.position);
            continue;
          }
          const own = h.position;
          const better = humans.filter((o) => typeof o.position === "number" && (o.position as number) < own).length;
          m.set(String(h.player_id), better + 1);
        }
        humanPositionsInBotMatches.set(mId, m);
      }
    }
  }

  return {
    isExcludedPlayer: (pid) => excludedPlayerIds.has(String(pid)),
    position: (mid, pid, original) => {
      const m = humanPositionsInBotMatches.get(String(mid));
      if (!m) return original ?? null;
      return m.has(String(pid)) ? (m.get(String(pid)) ?? null) : original ?? null;
    },
    humanPositionsInBotMatches,
  };
}

/**
 * Wie humanTournamentResults, aber für Routen, die nur die Ergebnisse EINZELNER Spieler laden:
 * lädt für Turniere mit Bots alle Ergebnisse nach und liefert den Platz unter Menschen.
 * rank() → Platz unter Menschen; null = 🤖 Training (zählt nicht); bei Turnieren ohne Bots unverändert.
 */
export async function loadHumanResultsContext(
  sb: Sb,
  ex: StatsExclusions,
  tournamentIds: readonly string[]
): Promise<{ rank: (tournamentId: string, playerId: string, original: number | null | undefined) => number | null }> {
  const adjusted = new Map<string, Map<string, number | null>>();
  const botProfiles = Array.from(ex.botProfileIds);
  if (botProfiles.length && tournamentIds.length) {
    const wanted = new Set(tournamentIds.map(String));
    const bp = await fetchAllIn<{ id: string; tournament_id: string }>(botProfiles, (chunk) =>
      sb.from("players").select("id, tournament_id").in("profile_id", chunk).order("id")
    );
    const botTournamentIds = Array.from(new Set(bp.data.map((p) => String(p.tournament_id)).filter((id) => wanted.has(id))));
    if (botTournamentIds.length) {
      const all = await fetchAllIn<{ tournament_id: string; player_id: string; final_rank: number | null }>(
        botTournamentIds,
        (chunk) =>
          sb
            .from("tournament_results")
            .select("tournament_id, player_id, final_rank")
            .in("tournament_id", chunk)
            .order("tournament_id")
            .order("player_id")
      );
      const pIds = Array.from(new Set(all.data.map((r) => String(r.player_id))));
      const pl = await fetchAllIn<{ id: string; profile_id: string | null }>(pIds, (chunk) =>
        sb.from("players").select("id, profile_id").in("id", chunk).order("id")
      );
      const prof = new Map(pl.data.map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));
      for (const tid of botTournamentIds) adjusted.set(tid, new Map()); // Standard: Training → null
      for (const r of humanTournamentResults(all.data, ex, (pid) => prof.get(pid) ?? null)) {
        adjusted.get(String(r.tournament_id))?.set(String(r.player_id), r.final_rank ?? null);
      }
    }
  }
  return {
    rank: (tid, pid, original) => {
      const m = adjusted.get(String(tid));
      if (!m) return original ?? null;
      return m.has(String(pid)) ? (m.get(String(pid)) ?? null) : null;
    },
  };
}
