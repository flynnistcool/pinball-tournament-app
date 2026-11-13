// 📱 Handy-Seite: Ergebnis eintragen (Score und/oder Platz) – öffentlich, aber nur mit gültigem QR-Token.
//
// Regeln (lib/myMatch.ts → entryMode):
// - Round the Pinball: nur den EIGENEN Score
// - Matchplay / Swiss / Round Robin: Scores und/oder Plätze aller Spieler im eigenen Match
// - Elimination: Scores aller Spieler im eigenen Match (Plätze automatisch)
// - DYP / Timeplay: (noch) nicht
// Gespeichert wird über die BESTEHENDEN Admin-Routen (set-score / set-position), damit Match- und
// Rundenabschluss (inkl. Elimination-Kaskade) genau wie im Admin-Bereich laufen.
// Danach – wie im Admin-Bereich – Plätze automatisch aus den Scores, wenn alle da sind.
//
// Schutz vor gegenseitigem Überschreiben: das Handy schickt mit, was es zuletzt gesehen hat
// ("expected"). Hat sich inzwischen etwas geändert → 409 + aktuelle Werte (außer force=true).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { readPlayerToken } from "@/lib/playerLink";
import { entryMode, eliminationExpected, positionsFromScores, toScore } from "@/lib/myMatch";
import { rotationActiveMap } from "@/lib/rotationTurn";
import { POST as setScorePost } from "@/app/api/match_players/set-score/route";
import { POST as setPositionPost } from "@/app/api/match_players/set-position/route";

export const dynamic = "force-dynamic";
// Datenbank-Antworten NIE zwischenspeichern (sonst liefert Next.js alte Stände aus)
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Entry = { player_id: string; score?: number | null; position?: number | null };
type Seen = { score: number | null; position: number | null };

