import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: ResponseInit) {
  return new NextResponse(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      ...(init?.headers ?? {}),
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return noStoreJson({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  // Tournament
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, code")
    .eq("code", code)
    .single();

  if (tErr || !t) return noStoreJson({ error: "Turnier nicht gefunden" }, { status: 404 });

  // rounds -> matches (machine_id needed)
  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id")
    .eq("tournament_id", t.id);

  if (rErr) return noStoreJson({ error: rErr.message ?? "Fehler beim Laden der Runden" }, { status: 500 });

  const roundIds = (rounds ?? []).map((r: any) => r.id);
  if (!roundIds.length) return noStoreJson({ ok: true, playerHighscores: [], machineHighscores: [] });

  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select("id, machine_id, round_id")
    .in("round_id", roundIds);

  if (mErr) return noStoreJson({ error: mErr.message ?? "Fehler beim Laden der Matches" }, { status: 500 });

  const matchIds = (matches ?? []).map((m: any) => m.id);
  if (!matchIds.length) return noStoreJson({ ok: true, playerHighscores: [], machineHighscores: [] });

  // match_players (score + player)
  const { data: mpRows, error: mpErr } = await sb
    .from("match_players")
    .select("match_id, player_id, score")
    .in("match_id", matchIds);

  if (mpErr) return noStoreJson({ error: mpErr.message ?? "Fehler beim Laden der Match-Spieler" }, { status: 500 });

  // player -> profile + name
  const uniquePlayerIds = Array.from(new Set((mpRows ?? []).map((x: any) => x.player_id)));
  const { data: playerRows, error: pErr } = await sb
    .from("players")
    .select("id, profile_id, name")
    .in("id", uniquePlayerIds);

  if (pErr) return noStoreJson({ error: pErr.message ?? "Fehler beim Laden der Spieler" }, { status: 500 });

  const profileIdByPlayerId = new Map<string, string>();
  const nameByProfileId = new Map<string, string>();

  for (const p of playerRows ?? []) {
    if (!p.profile_id) continue;
    profileIdByPlayerId.set(p.id, p.profile_id);
    nameByProfileId.set(p.profile_id, p.name ?? "Unbekannt");
  }

  // machine names
  const uniqueMachineIds = Array.from(
    new Set((matches ?? []).map((m: any) => m.machine_id).filter(Boolean))
  );

  const machineNameById = new Map<string, string>();
  if (uniqueMachineIds.length) {
    const { data: machineRows } = await sb
      .from("machines")
      .select("id, name")
      .in("id", uniqueMachineIds);

    for (const mac of machineRows ?? []) {
      machineNameById.set(mac.id, mac.name ?? "Unbekannt");
    }
  }

  const machineIdByMatchId = new Map<string, string>();
  for (const m of matches ?? []) {
    if (m.machine_id) machineIdByMatchId.set(m.id, m.machine_id);
  }

  // best per machine (ties count for all)
  type Best = { score: number; winners: Set<string> }; // winners = profile_id
  const bestByMachine = new Map<string, Best>();

  for (const mp of mpRows ?? []) {
    const machineId = machineIdByMatchId.get(mp.match_id);
    if (!machineId) continue;
    if (mp.score == null) continue;

    const profileId = profileIdByPlayerId.get(mp.player_id);
    if (!profileId) continue;

    const score = Number(mp.score);
    if (!Number.isFinite(score)) continue;

    const cur = bestByMachine.get(machineId);
    if (!cur) {
      bestByMachine.set(machineId, { score, winners: new Set([profileId]) });
      continue;
    }

    if (score > cur.score) {
      cur.score = score;
      cur.winners = new Set([profileId]);
    } else if (score === cur.score) {
      cur.winners.add(profileId);
    }
  }

  const machineHighscores = Array.from(bestByMachine.entries())
    .flatMap(([machine_id, best]) => {
      const machine_name = machineNameById.get(machine_id) ?? "Unbekannt";
      return Array.from(best.winners).map((profile_id) => ({
        machine_id,
        machine_name,
        score: best.score,
        profile_id,
        name: nameByProfileId.get(profile_id) ?? "Unbekannt",
      }));
    })
    .sort((a, b) => b.score - a.score);

  const countByProfile = new Map<string, number>();
  for (const [, best] of bestByMachine.entries()) {
    for (const pid of best.winners) {
      countByProfile.set(pid, (countByProfile.get(pid) ?? 0) + 1);
    }
  }

  const playerHighscores = Array.from(countByProfile.entries())
    .map(([profile_id, highscores]) => ({
      profile_id,
      name: nameByProfileId.get(profile_id) ?? "Unbekannt",
      highscores,
    }))
    .sort((a, b) => b.highscores - a.highscores || a.name.localeCompare(b.name));

  return noStoreJson({ ok: true, playerHighscores, machineHighscores });
}
