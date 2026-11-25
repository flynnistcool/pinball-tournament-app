// 🛡️ Titelverteidiger – reine Logik.
// Gab es GENAU DIESELBE Besetzung (gleiche Profile, Reihenfolge egal) schon einmal am selben Flipper
// (gleicher Name an derselben Location)? Dann ist der damalige Sieger (Platz 1) "Titelverteidiger".
// Formatgruppen: Matchplay / Swiss / Round Robin zählen zusammen, Round the Pinball nur mit RtP.
// DYP (Teams), Elimination, Timeplay: keine Titelverteidiger.

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
  machineKey: string | null;
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
};

const lineupKey = (group: DefenderGroup, machineKey: string, profiles: string[]) =>
  `${group}|${machineKey}|${profiles.slice().sort().join(",")}`;

/**
 * @param history  Teilnahmen früherer Matches (alle Spieler je Match)
 * @param current  laufende Matches
 * @returns matchId → Titelverteidiger (nur wenn es die Besetzung schon gab und es genau einen Sieger gab)
 */
export function findDefenders(history: DefenderHistRow[], current: DefenderCurrent[]): Record<string, Defender> {
  const currentIds = new Set(current.map((c) => String(c.matchId)));

  const byMatch = new Map<string, DefenderHistRow[]>();
  for (const r of history) {
    const id = String(r.match_id);
    if (currentIds.has(id)) continue; // das laufende Match selbst zählt nie
    const list = byMatch.get(id);
    if (list) list.push(r);
    else byMatch.set(id, [r]);
  }

  // letzte fertige Partie je Besetzung
  const last = new Map<string, Defender & { t: number }>();
  for (const rows of Array.from(byMatch.values())) {
    const first = rows[0];
    const group = defenderGroup(first.format);
    if (!group || !first.machineKey) continue;
    if (rows.some((r) => !r.profile_id || r.position == null)) continue; // unvollständig / Gast
    const profiles = rows.map((r) => String(r.profile_id));
    if (new Set(profiles).size !== profiles.length || profiles.length < 2) continue;
    const winners = rows.filter((r) => r.position === 1);
    if (winners.length !== 1) continue; // Gleichstand → kein eindeutiger Sieger
    const key = lineupKey(group, first.machineKey, profiles);
    const t = first.at ? Date.parse(first.at) : 0;
    const prev = last.get(key);
    if (!prev || t > prev.t) last.set(key, { profileId: String(winners[0].profile_id), at: first.at, t: Number.isFinite(t) ? t : 0 });
  }

  const out: Record<string, Defender> = {};
  for (const c of current) {
    const group = defenderGroup(c.format);
    if (!group || !c.machineKey) continue;
    if (c.profileIds.length < 2 || c.profileIds.some((p) => !p)) continue;
    const profiles = c.profileIds.map(String);
    if (new Set(profiles).size !== profiles.length) continue;
    const hit = last.get(lineupKey(group, c.machineKey, profiles));
    if (hit) out[String(c.matchId)] = { profileId: hit.profileId, at: hit.at };
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

// ── 📣 Ticker-Meldungen ─────────────────────────────────────────────────────

/** Ankündigungen eines Matches beginnen mit dieser Kennung (Flipper geändert → alle ausblenden außer der neuen) */
export const defenderAnnouncePrefix = (matchId: string) => `defender|${matchId}|`;

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

/** vor dem Spiel: "Auf Jaws hat in dieser Besetzung zuletzt Marcus gewonnen …" */
export function defenderAnnounceItem(opts: {
  matchId: string;
  machineId: string;
  machine: string | null;
  machineIcon: string | null;
  defenderId: string;
  defenderName: string;
  at: string | null;
}): FeedItem {
  const { matchId, machineId, machine, machineIcon, defenderId, defenderName, at } = opts;
  const when = defenderDate(at);
  return {
    key: `${defenderAnnouncePrefix(matchId)}${machineId}|${defenderId}`,
    kind: "titleDefender",
    icon: "🛡️",
    title: "Titelverteidiger",
    body: `Auf ${onMachine(machine, machineIcon)} hat in genau dieser Besetzung zuletzt ${defenderName} gewonnen${
      when ? ` (${when})` : ""
    }. Gelingt die Titelverteidigung – oder wird ${defenderName} gestoppt?`,
    players: [defenderId],
    data: { player: defenderName, machine, machineIcon, at, matchId },
  };
}

/** nach dem Spiel: verteidigt oder gestoppt */
export function defenderResultItem(opts: {
  matchId: string;
  machineId: string;
  machine: string | null;
  machineIcon: string | null;
  defenderId: string;
  defenderName: string;
  winnerId: string;
  winnerName: string;
}): FeedItem {
  const { matchId, machineId, machine, machineIcon, defenderId, defenderName, winnerId, winnerName } = opts;
  const m = onMachine(machine, machineIcon);
  const defended = winnerId === defenderId;
  return {
    key: `defenderResult|${matchId}|${machineId}`,
    kind: "titleDefender",
    icon: defended ? "🛡️" : "⚔️",
    title: defended ? "Titel verteidigt" : "Titelverteidiger gestoppt",
    body: defended
      ? `${defenderName} verteidigt den Sieg auf ${m} – auch diesmal in dieser Besetzung vorn!`
      : `${winnerName} stoppt Titelverteidiger ${defenderName} auf ${m}!`,
    players: defended ? [defenderId] : [winnerId, defenderId],
    data: defended
      ? { player: defenderName, machine, machineIcon, defended }
      : { player: winnerName, other: defenderName, machine, machineIcon, defended },
  };
}
