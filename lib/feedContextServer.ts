// 🧮 Gemeinsame Server-Bausteine (nur Server): bisherige Flipper-Rekorde, persönliche Bestwerte und Matchsiege
// eines Turniers. Genutzt von /api/public/machine-records, /api/public/player-wins und dem Server-Ticker
// (/api/public/feed/sync) – so rechnen Geräte und Server garantiert mit denselben Daten.

import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { buildPriorRecords, machineKey, personalKey, type PriorRecords } from "@/lib/recordWatch";
import { isExcludedProfile, loadHumanMatchContext, loadStatsExclusions } from "@/lib/statsExclusions";

type Sb = ReturnType<typeof supabaseAdmin>;

// Timeplay (auf Zeit) und DYP (nur Platzierungen, teils Kicker/Arcade) zählen nicht
const NOT_COUNTED_FORMATS = new Set(["timeplay", "dyp", "dyp_round_robin"]);
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export type MachineRecordsResult = {
  enabled: boolean;
  records: PriorRecords["records"];
  monthly: PriorRecords["monthly"];
  personal: PriorRecords["personal"];
  excludedProfiles?: string[];
  played?: string[];
  profiles?: string[];
};

/**
 * 🎰 Flipper-Premiere: welche Flipper (Name) haben diese Profile an DIESER Location schon gespielt?
 * Alle anderen Turniere der Location – jedes Format, auch noch laufende. Ein Eintrag zählt, sobald es
 * einen Score oder Platz gibt. Fehler → leere Liste (dann eben ohne Premiere-Schutz, Rekorde laufen weiter).
 */
async function loadPlayedAtLocation(sb: Sb, profileIds: string[], currentId: string, locationId: string) {
  if (!profileIds.length) return [] as string[];
  const { data: locTours, error: ltErr } = await sb.from("tournaments").select("id").eq("location_id", locationId);
  if (ltErr) return [];
  const atLocation = new Set((locTours ?? []).map((x: { id: string }) => String(x.id)));
  atLocation.delete(currentId); // laufendes Turnier: zählt über die Live-Scores (anderes Match)
  if (!atLocation.size) return [];
  const pl = await fetchAllIn<{ id: string; profile_id: string | null; tournament_id: string | null }>(profileIds, (chunk) =>
    sb.from("players").select("id, profile_id, tournament_id").in("profile_id", chunk).order("id")
  );
  if (pl.error) return [];
  const profOf = new Map(
    pl.data
      .filter((p) => p.profile_id && atLocation.has(String(p.tournament_id ?? "")))
      .map((p) => [String(p.id), String(p.profile_id)])
  );
  if (!profOf.size) return [];
  const mp = await fetchAllIn<{ match_id: string; player_id: string; score: unknown; position: unknown }>(
    Array.from(profOf.keys()),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, score, position")
        .in("player_id", chunk)
        .order("match_id")
        .order("player_id")
  );
  if (mp.error) return [];
  const rows = mp.data.filter((r) => r.score != null || r.position != null);
  const ma = await fetchAllIn<{ id: string; machine_id: string | null }>(
    Array.from(new Set(rows.map((r) => String(r.match_id)))),
    (chunk) => sb.from("matches").select("id, machine_id").in("id", chunk).order("id")
  );
  if (ma.error) return [];
  const machineOf = new Map(ma.data.map((m) => [String(m.id), m.machine_id ? String(m.machine_id) : ""]));
  const mc = await fetchAllIn<{ id: string; name: string | null }>(
    Array.from(new Set(ma.data.map((m) => String(m.machine_id ?? "")).filter(Boolean))),
    (chunk) => sb.from("machines").select("id, name").in("id", chunk).order("id")
  );
  if (mc.error) return [];
  const nameOf = new Map(mc.data.map((m) => [String(m.id), m.name]));
  const keys = new Set<string>();
  for (const r of rows) {
    const prof = profOf.get(String(r.player_id));
    const key = machineKey(nameOf.get(machineOf.get(String(r.match_id)) ?? "") ?? null);
    if (prof && key) keys.add(personalKey(prof, key));
  }
  return Array.from(keys);
}

