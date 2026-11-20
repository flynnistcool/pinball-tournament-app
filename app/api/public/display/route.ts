// 📟 LED-Display am Flipper (Adafruit Matrix Portal): was soll es gerade zeigen?
// GET /api/public/display?flipper=Godzilla&location=Spielhalle
//   → { ok: true, mode, top, bottom, topColor, bottomColor, poll, tournament,
//       timer: { phase, toStart, toEnd }, active: "NAME" | null, scores: [{ name, score }] }
//   timer/active/scores nur bei Round the Pinball (für 3-2-1-LOS, Schluss-Countdown, "Score eintragen")
//   mode "blockdone" + blocks: [{ block, name, score }] – alle Durchgänge fertig, Highscores je Block
//   mode "final" + ranking: [{ place, name, points }], tournamentName – Turnier gerade beendet (≤ 24 h)
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
import { rotationActiveMap, rotationBlocksFrom } from "@/lib/rotationTurn";
import {
  displayText,
  displayTimerInfo,
  flipperDisplay,
  tournamentRanking,
  type BlockHighscore,
  type DisplayRecord,
  type DisplayTimer,
  type RankingEntry,
} from "@/lib/flipperDisplay";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store" } as const;
/** So oft soll das Display nachfragen (Sekunden) */
const POLL_SEC = 10;
/** Allzeit-Rekorde ändern sich nur, wenn ein Turnier beendet wird → 5 Min. zwischenspeichern (je Location) */
const ALLTIME_TTL_MS = 5 * 60_000;
const NIL_ID = "00000000-0000-0000-0000-000000000000";
/** Siegerliste nach Turnierende: höchstens so lange nach dem Anlegen des Turniers (danach wieder Allzeit) */
const FINAL_SHOW_MS = 24 * 60 * 60_000;

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
    let scores: { name: string; score: number }[] = [];
    let blocksDone: BlockHighscore[] | null = null;
    let final: { name: string | null; ranking: RankingEntry[] } | null = null;
    let finalCode: string | null = null;

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

      const { data: rounds, error: rErr } = await sb
        .from("rounds")
        .select("id, created_at, status")
        .eq("tournament_id", t.id);
      if (rErr) return fail(`Runden laden fehlgeschlagen: ${rErr.message}`, 500);
      const roundIds = (rounds ?? []).map((r: { id: string }) => String(r.id));
      hasRounds = roundIds.length > 0;

      if (inTournament && hasRounds) {
        const mRes = await fetchAllIn<{ id: string; round_id: string; machine_id: string | null }>(roundIds, (chunk) =>
          sb.from("matches").select("id, round_id, machine_id").in("round_id", chunk).order("id")
        );
        if (mRes.error) return fail(`Matches laden fehlgeschlagen: ${mRes.error.message}`, 500);
        // 🧱 nachgelegte Runden: jeder Block steht für sich – nur der neueste Block zählt (Highscore, wer dran ist)
        const blocks = rotationBlocksFrom(
          (rounds ?? []) as { id: string; created_at: string | null }[],
          mRes.data
        );
        const newest = blocks ? Object.values(blocks).sort().pop() : undefined;
        const inBlock = (id: string) => !newest || blocks?.[String(id)] === newest;
        const blockMatches = mRes.data.filter((m) => inBlock(String(m.id)));
        const matchIds = blockMatches.map((m) => String(m.id));
        const allMatchIds = mRes.data.map((m) => String(m.id));
        const mpAll = await fetchAllIn<{
          match_id: string;
          player_id: string;
          score: number | string | null;
          start_position: number | null;
        }>(allMatchIds, (chunk) =>
          sb
            .from("match_players")
            .select("match_id, player_id, score, start_position")
            .in("match_id", chunk)
            .order("match_id")
            .order("player_id")
        );
        if (mpAll.error) return fail(`Scores laden fehlgeschlagen: ${mpAll.error.message}`, 500);
        const blockIdSet = new Set(matchIds);
        const mpRes = { data: mpAll.data.filter((mp) => blockIdSet.has(String(mp.match_id))) };

        const { data: players, error: pErr } = await sb.from("players").select("id, name").eq("tournament_id", t.id);
        if (pErr) return fail(`Spieler laden fehlgeschlagen: ${pErr.message}`, 500);
        const nameOf = new Map((players ?? []).map((p: { id: string; name: string | null }) => [String(p.id), p.name ?? null]));

        // 🧱 Alle Durchgänge fertig (keine offene Runde) → Highscores dieses Flippers je Block
        const allDone =
          t.format === "rotation" && (rounds ?? []).every((r: { status: string | null }) => r.status !== "open");
        if (allDone) {
          const blockKeys = Array.from(new Set(Object.values(blocks ?? {}))).sort();
          const blockNo = (mid: string) => (blocks ? blockKeys.indexOf(blocks[mid] ?? "") + 1 : 1);
          const mineAll = new Set(
            mRes.data.filter((m) => m.machine_id && mine.has(String(m.machine_id))).map((m) => String(m.id))
          );
          const best = new Map<number, { s: number; pid: string }>();
          for (const mp of mpAll.data) {
            if (!mineAll.has(String(mp.match_id))) continue;
            const s = toScore(mp.score);
            if (s == null) continue;
            const b = blockNo(String(mp.match_id));
            const cur = best.get(b);
            if (!cur || s > cur.s) best.set(b, { s, pid: String(mp.player_id) });
          }
          blocksDone = Array.from(best.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([block, v]) => ({ block, name: displayText(nameOf.get(v.pid)) || "?", score: v.s }));
        }

        const myMatches = new Set(
          blockMatches.filter((m) => m.machine_id && mine.has(String(m.machine_id))).map((m) => String(m.id))
        );
        // Flipper spielt im aktuellen Block nicht mit → wie "nicht im Turnier" (Allzeit-Highscore)
        if (!myMatches.size) inTournament = false;

        // 🔵 wer ist an diesem Flipper gerade dran? (gleiche Regel wie Admin/TV/Handy)
        const active = rotationActiveMap(matchIds, mpRes.data);
        for (const mid of Array.from(myMatches)) {
          const pid = active[mid];
          if (pid) {
            activePlayer = nameOf.get(String(pid)) ?? null;
            break;
          }
        }

        // 🏆 bester Score an diesem Flipper im Turnier + beste Scores je Spieler (für "Platz X" am Display)
        const bestOf = new Map<string, number>();
        for (const mp of mpRes.data) {
          if (!myMatches.has(String(mp.match_id))) continue;
          const s = toScore(mp.score);
          if (s == null) continue;
          const pid = String(mp.player_id);
          if (!bestOf.has(pid) || s > (bestOf.get(pid) as number)) bestOf.set(pid, s);
          if (!tournamentBest || s > tournamentBest.score) {
            tournamentBest = { score: s, holder: nameOf.get(pid) ?? null };
          }
        }
        scores = Array.from(bestOf.entries())
          .map(([pid, score]) => ({ name: displayText(nameOf.get(pid)), score }))
          .sort((a, b) => b.score - a.score);
      }
    }

    // 🏁 Kein laufendes Turnier: gerade beendetes Round the Pinball (≤ 24 h) → Siegerliste
    if (!t) {
      let fq = sb
        .from("tournaments")
        .select("id, code, name, format, created_at")
        .eq("status", "finished")
        .gte("created_at", new Date(Date.now() - FINAL_SHOW_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (locationId) fq = fq.eq("location_id", locationId);
      const { data: fts, error: fErr } = await fq;
      if (fErr) return fail(`Turnier laden fehlgeschlagen: ${fErr.message}`, 500);
      const ft = (fts ?? [])[0] as { id: string; code: string; name: string | null; format: string | null } | undefined;
      if (ft && ft.format === "rotation") {
        const [{ data: fPlayers, error: fpErr }, { data: fRounds, error: frErr }] = await Promise.all([
          sb.from("players").select("id, name").eq("tournament_id", ft.id),
          sb.from("rounds").select("id, format").eq("tournament_id", ft.id),
        ]);
        if (fpErr || frErr) return fail("Turnierdaten laden fehlgeschlagen", 500);
        const fRoundIds = (fRounds ?? []).map((r: { id: string }) => String(r.id));
        const fm = await fetchAllIn<{ id: string; round_id: string }>(fRoundIds, (chunk) =>
          sb.from("matches").select("id, round_id").in("round_id", chunk).order("id")
        );
        if (fm.error) return fail(`Matches laden fehlgeschlagen: ${fm.error.message}`, 500);
        const fmp = await fetchAllIn<{ match_id: string; player_id: string; position: number | null }>(
          fm.data.map((m) => String(m.id)),
          (chunk) =>
            sb
              .from("match_players")
              .select("match_id, player_id, position")
              .in("match_id", chunk)
              .order("match_id")
              .order("player_id")
        );
        if (fmp.error) return fail(`Plätze laden fehlgeschlagen: ${fmp.error.message}`, 500);
        const ranking = tournamentRanking(
          (fPlayers ?? []) as { id: string; name: string | null }[],
          (fRounds ?? []) as { id: string; format: string | null }[],
          fm.data,
          fmp.data
        );
        if (ranking.length) {
          final = { name: displayText(ft.name), ranking };
          finalCode = String(ft.code);
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
      blocksDone,
      final,
    });

    // Animationen am Display (3-2-1-LOS, letzte 60 s, Score eintragen): nur bei Round the Pinball mit diesem Flipper
    const rtp = !!t && t.format === "rotation" && inTournament && hasRounds;
    const timer = rtp ? displayTimerInfo(t?.rotation_timer ?? null, Date.now()) : displayTimerInfo(null, 0);

    return NextResponse.json(
      {
        ok: true,
        ...out,
        poll: POLL_SEC,
        tournament: t ? String(t.code) : finalCode,
        timer,
        active: rtp && activePlayer ? displayText(activePlayer) : null,
        scores: rtp ? scores : [],
        // 🧱 alle Durchgänge fertig: Highscores je Block · 🏁 Turnier beendet: Siegerliste
        blocks: out.mode === "blockdone" ? blocksDone ?? [] : [],
        ranking: out.mode === "final" ? final?.ranking ?? [] : [],
        tournamentName: out.mode === "final" ? final?.name ?? null : null,
      },
      { headers: NO_STORE }
    );
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
