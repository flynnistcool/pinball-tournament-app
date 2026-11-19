// 📣 Live-Ticker lesen (öffentlich: TV + Handy ohne Login).
// GET ?code=XXXX → { ok, items: FeedItem[] (neueste zuerst), tableMissing? }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { FEED_MAX_ITEMS, type FeedItem } from "@/lib/feed";
import { scopeOf } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "code fehlt" }, { status: 400, headers: NO_STORE });

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb.from("tournaments").select("id").eq("code", code).maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500, headers: NO_STORE });
  if (!t) return NextResponse.json({ ok: false, error: "Turnier nicht gefunden" }, { status: 404, headers: NO_STORE });

  const query = (cols: string, skipHidden = false) => {
    let q = sb.from("tournament_feed").select(cols).eq("tournament_id", t.id);
    // 🙈 im Admin ausgeblendete Meldungen (data.hidden = true, /api/feed/hide) weglassen
    if (skipHidden) q = q.or("data->>hidden.is.null,data->>hidden.neq.true");
    return q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(FEED_MAX_ITEMS);
  };
  // mit beteiligten Spielern + Zusatzangaben (supabase_tournament_feed_v2.sql); sonst ohne
  const FULL = "id, event_key, kind, icon, title, body, created_at, player_ids, data";
  let { data, error } = await query(FULL, true);
  // Absicherung: Filter nicht verstanden → ohne Filter laden (ausgeblendete fallen unten trotzdem raus)
  if (error && !/player_ids|column/i.test(error.message)) ({ data, error } = await query(FULL));
  if (error && /player_ids|data/i.test(error.message)) {
    ({ data, error } = await query("id, event_key, kind, icon, title, body, created_at"));
  }
  if (error) {
    // Tabelle noch nicht angelegt → leerer Ticker statt Fehler
    return NextResponse.json({ ok: true, items: [], tableMissing: true }, { headers: NO_STORE });
  }
  const items: FeedItem[] = (data ?? [])
    .filter((r: any) => !(r?.data && typeof r.data === "object" && r.data.hidden === true))
    .map((r: any) => ({
    id: Number(r.id),
    key: String(r.event_key),
    kind: String(r.kind),
    icon: String(r.icon ?? ""),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    at: String(r.created_at),
    players: Array.isArray(r.player_ids) ? r.player_ids.map(String) : [],
    data: r.data && typeof r.data === "object" ? r.data : null,
  }));
  await fillShortNewsIcons(sb, t.id, items);
  // 🧊 ältere Favoritensturz-Meldungen: ungerundete Elo-Werte (227.19365566697212) nur in der Anzeige runden
  for (const it of items) {
    if (it.kind !== "upset") continue;
    const round = (txt: string) => txt.replace(/\d+\.\d{3,}/g, (m) => String(Math.round(Number(m))));
    it.body = round(it.body);
    it.title = round(it.title);
    if (it.data && typeof it.data === "object") {
      const d = it.data as Record<string, unknown>;
      for (const k of ["winnerElo", "loserElo"]) if (typeof d[k] === "number") d[k] = Math.round(d[k] as number);
    }
  }
  await fillAllzeitMachineIcons(sb, t.id, items);
  return NextResponse.json({ ok: true, items }, { headers: NO_STORE });
}

/**
 * 📰 Turnier-Shortnews: fehlt bei älteren Meldungen das Flipper-Icon,
 * wird es hier über den Flipper-Namen ergänzt. Nur Anzeige – die DB bleibt unverändert.
 */