/**
 * Bisherige Rekorde der Location (beendete Turniere, ohne Timeplay/DYP), 30-Tage-Highscores, persönliche
 * Bestwerte + "schon gespielt" der Turnierspieler. enabled=false: keine Location bzw. Timeplay/DYP.
 * Fehler → throw (Aufrufer meldet 500).
 */
export async function loadMachineRecords(
  sb: Sb,
  t: { id: string; location_id: string | null; format: string | null }
): Promise<MachineRecordsResult> {
  const empty: MachineRecordsResult = { enabled: false, records: {}, monthly: {}, personal: {} };
  if (!t.location_id || NOT_COUNTED_FORMATS.has(String(t.format ?? ""))) return empty;

  // Profile der aktuellen Spieler (für persönliche Bestwerte)
  const { data: curPlayers, error: cpErr } = await sb.from("players").select("profile_id").eq("tournament_id", t.id);
  if (cpErr) throw new Error(`Spieler laden fehlgeschlagen: ${cpErr.message}`);
  const personalFor = Array.from(
    new Set((curPlayers ?? []).map((p: { profile_id: string | null }) => p.profile_id).filter(Boolean).map(String))
  );

  // 🎰 an dieser Location schon gespielt – egal welches Format (für die Flipper-Premiere)
  const played = await loadPlayedAtLocation(sb, personalFor, String(t.id), String(t.location_id));

  const { data: others, error: oErr } = await sb
    .from("tournaments")
    .select("id, format, created_at")
    .eq("location_id", t.location_id)
    .eq("status", "finished")
    .neq("id", t.id);
  if (oErr) throw new Error(`Turniere laden fehlgeschlagen: ${oErr.message}`);
  const counted = (others ?? []).filter(
    (o: { format: string | null }) => !NOT_COUNTED_FORMATS.has(String(o.format ?? ""))
  ) as { id: string; created_at: string | null }[];
  const tIds = counted.map((o) => String(o.id));
  const since = Date.now() - MONTH_MS;
  const recentTournamentIds = counted
    .filter((o) => o.created_at && new Date(o.created_at).getTime() >= since)
    .map((o) => String(o.id));
  if (!tIds.length) return { ...empty, enabled: true, played, profiles: personalFor };

  const maRes = await fetchAllIn<{ id: string; name: string | null; tournament_id: string | null }>(tIds, (chunk) =>
    sb.from("machines").select("id, name, tournament_id").in("tournament_id", chunk).order("id")
  );
  if (maRes.error) throw new Error(`Flipper laden fehlgeschlagen: ${maRes.error.message}`);

  const mRes = await fetchAllIn<{ id: string; machine_id: string | null }>(
    maRes.data.map((m) => String(m.id)),
    (chunk) => sb.from("matches").select("id, machine_id").in("machine_id", chunk).order("id")
  );
  if (mRes.error) throw new Error(`Matches laden fehlgeschlagen: ${mRes.error.message}`);

  const mpRes = await fetchAllIn<{
    match_id: string;
    player_id: string;
    score: number | string | null;
    stats_ignored?: boolean | null;
  }>(
    mRes.data.map((m) => String(m.id)),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, score, stats_ignored")
        .in("match_id", chunk)
        .not("score", "is", null)
        .order("match_id")
        .order("player_id")
  );
  if (mpRes.error) throw new Error(`Scores laden fehlgeschlagen: ${mpRes.error.message}`);

  const pRes = await fetchAllIn<{ id: string; name: string | null; profile_id: string | null }>(
    Array.from(new Set(mpRes.data.map((m) => String(m.player_id)))),
    (chunk) => sb.from("players").select("id, name, profile_id").in("id", chunk).order("id")
  );
  if (pRes.error) throw new Error(`Spieler laden fehlgeschlagen: ${pRes.error.message}`);

  // 🛡️ Statistik-Schutz: Bots, Platzhalter und als falsch markierte Scores zählen nicht
  const ex = await loadStatsExclusions(sb);
  const profileOfPlayer = new Map(pRes.data.map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));
  const countedMps = mpRes.data.filter(
    (r) => r.stats_ignored !== true && !isExcludedProfile(ex, profileOfPlayer.get(String(r.player_id)))
  );

  const prior = buildPriorRecords({
    machines: maRes.data,
    matches: mRes.data,
    matchPlayers: countedMps,
    players: pRes.data,
    personalFor,
    recentTournamentIds,
    tournamentDates: Object.fromEntries(counted.map((o) => [String(o.id), o.created_at ?? null])),
  });
  const excludedProfiles = personalFor.filter((id) => isExcludedProfile(ex, id));
  // profiles = für diese Spieler wurde gerechnet (später hinzugefügte → Seite lädt sofort neu)
  return { enabled: true, ...prior, excludedProfiles, played, profiles: personalFor };
}

