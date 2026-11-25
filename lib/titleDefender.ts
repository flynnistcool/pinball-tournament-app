// 🛡️ Titelverteidiger + 🏅 Letzter Sieger – reine Logik.
// Gab es GENAU DIESELBE Besetzung (gleiche Profile, Reihenfolge egal) schon einmal …
//  - 🛡️ am selben Flipper (gleicher Name an derselben Location)? → damaliger Sieger = "Titelverteidiger"
//  - 🏅 irgendwo (egal welcher Flipper)? → Sieger des LETZTEN Aufeinandertreffens = "Letzter Sieger"
//    Badge immer (auch wenn es dasselbe Match wie beim Titelverteidiger war → dann 🛡️ + 🏅);
//    in der Meldung nur erwähnt, wenn es ein ANDERES Match war (sameAsFlipper = false)
// Formatgruppen: Matchplay / Swiss / Round Robin zählen zusammen, Round the Pinball nur mit RtP.
// DYP (Teams), Elimination, Timeplay: nichts.

export type DefenderGroup = "mp" | "rtp";

export function defenderGroup(format: string | null | undefined): DefenderGroup | null {
  const f = String(format ?? "").toLowerCase();
  if (f === "rotation") return "rtp";
  if (f === "matchplay" || f === "swiss" || f === "round_robin") return "mp";
  return null;
}

export type DefenderHistRow = {
  match_id: string;
  profile_id: string | null;
  position: number | null;
  format: string | null;
  at?: string | null;
  /** Flipper-Schlüssel an der Location des Turniers (null = andere Location/unbekannt) */
  machineKey: string | null;
  /** Flipper-Name (auch andere Locations) – für "auf Elvira" */
  machineName?: string | null;
};

export type DefenderCurrent = {
  matchId: string;
  /** Profile der Spieler im laufenden Match (null = Gast ohne Profil → kein Vergleich möglich) */
  profileIds: (string | null)[];
  machineKey: string | null;
  format: string | null;
};

export type Defender = {
  /** Profil des damaligen Siegers */
  profileId: string;
  /** Zeitpunkt des damaligen Matches */
  at?: string | null;
  /** damaliges Match */
  matchId: string;
  /** damaliger Flipper */
  machineName?: string | null;
  /** 🏅: dasselbe Match wie beim Titelverteidiger (Meldung erwähnt es dann nicht extra) */
  sameAsFlipper?: boolean;
};

export type DefenderFound = { flipper?: Defender; last?: Defender };

const lineupOf = (group: DefenderGroup, profiles: string[]) => `${group}|${profiles.slice().sort().join(",")}`;

/**
 * @param history  Teilnahmen früherer Matches (alle Spieler je Match)
 * @param current  laufende Matches
 * @returns matchId → { flipper: Titelverteidiger, last: letzter Sieger allgemein (+ sameAsFlipper) }
 */
export function findDefenders(history: DefenderHistRow[], current: DefenderCurrent[]): Record<string, DefenderFound> {
  const currentIds = new Set(current.map((c) => String(c.matchId)));

  const byMatch = new Map<string, DefenderHistRow[]>();
  for (const r of history) {
    const id = String(r.match_id);
    if (currentIds.has(id)) continue; // das laufende Match selbst zählt nie
    const list = byMatch.get(id);
    if (list) list.push(r);
    else byMatch.set(id, [r]);
  }

  type Hit = Defender & { t: number };
  const lastOnMachine = new Map<string, Hit>(); // Besetzung + Flipper
  const lastAnywhere = new Map<string, Hit>(); // nur Besetzung
  for (const [mid, rows] of Array.from(byMatch.entries())) {
    const first = rows[0];
    const group = defenderGroup(first.format);
    if (!group) continue;
    if (rows.some((r) => !r.profile_id || r.position == null)) continue; // unvollständig / Gast
    const profiles = rows.map((r) => String(r.profile_id));
    if (new Set(profiles).size !== profiles.length || profiles.length < 2) continue;
    const winners = rows.filter((r) => r.position === 1);
    if (winners.length !== 1) continue; // Gleichstand → kein eindeutiger Sieger
    const t0 = first.at ? Date.parse(first.at) : 0;
    const hit: Hit = {
      profileId: String(winners[0].profile_id),
      at: first.at ?? null,
      matchId: mid,
      machineName: first.machineName ?? null,
      t: Number.isFinite(t0) ? t0 : 0,
    };
    const lineup = lineupOf(group, profiles);
    const pa = lastAnywhere.get(lineup);
    if (!pa || hit.t > pa.t) lastAnywhere.set(lineup, hit);
    if (first.machineKey) {
      const k = `${lineup}|${first.machineKey}`;
      const pm = lastOnMachine.get(k);
      if (!pm || hit.t > pm.t) lastOnMachine.set(k, hit);
    }
  }

  const strip = (h: Hit): Defender => ({ profileId: h.profileId, at: h.at, matchId: h.matchId, machineName: h.machineName });
  const out: Record<string, DefenderFound> = {};
  for (const c of current) {
    const group = defenderGroup(c.format);
    if (!group) continue;
    if (c.profileIds.length < 2 || c.profileIds.some((p) => !p)) continue;
    const profiles = c.profileIds.map(String);
    if (new Set(profiles).size !== profiles.length) continue;
    const lineup = lineupOf(group, profiles);
    const onMachine = c.machineKey ? lastOnMachine.get(`${lineup}|${c.machineKey}`) : undefined;
    const anywhere = lastAnywhere.get(lineup);
    const found: DefenderFound = {};
    if (onMachine) found.flipper = strip(onMachine);
    if (anywhere) found.last = { ...strip(anywhere), sameAsFlipper: !!onMachine && anywhere.matchId === onMachine.matchId };
    if (found.flipper || found.last) out[String(c.matchId)] = found;
  }
  return out;
}

