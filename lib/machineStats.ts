// Statistik pro Location-Flipper (Locations-Tab).
//
// Verknüpfung: Turnier-Flipper (Tabelle machines) haben KEINE ID-Verbindung zu den
// Location-Flippern (location_machines). Sie werden beim Turnier-Anlegen per Name kopiert.
// Zuordnung daher über: tournaments.location_id + Flipper-NAME (Groß/Klein + Leerzeichen egal)
// – genau wie bei der Flipper-Winrate.
// Single-Play-Läufe und Tasks hängen dagegen per ID am Location-Flipper.
//
// Gezählt werden nur BEENDETE Turniere (Filter in der API) und darin nur FERTIGE Matches.
//
// Reine Funktion, speichert nichts.

export type MsTournament = { id: string; created_at: string | null; name?: string | null; category?: string | null };
export type MsMachine = { id: string; name: string | null; tournament_id: string };
export type MsMatch = { id: string; machine_id: string | null };
export type MsMatchPlayer = { match_id: string; player_id: string; position: number | null; score: number | string | null };
export type MsPlayer = { id: string; name: string | null; profile_id: string | null };
export type MsProfile = { id: string; name: string | null; icon?: string | null; color?: string | null };
export type MsLocationMachine = { id: string; name: string | null };

export type MachineStat = {
  matches: number; // fertige Matches (alle Plätze vergeben) in beendeten Turnieren
  tournaments: number; // in wie vielen Turnieren
  lastPlayed: string | null; // Datum des letzten Turniers mit Match
  lastTournament: string | null; // Name dieses Turniers
  lastCategory: string | null; // Kategorie dieses Turniers
  highscore: number | null;
  highscoreBy: string | null;
  highscoreAt: string | null;
  highscoreTournament: string | null; // Turniername
  highscoreCategory: string | null; // Kategorie / Serie
  avgScore: number | null; // Ø aller Scores > 0
  king: { name: string; icon: string | null; color: string | null; wins: number; played: number; winrate: number } | null;
  rank: number | null; // Beliebtheit: Platz in der Location nach Anzahl Matches
  rankOf: number;
  monthly: { month: string; count: number }[]; // letzte 6 Monate (YYYY-MM)
  tasksActive: number;
  tasksTotal: number;
  tasks: { title: string; difficulty: string | null; active: boolean }[]; // Timeplay-Aufgaben

  singlePlayRuns: number;
};

