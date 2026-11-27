import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: t, error: tErr } = await sb
    .from("tournaments")
    // Hinweis: season_year und best_of existieren in der Live-DB nicht -> nicht abfragen
    .select("id, code, name, created_at, category, match_size, format, location_id, locations(name), status, extraball")
    .eq("code", code)
    .single();

  // Echten DB-Fehler melden statt pauschal "nicht gefunden" (erleichtert Fehlersuche)
  if (tErr && tErr.code !== "PGRST116") {
    return NextResponse.json({ error: `Turnier laden fehlgeschlagen: ${tErr.message}` }, { status: 500 });
  }
  if (!t) return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });

  // Load core entities first
  const [{ data: players, error: pErr }, { data: machines, error: mErr }, { data: rounds, error: rErr }] =
    await Promise.all([
      sb.from("players").select("id, name, active, profile_id").eq("tournament_id", t.id).order("created_at"),
      sb.from("machines").select("id, name, active, icon_emoji").eq("tournament_id", t.id).order("created_at"),
      sb.from("rounds").select("id, format, number, status, elo_enabled, created_at").eq("tournament_id", t.id).order("format").order("number"),
    ]);

  if (pErr) return NextResponse.json({ error: `Players load failed: ${pErr.message}` }, { status: 500 });
  if (mErr) return NextResponse.json({ error: `Machines load failed: ${mErr.message}` }, { status: 500 });
  if (rErr) return NextResponse.json({ error: `Rounds load failed: ${rErr.message}` }, { status: 500 });

  // 🎨 Flipper-Icon fehlt am Turnier-Flipper → Icon der Location (gleicher Name) nehmen. Nur Anzeige, DB bleibt.
  if (t.location_id && (machines ?? []).some((m: any) => !String(m?.icon_emoji ?? "").trim())) {
    try {
      const { data: lm } = await sb.from("location_machines").select("name, icon_emoji").eq("location_id", t.location_id);
      const iconByName = new Map<string, string>();
      for (const x of lm ?? []) {
        const nm = String((x as any).name ?? "").trim();
        const ic = String((x as any).icon_emoji ?? "").trim();
        if (nm && ic) iconByName.set(nm, ic);
      }
      for (const m of (machines ?? []) as any[]) {
        if (!String(m?.icon_emoji ?? "").trim()) {
          const ic = iconByName.get(String(m?.name ?? "").trim());
          if (ic) m.icon_emoji = ic;
        }
      }
    } catch {
      // Icons sind nur Schmuck
    }
  }

  const roundIds = (rounds ?? []).map((r: any) => r.id);

  // Load matches for those rounds
  const { data: matches, error: matchErr } = roundIds.length
    ? await sb
        .from("matches")
        .select("id, round_id, machine_id, status, series_id, game_number, created_at")
        .in("round_id", roundIds)
        .order("created_at")
    : { data: [], error: null as any };

  if (matchErr) return NextResponse.json({ error: `Matches load failed: ${matchErr.message}` }, { status: 500 });

  // Load match_players for those matches
  const matchIds = (matches ?? []).map((m: any) => m.id);

const { data: matchPlayers, error: mpErr } = matchIds.length
  ? await sb
      .from("match_players")
      .select("match_id, player_id, position, start_position, score") // score: für Infobildschirm (/s/CODE/tv)
      .in("match_id", matchIds)
      .order("start_position", { ascending: true })
  : { data: [], error: null as any };

  if (mpErr) return NextResponse.json({ error: `MatchPlayers load failed: ${mpErr.message}` }, { status: 500 });

  // Profil-Optik (Emoji + Farbe) für Infobildschirm – optional, Fehler hier sind nicht kritisch
  const profileIds = Array.from(
    new Set((players ?? []).map((p: any) => p.profile_id).filter(Boolean))
  ) as string[];
  const { data: profiles } = profileIds.length
    ? await sb
        .from("profiles")
        .select("id, icon, color, rating, is_bot, exclude_from_stats, bot_kind, bot_owner_profile_id")
        .in("id", profileIds)
    : { data: [] as any[] };
  // 👻/⚡ Ghost-/Form-Bots: Name des Spielers, dem sie folgen (fürs Abzeichen "👻 Ghost-Bot · Marco")
  const ownerIds = Array.from(
    new Set(((profiles ?? []) as any[]).map((p) => p.bot_owner_profile_id).filter(Boolean).map(String))
  );
  if (ownerIds.length) {
    const { data: owners } = await sb.from("profiles").select("id, name").in("id", ownerIds);
    const ownerName = new Map(((owners ?? []) as any[]).map((o) => [String(o.id), String(o.name ?? "")]));
    for (const p of (profiles ?? []) as any[]) {
      if (p.bot_owner_profile_id) p.bot_owner_name = ownerName.get(String(p.bot_owner_profile_id)) ?? null;
    }
  }

  // Elo-Stand vor dem Turnier (Sicherung beim Turnierstart) – für Infobildschirm
  const { data: startRatings } = await sb
    .from("tournament_ratings")
    .select("profile_id, rating_before")
    .eq("tournament_id", t.id);

  // Superfinale (falls gestartet) – für das Superfinale-Podest im Infobildschirm
  let final: {
    status: string | null;
    target_points: number | null;
    players: { player_id: string; seed: number; start_points: number; points: number }[];
  } | null = null;
  const { data: finales } = await sb
    .from("finales")
    .select("id, status, target_points")
    .eq("tournament_id", t.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (finales && finales.length > 0) {
    const f: any = finales[0];
    const { data: fps } = await sb
      .from("final_players")
      .select("player_id, seed, start_points, points")
      .eq("final_id", f.id)
      .order("seed", { ascending: true });
    final = {
      status: f.status ?? null,
      target_points: f.target_points ?? null,
      players: (fps ?? []) as any[],
    };
  }

  // ⏱️ Round the Pinball: Timer-Stand (Spalte aus supabase_rotation_timer.sql – fehlt sie, einfach ohne)
  let rotationTimer: unknown = null;
  if (t.format === "rotation") {
    const { data: rt, error: rtErr } = await sb.from("tournaments").select("rotation_timer").eq("id", t.id).maybeSingle();
    if (!rtErr) rotationTimer = (rt as { rotation_timer?: unknown } | null)?.rotation_timer ?? null;
  }
  // 🔊 Sprache der Ansagen (TV-Timer) – Spalte evtl. nicht vorhanden → Englisch
  let speechLang: string = "en";
  if (t.format === "rotation") {
    const { data: sl, error: slErr } = await sb.from("tournaments").select("speech_lang").eq("id", t.id).maybeSingle();
    if (!slErr && (sl as { speech_lang?: string } | null)?.speech_lang === "de") speechLang = "de";
  }

  return NextResponse.json({
    tournament: t,
    final,
    rotation_timer: rotationTimer,
    speech_lang: speechLang,
    server_now: Date.now(), // TV: Uhr-Abgleich für die Restzeit
    profiles: profiles ?? [],
    start_ratings: startRatings ?? [],
    players: players ?? [],
    machines: machines ?? [],
    rounds: rounds ?? [],
    matches: matches ?? [],
    match_players: matchPlayers ?? [],
  });
}