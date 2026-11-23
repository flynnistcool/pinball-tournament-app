// 🎱 DYP: wie oft war jeder Spieler an welcher Geräteart? – reine Logik.
// Alle Flipper zählen zusammen als "F", jedes andere Gerät eigene Spalte mit Kürzel
// ("Arcade - MK2" → "A-M", "Switch - Mario Kart" → "S-M", "Kicker" → "K").

export type DeviceCat = { key: string; short: string; label: string; pinball: boolean };
export type DevicePlayerRow = { id: string; name: string; counts: Record<string, number> };

type M = { id: string; name?: string | null; is_pinball?: boolean | null; active?: boolean | null };
type Mt = { id: string; machine_id?: string | null };
type Mp = { match_id: string; player_id: string };
type P = { id: string; name?: string | null };

export function deviceShort(name: string): string {
  const parts = String(name ?? "")
    .split("-")
    .map((x) => x.trim())
    .filter(Boolean);
  const s = parts.map((x) => x[0]!.toUpperCase()).join("-");
  return s || "?";
}

export function dypDeviceCounts(players: P[], machines: M[], matches: Mt[], matchPlayers: Mp[]) {
  const catOfMachine = new Map<string, string>();
  const cats = new Map<string, DeviceCat>();
  const hasPinball = machines.some((m) => m.is_pinball !== false);
  if (hasPinball) cats.set("F", { key: "F", short: "F", label: "Flipper (alle zusammen)", pinball: true });
  for (const m of machines) {
    const id = String(m.id);
    if (m.is_pinball !== false) {
      catOfMachine.set(id, "F");
      continue;
    }
    const key = "m:" + id;
    catOfMachine.set(id, key);
    cats.set(key, { key, short: deviceShort(String(m.name ?? "")), label: String(m.name ?? "?"), pinball: false });
  }
  // gleiche Kürzel unterscheidbar machen (A-M, A-M2 …)
  const seen = new Map<string, number>();
  for (const c of cats.values()) {
    const n = (seen.get(c.short) ?? 0) + 1;
    seen.set(c.short, n);
    if (n > 1) c.short = c.short + n;
  }

  const catOfMatch = new Map<string, string>();
  for (const mt of matches) {
    const c = mt.machine_id ? catOfMachine.get(String(mt.machine_id)) : undefined;
    if (c) catOfMatch.set(String(mt.id), c);
  }

  const totals: Record<string, number> = {};
  for (const mt of matches) {
    const c = catOfMatch.get(String(mt.id));
    if (c) totals[c] = (totals[c] ?? 0) + 1;
  }

  const rows: DevicePlayerRow[] = players.map((p) => ({ id: String(p.id), name: String(p.name ?? "?"), counts: {} }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const mp of matchPlayers) {
    const c = catOfMatch.get(String(mp.match_id));
    const r = byId.get(String(mp.player_id));
    if (c && r) r.counts[c] = (r.counts[c] ?? 0) + 1;
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "de"));

  // jedes Gerät einzeln (aktive oder schon gespielte), meistgespielte zuerst
  const perMachine: Record<string, number> = {};
  for (const mt of matches) {
    if (mt.machine_id) perMachine[String(mt.machine_id)] = (perMachine[String(mt.machine_id)] ?? 0) + 1;
  }
  const machineList = machines
    .filter((m: any) => m.active !== false || (perMachine[String(m.id)] ?? 0) > 0)
    .map((m) => ({
      id: String(m.id),
      name: String(m.name ?? "?"),
      pinball: m.is_pinball !== false,
      count: perMachine[String(m.id)] ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));

  return { cats: Array.from(cats.values()), rows, totals, machineList };
}