async function fillShortNewsIcons(sb: ReturnType<typeof supabaseAdmin>, tournamentId: string, items: FeedItem[]) {
  const needs = items.filter(
    (it) =>
      (it.kind === "matchShort" || it.kind === "waveShort") &&
      Array.isArray(it.data?.lines) &&
      ((it.data!.lines as { machine?: string; machineIcon?: string | null }[]).some((l) => l?.machine && !l?.machineIcon) ||
        (it.kind === "matchShort" && !it.data?.machineIcon))
  );
  if (!needs.length) return;
  try {
    const { data: machines } = await sb.from("machines").select("name, icon_emoji").eq("tournament_id", tournamentId);
    const iconByMachine = new Map<string, string>();
    for (const m of machines ?? []) {
      const ic = String((m as any).icon_emoji ?? "").trim();
      if (ic && (m as any).name) iconByMachine.set(String((m as any).name), ic);
    }
    // Rückfall: Icon aus den Flippern der Location (gleicher Name), falls am Turnier-Flipper keins hinterlegt ist
    const missingNames = (machines ?? []).filter((m: any) => m?.name && !iconByMachine.has(String(m.name))).map((m: any) => String(m.name));
    if (missingNames.length) {
      const { data: tl } = await sb.from("tournaments").select("location_id").eq("id", tournamentId).maybeSingle();
      const locId = (tl as { location_id?: string | null } | null)?.location_id;
      if (locId) {
        const { data: lm } = await sb.from("location_machines").select("name, icon_emoji").eq("location_id", locId);
        for (const m of lm ?? []) {
          const ic = String((m as any).icon_emoji ?? "").trim();
          const nm = String((m as any).name ?? "");
          if (ic && nm && !iconByMachine.has(nm)) iconByMachine.set(nm, ic);
        }
      }
    }
    for (const it of needs) {
      const lines = (it.data!.lines as { machine?: string; machineIcon?: string | null }[]).map(
        (l) => {
          if (!l) return l;
          const out = { ...l };
          if (!out.machineIcon && out.machine && iconByMachine.has(out.machine)) out.machineIcon = iconByMachine.get(out.machine);
          return out;
        }
      );
      it.data = { ...it.data, lines };
      // Matchplay: Flipper-Icon vor den Titel ("Jaws: X gewinnt")
      const mName = typeof it.data.machine === "string" ? it.data.machine : "";
      const mIcon = mName ? iconByMachine.get(mName) : undefined;
      if (it.kind === "matchShort" && !it.data.machineIcon && mIcon) {
        if (!it.title.startsWith(mIcon) && it.title.startsWith(mName + ":")) it.title = `${mIcon} ${it.title}`;
        it.data = { ...it.data, machineIcon: mIcon }; // für die Anzeige "Flipper-Icon + Name"
      }
    }
  } catch {
    // Icons sind nur Schmuck – Ticker trotzdem ausliefern
  }
}

/**
 * ♾️ Allzeit-Meldungen (Highscore, persönlicher Rekord, Premiere …): Flipper-Icon vor den Flipper-Namen
 * in Titel und Text setzen. Nur Anzeige – die DB bleibt unverändert; gilt damit auch für ältere Meldungen.
 */
async function fillAllzeitMachineIcons(sb: ReturnType<typeof supabaseAdmin>, tournamentId: string, items: FeedItem[]) {
  // + Match-Momente (🧊 Favoritensturz, 📸 Fotofinish, 💣 Kantersieg, 🔄 Revanche: "… an 🦖 Godzilla Premium")
  const MOMENT_KINDS = new Set(["upset", "photo", "blowout", "revenge"]);
  const targets = items.filter((it) => scopeOf(it.kind) === "allzeit" || scopeOf(it.kind) === "spieler" || MOMENT_KINDS.has(it.kind));
  if (!targets.length) return;
  try {
    const { data: machines } = await sb.from("machines").select("name, icon_emoji").eq("tournament_id", tournamentId);
    const iconByName = new Map<string, string>();
    for (const m of machines ?? []) {
      const name = String((m as any).name ?? "").trim();
      const ic = String((m as any).icon_emoji ?? "").trim();
      if (name && ic) iconByName.set(name, ic);
    }
    // Rückfall: Icon aus den Flippern der Location (gleicher Name), falls am Turnier-Flipper keins hinterlegt ist
    const missing = (machines ?? []).some((m: any) => m?.name && !iconByName.has(String(m.name).trim()));
    if (missing) {
      const { data: tl } = await sb.from("tournaments").select("location_id").eq("id", tournamentId).maybeSingle();
      const locId = (tl as { location_id?: string | null } | null)?.location_id;
      if (locId) {
        const { data: lm } = await sb.from("location_machines").select("name, icon_emoji").eq("location_id", locId);
        for (const m of lm ?? []) {
          const name = String((m as any).name ?? "").trim();
          const ic = String((m as any).icon_emoji ?? "").trim();
          if (name && ic && !iconByName.has(name)) iconByName.set(name, ic);
        }
      }
    }
    if (!iconByName.size) return;
    // längste Namen zuerst ("Jaws Premium" vor "Jaws"); nur ganze Wörter
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const names = Array.from(iconByName.keys()).sort((a, b) => b.length - a.length);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "gu");
    const addIcons = (text: string) =>
      text.replace(re, (name: string, _g: string, offset: number, whole: string) => {
        const icon = iconByName.get(name)!;
        // steht das Icon schon davor → nichts tun
        return whole.slice(Math.max(0, offset - icon.length - 1), offset).startsWith(icon) ? name : `${icon} ${name}`;
      });
    for (const it of targets) {
      it.title = addIcons(it.title);
      it.body = addIcons(it.body);
    }
  } catch {
    // Icons sind nur Schmuck – Ticker trotzdem ausliefern
  }
}
