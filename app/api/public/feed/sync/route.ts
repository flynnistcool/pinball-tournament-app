// 📡 Live-Ticker über den Server: rechnet aus den Turnierdaten nach, was im Ticker stehen muss, und trägt
// Fehlendes ein. Anstoßen darf jedes offene Gerät (TV, Handy, Admin) – geschrieben wird nur, was sich aus
// den echten Daten ergibt (lib/feedReplay.ts), daher öffentlich.
// POST { code } → { ok, added, pending, skipped? }
//
// Schutz & Sparsamkeit:
// - nur wenn "Ticker über Server" in 🔔 Meldungen & Sounds eingeschaltet ist
// - Fingerabdruck unverändert + nichts offen → sofort fertig (kein Schreiben)
// - 10-s-Tippfehler-Schutz: neue Meldung erst, wenn ihre Daten 10 s gleich geblieben sind
//   (Merkzettel in tournament_feed_state; fehlt die Tabelle → ohne Schutz)
// - beendete Turniere nur, wenn der Server sie schon während des Turniers betreut hat
//   (sonst würde das Öffnen eines alten Turniers den Ticker mit alten Meldungen füllen)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { cleanFeedItem } from "@/lib/feed";
import { feedCandidates, feedFingerprint } from "@/lib/feedReplay";
import { NOTIFICATION_SETTINGS_KEY, normalizeNotificationSettings, notifSetting, serverFeedOn } from "@/lib/notifications";
import type { MmData } from "@/lib/myMatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const STABLE_MS = 10_000;
/** dieselbe Server-Instanz rechnet je Turnier höchstens so oft nach */
const MIN_GAP_MS = 3_000;
const lastRun = new Map<string, number>();

const ok = (body: Record<string, unknown>) => NextResponse.json({ ok: true, ...body }, { headers: NO_STORE });
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