function fail(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

async function callRoute(
  handler: (req: Request) => Promise<Response>,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const res = await handler(
    new Request("http://localhost/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { ok: true } : { ok: false, error: j.error ?? `Fehler ${res.status}` };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.code ?? "").trim().toUpperCase();
  const myId = readPlayerToken(String(body.t ?? ""));
  const matchId = String(body.match_id ?? "").trim();
  const force = body.force === true;
  const expected = (body.expected ?? {}) as Record<string, Seen>;
  const rawEntries = Array.isArray(body.entries) ? (body.entries as Entry[]) : [];

  if (!code) return fail("Code fehlt", 400);
  if (!myId) return fail("Ungültiger QR-Code", 403);
  if (!matchId) return fail("match_id fehlt", 400);
  if (!rawEntries.length) return fail("Nichts zu speichern", 400);

  const sb = supabaseAdmin();
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, format, status")
    .eq("code", code)
    .maybeSingle();
  if (tErr) return fail(tErr.message, 500);
  if (!t) return fail("Turnier nicht gefunden", 404);
  if (String(t.status ?? "") === "finished") return fail("Das Turnier ist beendet – Eintragen nicht mehr möglich", 403);

  const mode = entryMode(t.format);
  if (mode === "none") return fail("In diesem Modus geht das Eintragen per Handy (noch) nicht", 403);

  const { data: me, error: meErr } = await sb
    .from("players")
    .select("id, name")
    .eq("id", myId)
    .eq("tournament_id", t.id)
    .maybeSingle();
  if (meErr) return fail(meErr.message, 500);
  if (!me) return fail("Spieler gehört nicht zu diesem Turnier", 403);
  // 📝 für den Verlauf (match_players.entry_log): wer hat gespeichert
  const author = { entered_by: String(me.name ?? "Spieler"), entered_src: "phone" };

  const { data: m, error: mErr } = await sb
    .from("matches")
    .select("id, round_id, rounds!inner(tournament_id, number)")
    .eq("id", matchId)
    .eq("rounds.tournament_id", t.id)
    .maybeSingle();
  if (mErr) return fail(mErr.message, 500);
  if (!m) return fail("Match nicht gefunden", 404);

  const { data: mpsRaw, error: mpErr } = await sb
    .from("match_players")
    .select("player_id, score, position, start_position")
    .eq("match_id", matchId);
  if (mpErr) return fail(mpErr.message, 500);
  const mps = (mpsRaw ?? []) as {
    player_id: string;
    score: number | string | null;
    position: number | null;
    start_position: number | null;
  }[];
  const inMatch = new Set(mps.map((x) => String(x.player_id)));
  if (!inMatch.has(String(myId))) return fail("Du spielst nicht in diesem Match", 403);
  // Round the Pinball: nur an dem Flipper, an dem man GERADE dran ist (Wellen-Regel über alle Flipper)
  if (mode === "own") {
    const { data: rounds } = await sb.from("rounds").select("id").eq("tournament_id", t.id);
    const roundIds = (rounds ?? []).map((r: { id: string }) => r.id);
    const { data: allMatches } = roundIds.length
      ? await sb.from("matches").select("id").in("round_id", roundIds)
      : { data: [] as { id: string }[] };
    const allIds = (allMatches ?? []).map((x: { id: string }) => String(x.id));
    const { data: allMps } = allIds.length
      ? await sb.from("match_players").select("match_id, player_id, start_position, score").in("match_id", allIds)
      : { data: [] };
    const active = rotationActiveMap(allIds, allMps ?? []);
    if (active[matchId] !== String(myId)) return fail("Du bist an diesem Flipper gerade nicht dran", 403);
  }

  // Einträge prüfen
  const entries: Entry[] = [];
  for (const e of rawEntries) {
    const pid = String(e?.player_id ?? "");
    if (!inMatch.has(pid)) return fail("Spieler ist nicht in diesem Match", 400);
    const hasScore = Object.prototype.hasOwnProperty.call(e, "score");
    const hasPosition = Object.prototype.hasOwnProperty.call(e, "position");
    if (mode === "own" && pid !== String(myId)) return fail("Hier darfst du nur deinen eigenen Score eintragen", 403);
    if ((mode === "own" || mode === "score") && hasPosition) return fail("Plätze werden in diesem Modus automatisch vergeben", 403);
    const entry: Entry = { player_id: pid };
    if (hasScore) {
      const s = numOrNull(e.score);
      if (e.score != null && e.score !== ("" as unknown) && (s == null || s < 0)) return fail("Ungültiger Score", 400);
      entry.score = s;
    }
    if (hasPosition) {
      const p = numOrNull(e.position);
      if (p != null && (!Number.isInteger(p) || p < 1 || p > mps.length)) return fail("Ungültiger Platz", 400);
      entry.position = p;
    }
    if (hasScore || hasPosition) entries.push(entry);
  }
  if (!entries.length) return fail("Nichts zu speichern", 400);

  // Gleichstand (gleicher Score bei zwei Spielern) ist nicht erlaubt – Handy soll erst korrigieren
  if (mode === "full" || mode === "score") {
    const finalScores = mps
      .map((x) => {
        const e = entries.find((y) => y.player_id === String(x.player_id));
        return e && "score" in e ? e.score ?? null : toScore(x.score);
      })
      .filter((v): v is number => v != null);
    if (new Set(finalScores).size !== finalScores.length) {
      return fail("Gleicher Score bei zwei Spielern – bitte die Scores prüfen", 400);
    }
  }

  // Plätze müssen zu den Scores passen (mehr Punkte = besserer Platz).
  // Werden nur Scores geschickt, vergibt der Server die Plätze danach ohnehin neu → dann nichts zu prüfen.
  if (mode === "full" && entries.some((e) => "position" in e)) {
    const rows = mps
      .map((x) => {
        const pid = String(x.player_id);
        const e = entries.find((y) => y.player_id === pid);
        const sc = e && "score" in e ? e.score ?? null : toScore(x.score);
        const pos = e && "position" in e ? e.position ?? null : numOrNull(x.position);
        return { sc, pos };
      })
      .filter((r): r is { sc: number; pos: number } => r.sc != null && r.pos != null);
    const bad = rows.some((a) => rows.some((b) => a.sc > b.sc && a.pos > b.pos));
    if (bad) return fail("Plätze passen nicht zu den Scores – bitte korrigieren", 400);
  }

  // Hat inzwischen jemand anderes etwas eingetragen?
  if (!force) {
    const conflicts: { player_id: string; field: "score" | "position"; current: number | null }[] = [];
    for (const e of entries) {
      const cur = mps.find((x) => String(x.player_id) === e.player_id);
      const seen = expected[e.player_id];
      if (!cur) continue;
      if ("score" in e) {
        const now = toScore(cur.score);
        const before = seen ? numOrNull(seen.score) : null;
        if (now !== before && now !== e.score) conflicts.push({ player_id: e.player_id, field: "score", current: now });
      }
      if ("position" in e) {
        const now = numOrNull(cur.position);
        const before = seen ? numOrNull(seen.position) : null;
        if (now !== before && now !== e.position) conflicts.push({ player_id: e.player_id, field: "position", current: now });
      }
    }
    if (conflicts.length) return fail("Inzwischen wurde schon etwas eingetragen", 409, { conflicts });
  }

  // Speichern über die bestehenden Routen (erst Scores, dann Plätze)
  let scoresChanged = false;
  for (const e of entries) {
    if (!("score" in e)) continue;
    const r = await callRoute(setScorePost, { code, match_id: matchId, player_id: e.player_id, score: e.score, ...author });
    if (!r.ok) return fail(r.error ?? "Score speichern fehlgeschlagen", 500);
    scoresChanged = true;
  }
  const manualPositions = entries.filter((e) => "position" in e);
  for (const e of manualPositions) {
    const r = await callRoute(setPositionPost, { code, match_id: matchId, player_id: e.player_id, position: e.position, ...author });
    if (!r.ok) return fail(r.error ?? "Platz speichern fehlgeschlagen", 500);
  }

  // Wie im Admin-Bereich: sind alle Scores da → Plätze automatisch
  let auto: "set" | "tie" | null = null;
  if (scoresChanged && manualPositions.length === 0) {
    const { data: fresh } = await sb.from("match_players").select("player_id, score").eq("match_id", matchId);
    const rows = (fresh ?? []).map((x: { player_id: string; score: number | string | null }) => ({
      player_id: String(x.player_id),
      score: toScore(x.score),
    }));
    let allowed = true;
    if (mode === "score") {
      // Elimination: erst wenn die Runde voll besetzt ist (wie im Admin-Bereich)
      const { data: rounds } = await sb.from("rounds").select("id, number").eq("tournament_id", t.id);
      const roundIds = (rounds ?? []).map((r: { id: string }) => r.id);
      const { data: matches } = roundIds.length
        ? await sb.from("matches").select("id, round_id, machine_id").in("round_id", roundIds)
        : { data: [] };
      const matchIds = (matches ?? []).map((x: { id: string }) => x.id);
      const { data: allMps } = matchIds.length
        ? await sb.from("match_players").select("match_id, player_id, position, score").in("match_id", matchIds)
        : { data: [] };
      const roundNo = Number((m as unknown as { rounds?: { number?: number } }).rounds?.number ?? 0);
      const exp = eliminationExpected(
        { rounds: rounds ?? [], matches: matches ?? [], match_players: allMps ?? [] },
        roundNo
      );
      allowed = !!exp && rows.length === exp;
    }
    if (allowed) {
      const pos = positionsFromScores(rows, mode === "score");
      if (pos === "tie") auto = "tie";
      else if (pos) {
        for (const [pid, p] of Object.entries(pos)) {
          const r = await callRoute(setPositionPost, { code, match_id: matchId, player_id: pid, position: p, ...author });
          if (!r.ok) return fail(r.error ?? "Plätze setzen fehlgeschlagen", 500);
        }
        auto = "set";
      }
    }
  }

  return NextResponse.json({ ok: true, auto });
}
