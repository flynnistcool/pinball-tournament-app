// 🕹️ Arcade: nächste Stufe anlegen = 1 neue Runde mit genau 1 Match (Spieler vs. Bot der aktuellen Stufe).
// Gewonnen → nächster Bot; verloren (Leben übrig) → derselbe Bot nochmal. Flipper zufällig aus den aktiven
// (möglichst nicht derselbe wie zuletzt) – lässt sich danach wie gewohnt umstellen. Elo aus (Training).
// POST { code, sameMachine? } -> { ok: true, roundNumber, stage, botName } | { ok: false, error }
// Revanche nach einer Niederlage: standardmäßig derselbe Flipper; sameMachine: false → neu auslosen.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { arcadeDuelWon, arcadeState, type ArcadeDuel } from "@/lib/arcade";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!code) return fail("Code fehlt", 400);
    const sameMachineWish: boolean | null = typeof body?.sameMachine === "boolean" ? body.sameMachine : null;
    const sb = supabaseAdmin();

    const { data: t, error: tErr } = await sb
      .from("tournaments")
      .select("id, status, format, arcade_mode, arcade_lives, arcade_stages, arcade_profile_id")
      .eq("code", code)
      .maybeSingle();
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    if (!t) return fail("Turnier nicht gefunden", 404);
    const tt = t as {
      id: string;
      status: string | null;
      format: string | null;
      arcade_mode: string | null;
      arcade_lives: number | null;
      arcade_stages: string[] | null;
      arcade_profile_id: string | null;
    };
    if (!tt.arcade_mode || !Array.isArray(tt.arcade_stages) || !tt.arcade_stages.length) return fail("Kein Arcade-Lauf", 400);
    if (tt.status === "finished") return fail("Der Arcade-Lauf ist beendet", 400);

    // Spieler-Einträge
    const { data: players, error: plErr } = await sb.from("players").select("id, name, profile_id").eq("tournament_id", tt.id);
    if (plErr) return fail(plErr.message, 500);
    const me = (players ?? []).find((p: { profile_id: string | null }) => String(p.profile_id) === String(tt.arcade_profile_id));
    if (!me) return fail("Spieler des Arcade-Laufs fehlt im Turnier", 400);

    // bisherige Duelle
    const { data: rounds, error: rErr } = await sb.from("rounds").select("id, number").eq("tournament_id", tt.id);
    if (rErr) return fail(rErr.message, 500);
    const roundIds = (rounds ?? []).map((r: { id: string }) => String(r.id));
    const roundNo = new Map((rounds ?? []).map((r: { id: string; number: number | null }) => [String(r.id), r.number ?? 0]));
    const matches = roundIds.length
      ? ((await sb.from("matches").select("id, round_id, machine_id").in("round_id", roundIds)).data ?? [])
      : [];
    const matchIds = (matches as { id: string }[]).map((m) => String(m.id));
    const mps = matchIds.length
      ? ((await sb.from("match_players").select("match_id, player_id, position, score").in("match_id", matchIds)).data ?? [])
      : [];
    const duels: ArcadeDuel[] = (matches as { id: string; round_id: string }[]).map((m) => {
      const rows = (mps as { match_id: string; player_id: string; position: number | null; score: number | string | null }[]).filter(
        (x) => String(x.match_id) === String(m.id)
      );
      const mine = rows.find((x) => String(x.player_id) === String((me as { id: string }).id));
      const bot = rows.find((x) => String(x.player_id) !== String((me as { id: string }).id));
      const v = (x?: { position: number | null; score: number | string | null }) => ({
        position: x?.position ?? null,
        score: x?.score != null && x.score !== "" ? Number(x.score) : null,
      });
      return { roundNumber: roundNo.get(String(m.round_id)) ?? 0, won: mine && bot ? arcadeDuelWon(v(mine), v(bot)) : null };
    });
    const st = arcadeState(tt.arcade_stages.length, Number(tt.arcade_lives ?? 1), duels);
    if (st.open) return fail("Das aktuelle Duell hat noch kein Ergebnis", 409);
    if (st.status === "cleared") return fail("🏆 Alle Stufen geschafft – der Lauf ist zu Ende", 400);
    if (st.status === "gameover") return fail("💀 Game Over – keine Leben mehr", 400);

    // Gegner dieser Stufe als Spieler im Turnier (einmal)
    const botProfileId = String(tt.arcade_stages[st.wins]);
    const { data: botProf, error: bpErr } = await sb.from("profiles").select("id, name").eq("id", botProfileId).maybeSingle();
    if (bpErr) return fail(bpErr.message, 500);
    if (!botProf) return fail("Bot dieser Stufe existiert nicht mehr", 400);
    let botPlayer = (players ?? []).find((p: { profile_id: string | null }) => String(p.profile_id) === botProfileId) as
      | { id: string }
      | undefined;
    if (!botPlayer) {
      const { data: np, error: npErr } = await sb
        .from("players")
        .insert({ tournament_id: tt.id, name: String((botProf as { name?: string }).name ?? "Bot"), profile_id: botProfileId })
        .select("id")
        .single();
      if (npErr || !np) return fail(`Bot hinzufügen fehlgeschlagen: ${npErr?.message ?? "?"}`, 500);
      botPlayer = np as { id: string };
    }

    // Elo-Stand vor dem Turnier festhalten (wie bei normalen Runden) – für spätere Bot-Rechnungen
    const needTr = [String(tt.arcade_profile_id), botProfileId];
    const { data: trHave } = await sb.from("tournament_ratings").select("profile_id").eq("tournament_id", tt.id);
    const have = new Set(((trHave ?? []) as { profile_id: string }[]).map((r) => String(r.profile_id)));
    const missing = needTr.filter((id) => !have.has(id));
    if (missing.length) {
      const { data: profs } = await sb.from("profiles").select("id, rating, provisional_matches, matches_played").in("id", missing);
      if (profs?.length) {
        await sb.from("tournament_ratings").insert(
          (profs as { id: string; rating: number | null; provisional_matches: number | null; matches_played: number | null }[]).map((p) => ({
            tournament_id: tt.id,
            profile_id: p.id,
            rating_before: p.rating,
            provisional_before: p.provisional_matches,
            matches_before: p.matches_played,
          }))
        );
      }
    }

    // Flipper: zufällig aus den aktiven, möglichst nicht derselbe wie im letzten Duell
    const { data: machines, error: mcErr } = await sb.from("machines").select("id, active").eq("tournament_id", tt.id);
    if (mcErr) return fail(mcErr.message, 500);
    const active = ((machines ?? []) as { id: string; active: boolean | null }[]).filter((m) => m.active !== false);
    if (!active.length) return fail("Keine aktiven Flipper", 400);
    const lastMatch = [...(matches as { id: string; round_id: string; machine_id: string | null }[])].sort(
      (a, b) => (roundNo.get(String(b.round_id)) ?? 0) - (roundNo.get(String(a.round_id)) ?? 0)
    )[0];
    // 🔁 Revanche (letztes Duell verloren): derselbe Flipper, außer ausdrücklich "anderer Flipper"
    const lastDuel = [...duels].sort((a, b) => b.roundNumber - a.roundNumber)[0];
    const lastLost = lastDuel?.won === false;
    const lastActive = active.find((m) => String(m.id) === String(lastMatch?.machine_id ?? ""));
    const reuse = lastLost && lastActive && sameMachineWish !== false;
    const pool = active.length > 1 ? active.filter((m) => String(m.id) !== String(lastMatch?.machine_id ?? "")) : active;
    const machine = reuse ? lastActive : pool[Math.floor(Math.random() * pool.length)];

    const nextNumber = Math.max(0, ...Array.from(roundNo.values())) + 1;
    const { data: round, error: nrErr } = await sb
      .from("rounds")
      .insert({
        tournament_id: tt.id,
        format: tt.format === "rotation" ? "rotation" : "matchplay", // 🔄 RtP-Arcade: Runde als RtP
        number: nextNumber,
        status: "open",
        elo_enabled: false,
      })
      .select("id")
      .single();
    if (nrErr || !round) return fail(`Runde anlegen fehlgeschlagen: ${nrErr?.message ?? "?"}`, 500);
    const { data: match, error: nmErr } = await sb
      .from("matches")
      .insert({ round_id: (round as { id: string }).id, machine_id: machine.id, status: "open", game_number: 1 })
      .select("id")
      .single();
    if (nmErr || !match) return fail(`Match anlegen fehlgeschlagen: ${nmErr?.message ?? "?"}`, 500);
    const meFirst = Math.random() < 0.5;
    const { error: mpErr } = await sb.from("match_players").insert([
      { match_id: (match as { id: string }).id, player_id: (me as { id: string }).id, position: null, start_position: meFirst ? 1 : 2 },
      { match_id: (match as { id: string }).id, player_id: botPlayer.id, position: null, start_position: meFirst ? 2 : 1 },
    ]);
    if (mpErr) return fail(`Spieler ins Match setzen fehlgeschlagen: ${mpErr.message}`, 500);

    return NextResponse.json({
      ok: true,
      roundNumber: nextNumber,
      stage: st.wins + 1,
      botName: String((botProf as { name?: string }).name ?? "Bot"),
    });
  } catch (e: unknown) {
    console.error("arcade/next crash:", e);
    return fail(String((e as Error)?.message ?? e), 500);
  }
}
