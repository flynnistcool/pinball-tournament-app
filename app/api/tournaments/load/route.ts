import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { realDbError } from "@/lib/dbErrors";

async function handle(codeRaw: string) {
  const code = String(codeRaw ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  // 1) Turnier laden
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select(
      "id, code, name, created_at, category, match_size, format, location_id, locations(name), status, speech_round_enabled, extraball"
    )

    .eq("code", code)
    .single();

  const tDbErr = realDbError(tErr, "Turnier laden");
  if (tDbErr) return NextResponse.json({ error: tDbErr }, { status: 500 });
  if (tErr || !t) {
    return NextResponse.json(
      { error: "Turnier nicht gefunden" },
      { status: 404 }
    );
  }

  // 🔊 Sprache der Sprachausgabe – eigene Abfrage, damit das Laden auch ohne die Spalte
  //    (supabase_speech_lang.sql noch nicht ausgeführt) funktioniert → dann "en"
  const { data: sl } = await sb.from("tournaments").select("speech_lang").eq("id", t.id).maybeSingle();
  (t as any).speech_lang = (sl as any)?.speech_lang === "de" ? "de" : "en";
  // 🎱 DYP-Flipper-Gewicht (supabase_dyp_pinball_weight.sql) – fehlt die Spalte: Standard 3
  const { data: pw } = await sb.from("tournaments").select("dyp_pinball_weight").eq("id", t.id).maybeSingle();
  (t as any).dyp_pinball_weight = (pw as any)?.dyp_pinball_weight ?? 3;

  // 2) Runden laden
  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id, tournament_id, number, format, status, elo_enabled, created_at")
    .eq("tournament_id", t.id)
    .order("format")
    .order("number");

  // 🧯 Fehler NICHT als leere Liste ausgeben (sonst zeigt das Tablet ein leeres Turnier)
  const rDbErr = realDbError(rErr, "Runden laden");
  if (rDbErr) return NextResponse.json({ error: rDbErr }, { status: 500 });

  const roundIds = (rounds ?? []).map((r: any) => r.id);

  // 3) Spieler, Maschinen, Matches parallel laden
  const [
    { data: players, error: plErr },
    { data: machines, error: maErr },
    { data: matches, error: mtErr },
  ] = await Promise.all([
      sb
        .from("players")
        .select("id, name, active, profile_id")
        .eq("tournament_id", t.id)
        .order("created_at"),
      sb
        .from("machines")
        .select("id, name, active, icon_emoji") // 👈 icon_emoji hier ergänzt
        .eq("tournament_id", t.id)
        .order("created_at"),
      roundIds.length
        ? sb
            .from("matches")
            .select(
              "id, round_id, machine_id, status, series_id, game_number, created_at, task_id, task_text"
            )
            .in("round_id", roundIds)
            .order("created_at")
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

  const listErr =
    realDbError(plErr, "Spieler laden") ?? realDbError(maErr, "Flipper laden") ?? realDbError(mtErr, "Matches laden");
  if (listErr) return NextResponse.json({ error: listErr }, { status: 500 });

    // 3b) Tasks für Matches laden (für Beschreibung)
    const taskIds = Array.from(
      new Set((matches ?? []).map((m: any) => m.task_id).filter(Boolean))
    );

    const { data: tasks } = taskIds.length
      ? await sb
          .from("machine_tasks")
          .select("id, title, description, difficulty")
          .in("id", taskIds)
      : { data: [] as any[] };


  // 4) Profile für die Turnier-Spieler nachladen und mergen
  const rawPlayers = players ?? [];

  const profileIds = Array.from(
    new Set(
      rawPlayers
        .map((p: any) => p.profile_id)
        .filter(
          (id: any) => typeof id === "string" && id && id.length > 0
        )
    )
  );

  let profilesById: Record<
    string,
    { id: string; color: string | null; icon: string | null; avatar_url: string | null; is_bot?: boolean | null }
  > = {};

  if (profileIds.length > 0) {
    const { data: profiles, error: pErr } = await sb
      .from("profiles")
      .select("id, color, icon, avatar_url, is_bot")
      .in("id", profileIds);

    if (!pErr && profiles) {
      profilesById = Object.fromEntries(
        profiles.map((p: any) => [p.id, p])
      );
    }
  }

  const playersWithProfile = rawPlayers.map((p: any) => {
    const prof = p.profile_id ? profilesById[p.profile_id] : null;

    return {
      ...p,
      color: (p as any).color ?? prof?.color ?? null,
      icon: (p as any).icon ?? prof?.icon ?? null,
      avatar_url: (p as any).avatar_url ?? prof?.avatar_url ?? null,
      is_bot: prof?.is_bot === true, // 🤖 KI-Bot
    };
  });

  // 5) Match-Players
  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: match_players, error: mpErr } = matchIds.length
    ? await sb
        .from("match_players")
        // 👇 team ist wichtig für DYP (2vs2)
        .select("match_id, player_id, position, start_position, score, time_ms, team")
        .in("match_id", matchIds)
        .order("start_position", { ascending: true })
    : { data: [] as any[], error: null };

  const mpDbErr = realDbError(mpErr, "Scores/Plätze laden");
  if (mpDbErr) return NextResponse.json({ error: mpDbErr }, { status: 500 });

  // 🎱 DYP: Flipper / Nicht-Flipper je Gerät (Name ↔ location_machines.is_pinball) – für den Geräte-Zähler.
  //    Fehlt die Spalte noch → alle Flipper.
  let machinesOut: any[] = machines ?? [];
  if ((t as any).format === "dyp_round_robin" && (t as any).location_id) {
    const { data: flags, error: flErr } = await sb
      .from("location_machines")
      .select("name, is_pinball")
      .eq("location_id", (t as any).location_id);
    const notPinball = new Set<string>();
    if (!flErr) {
      for (const f of (flags ?? []) as any[]) {
        if (f.is_pinball === false) notPinball.add(String(f.name ?? "").trim().toLowerCase());
      }
    }
    machinesOut = machinesOut.map((m: any) => ({
      ...m,
      is_pinball: !notPinball.has(String(m?.name ?? "").trim().toLowerCase()),
    }));
  }

  // 6) Response in der Struktur, die deine page.tsx erwartet
  return NextResponse.json({
    tournament: t,
    players: playersWithProfile ?? [],
    machines: machinesOut,
    rounds: rounds ?? [],
    matches: matches ?? [],
    match_players: match_players ?? [],
    tasks: tasks ?? [],   
  });
}

// ✅ GET: /api/tournaments/load?code=XXXXXX
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  return handle(code);
}

// ✅ POST: { code: "XXXXXX" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(body.code ?? "");
}