/** kurzes Datum "12.10." bzw. "12.10.2025", wenn nicht dieses Jahr */
export function defenderDate(at: string | null | undefined, now = new Date()): string {
  if (!at) return "";
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return "";
  const dm = `${d.getDate()}.${d.getMonth() + 1}.`;
  return d.getFullYear() === now.getFullYear() ? dm : `${dm}${d.getFullYear()}`;
}

/**
 * Kennung "welche laufenden Matches spielen an welchem Flipper" – gleich gerechnet auf Server und Seite.
 * Ändert sich ein Flipper, ändert sich die Kennung → Seite lädt die Duell-Daten neu, Server rechnet neu.
 * Nur Matches offener Runden übergeben (Server) bzw. die Seite filtert selbst (liveMachineSigFromData).
 */
export function liveMachineSig(
  matches: readonly { id: unknown; machine_id?: unknown; status?: unknown }[]
): string {
  return matches
    .filter((m) => String(m.status ?? "").toLowerCase() !== "finished")
    .map((m) => `${String(m.id)}:${m.machine_id ? String(m.machine_id) : ""}`)
    .sort()
    .join(",");
}

/** wie liveMachineSig, aber aus den Seiten-Daten (nur Matches offener Runden) */
export function liveMachineSigFromData(
  data:
    | {
        rounds?: readonly { id: unknown; status?: unknown }[] | null;
        matches?: readonly { id: unknown; round_id?: unknown; machine_id?: unknown; status?: unknown }[] | null;
      }
    | null
    | undefined
): string {
  const open = new Set((data?.rounds ?? []).filter((r) => String(r.status ?? "") === "open").map((r) => String(r.id)));
  return liveMachineSig((data?.matches ?? []).filter((m) => open.has(String(m.round_id))));
}

// ── 📣 Ticker-Meldungen (Titelverteidiger + letzter Sieger in EINER Meldung) ──────

/** Ankündigungen eines Matches beginnen mit dieser Kennung (Flipper geändert → alle ausblenden außer der neuen) */
export const defenderAnnouncePrefix = (matchId: string) => `defender|${matchId}|`;

export type DefenderPerson = { id: string; name: string; at: string | null; machine?: string | null };

type FeedItem = {
  key: string;
  kind: string;
  icon: string;
  title: string;
  body: string;
  players: string[];
  data: Record<string, unknown>;
};

const onMachine = (machine: string | null, icon: string | null) =>
  machine ? `${icon ? `${icon} ` : ""}${machine}` : "diesem Flipper";