export const machineKey = (name: string | null | undefined) =>
  String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function computeMachineStats(input: {
  locationMachines: MsLocationMachine[];
  tournaments: MsTournament[];
  machines: MsMachine[];
  matches: MsMatch[];
  matchPlayers: MsMatchPlayer[];
  players: MsPlayer[];
  profiles: MsProfile[];
  tasks: { location_machine_id: string; active: boolean | null; title?: string | null; difficulty?: string | null }[];
  singlePlayRuns: { machine_id: string | null; status: string | null }[];
  now?: Date;
}): Record<string, MachineStat> {
  const tById = new Map(input.tournaments.map((t) => [t.id, t]));
  const machineKeyById = new Map<string, string>();
  const machineTournament = new Map<string, string>();
  for (const m of input.machines) {
    machineKeyById.set(m.id, machineKey(m.name));
    machineTournament.set(m.id, m.tournament_id);
  }
  const playerById = new Map(input.players.map((p) => [p.id, p]));
  const profileById = new Map(input.profiles.map((p) => [p.id, p]));
  const mpsByMatch = new Map<string, MsMatchPlayer[]>();
  for (const mp of input.matchPlayers) {
    const list = mpsByMatch.get(mp.match_id);
    if (list) list.push(mp);
    else mpsByMatch.set(mp.match_id, [mp]);
  }

  // letzte 6 Monate
  const now = input.now ?? new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  type Acc = {
    matches: number;
    tournaments: Set<string>;
    lastPlayed: string | null;
    lastT: MsTournament | null;
    hs: number | null;
    hsBy: string | null;
    hsAt: string | null;
    hsT: MsTournament | null;
    scoreSum: number;
    scoreN: number;
    byWho: Map<string, { name: string; icon: string | null; color: string | null; wins: number; played: number }>;
    monthly: Record<string, number>;
  };
  const acc = new Map<string, Acc>();
  const getAcc = (k: string) => {
    let a = acc.get(k);
    if (!a) {
      a = {
        matches: 0,
        tournaments: new Set(),
        lastPlayed: null,
        lastT: null,
        hs: null,
        hsBy: null,
        hsAt: null,
        hsT: null,
        scoreSum: 0,
        scoreN: 0,
        byWho: new Map(),
        monthly: {},
      };
      acc.set(k, a);
    }
    return a;
  };

  for (const m of input.matches) {
    if (!m.machine_id) continue;
    const k = machineKeyById.get(m.machine_id);
    if (!k) continue;
    const list = mpsByMatch.get(m.id) ?? [];
    // nur fertige Matches: alle Plätze vergeben
    const finished = list.length > 0 && list.every((x) => x.position != null);
    if (!finished) continue;

    const tId = machineTournament.get(m.machine_id) ?? "";
    const tDate = tById.get(tId)?.created_at ?? null;
    const a = getAcc(k);
    a.matches += 1;
    if (tId) a.tournaments.add(tId);
    if (tDate && (!a.lastPlayed || tDate > a.lastPlayed)) {
      a.lastPlayed = tDate;
      a.lastT = tById.get(tId) ?? null;
    }
    if (tDate) {
      const mk = tDate.slice(0, 7);
      a.monthly[mk] = (a.monthly[mk] ?? 0) + 1;
    }

    for (const mp of list) {
      const pl = playerById.get(mp.player_id);
      const prof = pl?.profile_id ? profileById.get(pl.profile_id) : undefined;
      const who = String(prof?.name ?? pl?.name ?? "?");
      const s = toScore(mp.score);
      if (s != null && s > 0) {
        a.scoreSum += s;
        a.scoreN += 1;
        if (a.hs == null || s > a.hs) {
          a.hs = s;
          a.hsBy = who;
          a.hsAt = tDate;
          a.hsT = tById.get(tId) ?? null;
        }
      }
      if (mp.position != null) {
        const whoKey = pl?.profile_id ? `p:${pl.profile_id}` : `n:${who.toLowerCase()}`;
        let w = a.byWho.get(whoKey);
        if (!w) {
          w = { name: who, icon: (prof?.icon ?? "").trim() || null, color: prof?.color ?? null, wins: 0, played: 0 };
          a.byWho.set(whoKey, w);
        }
        w.played += 1;
        if (Number(mp.position) === 1) w.wins += 1;
      }
    }
  }

  // Beliebtheit (Rang nach Matches, nur Flipper dieser Location)
  const lmKeys = input.locationMachines.map((lm) => machineKey(lm.name));
  const counts = lmKeys.map((k) => acc.get(k)?.matches ?? 0);
  const sortedCounts = [...counts].sort((x, y) => y - x);

  const tasksBy = new Map<string, { active: number; total: number; list: MachineStat["tasks"] }>();
  const diffOrder: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
  for (const t of input.tasks) {
    const cur = tasksBy.get(t.location_machine_id) ?? { active: 0, total: 0, list: [] };
    cur.total += 1;
    if (t.active !== false) cur.active += 1;
    cur.list.push({ title: String(t.title ?? "").trim() || "—", difficulty: t.difficulty ?? null, active: t.active !== false });
    cur.list.sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        (diffOrder[a.difficulty ?? ""] ?? 9) - (diffOrder[b.difficulty ?? ""] ?? 9) ||
        a.title.localeCompare(b.title)
    );
    tasksBy.set(t.location_machine_id, cur);
  }
  const runsBy = new Map<string, number>();
  for (const r of input.singlePlayRuns) {
    if (!r.machine_id || r.status !== "finished") continue;
    runsBy.set(r.machine_id, (runsBy.get(r.machine_id) ?? 0) + 1);
  }

  const out: Record<string, MachineStat> = {};
  input.locationMachines.forEach((lm, i) => {
    const a = acc.get(lmKeys[i]);
    let king: MachineStat["king"] = null;
    if (a) {
      for (const w of Array.from(a.byWho.values())) {
        if (w.wins === 0) continue;
        const better =
          !king ||
          w.wins > king.wins ||
          (w.wins === king.wins && w.wins / w.played > king.wins / king.played);
        if (better) king = { ...w, winrate: Math.round((w.wins / w.played) * 100) };
      }
    }
    const matches = a?.matches ?? 0;
    out[lm.id] = {
      matches,
      tournaments: a?.tournaments.size ?? 0,
      lastPlayed: a?.lastPlayed ?? null,
      lastTournament: String(a?.lastT?.name ?? "").trim() || null,
      lastCategory: String(a?.lastT?.category ?? "").trim() || null,
      highscore: a?.hs ?? null,
      highscoreBy: a?.hsBy ?? null,
      highscoreAt: a?.hsAt ?? null,
      highscoreTournament: String(a?.hsT?.name ?? "").trim() || null,
      highscoreCategory: String(a?.hsT?.category ?? "").trim() || null,
      avgScore: a && a.scoreN ? Math.round(a.scoreSum / a.scoreN) : null,
      king,
      rank: matches > 0 ? sortedCounts.indexOf(matches) + 1 : null,
      rankOf: input.locationMachines.length,
      monthly: months.map((mo) => ({ month: mo, count: a?.monthly[mo] ?? 0 })),
      tasksActive: tasksBy.get(lm.id)?.active ?? 0,
      tasksTotal: tasksBy.get(lm.id)?.total ?? 0,
      tasks: tasksBy.get(lm.id)?.list ?? [],
      singlePlayRuns: runsBy.get(lm.id) ?? 0,
    };
  });
  return out;
}
