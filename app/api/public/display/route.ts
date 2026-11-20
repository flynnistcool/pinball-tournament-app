// 📟 LED-Display am Flipper (Adafruit Matrix Portal): was soll es gerade zeigen?
// GET /api/public/display?flipper=Godzilla&location=Spielhalle
//   → { ok: true, mode, top, bottom, topColor, bottomColor, poll, tournament }
// Öffentlich (ohne Login, wie TV/Handy) – liefert nur Texte, die ohnehin am Infobildschirm stehen.
//
// flipper  = Flipper-Name wie in der App (Groß/Klein egal)
// location = Name der Location (optional; nötig für den Allzeit-Highscore, wenn kein Turnier läuft)
// Laufendes Turnier = neuestes nicht beendetes Turnier (an dieser Location, falls angegeben).
// Logik der Anzeige: lib/flipperDisplay.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { loadMachineRecords } from "@/lib/feedContextServer";
import { machineKey } from "@/lib/machineStats";
import { rotationActiveMap } from "@/lib/rotationTurn";
import { flipperDisplay, type DisplayRecord, type DisplayTimer } from "@/lib/flipperDisplay";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;
/** So oft soll das Display nachfragen (Sekunden) */
const POLL_SEC = 10;
/** Allzeit-Rekorde ändern sich nur, wenn ein Turnier beendet wird → 5 Min. zwischenspeichern (je Location) */
const ALLTIME_TTL_MS = 5 * 60_000;
const NIL_ID = "00000000-0000-0000-0000-000000000000";

const allTimeCache = new Map<string, { at: number; records: Record<string, { score: number; holder: string | null }> }>();

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

function toScore(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Sb = ReturnType<typeof supabaseAdmin>;

async function allTimeRecords(sb: Sb, locationId: string) {
  const hit = allTimeCache.get(locationId);
  if (hit && Date.now() - hit.at < ALLTIME_TTL_MS) return hit.records;
  // Turnier-Kennung NIL: alle beendeten Turniere der Location zählen, keine persönlichen Werte nötig
  const r = await loadMachineRecords(sb, { id: NIL_ID, location_id: locationId, format: "matchplay" });
  const records = r.records ?? {};
  allTimeCache.set(locationId, { at: Date.now(), records });
  return records;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const flipper = String(url.searchParams.get("flipper") ?? "").trim();
    const locationName = String(url.searchParams.get("location") ?? "").trim();
    if (!flipper) return fail("flipper fehlt", 400);
    const key = machineKey(flipper);
    const sb = supabaseAdmin();

    // 📍 Location (optional)
    let locationId: string | null = null;
    if (locationName) {
      const { data: locs, error: lErr } = await sb.from("locations").select("id, name");
      if (lErr) return fail(`Locations laden fehlgeschlagen: ${lErr.message}`, 500);
      const loc = (locs ?? []).find((l: { name: string | null }) => machineKey(l.name) === machineKey(locationName));
      if (!loc) return fail("Location nicht gefunden", 404);
      locationId = String((loc as { id: string }).id);
    }

    // 🏁 laufendes Turnier
    let tq = sb
      .from("tournaments")
      .select("id, code, name, format, location_id, rotation_timer, created_at")
      .neq("status", "finished")
      .order("created_at", { ascending: false })
      .limit(1);
    if (locationId) tq = tq.eq("location_id", locationId);
    const { data: ts, error: tErr } = await tq;
    if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
    const t = (ts ?? [])[0] as
      | { id: string; code: string; name: string | null; format: string | null; location_id: string | null; rotation_timer: DisplayTimer }
      | undefined;

    let inTournament = false;
    let hasRounds = false;
    let activePlayer: string | null = null;
    let tournamentBest: DisplayRecord | null = null;

    if (t) {
      const { data: machines, error: maErr } = await sb
        .from("machines")
        .select("id, name, active")
        .eq("tournament_id", t.id);
      if (maErr) return fail(`Flipper laden fehlgeschlagen: ${maErr.message}`, 500);
      const mine = new Set(
        (machines ?? [])
          .filter((m: { name: string | null; active: boolean | null }) => machineKey(m.name) === key && m.active !== false)
          .map((m: { id: string }) => String(m.id))
      );
      inTournament = mine.size > 0;

      const { data: rounds, error: rErr } = await sb.from("rounds").select("id").eq("tournament_id", t.id);
      if (rErr) return fail(`Runden laden fehlgeschlagen: ${rErr.message}`, 500);
      const roundIds = (rounds ?? []).map((r: { id: string }) => String(r.id));
      hasRounds = roundIds.length > 0;

      if (inTournament && hasRounds) {
        const mRes = await fetchAllIn<{ id: string; machine_id: string | null }>(roundIds, (chunk) =>
          sb.from("matches").select("id, machine_id").in("round_id", chunk).order("id")
        );
        if (mRes.error) return fail(`Matches laden fehlgeschlagen: ${mRes.error.message}`, 500);
        const matchIds = mRes.data.map((m) => String(m.id));
        const mpRes = await fetchAllIn<{
          match_id: string;
          player_id: string;
          score: number | string | null;
          start_position: number | null;
        }>(matchIds, (chunk) =>
          sb
            .from("match_players")
            .select("match_id, player_id, score, start_position")
            .in("match_id", chunk)
            .order("match_id")
            .order("player_id")
        );
        if (mpRes.error) return fail(`Scores laden fehlgeschlagen: ${mpRes.error.message}`, 500);

        const { data: players, error: pErr } = await sb.from("players").select("id, name").eq("tournament_id", t.id);
        if (pErr) return fail(`Spieler laden fehlgeschlagen: ${pErr.message}`, 500);
        const nameOf = new Map((players ?? []).map((p: { id: string; name: string | null }) => [String(p.id), p.name ?? null]));

        const myMatches = new Set(mRes.data.filter((m) => m.machine_id && mine.has(String(m.machine_id))).map((m) => String(m.id)));

        // 🔵 wer ist an diesem Flipper gerade dran? (gleiche Regel wie Admin/TV/Handy)
        const active = rotationActiveMap(matchIds, mpRes.data);
        for (const mid of Array.from(myMatches)) {
          const pid = active[mid];
          if (pid) {
            activePlayer = nameOf.get(String(pid)) ?? null;
            break;
          }
        }

        // 🏆 bester Score an diesem Flipper im Turnier
        for (const mp of mpRes.data) {
          if (!myMatches.has(String(mp.match_id))) continue;
          const s = toScore(mp.score);
          if (s == null) continue;
          if (!tournamentBest || s > tournamentBest.score) {
            tournamentBest = { score: s, holder: nameOf.get(String(mp.player_id)) ?? null };
          }
        }
      }
    }

    // ♾️ Allzeit-Highscore (Location des Turniers, sonst die angegebene)
    let allTime: DisplayRecord | null = null;
    const recLocation = t?.location_id ? String(t.location_id) : locationId;
    if (recLocation) {
      const records = await allTimeRecords(sb, recLocation);
      const r = records[key];
      if (r) allTime = { score: Number(r.score), holder: r.holder ?? null };
    }

    const out = flipperDisplay({
      flipper,
      tournament: t ? { name: t.name, format: t.format } : null,
      inTournament,
      hasRounds,
      timer: t?.rotation_timer ?? null,
      activePlayer,
      tournamentBest,
      allTime,
      now: Date.now(),
    });

    return NextResponse.json(
      { ok: true, ...out, poll: POLL_SEC, tournament: t ? String(t.code) : null },
      { headers: NO_STORE }
    );
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
