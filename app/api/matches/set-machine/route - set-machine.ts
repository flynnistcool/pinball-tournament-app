import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function pickRandomTaskForMatch(
  supabase: ReturnType<typeof supabaseAdmin>,
  matchId: string,
  machineId: string
) {
  // 1) Match → Tournament (über rounds)
  const { data: m } = await supabase
    .from("matches")
    .select("id, rounds!inner(tournament_id)")
    .eq("id", matchId)
    .single();

  const tournamentId = (m as any)?.rounds?.tournament_id;
  if (!tournamentId) return null;

  // 2) Tournament → location_id + format (nur timeplay!)
  const { data: t } = await supabase
    .from("tournaments")
    .select("location_id, format")
    .eq("id", tournamentId)
    .single();

  const format = String((t as any)?.format ?? "");
  if (format !== "timeplay") return null;

  const locationId = (t as any)?.location_id;
  if (!locationId) return null;

  // 3) Snapshot-Maschine → Name
  const { data: sm } = await supabase
    .from("machines")
    .select("name")
    .eq("id", machineId)
    .single();

  const machineName = String((sm as any)?.name ?? "").trim();
  if (!machineName) return null;

  // 4) location_machine finden (location_id + name)
  const { data: lm } = await supabase
    .from("location_machines")
    .select("id")
    .eq("location_id", locationId)
    .eq("name", machineName)
    .eq("active", true)
    .maybeSingle();

  if (!lm?.id) return null;

  // 5) Tasks laden (WICHTIG: location_machine_id)
  const { data: tasks } = await supabase
    .from("machine_tasks")
    .select("id")
    .eq("location_machine_id", lm.id)
    .eq("active", true);

  if (!tasks || tasks.length === 0) return null;

  // 6) zufällig wählen
  const idx = Math.floor(Math.random() * tasks.length);
  return tasks[idx]?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const matchId = String(body?.matchId ?? "").trim();

    // machineId darf null sein (Maschine entfernen)
    const machineId =
      body?.machineId === null
        ? null
        : String(body?.machineId ?? "").trim() || null;

    if (!matchId) {
      return NextResponse.json({ error: "matchId ist erforderlich" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // 1) Maschine setzen + Task resetten
    const { data, error } = await supabase
      .from("matches")
      .update({ machine_id: machineId, task_id: null })
      .eq("id", matchId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Supabase-Fehler in set-machine:", error);
      return NextResponse.json(
        { error: error.message ?? "Supabase-Fehler in set-machine" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Match nicht gefunden (kein Datensatz aktualisiert)" },
        { status: 404 }
      );
    }

    // 2) Wenn Maschine gesetzt ist: Task neu setzen (nur timeplay)
    if (machineId) {
      const taskId = await pickRandomTaskForMatch(supabase, matchId, machineId);

      if (taskId) {
        const { error: taskErr } = await supabase
          .from("matches")
          .update({ task_id: taskId })
          .eq("id", matchId);

        if (taskErr) {
          console.error("Supabase-Fehler beim Setzen der Aufgabe:", taskErr);
          return NextResponse.json(
            { error: taskErr.message ?? "Supabase-Fehler beim Setzen der Aufgabe" },
            { status: 500 }
          );
        }
      }
    }

    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Unerwarteter Fehler in /api/matches/set-machine:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unerwarteter Fehler in API-Handler" },
      { status: 500 }
    );
  }
}