/** "(auf Elvira, 20.11.)" */
function lastWhere(l: DefenderPerson): string {
  const parts = [l.machine ? `auf ${l.machine}` : "", defenderDate(l.at)].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Kennung der Ankündigung (ändert sich mit Flipper oder Personen → alte wird ausgeblendet) */
export function defenderAnnounceKey(matchId: string, machineId: string, flipperId: string | null, lastId: string | null) {
  return `${defenderAnnouncePrefix(matchId)}${machineId}|${flipperId ?? "-"}|${lastId ?? "-"}`;
}

/** vor dem Spiel */
export function defenderAnnounceItem(opts: {
  matchId: string;
  machineId: string;
  machine: string | null;
  machineIcon: string | null;
  /** 🛡️ Titelverteidiger auf diesem Flipper */
  flipper?: DefenderPerson | null;
  /** 🏅 Sieger des letzten Aufeinandertreffens (anderes Match) */
  last?: DefenderPerson | null;
  /** alle Spieler des Matches (Handy-Karte für jeden im Match) */
  playerIds?: string[];
}): FeedItem | null {
  const { matchId, machineId, machine, machineIcon } = opts;
  const f = opts.flipper ?? null;
  const l = opts.last ?? null;
  if (!f && !l) return null;
  const players = Array.from(new Set([...(f ? [f.id] : []), ...(l ? [l.id] : []), ...(opts.playerIds ?? [])]));
  const duel = (opts.playerIds?.length ?? 2) <= 2 ? "Duell" : "Aufeinandertreffen";
  const m = onMachine(machine, machineIcon);
  let title: string;
  let body: string;
  if (f && !l) {
    const when = defenderDate(f.at);
    title = "Titelverteidiger";
    body = `Auf ${m} hat in genau dieser Besetzung zuletzt ${f.name} gewonnen${when ? ` (${when})` : ""}. Gelingt die Titelverteidigung – oder wird ${f.name} gestoppt?`;
  } else if (!f && l) {
    title = "Letzter Sieger";
    body = `Das letzte ${duel} in genau dieser Besetzung hat ${l.name} gewonnen${lastWhere(l)}. Wiederholt sich das?`;
  } else if (f!.id === l!.id) {
    title = "Titelverteidiger";
    body = `Auf ${m} hat in genau dieser Besetzung zuletzt ${f!.name} gewonnen – und auch das letzte ${duel} überhaupt${lastWhere(l!)}. Gelingt die Titelverteidigung?`;
  } else {
    title = "Titelverteidiger";
    body = `Auf ${m} hat in genau dieser Besetzung zuletzt ${f!.name} gewonnen – das letzte ${duel} überhaupt ging aber an ${l!.name}${lastWhere(l!)}. Wer setzt sich durch?`;
  }
  return {
    key: defenderAnnounceKey(matchId, machineId, f?.id ?? null, l?.id ?? null),
    kind: "titleDefender",
    icon: "🛡️",
    title,
    body,
    players,
    data: {
      player: (f ?? l)!.name,
      other: f && l && f.id !== l.id ? l.name : undefined,
      machine,
      machineIcon,
      matchId,
      defenderId: f?.id ?? null,
      lastId: l?.id ?? null,
      phase: "announce",
    },
  };
}

/** nach dem Spiel */
export function defenderResultItem(opts: {
  matchId: string;
  machineId: string;
  machine: string | null;
  machineIcon: string | null;
  flipper?: { id: string; name: string } | null;
  last?: { id: string; name: string } | null;
  winnerId: string;
  winnerName: string;
  /** alle Spieler des Matches (Handy-Karte für jeden im Match) */
  playerIds?: string[];
}): FeedItem | null {
  const { matchId, machineId, machine, machineIcon, winnerId, winnerName } = opts;
  const f = opts.flipper ?? null;
  const l = opts.last ?? null;
  if (!f && !l) return null;
  const players = Array.from(
    new Set([winnerId, ...(f ? [f.id] : []), ...(l ? [l.id] : []), ...(opts.playerIds ?? [])])
  );
  const duel = (opts.playerIds?.length ?? 2) <= 2 ? "Duell" : "Aufeinandertreffen";
  const m = onMachine(machine, machineIcon);
  const W = winnerName;
  let title: string;
  let body: string;
  let other: string | undefined;
  if (f && !l) {
    if (winnerId === f.id) {
      title = "Titel verteidigt";
      body = `${f.name} verteidigt den Sieg auf ${m} – auch diesmal in dieser Besetzung vorn!`;
    } else {
      title = "Titelverteidiger gestoppt";
      body = `${W} stoppt Titelverteidiger ${f.name} auf ${m}!`;
      other = f.name;
    }
  } else if (!f && l) {
    if (winnerId === l.id) {
      title = "Wieder gewonnen";
      body = `${l.name} gewinnt auch dieses ${duel} – wie beim letzten Mal!`;
    } else {
      title = "Spieß umgedreht";
      body = `${W} dreht den Spieß um – beim letzten ${duel} hatte noch ${l.name} gewonnen!`;
      other = l.name;
    }
  } else if (f!.id === l!.id) {
    if (winnerId === f!.id) {
      title = "Titel verteidigt";
      body = `${f!.name} verteidigt ${m} – und gewinnt auch das ${duel} erneut!`;
    } else {
      title = "Titelverteidiger gestoppt";
      body = `${W} stoppt Titelverteidiger ${f!.name} auf ${m}!`;
      other = f!.name;
    }
  } else if (winnerId === f!.id) {
    title = "Titel verteidigt";
    body = `${f!.name} verteidigt ${m} – und holt sich das ${duel} von ${l!.name} zurück!`;
    other = l!.name;
  } else if (winnerId === l!.id) {
    title = "Titelverteidiger gestoppt";
    body = `${l!.name} stoppt Titelverteidiger ${f!.name} auf ${m} und gewinnt das ${duel} zum zweiten Mal in Folge!`;
    other = f!.name;
  } else {
    title = "Titelverteidiger gestoppt";
    body = `${W} stoppt Titelverteidiger ${f!.name} auf ${m}!`;
    other = f!.name;
  }
  return {
    key: `defenderResult|${matchId}|${machineId}`,
    kind: "titleDefender",
    icon: "🛡️",
    title,
    body,
    players,
    data: {
      player: W,
      other,
      machine,
      machineIcon,
      matchId,
      defenderId: f?.id ?? null,
      lastId: l?.id ?? null,
      winnerId,
      defended: f ? winnerId === f.id : undefined,
      phase: "result",
    },
  };
}
