// 📏 Bot-Labor: "Zeit-Umrechnung" aus euren echten Daten messen (nur zur Info – wird NICHT automatisch übernommen).
// GET /api/bots/time-calibration
//  -> { ok: true, byMinutes: [{ minutes, exponent, factor, pairs }], overall: { exponent, pairs } | null }
// Vergleich: dieselben Spieler am selben Flipper (gleiche Location) in beendeten Round-the-Pinball-Turnieren,
// einmal mit 10 Minuten und einmal mit anderer Spielzeit. Je Paar: Exponent e mit
//   Ø-Score(m) / Ø-Score(10) = (m / 10) ^ e   (Ø = geometrisches Mittel, robust gegen Wahnsinnsspiele)
// Ergebnis = Median der Exponenten (je Spielzeit und gesamt). 1 = genau im Verhältnis der Zeit.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fetchAllIn } from "@/lib/supabaseChunks";
import { machineKey } from "@/lib/machineStats";
import { effectiveMinutes } from "@/lib/playMinutes";
import { isExcludedProfile, loadStatsExclusions } from "@/lib/statsExclusions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const BASE = 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data: ts, error: tErr } = await sb
      .from("tournaments")
      .select("id, location_id, format, play_minutes")
      .eq("format", "rotation")
      .eq("status", "finished");
    if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
    const tours = (ts ?? []) as { id: string; location_id: string | null; format: string; play_minutes: number | null }[];
    const minutesOf = new Map(tours.map((t) => [String(t.id), effectiveMinutes(t.format, t.play_minutes)]));
    const locOf = new Map(tours.map((t) => [String(t.id), String(t.location_id ?? "")]));
    const empty = { ok: true, byMinutes: [], overall: null, otherTournaments: 0 };
    const otherTournaments = tours.filter((t) => minutesOf.get(String(t.id)) !== BASE).length;
    if (!otherTournaments) return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });

    const mc = await fetchAllIn<{ id: string; name: string | null; tournament_id: string }>(
      tours.map((t) => String(t.id)),
      (chunk) => sb.from("machines").select("id, name, tournament_id").in("tournament_id", chunk).order("id")
    );
    if (mc.error) return NextResponse.json({ ok: false, error: mc.error.message }, { status: 500 });
    const ma = await fetchAllIn<{ id: string; machine_id: string }>(
      mc.data.map((m) => String(m.id)),
      (chunk) => sb.from("matches").select("id, machine_id").in("machine_id", chunk).order("id")
    );
    if (ma.error) return NextResponse.json({ ok: false, error: ma.error.message }, { status: 500 });
    const mp = await fetchAllIn<{ match_id: string; player_id: string; score: number | string | null; stats_ignored: boolean | null }>(
      ma.data.map((m) => String(m.id)),
      (chunk) =>
        sb
          .from("match_players")
          .select("match_id, player_id, score, stats_ignored")
          .in("match_id", chunk)
          .not("score", "is", null)
          .order("match_id")
          .order("player_id")
    );
    if (mp.error) return NextResponse.json({ ok: false, error: mp.error.message }, { status: 500 });
    const pl = await fetchAllIn<{ id: string; profile_id: string | null }>(
      Array.from(new Set(mp.data.map((r) => String(r.player_id)))),
      (chunk) => sb.from("players").select("id, profile_id").in("id", chunk).order("id")
    );
    if (pl.error) return NextResponse.json({ ok: false, error: pl.error.message }, { status: 500 });
    const ex = await loadStatsExclusions(sb);

    const machineById = new Map(mc.data.map((m) => [String(m.id), m]));
    const machineOfMatch = new Map(ma.data.map((m) => [String(m.id), String(m.machine_id)]));
    const profileOf = new Map(pl.data.map((p) => [String(p.id), p.profile_id ? String(p.profile_id) : null]));

    // Spieler|Location|Flipper → Spielzeit → Summe der log-Scores
    const groups = new Map<string, Map<number, { sum: number; n: number }>>();
    for (const r of mp.data) {
      const score = Number(r.score);
      if (!(score > 0) || r.stats_ignored === true) continue;
      const prof = profileOf.get(String(r.player_id));
      if (!prof || isExcludedProfile(ex, prof)) continue;
      const m = machineById.get(machineOfMatch.get(String(r.match_id)) ?? "");
      if (!m) continue;
      const tid = String(m.tournament_id);
      const key = `${prof}|${locOf.get(tid)}|${machineKey(m.name)}`;
      const min = minutesOf.get(tid) ?? BASE;
      const g = groups.get(key) ?? new Map<number, { sum: number; n: number }>();
      const acc = g.get(min) ?? { sum: 0, n: 0 };
      acc.sum += Math.log(score);
      acc.n += 1;
      g.set(min, acc);
      groups.set(key, g);
    }

    const perMin = new Map<number, number[]>();
    for (const g of groups.values()) {
      const base = g.get(BASE);
      if (!base) continue;
      for (const [min, acc] of g.entries()) {
        if (min === BASE) continue;
        const e = (acc.sum / acc.n - base.sum / base.n) / Math.log(min / BASE);
        if (Number.isFinite(e)) (perMin.get(min) ?? perMin.set(min, []).get(min)!).push(e);
      }
    }
    const byMinutes = Array.from(perMin.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minutes, es]) => {
        const exponent = Math.round(median(es) * 100) / 100;
        return { minutes, exponent, factor: Math.round(Math.pow(minutes / BASE, exponent) * 1000) / 1000, pairs: es.length };
      });
    const all = Array.from(perMin.values()).flat();
    const overall = all.length ? { exponent: Math.round(median(all) * 100) / 100, pairs: all.length } : null;
    return NextResponse.json({ ok: true, byMinutes, overall, otherTournaments }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    console.error("bots/time-calibration crash:", e);
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