type Pending = Record<string, { sig: string; since: number }>;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { code?: unknown; dry?: unknown };
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!code) return fail("code fehlt", 400);
  // 🧪 Probelauf: nur zeigen, was nach dem aktuellen Stand im Ticker stehen müsste – nichts schreiben
  const dry = body?.dry === true;

  const now = Date.now();
  if (!dry && now - (lastRun.get(code) ?? 0) < MIN_GAP_MS) return ok({ added: 0, skipped: "zu früh" });
  if (!dry) lastRun.set(code, now);

  const sb = supabaseAdmin();

  // Schalter "Ticker über Server"
  const { data: setRow } = await sb.from("app_settings").select("value").eq("key", NOTIFICATION_SETTINGS_KEY).maybeSingle();
  const settings = normalizeNotificationSettings((setRow as { value?: unknown } | null)?.value);
  if (!dry && !serverFeedOn(settings)) return ok({ added: 0, skipped: "aus" });

  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, name, status, format")
    .eq("code", code)
    .maybeSingle();
  if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
  if (!t) return fail("Turnier nicht gefunden", 404);
  const tid = String(t.id);

  // Merkzettel (Fingerabdruck + offene Meldungen)
  const st = await sb.from("tournament_feed_state").select("fingerprint, pending").eq("tournament_id", tid).maybeSingle();
  const stateTable = !st.error; // Tabelle vorhanden?
  const state = (st.data ?? null) as { fingerprint: string | null; pending: Pending | null } | null;

  // was steht schon im Ticker?
  const { data: existingRows, error: exErr } = await sb.from("tournament_feed").select("event_key").eq("tournament_id", tid);
  if (exErr) return fail(`Ticker lesen fehlgeschlagen: ${exErr.message}`, 500);
  const existing = new Set((existingRows ?? []).map((r: { event_key: string }) => String(r.event_key)));
  // beendet und weder betreut noch je ein Ticker-Eintrag → altes Turnier, nichts nachtragen
  if (!dry && t.status === "finished" && !state && existing.size === 0) return ok({ added: 0, skipped: "beendet, alt" });

  // Turnierdaten (wie /api/public/tournament)
  const [pl, mc, rd] = await Promise.all([
    sb.from("players").select("id, name, active, profile_id").eq("tournament_id", tid).order("created_at"),
    sb.from("machines").select("id, name, icon_emoji").eq("tournament_id", tid).order("created_at"),
    sb.from("rounds").select("id, format, number, status").eq("tournament_id", tid).order("format").order("number"),
  ]);
  if (pl.error || mc.error || rd.error) return fail("Turnierdaten laden fehlgeschlagen", 500);
  const roundIds = (rd.data ?? []).map((r: { id: string }) => String(r.id));
  const ma = roundIds.length
    ? await fetchAllIn<{ id: string; round_id: string; machine_id: string | null; status: string | null }>(roundIds, (chunk) =>
        sb.from("matches").select("id, round_id, machine_id, status, created_at").in("round_id", chunk).order("created_at").order("id")
      )
    : { data: [], error: null };
  if (ma.error) return fail("Matches laden fehlgeschlagen", 500);
  const matchIds = ma.data.map((m) => String(m.id));
  const mp = matchIds.length
    ? await fetchAllIn<MmData["match_players"][number]>(matchIds, (chunk) =>
        sb
          .from("match_players")
          .select("match_id, player_id, position, start_position, score")
          .in("match_id", chunk)
          .order("match_id")
          .order("player_id")
      )
    : { data: [], error: null };
  if (mp.error) return fail("Ergebnisse laden fehlgeschlagen", 500);

  // gleiche Reihenfolge wie bei den Geräten: Startposition je Match
  const mps = mp.data
    .slice()
    .sort((a, b) => Number(a.start_position ?? 99) - Number(b.start_position ?? 99));
  const data: MmData = {
    tournament: { format: t.format, status: t.status, name: t.name },
    players: (pl.data ?? []) as MmData["players"],
    machines: (mc.data ?? []) as MmData["machines"],
    rounds: (rd.data ?? []) as MmData["rounds"],
    matches: ma.data as MmData["matches"],
    match_players: mps,
  };

  if (dry) {
    const all = feedCandidates(data);
    return ok({
      dry: true,
      candidates: all.map((c) => ({ key: c.item.key, kind: c.item.kind, title: c.item.title, body: c.item.body })),
    });
  }

  const fp = feedFingerprint(data);
  const pendingBefore: Pending = (state?.pending as Pending) ?? {};
  if (state && state.fingerprint === fp && Object.keys(pendingBefore).length === 0) {
    return ok({ added: 0, skipped: "unverändert" });
  }

  // Kandidaten: nur Arten, die im Ticker eingeschaltet sind
  const cands = feedCandidates(data).filter(
    (c) => !existing.has(c.item.key) && notifSetting(settings, c.item.kind, "ticker").enabled
  );

  const pending: Pending = {};
  const ready = [];
  for (const c of cands) {
    const p = pendingBefore[c.item.key];
    if (!stateTable) {
      ready.push(c.item); // ohne Merkzettel-Tabelle: sofort (ohne Tippfehler-Schutz)
    } else if (p && p.sig === c.sig && now - p.since >= STABLE_MS) {
      ready.push(c.item);
    } else {
      pending[c.item.key] = p && p.sig === c.sig ? p : { sig: c.sig, since: now };
    }
  }

  // eintragen (Reihenfolge bleibt → Flawless Victory als letzter Eintrag ganz oben)
  let added = 0;
  if (ready.length) {
    const rows = ready
      .map(cleanFeedItem)
      .filter((x): x is NonNullable<ReturnType<typeof cleanFeedItem>> => !!x)
      .map((it) => ({
        tournament_id: tid,
        event_key: it.key,
        kind: it.kind,
        icon: it.icon,
        title: it.title,
        body: it.body,
        player_ids: it.players ?? [],
        data: it.data ?? null,
      }));
    for (let i = 0; i < rows.length; i += 20) {
      const chunk = rows.slice(i, i + 20);
      let { error } = await sb.from("tournament_feed").upsert(chunk, { onConflict: "tournament_id,event_key", ignoreDuplicates: true });
      if (error && /player_ids|data/i.test(error.message)) {
        ({ error } = await sb
          .from("tournament_feed")
          .upsert(
            chunk.map(({ player_ids: _p, data: _d, ...r }) => r),
            { onConflict: "tournament_id,event_key", ignoreDuplicates: true }
          ));
      }
      if (error) return fail(`Ticker speichern fehlgeschlagen: ${error.message}`, 500);
      added += chunk.length;
    }
  }

  if (stateTable) {
    await sb
      .from("tournament_feed_state")
      .upsert({ tournament_id: tid, fingerprint: fp, pending, updated_at: new Date().toISOString() }, { onConflict: "tournament_id" });
  }

  return ok({ added, pending: Object.keys(pending).length, stateTable });
}
