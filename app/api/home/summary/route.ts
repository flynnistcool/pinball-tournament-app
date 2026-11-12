// Daten für die Startseiten-Kacheln:
// - running:    laufende Turniere (Name, Code, Format, aktuelle Runde)
// - lastWinner: Sieger des zuletzt beendeten Turniers (Superfinale zählt vor Endwertung)
// - weekTop:    höchster Score aus Turnieren der letzten 7 Tage (Spieler, Flipper, Turnier)
// Jeder Teil ist für sich abgesichert: klappt einer nicht, kommen die anderen trotzdem.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { currentRoundByTournament, pickTopScore, pickWinners, type ResultRow, type ScoreRow } from "@/lib/homeSummary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Sb = ReturnType<typeof supabaseAdmin>;

type TournamentRow = {
  id: string;
  code: string;
  name: string | null;
  format: string | null;
  status: string | null;
  created_at: string | null;
  location_id: string | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function locationName(sb: Sb, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await sb.from("locations").select("id, name").eq("id", id).maybeSingle();
  return (data as { name?: string | null } | null)?.name ?? null;
}

async function loadRunning(sb: Sb, tournaments: TournamentRow[]) {
  const live = tournaments.filter((t) => t.status !== "finished");
  if (!live.length) return [];
  const { data: rounds, error } = await sb
    .from("rounds")
    .select("tournament_id, number")
    .in("tournament_id", live.map((t) => t.id));
  if (error) console.error("home/summary rounds error:", error);
  const roundBy = currentRoundByTournament((rounds ?? []) as { tournament_id: string; number: number | null }[]);
  return Promise.all(
    live.map(async (t) => ({
      code: t.code,
      name: t.name,
      format: t.format,
      round: roundBy.get(String(t.id)) ?? 0,
      location: await locationName(sb, t.location_id),
    }))
  );
}

async function loadLastWinner(sb: Sb, tournaments: TournamentRow[]) {
  // die letzten beendeten Turniere durchgehen, bis eines Ergebnisse hat
  const finished = tournaments.filter((t) => t.status === "finished").slice(0, 5);
  for (const t of finished) {
    const { data, error } = await sb
      .from("tournament_results")
      .select("player_name, final_rank, super_final_rank")
      .eq("tournament_id", t.id);
    if (error) {
      console.error("home/summary results error:", error);
      return null;
    }
    const { names, viaSuperFinal } = pickWinners((data ?? []) as ResultRow[]);
    if (!names.length) continue;
    return {
      names,
      viaSuperFinal,
      tournamentName: t.name,
      code: t.code,
      date: t.created_at,
      location: await locationName(sb, t.location_id),
    };
  }
  return null;
}

async function loadWeekTop(sb: Sb, tournaments: TournamentRow[]) {
  const since = Date.now() - WEEK_MS;
  const recent = tournaments.filter((t) => t.created_at && new Date(t.created_at).getTime() >= since);
  if (!recent.length) return null;

  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id, tournament_id")
    .in("tournament_id", recent.map((t) => t.id));
  if (rErr || !rounds?.length) return null;

  const mRes = await fetchAllIn<{ id: string; round_id: string; machine_id: string | null }>(
    rounds.map((r: { id: string }) => String(r.id)),
    (chunk) => sb.from("matches").select("id, round_id, machine_id").in("round_id", chunk).order("id")
  );
  if (mRes.error || !mRes.data.length) return null;

  const mpRes = await fetchAllIn<ScoreRow>(
    mRes.data.map((m) => String(m.id)),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, score")
        .in("match_id", chunk)
        .not("score", "is", null)
        .order("match_id")
        .order("player_id")
  );
  if (mpRes.error) return null;

  const top = pickTopScore(mpRes.data);
  if (!top) return null;

  const match = mRes.data.find((m) => String(m.id) === String(top.match_id));
  const round = rounds.find((r: { id: string }) => String(r.id) === String(match?.round_id));
  const tour = recent.find((t) => String(t.id) === String((round as { tournament_id?: string } | undefined)?.tournament_id));

  const [{ data: player }, machineRes] = await Promise.all([
    sb.from("players").select("id, name").eq("id", top.player_id).maybeSingle(),
    match?.machine_id
      ? sb.from("machines").select("id, name, icon_emoji").eq("id", match.machine_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const machine = machineRes.data as { name?: string | null; icon_emoji?: string | null } | null;

  return {
    score: top.score,
    playerName: (player as { name?: string | null } | null)?.name ?? null,
    machineName: machine?.name ?? null,
    machineIcon: machine?.icon_emoji ?? null,
    tournamentName: tour?.name ?? null,
    code: tour?.code ?? null,
    date: tour?.created_at ?? null,
  };
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`home/summary ${label} crash:`, e);
    return null;
  }
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("tournaments")
      .select("id, code, name, format, status, created_at, location_id")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("home/summary tournaments error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const tournaments = (data ?? []) as TournamentRow[];

    const [running, lastWinner, weekTop] = await Promise.all([
      safe("running", () => loadRunning(sb, tournaments)),
      safe("lastWinner", () => loadLastWinner(sb, tournaments)),
      safe("weekTop", () => loadWeekTop(sb, tournaments)),
    ]);

    return NextResponse.json({ ok: true, running: running ?? [], lastWinner, weekTop });
  } catch (e: unknown) {
    console.error("home/summary crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
