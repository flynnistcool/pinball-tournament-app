// 📟 LED-Display am Flipper (Adafruit Matrix Portal): was soll es gerade zeigen?
// GET /api/public/display?flipper=Godzilla&location=Spielhalle[&shown=CODE]
//   shown = Turnier, das das Display gerade zeigt (für die Lösch-Explosion)
//   → { ok: true, mode, top, bottom, topColor, bottomColor, poll, tournament,
//       timer: { phase, toStart, toEnd }, active: "NAME" | null, scores: [{ name, score }] }
//   timer/active/scores nur bei Round the Pinball (für 3-2-1-LOS, Schluss-Countdown, "Score eintragen")
//   mode "blockdone" + blocks: [{ block, name, score }] – alle Durchgänge fertig, Highscores je Block
//   mode "final" + ranking: [{ place, name, points }], tournamentName – Turnier gerade beendet (≤ 10 Min.)
//   deleted: ["CODE", …] – gemerkte, inzwischen gelöschte Turniere (Display: Explosion, dann Allzeit)
//   icon: "🦖" | null – Flipper-Icon der Location (Display wählt danach sein Maskottchen)
//   best: Turnier-Highscore am Flipper (Zahl) · Matchplay/Swiss/Round Robin: mode "mplay" | "mwin" | "slides"
//     (+ matchId, slides: [{ top, bottom }]) – siehe lib/flipperDisplay.ts matchDisplay
// Öffentlich (ohne Login, wie TV/Handy) – liefert nur Texte, die ohnehin am Infobildschirm stehen.
//
// flipper  = Flipper-Name wie in der App (Groß/Klein egal)
// location = Name der Location (optional; nötig für den Allzeit-Highscore, wenn kein Turnier läuft)
// Welches Turnier: 1) aus den am Admin-iPad geöffneten Turnieren (Liste, /api/display-tournament,
//   app_settings "display_tournament:<location>") das neueste, in dem DIESER Flipper mitspielt –
//   beendet: noch 10 Min. Siegerliste; gelöscht/später/Flipper nicht dabei: Allzeit-Highscore;
//   2) nur falls noch nie eines gemerkt wurde: das neueste nicht beendete Turnier (an dieser Location).
// Logik der Anzeige: lib/flipperDisplay.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { loadMachineRecords } from "@/lib/feedContextServer";
import { machineKey } from "@/lib/machineStats";
import { rotationActiveMap, rotationBlocksFrom } from "@/lib/rotationTurn";
import { finalRankingFromResults, loadMatchDisplay } from "@/lib/displayMatchServer";
import {
  displayText,
  displayPinList,
  displayTimerInfo,
  displayTournamentKey,
  flipperDisplay,
  matchDisplay,
  MATCH_DISPLAY_FORMATS,
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
/** Siegerliste nach Turnierende: so lange nach "Turnier beenden" (danach wieder Allzeit-Highscore) */
const FINAL_SHOW_MS = 10 * 60_000;

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

/** Flipper-Icons je Location (location_machines.icon_emoji) – 5 Min. zwischenspeichern */
const iconCache = new Map<string, { at: number; icons: Record<string, string> }>();
async function machineIcons(sb: Sb, locationId: string): Promise<Record<string, string>> {
  const hit = iconCache.get(locationId);
  if (hit && Date.now() - hit.at < ALLTIME_TTL_MS) return hit.icons;
  const { data } = await sb.from("location_machines").select("name, icon_emoji").eq("location_id", locationId);
  const icons: Record<string, string> = {};
  for (const m of (data ?? []) as { name: string | null; icon_emoji: string | null }[]) {
    const ic = String(m.icon_emoji ?? "").trim();
    if (ic) icons[machineKey(m.name)] = ic;
  }
  iconCache.set(locationId, { at: Date.now(), icons });
  return icons;
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

    type TRow = {
      id: string;
      code: string;
      name: string | null;
      format: string | null;
      location_id: string | null;
      rotation_timer: DisplayTimer;
      status?: string | null;
    };
    let t: TRow | undefined;
    // 🏁 Kandidat für die Siegerliste (gemerktes Turnier, vor ≤ 10 Min. beendet)
    let finalCandidate: TRow | null = null;
    let pinnedUsed = false;
    let deletedCodes: string[] = [];

    // 📟 1) Am Admin-iPad geöffnete Turniere (Liste, neuestes vorne – app_settings, /api/display-tournament).
    //    Dieses Display nimmt das neueste davon, in dem SEIN Flipper mitspielt (zwei iPads / zwei Turniere
    //    an verschiedenen Flippern stören sich nicht). Gibt es eine Liste, wird NICHT geraten:
    //    gelöscht → übersprungen, beendet → 10 Min. Siegerliste, sonst Allzeit-Highscore.
    const { data: pinRow } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", displayTournamentKey(locationId))
      .maybeSingle();
    const pins = displayPinList((pinRow as { value?: unknown } | null)?.value);
    if (pins.length) {
      pinnedUsed = true;
      const { data: pts, error: ptErr } = await sb
        .from("tournaments")
        .select("id, code, name, format, location_id, rotation_timer, status")
        .in(
          "code",
          pins.map((p) => p.code)
        );
      if (ptErr) return fail(`Turnier laden fehlgeschlagen: ${ptErr.message}`, 500);
      const byCode = new Map(((pts ?? []) as TRow[]).map((p) => [String(p.code).toUpperCase(), p]));
      // 💥 gemerkt, aber nicht mehr da = gelöscht → das Display, das es gerade zeigte, spielt die Explosion
      deletedCodes = pins.map((p) => p.code).filter((c) => !byCode.has(c));
      const ids = ((pts ?? []) as TRow[]).map((p) => String(p.id));
      const { data: pm, error: pmErr } = ids.length
        ? await sb.from("machines").select("tournament_id, name, active").in("tournament_id", ids)
        : { data: [], error: null };
      if (pmErr) return fail(`Flipper laden fehlgeschlagen: ${pmErr.message}`, 500);
      const withFlipper = new Set(
        ((pm ?? []) as { tournament_id: string; name: string | null; active: boolean | null }[])
          .filter((m) => machineKey(m.name) === key && m.active !== false)
          .map((m) => String(m.tournament_id))
      );
      for (const pin of pins) {
        const p = byCode.get(pin.code);
        if (!p || !withFlipper.has(String(p.id))) continue; // gelöscht / Flipper spielt dort nicht mit
        if (locationId && String(p.location_id ?? "") !== locationId) continue;
        if (p.status !== "finished") {
          t = p;
          break;
        }
        // beendet: nur innerhalb von 10 Min. nach "Turnier beenden" (Spalte finished_at fehlt → nicht)
        const { data: fa, error: faErr } = await sb.from("tournaments").select("finished_at").eq("id", p.id).maybeSingle();
        const finRaw = !faErr ? (fa as { finished_at?: string | null } | null)?.finished_at : null;
        const fin = finRaw ? Date.parse(String(finRaw)) : NaN;
        if (Number.isFinite(fin) && Date.now() - fin < FINAL_SHOW_MS) {
          finalCandidate = p;
          break;
        }
      }
    }

    // 🏁 2) nur wenn noch NIE ein Turnier gemerkt wurde: automatisch das neueste nicht beendete (an der Location)
    if (!pinnedUsed) {
      let tq = sb
        .from("tournaments")
        .select("id, code, name, format, location_id, rotation_timer, created_at")
        .neq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(1);
      if (locationId) tq = tq.eq("location_id", locationId);
      const { data: ts, error: tErr } = await tq;
      if (tErr) return fail(`Turnier laden fehlgeschlagen: ${tErr.message}`, 500);
      t = (ts ?? [])[0] as TRow | undefined;
    }

    // 💥 Das Display meldet, welches Turnier es gerade zeigt (?shown=CODE) – gibt es das nicht mehr,
    //    wurde es gelöscht (funktioniert auch ohne gemerkte Turnier-Liste)
    const shown = String(url.searchParams.get("shown") ?? "").trim().toUpperCase();
    if (shown && !deletedCodes.includes(shown) && shown !== String(t?.code ?? "").toUpperCase()) {
      const { data: still, error: sErr } = await sb.from("tournaments").select("id").eq("code", shown).maybeSingle();
      if (!sErr && !still) deletedCodes = [...deletedCodes, shown];
    }

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

      // 🎯 Matchplay / Swiss / Round Robin: eigener Weg (lib/displayMatchServer.ts) – Round the Pinball unten
      if (MATCH_DISPLAY_FORMATS.has(String(t.format ?? "")) && inTournament) {
        const md = await loadMatchDisplay(sb, { id: t.id, location_id: t.location_id, format: t.format }, mine, flipper);
        const recLoc = t.location_id ? String(t.location_id) : locationId;
        let allTimeM: DisplayRecord | null = null;
        if (recLoc) {
          const r = (await allTimeRecords(sb, recLoc))[key];
          if (r) allTimeM = { score: Number(r.score), holder: r.holder ?? null };
        }
        const iconM = recLoc ? (await machineIcons(sb, recLoc))[key] ?? null : null;
        const outM = matchDisplay({
          flipper,
          format: String(t.format),
          tournamentName: t.name,
          hasRounds: md.hasRounds,
          match: md.match,
          roundDone: md.roundDone,
          roundNo: md.roundNo,
          standings: md.standings,
          tournamentBest: md.tournamentBest,
          allTime: allTimeM,
        });
        return NextResponse.json(
          {
            ok: true,
            ...outM,
            poll: POLL_SEC,
            tournament: String(t.code),
            timer: displayTimerInfo(null, 0),
            active: md.match?.active ?? null,
            scores: [],
            best: md.tournamentBest?.score ?? null,
            matchId: md.match?.matchId ?? null,
            slides: outM.slides ?? [],
            blocks: [],
            ranking: [],
            tournamentName: null,
            deleted: deletedCodes,
            icon: iconM,
          },
          { headers: NO_STORE }
        );
      }

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

    // 🏁 Kein laufendes Turnier: Round the Pinball / Matchplay & Co. vor ≤ 10 Min. beendet → Siegerliste
    //    (tournaments.finished_at aus supabase_tournament_finished_at.sql – fehlt die Spalte: keine Siegerliste)
    if (!t) {
      type FRow = { id: string; code: string; name: string | null; format: string | null };
      let ft: FRow | undefined = finalCandidate ?? undefined;
      if (!ft && !pinnedUsed) {
        let fq = sb
          .from("tournaments")
          .select("id, code, name, format, finished_at")
          .eq("status", "finished")
          .gte("finished_at", new Date(Date.now() - FINAL_SHOW_MS).toISOString())
          .order("finished_at", { ascending: false })
          .limit(1);
        if (locationId) fq = fq.eq("location_id", locationId);
        const { data: fts, error: fErr } = await fq;
        if (fErr && !/finished_at/i.test(fErr.message)) return fail(`Turnier laden fehlgeschlagen: ${fErr.message}`, 500);
        ft = (fts ?? [])[0] as FRow | undefined;
      }
      // Matchplay & Co.: Endplatzierung aus der Auswertung (inkl. Superfinale), sonst wie unten berechnen
      if (ft && MATCH_DISPLAY_FORMATS.has(String(ft.format ?? ""))) {
        const fromResults = await finalRankingFromResults(sb, String(ft.id));
        if (fromResults && fromResults.length) {
          final = { name: displayText(ft.name), ranking: fromResults };
          finalCode = String(ft.code);
        }
      }
      if (ft && !final && (ft.format === "rotation" || MATCH_DISPLAY_FORMATS.has(String(ft.format ?? "")))) {
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
    // 🦖 Icon des Flippers an der Location (Display wählt danach sein Maskottchen, falls nicht fest eingestellt)
    const icon = recLocation ? (await machineIcons(sb, recLocation))[key] ?? null : null;

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
        // 🏆 Turnier-Highscore an diesem Flipper (Zahl) – steigt er, fährt das Maskottchen
        best: rtp ? tournamentBest?.score ?? null : null,
        // 🧱 alle Durchgänge fertig: Highscores je Block · 🏁 Turnier beendet: Siegerliste
        blocks: out.mode === "blockdone" ? blocksDone ?? [] : [],
        ranking: out.mode === "final" ? final?.ranking ?? [] : [],
        tournamentName: out.mode === "final" ? final?.name ?? null : null,
        // 💥 gelöschte (vorher gemerkte) Turniere – zeigte das Display eines davon, kommt die Explosion
        deleted: deletedCodes,
        icon,
      },
      { headers: NO_STORE }
    );
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
