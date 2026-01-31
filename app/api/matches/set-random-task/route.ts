import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const matchId = String(body.matchId ?? body.match_id ?? "").trim();

  if (!matchId) {
    return NextResponse.json({ error: "matchId fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // 1) Match laden -> machine_id + round->tournament_id
  const { data: match, error: mErr } = await sb
    .from("matches")
    .select("id, machine_id, rounds!inner(tournament_id)")
    .eq("id", matchId)
    .single();

  if (mErr || !match) {
    return NextResponse.json({ error: "Match nicht gefunden" }, { status: 404 });
  }

  const machineId = (match as any).machine_id as string | null;
  const tournamentId = (match as any).rounds?.tournament_id as string | null;

  if (!machineId || !tournamentId) {
    // Wenn keine Maschine gesetzt ist, Task zurücksetzen
    await sb.from("matches").update({ task_id: null }).eq("id", matchId);
    return new NextResponse(JSON.stringify({ ok: true, task_id: null }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // 2) Turnier laden -> location_id
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, location_id")
    .eq("id", tournamentId)
    .single();

  if (tErr || !t) {
    return NextResponse.json({ error: "Turnier nicht gefunden" }, { status: 404 });
  }

  const locationId = (t as any).location_id as string | null;
  if (!locationId) {
    return NextResponse.json({ error: "Turnier hat keine location_id" }, { status: 400 });
  }

  // 3) Snapshot-Maschine laden -> name
  const { data: snapMachine, error: smErr } = await sb
    .from("machines")
    .select("id, name")
    .eq("id", machineId)
    .single();

  if (smErr || !snapMachine) {
    return NextResponse.json({ error: "Maschine nicht gefunden" }, { status: 404 });
  }

  const machineName = String((snapMachine as any).name ?? "").trim();
  if (!machineName) {
    return NextResponse.json({ error: "Maschine hat keinen Namen" }, { status: 400 });
  }

  // 4) location_machine finden (location_id + name)
  const { data: lm, error: lmErr } = await sb
    .from("location_machines")
    .select("id")
    .eq("location_id", locationId)
    .eq("name", machineName)
    .eq("active", true)
    .maybeSingle();

  if (lmErr || !lm?.id) {
    // kein Mapping gefunden -> Task zurücksetzen
    await sb.from("matches").update({ task_id: null }).eq("id", matchId);
    return new NextResponse(JSON.stringify({ ok: true, task_id: null }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // 5) Tasks laden und zufällig wählen (JS-Random)
  const { data: tasks, error: taskErr } = await sb
    .from("machine_tasks")
    .select("id")
    .eq("location_machine_id", lm.id)
    .eq("active", true);

  if (taskErr) {
    return NextResponse.json({ error: taskErr.message ?? "Task load error" }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    await sb.from("matches").update({ task_id: null }).eq("id", matchId);
    return new NextResponse(JSON.stringify({ ok: true, task_id: null }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const idx = Math.floor(Math.random() * tasks.length);
  const taskId = String((tasks[idx] as any)?.id ?? "");

  // 6) Match updaten
  const { error: uErr } = await sb
    .from("matches")
    .update({ task_id: taskId })
    .eq("id", matchId);

  if (uErr) {
    return NextResponse.json({ error: uErr.message ?? "Task update error" }, { status: 500 });
  }

  return new NextResponse(JSON.stringify({ ok: true, task_id: taskId }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
