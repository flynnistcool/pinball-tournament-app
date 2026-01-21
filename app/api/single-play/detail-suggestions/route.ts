export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

function extractQuotedParts(s: string): string[] {
  const out: string[] = [];
  const re = /'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const inner = (m[1] ?? "").trim();
    if (inner) out.push(`'${inner}'`);
  }
  return out;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function byFrequency(arr: string[]): string[] {
  const counts = new Map<string, number>();
  for (const s of arr) {
    const key = String(s ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      // 1) Häufigkeit absteigend
      if (b[1] !== a[1]) return b[1] - a[1];
      // 2) stabil: alphabetisch (case-insensitive)
      return a[0].localeCompare(b[0], "de", { sensitivity: "base" });
    })
    .map(([label]) => label);
}


export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const profileId = String(url.searchParams.get("profileId") ?? "").trim();

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId fehlt" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sb = supabaseAdmin();

const { data: runRows, error: runErr } = await sb
  .from("single_play_runs")
  .select("run_detail")
  .eq("profile_id", profileId)
  .not("run_detail", "is", null)
  .in("status", ["finished", "abandoned", "in_progress"])
  .order("finished_at", { ascending: false })
  .limit(300);

if (runErr) {
  return NextResponse.json(
    { error: runErr.message },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}


    const { data, error } = await sb
      .from("single_play_ball_events")
      .select(
        `
        drain_detail,
        save_action_detail,
        single_play_runs!inner(profile_id,status)
      `
      )
      .eq("single_play_runs.profile_id", profileId)
      .in("single_play_runs.status", ["finished", "abandoned", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const drain: string[] = [];
    const save: string[] = [];
    const run: string[] = [];

    for (const row of data ?? []) {
      drain.push(...extractQuotedParts(String((row as any).drain_detail ?? "")));
      save.push(
        ...extractQuotedParts(String((row as any).save_action_detail ?? ""))
      );
    }
    for (const rr of runRows ?? []) {
      run.push(...extractQuotedParts(String((rr as any).run_detail ?? "")));
    }

    return NextResponse.json(
      {
        drain: byFrequency(drain).slice(0, 30),
        save: byFrequency(save).slice(0, 30),
        run: byFrequency(run).slice(0, 30),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