/**
 * Bisherige Matchsiege der Spieler eines Turniers: wins[profileId] = Platz 1 in ALLEN ANDEREN Turnieren
 * (alle Formate; in Matches mit 🤖 Bots zählt der Platz nur unter Menschen). excluded = Bots/Platzhalter.
 * Fehler → throw.
 */
export async function loadPriorWins(sb: Sb, tournamentId: string): Promise<{ wins: Record<string, number>; excluded: string[] }> {
  const { data: cur, error: cErr } = await sb.from("players").select("profile_id").eq("tournament_id", tournamentId);
  if (cErr) throw new Error(`Spieler laden fehlgeschlagen: ${cErr.message}`);
  const profileIds = Array.from(
    new Set((cur ?? []).map((p: { profile_id: string | null }) => p.profile_id).filter(Boolean).map(String))
  );
  if (!profileIds.length) return { wins: {}, excluded: [] };

  // alle Spieler-Einträge dieser Profile in anderen Turnieren
  const apRes = await fetchAllIn<{ id: string; profile_id: string; tournament_id: string }>(profileIds, (chunk) =>
    sb.from("players").select("id, profile_id, tournament_id").in("profile_id", chunk).order("id")
  );
  if (apRes.error) throw new Error(`Spielerverlauf laden fehlgeschlagen: ${apRes.error.message}`);
  const others = apRes.data.filter((p) => String(p.tournament_id) !== String(tournamentId));
  const profileByPlayer = new Map(others.map((p) => [String(p.id), String(p.profile_id)]));

  // alle gewerteten Matches laden (nicht nur Siege): in Matches mit 🤖 Bots zählt der Platz nur unter Menschen
  const wRes = await fetchAllIn<{ match_id: string; player_id: string; position: number | null }>(
    others.map((p) => String(p.id)),
    (chunk) =>
      sb
        .from("match_players")
        .select("match_id, player_id, position")
        .in("player_id", chunk)
        .not("position", "is", null)
        .order("match_id")
        .order("player_id")
  );
  if (wRes.error) throw new Error(`Siege laden fehlgeschlagen: ${wRes.error.message}`);

  const ex = await loadStatsExclusions(sb);
  const hc = await loadHumanMatchContext(sb, ex, Array.from(new Set(wRes.data.map((r) => String(r.match_id)))));

  const wins: Record<string, number> = {};
  for (const pid of profileIds) wins[pid] = 0;
  for (const w of wRes.data) {
    const pid = profileByPlayer.get(String(w.player_id));
    if (!pid) continue;
    if (hc.position(String(w.match_id), String(w.player_id), w.position) === 1) wins[pid] = (wins[pid] ?? 0) + 1;
  }
  // 🤖/🚫 Bots + Platzhalter: keine Matchsieg-Meilensteine
  const excluded = profileIds.filter((id) => isExcludedProfile(ex, id));
  return { wins, excluded };
}

/** Elo zu Turnierbeginn je Profil (tournament_ratings.rating_before) – wie die linke Zahl im Leaderboard */
export async function loadStartElo(sb: Sb, tournamentId: string): Promise<Record<string, number>> {
  const { data, error } = await sb.from("tournament_ratings").select("profile_id, rating_before").eq("tournament_id", tournamentId);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { profile_id: string | null; rating_before: number | null }[]) {
    if (r.profile_id && typeof r.rating_before === "number") out[String(r.profile_id)] = r.rating_before;
  }
  return out;
}
