// ⏱️ Round the Pinball: Timer-Stand speichern (Admin-iPad → TV zeigt "Timer läuft").
// POST { code, state: "running" | "paused" | "prestart" | "off", remainingMs?, durationSec? }
// remainingMs = Restzeit des Timers (running/paused) bzw. bis zum Start (prestart)
// Die Endzeit wird hier mit der SERVER-Uhr gebildet (Uhren von iPad und TV können abweichen).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "Code fehlt" }, { status: 400, headers: NO_STORE });

  const state = String(body.state ?? "");
  // "prestart" = 15-s-Countdown vor dem Start (für die Flipper-Displays; TV zeigt dabei nichts an)
  if (state !== "running" && state !== "paused" && state !== "prestart" && state !== "off") {
    return NextResponse.json({ ok: false, error: "Ungültiger Zustand" }, { status: 400, headers: NO_STORE });
  }
  const remainingMs = Math.max(0, Math.round(Number(body.remainingMs) || 0));
  const durationSec = Math.max(0, Math.round(Number(body.durationSec) || 0));
  const now = Date.now();
  const value =
    state === "off"
      ? null
      : {
          state,
          endAt: state === "running" ? now + remainingMs : null,
          // Countdown: wann der Timer losgeht (remainingMs = Restzeit bis zum Start)
          startAt: state === "prestart" ? now + remainingMs : null,
          remainingMs,
          durationSec,
          at: now,
        };

  const sb = supabaseAdmin();
  const { error } = await sb.from("tournaments").update({ rotation_timer: value }).eq("code", code);
  if (error) {
    const hint = /rotation_timer/i.test(error.message)
      ? " – bitte zuerst supabase_rotation_timer.sql im Supabase SQL-Editor ausführen"
      : "";
    return NextResponse.json({ ok: false, error: error.message + hint }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, timer: value }, { headers: NO_STORE });
}
