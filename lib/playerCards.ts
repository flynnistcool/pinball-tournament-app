// Reine Auswertung für die Spieler-Sammelkarten am TV (/api/public/player-cards).
// Keine Datenbankzugriffe – bekommt alle nötigen Zeilen und baut daraus die Karten.

export type CardProfile = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  icon: string | null;
  color: string | null;
  rating: number | null;
};

export type CardInput = {
  /** Spieler dieses Turniers (Reihenfolge = Anmeldung) */
  tournamentPlayers: { id: string; name: string | null; profile_id: string | null }[];
  profiles: CardProfile[];
  /** alle Spieler-Einträge der Profile über alle Turniere */
  allPlayers: { id: string; profile_id: string; tournament_id: string }[];
  /** Match-Ergebnisse dieser Spieler-Einträge */
  matchPlayers: { match_id: string; player_id: string; position: number | null; score: number | string | null }[];
  matches: { id: string; machine_id: string | null }[];
  machines: { id: string; name: string | null; icon_emoji: string | null }[];
  /** Endergebnisse (tournament_results) dieser Spieler-Einträge */
  results: { tournament_id: string; player_id: string; final_rank: number | null; super_final_rank: number | null }[];
};

export type PlayerCard = {
  playerId: string;
  profileId: string | null;
  name: string;
  avatarUrl: string | null;
  icon: string | null;
  color: string | null;
  elo: number | null;
  /** Elo-Rang unter den Spielern dieses Turniers (1 = Favorit), null ohne Elo */
  eloRank: number | null;
  eloRankOf: number;
  tournaments: number;
  tournamentWins: number;
  matches: number;
  matchWins: number;
  winrate: number | null; // in %
  favoriteMachine: { name: string; icon: string | null; count: number } | null;
  /** bis zu 3 Flipper mit der besten Siegquote (je mind. BEST_MACHINE_MIN_MATCHES Matches), Bester zuerst */
  bestMachines: BestMachine[];
  bestScore: { score: number; machine: string | null; icon: string | null } | null;
};

export type BestMachine = { name: string; icon: string | null; matches: number; wins: number; winrate: number };

/** so viele Matches braucht ein Flipper mindestens für "Bester Flipper" (sonst wäre 1 Sieg aus 1 = 100 %) */
export const BEST_MACHINE_MIN_MATCHES = 3;

/** Turniersieg: mit Superfinale zählt dessen Platz 1, sonst Platz 1 der Endwertung. */
export function isTournamentWin(r: { final_rank: number | null; super_final_rank: number | null }): boolean {
  return r.super_final_rank != null ? Number(r.super_final_rank) === 1 : Number(r.final_rank) === 1;
}

export function buildPlayerCards(input: CardInput): PlayerCard[] {
  const profileById = new Map(input.profiles.map((p) => [String(p.id), p]));
  const machineById = new Map(input.machines.map((m) => [String(m.id), m]));
  const machineIdByMatch = new Map(input.matches.map((m) => [String(m.id), m.machine_id ? String(m.machine_id) : null]));
  const profileByPlayer = new Map(input.allPlayers.map((p) => [String(p.id), String(p.profile_id)]));

  type Agg = {
    tournaments: Set<string>;
    tournamentWins: number;
    matches: number;
    matchWins: number;
    machineCount: Map<string, { name: string; icon: string | null; count: number; wins: number }>;
    best: { score: number; machine: string | null; icon: string | null } | null;
  };
  const agg = new Map<string, Agg>();
  const get = (profileId: string): Agg => {
    let a = agg.get(profileId);
    if (!a) {
      a = { tournaments: new Set(), tournamentWins: 0, matches: 0, matchWins: 0, machineCount: new Map(), best: null };
      agg.set(profileId, a);
    }
    return a;
  };

  for (const p of input.allPlayers) get(String(p.profile_id)).tournaments.add(String(p.tournament_id));

  for (const mp of input.matchPlayers) {
    const profileId = profileByPlayer.get(String(mp.player_id));
    if (!profileId) continue;
    const a = get(profileId);
    const machineId = machineIdByMatch.get(String(mp.match_id)) ?? null;
    const machine = machineId ? machineById.get(machineId) : undefined;
    const machineName = machine?.name?.trim() || null;

    // nur gewertete Matches (Platz vergeben) zählen für Matches/Siege/Lieblingsflipper
    if (mp.position != null && Number(mp.position) > 0) {
      a.matches += 1;
      if (Number(mp.position) === 1) a.matchWins += 1;
      if (machineName) {
        // gleicher Flipper-Name in verschiedenen Turnieren = derselbe Flipper
        const key = machineName.toLowerCase();
        const cur = a.machineCount.get(key) ?? { name: machineName, icon: machine?.icon_emoji ?? null, count: 0, wins: 0 };
        cur.count += 1;
        if (Number(mp.position) === 1) cur.wins += 1;
        a.machineCount.set(key, cur);
      }
    }

    const s = mp.score == null || mp.score === "" ? NaN : Number(mp.score);
    if (Number.isFinite(s) && s > 0 && (!a.best || s > a.best.score)) {
      a.best = { score: s, machine: machineName, icon: machine?.icon_emoji ?? null };
    }
  }

  for (const r of input.results) {
    const profileId = profileByPlayer.get(String(r.player_id));
    if (profileId && isTournamentWin(r)) get(profileId).tournamentWins += 1;
  }

  // Elo-Rang unter den Turnierspielern
  const ratings = input.tournamentPlayers
    .map((p) => (p.profile_id ? profileById.get(String(p.profile_id))?.rating : null))
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const rankOf = (elo: number | null): number | null =>
    elo == null ? null : 1 + ratings.filter((r) => r > elo).length;

  return input.tournamentPlayers.map((tp) => {
    const prof = tp.profile_id ? profileById.get(String(tp.profile_id)) : undefined;
    const a = prof ? agg.get(String(prof.id)) : undefined;
    const elo = typeof prof?.rating === "number" && Number.isFinite(prof.rating) ? prof.rating : null;

    let favorite: PlayerCard["favoriteMachine"] = null;
    const machineList = Array.from(a?.machineCount.values() ?? []);
    for (const m of machineList) {
      if (!favorite || m.count > favorite.count) favorite = { name: m.name, icon: m.icon, count: m.count };
    }
    // Top 3 nach Siegquote; bei Gleichstand der Flipper mit mehr Matches
    const bestMachines: BestMachine[] = machineList
      .filter((m) => m.count >= BEST_MACHINE_MIN_MATCHES)
      .sort((x, y) => y.wins / y.count - x.wins / x.count || y.count - x.count)
      .slice(0, 3)
      .map((m) => ({ name: m.name, icon: m.icon, matches: m.count, wins: m.wins, winrate: Math.round((m.wins / m.count) * 100) }));

    const matches = a?.matches ?? 0;
    const matchWins = a?.matchWins ?? 0;
    return {
      playerId: String(tp.id),
      profileId: prof ? String(prof.id) : null,
      name: String(tp.name ?? prof?.name ?? "?"),
      avatarUrl: prof?.avatar_url ?? null,
      icon: prof?.icon ?? null,
      color: prof?.color ?? null,
      elo,
      eloRank: rankOf(elo),
      eloRankOf: ratings.length,
      tournaments: a?.tournaments.size ?? 0,
      tournamentWins: a?.tournamentWins ?? 0,
      matches,
      matchWins,
      winrate: matches > 0 ? Math.round((matchWins / matches) * 100) : null,
      favoriteMachine: favorite,
      bestMachines,
      bestScore: a?.best ?? null,
    };
  });
}
