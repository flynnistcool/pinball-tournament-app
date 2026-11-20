// 📊 Lob / 💡 Erinnerung nach dem Speichern am Handy in den Live-Ticker schreiben (nur Server).
// Fehler hier sind egal: Das Speichern selbst ist schon erledigt – der Ticker ist nur Zusatz.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { countPhoneScores, crossedMilestone, scorePraiseItem, scoreTipItem } from "@/lib/scoreNudge";
import type { FeedItemInput } from "@/lib/feed";

async function insertFeed(sb: SupabaseClient, tournamentId: string, items: FeedItemInput[]) {
  if (!items.length) return;
  const rows = items.map((it) => ({
    tournament_id: tournamentId,
    event_key: it.key,
    kind: it.kind,
    icon: it.icon,
    title: it.title,
    body: it.body,
    player_ids: it.players ?? [],
    data: it.data ?? null,
  }));
  await sb.from("tournament_feed").upsert(rows, { onConflict: "tournament_id,event_key", ignoreDuplicates: true });
}

export async function scoreNudgeAfterPhoneSave(
  sb: SupabaseClient,
  opts: { tournamentId: string; matchId: string; playerId: string; playerName: string; savedScore: boolean }
): Promise<void> {
  try {
    const { tournamentId, matchId, playerId, playerName, savedScore } = opts;
    const items: FeedItemInput[] = [];

    // 💡 Match ist jetzt fertig (alle Plätze) – aber ganz ohne Scores → einmal pro Turnier der Tipp
    const { data: here } = await sb.from("match_players").select("position, score").eq("match_id", matchId);
    const hereRows = (here ?? []) as { position: number | null; score: unknown }[];
    const done = hereRows.length >= 2 && hereRows.every((r) => Number(r.position) > 0);
    const noScores = hereRows.every((r) => r.score == null || r.score === "");
    if (done && noScores) items.push(scoreTipItem(playerId, playerName));

    // 📊 Lob: Stufe neu erreicht?
    if (savedScore) {
      const { data: rounds } = await sb.from("rounds").select("id").eq("tournament_id", tournamentId);
      const roundIds = (rounds ?? []).map((r: { id: string }) => String(r.id));
      const { data: matches } = await fetchAllIn<{ id: string }>(roundIds, (chunk) =>
        sb.from("matches").select("id").in("round_id", chunk)
      );
      const matchIds = matches.map((m) => String(m.id));
      const { data: mps, error } = await fetchAllIn<{ match_id: string; score: unknown; entry_log: unknown }>(matchIds, (chunk) =>
        sb.from("match_players").select("match_id, score, entry_log").in("match_id", chunk)
      );
      if (!error) {
        const now = countPhoneScores(mps, playerName);
        const prev = countPhoneScores(mps, playerName, matchId);
        const m = crossedMilestone(prev, now);
        if (m != null) items.push(scorePraiseItem(playerId, playerName, m));
      }
    }

    await insertFeed(sb, tournamentId, items);
  } catch {
    /* Ticker ist nur Zusatz */
  }
}
